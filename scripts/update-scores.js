'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data.json');

// football-data.org name  →  name used in data.json (after ranking is stripped)
const TEAM_NAME_MAP = {
  'Korea Republic':    'South Korea',
  "Côte d'Ivoire":     'Ivory Coast',
  "Cote d'Ivoire":     'Ivory Coast',
  'Curacao':           'Curaçao',
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
    https.get({ hostname, path: pathname + search, headers }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
          return;
        }
        resolve(JSON.parse(body));
      });
    }).on('error', reject);
  });
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
  console.log(`API returned ${result.matches.length} total matches, ${finished.length} finished.`);

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8').replace(/^﻿/, ''));
  let updatedCount = 0;

  for (const match of data.matches) {
    if (match.actual_score !== null) continue;

    const ourHome = normalize(stripRanking(match.home));
    const ourAway = normalize(stripRanking(match.away));

    const found = finished.find(m => {
      const apiHome = normalize(TEAM_NAME_MAP[m.homeTeam.name] ?? m.homeTeam.name);
      const apiAway = normalize(TEAM_NAME_MAP[m.awayTeam.name] ?? m.awayTeam.name);
      return apiHome === ourHome && apiAway === ourAway;
    });

    if (found) {
      const { home, away } = found.score.fullTime;
      match.actual_score = `${home}-${away}`;
      console.log(`  Match ${match.id}: ${match.home} vs ${match.away} → ${match.actual_score}`);
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 4));
    console.log(`\nSaved ${updatedCount} updated score(s) to data.json.`);
  } else {
    console.log('No new scores found — data.json unchanged.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
