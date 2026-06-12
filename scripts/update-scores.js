'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data.json');

// football-data.org name  ->  name used in data.json after ranking is stripped
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
  'Cape Verde Islands': 'Cabo Verde',
  'Cape Verde': 'Cabo Verde',
};

// API-Football name  ->  name used in data.json after ranking is stripped
const AF_TEAM_NAME_MAP = {
  'Korea Republic':    'South Korea',
  'Republic of Korea': 'South Korea',
  "Côte d'Ivoire":     'Ivory Coast',
  "Cote d'Ivoire":     'Ivory Coast',
  'Curacao':           'Curaçao',
  'Czech Republic':    'Czech Republic',
  'United States':     'USA',
  'IR Iran':           'Iran',
  'DR Congo':          'Congo DR',
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

async function main() {
  const token   = process.env.FOOTBALL_API_KEY;
  const afToken = process.env.API_FOOTBALL_KEY;

  if (!token) {
    console.error('FOOTBALL_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const headers = { 'X-Auth-Token': token };

  console.log('Fetching WC 2026 matches from football-data.org...');

  const result = await fetchJson(
    'https://api.football-data.org/v4/competitions/WC/matches?season=2026',
    headers
  );

  const finished = result.matches.filter(m => m.status === 'FINISHED');

  console.log(
    `API returned ${result.matches.length} total matches, ${finished.length} finished.`
  );

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8').replace(/^﻿/, ''));

  let updatedCount = 0;
  let cleanedCount = 0;

  for (const match of data.matches) {
    // Clean bad value created by previous script version
    if (match.actual_score === 'null-null') {
      match.actual_score = null;
      cleanedCount++;
      console.log(`  Match ${match.id}: cleaned invalid score "null-null"`);
    }

    // Keep existing real scores
    if (match.actual_score !== null) {
      continue;
    }

    const ourHome = normalize(stripRanking(match.home));
    const ourAway = normalize(stripRanking(match.away));

    const found = finished.find(apiMatch => {
      const apiHomeName =
        TEAM_NAME_MAP[apiMatch.homeTeam.name] ?? apiMatch.homeTeam.name;

      const apiAwayName =
        TEAM_NAME_MAP[apiMatch.awayTeam.name] ?? apiMatch.awayTeam.name;

      const apiHome = normalize(apiHomeName);
      const apiAway = normalize(apiAwayName);

      return apiHome === ourHome && apiAway === ourAway;
    });

    if (found) {
      const { home, away } = found.score.fullTime;
      if (home === null || away === null) {
        console.log(`  Match ${match.id}: ${match.home} vs ${match.away} — status FINISHED but score not yet populated`);
        continue;
      }
      match.actual_score = `${home}-${away}`;
      console.log(`  Match ${match.id}: ${match.home} vs ${match.away} → ${match.actual_score}`);
      updatedCount++;
    }
  }

  // ── API-Football: fetch goal scorers + referees ───
  const needsGoals = data.matches.filter(
    m => m.actual_score && !Array.isArray(m.goals)
  );

  let goalsUpdatedCount = 0;

  if (afToken && needsGoals.length > 0) {
    console.log(`\nFetching goal data for ${needsGoals.length} match(es) from API-Football...`);

    let afFixtures;
    try {
      const afResult = await fetchJson(
        'https://v3.football.api-sports.io/fixtures?league=1&season=2026',
        { 'x-apisports-key': afToken }
      );
      afFixtures = afResult.response || [];
      console.log(`  API-Football returned ${afFixtures.length} fixtures.`);
    } catch (err) {
      console.warn(`  Could not fetch API-Football fixtures: ${err.message}`);
      afFixtures = [];
    }

    // Build lookup: normalised "home_away" → fixture object
    const afMap = {};
    for (const f of afFixtures) {
      const hRaw = AF_TEAM_NAME_MAP[f.teams.home.name] ?? f.teams.home.name;
      const aRaw = AF_TEAM_NAME_MAP[f.teams.away.name] ?? f.teams.away.name;
      const key  = normalize(hRaw) + '_' + normalize(aRaw);
      afMap[key] = f;
    }

    for (const match of needsGoals) {
      const hName = stripRanking(match.home);
      const aName = stripRanking(match.away);
      const key   = normalize(hName) + '_' + normalize(aName);
      const af    = afMap[key];

      if (!af) {
        console.log(`  Match ${match.id}: no API-Football fixture found for ${hName} vs ${aName}`);
        continue;
      }

      // Referee (may be null before the match)
      match.referee = af.fixture.referee || null;

      // Fetch goal events for this fixture
      try {
        const evResult = await fetchJson(
          `https://v3.football.api-sports.io/fixtures/events?fixture=${af.fixture.id}`,
          { 'x-apisports-key': afToken }
        );

        const events = evResult.response || [];

        match.goals = events
          .filter(e => e.type === 'Goal')
          .map(e => {
            const min    = e.time.elapsed;
            const extra  = e.time.extra;
            const minute = extra ? `${min}+${extra}` : `${min}`;

            const teamNorm = normalize(AF_TEAM_NAME_MAP[e.team.name] ?? e.team.name);
            const team = teamNorm === normalize(hName) ? 'home'
                       : teamNorm === normalize(aName) ? 'away' : 'unknown';

            return {
              player: e.player.name,
              minute,
              team,
              detail: e.detail, // "Normal Goal", "Penalty", "Own Goal"
            };
          });

        console.log(`  Match ${match.id}: ${hName} vs ${aName} — ${match.goals.length} goal(s), referee: ${match.referee || 'N/A'}`);
        goalsUpdatedCount++;
      } catch (err) {
        console.warn(`  Match ${match.id}: could not fetch events — ${err.message}`);
      }
    }
  } else if (!afToken && needsGoals.length > 0) {
    console.log(`\nAPI_FOOTBALL_KEY not set — skipping goal scorer fetch for ${needsGoals.length} match(es).`);
  }

  const hasChanges = updatedCount > 0 || cleanedCount > 0 || goalsUpdatedCount > 0;

  if (hasChanges) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 4) + '\n');
    console.log(
      `\nSaved changes to data.json. Scores: ${updatedCount} updated, ${cleanedCount} cleaned. Goals: ${goalsUpdatedCount} match(es) updated.`
    );
  } else {
    console.log('\nNo changes — data.json unchanged.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
