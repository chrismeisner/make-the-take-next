#!/usr/bin/env node
import 'dotenv/config';
import { createRepositories } from '../lib/dal/factory.js';

const seed = async () => {
  const { metrics } = createRepositories();
  await metrics.ensureSchema();
  const items = [
    // NFL player single
    { league: 'nfl', entity: 'player', scope: 'single', key: 'passingYards', label: 'Passing Yards' },
    { league: 'nfl', entity: 'player', scope: 'single', key: 'passingCompletions', label: 'Passing Completions' },
    { league: 'nfl', entity: 'player', scope: 'single', key: 'passingAttempts', label: 'Passing Attempts' },
    { league: 'nfl', entity: 'player', scope: 'single', key: 'rushingYards', label: 'Rushing Yards' },
    { league: 'nfl', entity: 'player', scope: 'single', key: 'rushingAttempts', label: 'Rushing Attempts' },
    { league: 'nfl', entity: 'player', scope: 'single', key: 'receptions', label: 'Receptions' },
    { league: 'nfl', entity: 'player', scope: 'single', key: 'receivingYards', label: 'Receiving Yards' },
    { league: 'nfl', entity: 'player', scope: 'single', key: 'passingTD', label: 'Passing TDs' },
    { league: 'nfl', entity: 'player', scope: 'single', key: 'rushingTD', label: 'Rushing TDs' },
    { league: 'nfl', entity: 'player', scope: 'single', key: 'receivingTD', label: 'Receiving TDs' },
    { league: 'nfl', entity: 'player', scope: 'single', key: 'interceptions', label: 'Interceptions' },
    { league: 'nfl', entity: 'player', scope: 'single', key: 'tackles', label: 'Tackles' },
    { league: 'nfl', entity: 'player', scope: 'single', key: 'sacks', label: 'Sacks' },
    // NFL team single
    { league: 'nfl', entity: 'team', scope: 'single', key: 'points', label: 'Points' },
    { league: 'nfl', entity: 'team', scope: 'single', key: 'totalYards', label: 'Total Yards' },
    { league: 'nfl', entity: 'team', scope: 'single', key: 'firstDowns', label: 'First Downs' },
    { league: 'nfl', entity: 'team', scope: 'single', key: 'turnovers', label: 'Turnovers' },
    // MLB player single
    { league: 'major-mlb', entity: 'player', scope: 'single', key: 'R', label: 'Runs' },
    { league: 'major-mlb', entity: 'player', scope: 'single', key: 'H', label: 'Hits' },
    { league: 'major-mlb', entity: 'player', scope: 'single', key: 'RBI', label: 'RBI' },
    { league: 'major-mlb', entity: 'player', scope: 'single', key: 'HR', label: 'Home Runs' },
    { league: 'major-mlb', entity: 'player', scope: 'single', key: 'SB', label: 'Stolen Bases' },
    { league: 'major-mlb', entity: 'player', scope: 'single', key: 'SO', label: 'Strikeouts' },
    { league: 'major-mlb', entity: 'player', scope: 'single', key: 'BB', label: 'Walks' },
    { league: 'major-mlb', entity: 'player', scope: 'single', key: 'TB', label: 'Total Bases' },
    // MLB team single
    { league: 'major-mlb', entity: 'team', scope: 'single', key: 'R', label: 'Runs' },
    { league: 'major-mlb', entity: 'team', scope: 'single', key: 'H', label: 'Hits' },
    { league: 'major-mlb', entity: 'team', scope: 'single', key: 'E', label: 'Errors' },
  ];
  const n = await metrics.upsertMany(items);
  // eslint-disable-next-line no-console
  console.log(`[seed-metrics] upserted=${n}`);
};

seed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });


