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

-- Add short display name for teams
ALTER TABLE teams ADD COLUMN IF NOT EXISTS short_name TEXT;

-- Add attachment-like JSONB fields for team sides
ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_home_side JSONB;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_away_side JSONB;

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
  home_team TEXT,
  away_team TEXT,
  home_team_id UUID REFERENCES teams(id),
  away_team_id UUID REFERENCES teams(id)
);
CREATE INDEX IF NOT EXISTS idx_events_league_time ON events (league, event_time);

-- Add a stable external text identifier for Events (similar to packs.pack_id)
-- This can mirror Airtable's formula field or espn_game_id when available
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_id TEXT UNIQUE;

-- Add venue/location fields to events
ALTER TABLE events ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue TEXT;

-- Add broadcast fields to events
ALTER TABLE events ADD COLUMN IF NOT EXISTS tv TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS streaming TEXT;

-- Add NFL week number
ALTER TABLE events ADD COLUMN IF NOT EXISTS week INT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_url TEXT;

-- Packs
CREATE TABLE IF NOT EXISTS packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_url TEXT UNIQUE,
  title TEXT,
  event_id UUID REFERENCES events(id),
  pack_status TEXT,
  prize TEXT,
  league TEXT,
  featured_status TEXT,
  cover_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_packs_event ON packs (event_id);

-- Optional: Many-to-many relation between packs and events
CREATE TABLE IF NOT EXISTS packs_events (
  pack_id UUID REFERENCES packs(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  PRIMARY KEY (pack_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_packs_events_pack ON packs_events (pack_id);
CREATE INDEX IF NOT EXISTS idx_packs_events_event ON packs_events (event_id);

-- Add external pack_id (text) for cross-backend stable ID and backfill existing rows
ALTER TABLE packs ADD COLUMN IF NOT EXISTS pack_id TEXT UNIQUE;
UPDATE packs
  SET pack_id = LEFT(ENCODE(gen_random_bytes(9), 'hex'), 12)
  WHERE pack_id IS NULL;

-- Add pack-level open/close windows if not present
ALTER TABLE packs ADD COLUMN IF NOT EXISTS pack_open_time TIMESTAMPTZ;
ALTER TABLE packs ADD COLUMN IF NOT EXISTS pack_close_time TIMESTAMPTZ;
-- For debugging timezone issues: store close time as raw text to preserve exact input
-- Safe no-op if already TEXT
DO $$ BEGIN
  PERFORM 1
  FROM information_schema.columns
  WHERE table_name = 'packs' AND column_name = 'pack_close_time' AND data_type = 'text';
  IF NOT FOUND THEN
    BEGIN
      ALTER TABLE packs ALTER COLUMN pack_close_time TYPE TEXT USING pack_close_time::text;
    EXCEPTION WHEN others THEN
      -- If the cast fails or permissions are missing, ignore here; run manually in migration
      RAISE NOTICE 'Skipping pack_close_time type change to TEXT';
    END;
  END IF;
END $$;

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
-- Ensure short side labels exist for A/B
ALTER TABLE props ADD COLUMN IF NOT EXISTS prop_side_a_short TEXT;
ALTER TABLE props ADD COLUMN IF NOT EXISTS prop_side_b_short TEXT;
-- Store per-side take text for A/B
ALTER TABLE props ADD COLUMN IF NOT EXISTS prop_side_a_take TEXT;
ALTER TABLE props ADD COLUMN IF NOT EXISTS prop_side_b_take TEXT;
-- Computed numeric values per side (from moneyline)
ALTER TABLE props ADD COLUMN IF NOT EXISTS prop_side_a_value NUMERIC;
ALTER TABLE props ADD COLUMN IF NOT EXISTS prop_side_b_value NUMERIC;
CREATE INDEX IF NOT EXISTS idx_props_pack ON props (pack_id);
CREATE INDEX IF NOT EXISTS idx_props_event ON props (event_id);
CREATE INDEX IF NOT EXISTS idx_props_status ON props (prop_status);
CREATE INDEX IF NOT EXISTS idx_props_formula_key ON props (formula_key);

-- Store final computed result text and grading timestamp
ALTER TABLE props ADD COLUMN IF NOT EXISTS prop_result TEXT;
ALTER TABLE props ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ;

-- Track creation time for props
ALTER TABLE props ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Track last update time for props
ALTER TABLE props ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Ensure updated_at is set on every UPDATE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at'
  ) THEN
    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
    BEGIN
      NEW.updated_at := NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_props_updated_at'
  ) THEN
    CREATE TRIGGER set_props_updated_at
    BEFORE UPDATE ON props
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

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
  title TEXT,
  summary TEXT,
  prize TEXT,
  details TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  cover_url TEXT,
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

-- Prizes table is deprecated; intentionally not created in Postgres schema


