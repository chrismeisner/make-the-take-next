-- db/schema.sql
-- Postgres schema for core entities

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id TEXT,
  team_slug TEXT,
  name TEXT,
  league TEXT,
  emoji TEXT,
  logo_url TEXT
);
CREATE INDEX IF NOT EXISTS idx_teams_league ON teams (league);
-- Ensure uniqueness by league for team_id and team_slug
CREATE UNIQUE INDEX IF NOT EXISTS uniq_teams_league_team_id ON teams (league, team_id) WHERE team_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_teams_league_team_slug ON teams (league, team_slug) WHERE team_slug IS NOT NULL;

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

-- Admin flag on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS super_admin BOOLEAN NOT NULL DEFAULT FALSE;

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

-- Create or replace the trigger function (idempotent)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
CREATE INDEX IF NOT EXISTS idx_props_teams_team_prop ON props_teams (team_id, prop_id);

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

-- Link takes to profiles (one-to-many)
ALTER TABLE takes ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id);
CREATE INDEX IF NOT EXISTS idx_takes_profile ON takes (profile_id);

-- Store grading outcome per take to mirror Airtable takeResult
ALTER TABLE takes ADD COLUMN IF NOT EXISTS take_result TEXT;
-- Store points earned per take (mirrors Airtable takePTS)
ALTER TABLE takes ADD COLUMN IF NOT EXISTS take_pts NUMERIC;
-- Store tokens earned per take (derived as 5% of take_pts)
ALTER TABLE takes ADD COLUMN IF NOT EXISTS tokens NUMERIC;

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



-- Items
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id TEXT UNIQUE,
  title TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Marketplace fields for items
ALTER TABLE items ADD COLUMN IF NOT EXISTS tokens INT NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_items_status ON items (status);
CREATE INDEX IF NOT EXISTS idx_items_featured ON items (featured);

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

-- Tokens spent per exchange (for marketplace balance)
ALTER TABLE exchanges ADD COLUMN IF NOT EXISTS exchange_tokens INT;

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




-- Performance indexes for packs listing and aggregates
-- Speed up homepage packs query filtering by status and ordering by created_at
CREATE INDEX IF NOT EXISTS idx_packs_status_created ON packs (pack_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_packs_created ON packs (created_at DESC);

-- Speed up total take counts grouped by pack when filtering latest only
CREATE INDEX IF NOT EXISTS idx_takes_latest_by_pack ON takes (pack_id) WHERE take_status = 'latest';
-- Speed up per-user take counts for latest by pack
CREATE INDEX IF NOT EXISTS idx_takes_latest_by_mobile_pack ON takes (take_mobile, pack_id) WHERE take_status = 'latest';

-- Help MIN/MAX window scans per pack
CREATE INDEX IF NOT EXISTS idx_props_pack_open_close ON props (pack_id, open_time, close_time);

-- Promo Links: admin-controlled short keys that route promo traffic
CREATE TABLE IF NOT EXISTS promo_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE,
  destination_url TEXT NOT NULL,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INT NOT NULL DEFAULT 0,
  clicks INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_promo_links_active ON promo_links (active);
CREATE INDEX IF NOT EXISTS idx_promo_links_key ON promo_links (key);
CREATE INDEX IF NOT EXISTS idx_promo_links_priority ON promo_links (priority DESC);

-- Create or replace promo_links updated_at trigger function
CREATE OR REPLACE FUNCTION set_promo_links_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_promo_links_updated_at'
  ) THEN
    CREATE TRIGGER set_promo_links_updated_at
    BEFORE UPDATE ON promo_links
    FOR EACH ROW
    EXECUTE FUNCTION set_promo_links_updated_at();
  END IF;
END $$;

-- Notifications: link packs to profiles who asked to be notified
CREATE TABLE IF NOT EXISTS pack_notifications (
  pack_id UUID REFERENCES packs(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pack_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_pack_notifications_pack ON pack_notifications (pack_id);
CREATE INDEX IF NOT EXISTS idx_pack_notifications_profile ON pack_notifications (profile_id);

-- Notification preferences: per-user opt-ins by category/league
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,  -- e.g. 'pack_open'
  league TEXT,             -- e.g. 'nfl', 'mlb'; NULL for global categories
  opted_in BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, category, league)
);
CREATE INDEX IF NOT EXISTS idx_notif_prefs_category_league_optin
  ON notification_preferences (category, league, opted_in);

-- SMS rules: simple templates per trigger/league
CREATE TABLE IF NOT EXISTS sms_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key TEXT UNIQUE,
  title TEXT,
  trigger_type TEXT NOT NULL, -- e.g. 'pack_open'
  league TEXT,                -- nullable if global
  template TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Global SMS opt-out flag on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sms_opt_out_all BOOLEAN NOT NULL DEFAULT FALSE;