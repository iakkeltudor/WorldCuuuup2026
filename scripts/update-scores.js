'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data.json');

// football-data.org name  ->  name used in data.json after ranking is stripped
const TEAM_NAME_MAP = {
  'Korea Republic': 'South Korea',
  "Côte d'Ivoire": 'Ivory Coast',
  "Cote d'Ivoire": 'Ivory Coast',
  'Curacao': 'Curaçao',
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

function hasValidScore(score) {
  return (
    score &&
    score.fullTime &&
    score.fullTime.home !== null &&
    score.fullTime.home !== undefined &&
    score.fullTime.away !== null &&
    score.fullTime.away !== undefined
  );
}

async function main() {
  const token = process.env.FOOTBALL_API_KEY;

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

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8').replace(/^\uFEFF/, ''));

  let updatedCount = 0;
  let cleanedCount = 0;
  let skippedBecauseNoScoreCount = 0;

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

    if (!found) {
      continue;
    }

    if (!hasValidScore(found.score)) {
      skippedBecauseNoScoreCount++;
      console.log(
        `  Match ${match.id}: ${match.home} vs ${match.away} is FINISHED but API score is missing/null`
      );
      continue;
    }

    const homeScore = found.score.fullTime.home;
    const awayScore = found.score.fullTime.away;

    match.actual_score = `${homeScore}-${awayScore}`;

    console.log(
      `  Match ${match.id}: ${match.home} vs ${match.away} -> ${match.actual_score}`
    );

    updatedCount++;
  }

  if (updatedCount > 0 || cleanedCount > 0) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 4) + '\n');

    console.log(
      `\nSaved changes to data.json. Updated ${updatedCount} score(s), cleaned ${cleanedCount} invalid score(s).`
    );
  } else {
    console.log('\nNo new scores found — data.json unchanged.');
  }

  if (skippedBecauseNoScoreCount > 0) {
    console.log(
      `${skippedBecauseNoScoreCount} finished match(es) were found but had no valid full-time score in the API response.`
    );
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
