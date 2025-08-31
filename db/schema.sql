-- db/schema.sql
-- Postgres schema for core entities

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id TEXT UNIQUE,
  team_slug TEXT UNIQUE,
  name TEXT,
  league TEXT,
  emoji TEXT,
  logo_url TEXT
);
CREATE INDEX IF NOT EXISTS idx_teams_league ON teams (league);

-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id TEXT UNIQUE,
  mobile_e164 TEXT UNIQUE,
  username TEXT UNIQUE,
  favorite_team_id UUID REFERENCES teams(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profiles_mobile ON profiles (mobile_e164);

-- Events
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  espn_game_id TEXT UNIQUE,
  title TEXT,
  event_time TIMESTAMPTZ,
  league TEXT,
  home_team_id UUID REFERENCES teams(id),
  away_team_id UUID REFERENCES teams(id)
);
CREATE INDEX IF NOT EXISTS idx_events_league_time ON events (league, event_time);

-- Packs
CREATE TABLE IF NOT EXISTS packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_url TEXT UNIQUE,
  title TEXT,
  event_id UUID REFERENCES events(id),
  pack_status TEXT,
  prize TEXT,
  featured_status TEXT,
  cover_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_packs_event ON packs (event_id);

-- Props
CREATE TABLE IF NOT EXISTS props (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prop_id TEXT UNIQUE,
  prop_short TEXT,
  prop_summary TEXT,
  prop_type TEXT,
  prop_status TEXT,
  pack_id UUID REFERENCES packs(id),
  event_id UUID REFERENCES events(id),
  side_count INT,
  moneyline_a INT,
  moneyline_b INT,
  open_time TIMESTAMPTZ,
  close_time TIMESTAMPTZ,
  grading_mode TEXT,
  formula_key TEXT,
  formula_params JSONB,
  cover_url TEXT,
  prop_order INT
);
CREATE INDEX IF NOT EXISTS idx_props_pack ON props (pack_id);
CREATE INDEX IF NOT EXISTS idx_props_event ON props (event_id);
CREATE INDEX IF NOT EXISTS idx_props_status ON props (prop_status);
CREATE INDEX IF NOT EXISTS idx_props_formula_key ON props (formula_key);

-- Prop ↔ Team join
CREATE TABLE IF NOT EXISTS props_teams (
  prop_id UUID REFERENCES props(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (prop_id, team_id)
);

-- Takes
CREATE TABLE IF NOT EXISTS takes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prop_id UUID REFERENCES props(id),
  prop_id_text TEXT, -- legacy external id for quick lookup
  prop_side CHAR(1) CHECK (prop_side IN ('A','B')),
  take_mobile TEXT,
  take_status TEXT,
  pack_id UUID REFERENCES packs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_takes_prop ON takes (prop_id);
CREATE INDEX IF NOT EXISTS idx_takes_mobile_status ON takes (take_mobile, take_status);
CREATE INDEX IF NOT EXISTS idx_takes_pack ON takes (pack_id);

-- Contests
CREATE TABLE IF NOT EXISTS contests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id TEXT UNIQUE,
  contest_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contests_packs (
  contest_id UUID REFERENCES contests(id) ON DELETE CASCADE,
  pack_id UUID REFERENCES packs(id) ON DELETE CASCADE,
  PRIMARY KEY (contest_id, pack_id)
);

-- Achievements
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_key TEXT,
  title TEXT,
  description TEXT,
  value INT,
  profile_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_achievements_profile ON achievements (profile_id);
CREATE INDEX IF NOT EXISTS idx_achievements_key ON achievements (achievement_key);

-- Items
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id TEXT UNIQUE,
  title TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exchanges
CREATE TABLE IF NOT EXISTS exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id),
  item_id UUID REFERENCES items(id),
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exchanges_profile ON exchanges (profile_id);
CREATE INDEX IF NOT EXISTS idx_exchanges_status ON exchanges (status);

-- Outbox
CREATE TABLE IF NOT EXISTS outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbox_recipients (
  outbox_id UUID REFERENCES outbox(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (outbox_id, profile_id)
);

-- Content
CREATE TABLE IF NOT EXISTS content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE,
  body JSONB
);

-- Prizes
CREATE TABLE IF NOT EXISTS prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT,
  pack_id UUID REFERENCES packs(id),
  value TEXT,
  title TEXT
);


