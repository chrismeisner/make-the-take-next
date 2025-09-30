#!/usr/bin/env node
import 'dotenv/config';
import factoryPkg from '../lib/dal/factory.js';

const { createRepositories } = factoryPkg;

const items = [
  // MLB player single (curated)
  { league: 'major-mlb', entity: 'player', scope: 'single', key: 'R', label: 'Runs', source_key: { mlb: { boxscoreKey: 'R', aliases: ['runs'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'single', key: 'H', label: 'Hits', source_key: { mlb: { boxscoreKey: 'H', aliases: ['hits'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'single', key: 'RBI', label: 'RBI', source_key: { mlb: { boxscoreKey: 'RBI', aliases: ['rbi', 'RBIs'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'single', key: 'HR', label: 'Home Runs', source_key: { mlb: { boxscoreKey: 'HR', aliases: ['homeRuns', 'homeruns', 'home_runs'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'single', key: 'SB', label: 'Stolen Bases', source_key: { mlb: { boxscoreKey: 'SB', aliases: ['stolenBases', 'stolen_bases'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'single', key: 'SO', label: 'Strikeouts', source_key: { mlb: { boxscoreKey: 'SO', aliases: ['strikeouts', 'k', 'K'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'single', key: 'BB', label: 'Walks', source_key: { mlb: { boxscoreKey: 'BB', aliases: ['walks', 'baseOnBalls', 'base_on_balls'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'single', key: 'TB', label: 'Total Bases', source_key: { mlb: { boxscoreKey: 'TB', aliases: ['totalBases', 'total_bases'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'single', key: '2B', label: 'Doubles', source_key: { mlb: { boxscoreKey: '2B', aliases: ['doubles'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'single', key: '3B', label: 'Triples', source_key: { mlb: { boxscoreKey: '3B', aliases: ['triples'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'single', key: 'AB', label: 'At Bats', source_key: { mlb: { boxscoreKey: 'AB', aliases: ['atBats', 'at_bats'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'single', key: 'AVG', label: 'Batting Average', source_key: { mlb: { boxscoreKey: 'AVG', aliases: ['avg'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'single', key: 'OBP', label: 'On-Base %', source_key: { mlb: { boxscoreKey: 'OBP', aliases: ['onBasePct', 'obp', 'on_base_percentage'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'single', key: 'SLG', label: 'Slugging %', source_key: { mlb: { boxscoreKey: 'SLG', aliases: ['sluggingPct', 'slg'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'single', key: 'OPS', label: 'OPS', source_key: { mlb: { boxscoreKey: 'OPS', aliases: ['ops'] } } },

  // MLB player multi (allow same keys)
  { league: 'major-mlb', entity: 'player', scope: 'multi', key: 'H', label: 'Hits', source_key: { mlb: { boxscoreKey: 'H', aliases: ['hits'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'multi', key: 'RBI', label: 'RBI', source_key: { mlb: { boxscoreKey: 'RBI', aliases: ['rbi', 'RBIs'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'multi', key: 'HR', label: 'Home Runs', source_key: { mlb: { boxscoreKey: 'HR', aliases: ['homeRuns', 'homeruns', 'home_runs'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'multi', key: 'SB', label: 'Stolen Bases', source_key: { mlb: { boxscoreKey: 'SB', aliases: ['stolenBases', 'stolen_bases'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'multi', key: 'SO', label: 'Strikeouts', source_key: { mlb: { boxscoreKey: 'SO', aliases: ['strikeouts', 'k', 'K'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'multi', key: 'BB', label: 'Walks', source_key: { mlb: { boxscoreKey: 'BB', aliases: ['walks', 'baseOnBalls', 'base_on_balls'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'multi', key: 'TB', label: 'Total Bases', source_key: { mlb: { boxscoreKey: 'TB', aliases: ['totalBases', 'total_bases'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'multi', key: '2B', label: 'Doubles', source_key: { mlb: { boxscoreKey: '2B', aliases: ['doubles'] } } },
  { league: 'major-mlb', entity: 'player', scope: 'multi', key: '3B', label: 'Triples', source_key: { mlb: { boxscoreKey: '3B', aliases: ['triples'] } } },

  // MLB team single
  { league: 'major-mlb', entity: 'team', scope: 'single', key: 'R', label: 'Runs', source_key: { mlb: { boxscoreKey: 'R', aliases: [] } } },
  { league: 'major-mlb', entity: 'team', scope: 'single', key: 'H', label: 'Hits', source_key: { mlb: { boxscoreKey: 'H', aliases: [] } } },
  { league: 'major-mlb', entity: 'team', scope: 'single', key: 'E', label: 'Errors', source_key: { mlb: { boxscoreKey: 'E', aliases: [] } } },

  // MLB team multi
  { league: 'major-mlb', entity: 'team', scope: 'multi', key: 'R', label: 'Runs', source_key: { mlb: { boxscoreKey: 'R', aliases: [] } } },
  { league: 'major-mlb', entity: 'team', scope: 'multi', key: 'H', label: 'Hits', source_key: { mlb: { boxscoreKey: 'H', aliases: [] } } },
  { league: 'major-mlb', entity: 'team', scope: 'multi', key: 'E', label: 'Errors', source_key: { mlb: { boxscoreKey: 'E', aliases: [] } } },
];

async function main() {
  const { metrics } = createRepositories();
  await metrics.ensureSchema();
  const n = await metrics.upsertMany(items);
  // eslint-disable-next-line no-console
  console.log(`[seed-mlb-metrics] upserted=${n}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });


