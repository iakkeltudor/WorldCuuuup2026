'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data.json');
const FIREBASE_DB_URL = 'https://worldcuuuup-9a603-default-rtdb.europe-west1.firebasedatabase.app';

// football-data.org name  ->  name used in data.json
const TEAM_NAME_MAP = {
  'Korea Republic':    'South Korea',
  "Côte d'Ivoire":     'Ivory Coast',
  "Cote d'Ivoire":     'Ivory Coast',
  'Curacao':           'Curaçao',
  'Czechia':           'Czech Republic',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
  'Bosnia Herzegovina': 'Bosnia and Herzegovina',
  'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
  'Congo DR': 'DR Congo',
  'Cape Verde Islands': 'Cape Verde',
  'Cabo Verde': 'Cape Verde',
};

function stripRanking(name) {
  return name.replace(/\s*\(\d+\)\s*$/, '').trim();
}

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fetchJson(url, headers) {
  return new Promise((resolve, reject) => {
    const { hostname, pathname, search } = new URL(url);

    https
      .get({ hostname, path: pathname + search, headers }, res => {
        let body = '';

        res.on('data', chunk => {
          body += chunk;
        });

        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error(`Invalid JSON response: ${err.message}`));
          }
        });
      })
      .on('error', reject);
  });
}

function firebasePatch(path, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${FIREBASE_DB_URL}${path}.json`);
    const body = JSON.stringify(data);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, res => {
      res.resume();
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`Firebase PATCH ${path} → HTTP ${res.statusCode}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const token = process.env.FOOTBALL_API_KEY;

  if (!token) {
    console.error('FOOTBALL_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const headers = { 'X-Auth-Token': token };

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8').replace(/^﻿/, ''));

  let updatedCount = 0;
  let cleanedCount = 0;
  let teamsUpdatedCount = 0;
  let qualifiersUpdatedCount = 0;

  // ── Step 1: populate null home/away on KO stubs from Firebase ──────────────
  console.log('Fetching KO team assignments from Firebase...');
  let koFirebase = {};
  try {
    koFirebase = (await fetchJson(`${FIREBASE_DB_URL}/ko_matches.json`)) || {};
    console.log(`  Firebase returned data for ${Object.keys(koFirebase).length} KO match(es).`);
  } catch (err) {
    console.warn(`  Could not fetch Firebase ko_matches: ${err.message}`);
  }

  for (const match of data.matches) {
    if (match.id < 73) continue;
    const fb = koFirebase[match.id];
    if (!fb) continue;
    if (!match.home && fb.home) {
      match.home = fb.home;
      teamsUpdatedCount++;
      console.log(`  Match ${match.id}: home set to "${fb.home}" from Firebase`);
    }
    if (!match.away && fb.away) {
      match.away = fb.away;
      teamsUpdatedCount++;
      console.log(`  Match ${match.id}: away set to "${fb.away}" from Firebase`);
    }
  }

  // ── Step 2: fetch finished matches and update scores ───────────────────────
  console.log('\nFetching WC 2026 matches from football-data.org...');

  const result = await fetchJson(
    'https://api.football-data.org/v4/competitions/WC/matches?season=2026',
    headers
  );

  const finished = result.matches.filter(m => m.status === 'FINISHED');

  console.log(
    `API returned ${result.matches.length} total matches, ${finished.length} finished.`
  );

  // Build a lookup of finished matches keyed by normalised "home_away"
  const finishedMap = {};
  for (const apiMatch of finished) {
    const hName = apiMatch.homeTeam?.name;
    const aName = apiMatch.awayTeam?.name;
    if (!hName || !aName) continue;
    const h = normalize(TEAM_NAME_MAP[hName] ?? hName);
    const a = normalize(TEAM_NAME_MAP[aName] ?? aName);
    finishedMap[`${h}_${a}`] = apiMatch;
  }

  for (const match of data.matches) {
    // Clean bad value created by previous script version
    if (match.actual_score === 'null-null') {
      match.actual_score = null;
      cleanedCount++;
      console.log(`  Match ${match.id}: cleaned invalid score "null-null"`);
    }

    // Skip stubs whose teams haven't been determined yet
    if (!match.home || !match.away) continue;

    const ourHome = normalize(stripRanking(match.home));
    const ourAway = normalize(stripRanking(match.away));
    const found = finishedMap[`${ourHome}_${ourAway}`];

    if (!found) continue;

    // KO matches: use regularTime (90-min score) so draw+pens stores "1-1" not "7-6"
    // regularTime only appears in the API response when duration is EXTRA_TIME or PENALTY_SHOOTOUT
    const isKo = match.id >= 73;
    const scoreSource = (isKo && found.score.regularTime) ? found.score.regularTime : found.score.fullTime;
    const { home, away } = scoreSource;
    if (home === null || away === null) {
      console.log(`  Match ${match.id}: ${match.home} vs ${match.away} — FINISHED but score not yet populated`);
      continue;
    }

    if (!match.actual_score) {
      match.actual_score = `${home}-${away}`;
      console.log(`  Match ${match.id}: ${match.home} vs ${match.away} → ${match.actual_score}`);
      updatedCount++;
    }

    // KO matches: auto-set qualifier in Firebase when 90-min result is a draw
    if (isKo && home === away && found.score.winner && found.score.winner !== 'DRAW') {
      const qualifier = found.score.winner === 'HOME_TEAM' ? 'home' : 'away';
      const existingQual = koFirebase[match.id]?.qualifier;
      if (existingQual !== qualifier) {
        try {
          await firebasePatch(`/ko_matches/${match.id}`, { qualifier });
          koFirebase[match.id] = { ...(koFirebase[match.id] || {}), qualifier };
          console.log(`  Match ${match.id}: qualifier set to "${qualifier}" (${found.score.duration})`);
          qualifiersUpdatedCount++;
        } catch (err) {
          console.warn(`  Match ${match.id}: failed to write qualifier — ${err.message}`);
        }
      }
    }

    if (!match.referee) {
      const mainRef = (found.referees || []).find(r => r.type === 'REFEREE');
      if (mainRef) {
        match.referee = mainRef.nationality
          ? `${mainRef.name} (${mainRef.nationality})`
          : mainRef.name;
        console.log(`  Match ${match.id}: ${match.home} vs ${match.away} — referee: ${match.referee}`);
      }
    }
  }

  const hasChanges = updatedCount > 0 || cleanedCount > 0 || teamsUpdatedCount > 0;

  if (hasChanges) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 4) + '\n');
    console.log(
      `\nSaved changes to data.json. Scores: ${updatedCount} updated, ${cleanedCount} cleaned. Teams: ${teamsUpdatedCount} populated.`
    );
  } else {
    console.log('\nNo changes — data.json unchanged.');
  }

  if (qualifiersUpdatedCount > 0) {
    console.log(`Firebase: ${qualifiersUpdatedCount} KO qualifier(s) written.`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
