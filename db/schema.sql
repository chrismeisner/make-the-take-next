-- db/schema.sql
-- Postgres schema for core entities

-- H2H matchups (challenge mode)
CREATE TABLE IF NOT EXISTS h2h_matchups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linkage
  pack_id UUID NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  profile_a_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  profile_b_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Public-by-link access token (no PII in URL)
  token TEXT NOT NULL UNIQUE,

  -- Lifecycle: 'pending' (created, awaiting accept), 'accepted' (both bound), 'final' (graded)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','final')),

  -- Results snapshot (set on finalize)
  a_correct INT,
  b_correct INT,
  a_tokens INT,
  b_tokens INT,
  winner_profile_id UUID REFERENCES profiles(id),

  -- Bonus config and outcome (display/log only in v1)
  bonus_amount INT NOT NULL DEFAULT 10,
  tie_policy TEXT NOT NULL DEFAULT 'split', -- 'split' | 'both' | 'none'
  bonus_split_a INT,
  bonus_split_b INT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_h2h_matchups_pack ON h2h_matchups (pack_id);
CREATE INDEX IF NOT EXISTS idx_h2h_matchups_status ON h2h_matchups (status);
CREATE INDEX IF NOT EXISTS idx_h2h_matchups_profiles ON h2h_matchups (profile_a_id, profile_b_id);

-- Optional: prevent duplicate active challenges between same two users on same pack
-- (allows multiple historical finals, but only one non-final at a time)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uniq_active_h2h_per_pair'
  ) THEN
    CREATE UNIQUE INDEX uniq_active_h2h_per_pair
      ON h2h_matchups (pack_id, profile_a_id, profile_b_id)
      WHERE status IN ('pending','accepted');
  END IF;
END $$;

-- Performance: lookups by profile per pack for latest takes
CREATE INDEX IF NOT EXISTS idx_takes_latest_by_profile_pack
  ON takes (profile_id, pack_id) WHERE take_status = 'latest';

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id TEXT,
  team_slug TEXT,
  -- Three-letter/team code like BOS, NYY
  abbreviation TEXT,
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

-- Add abbreviation column idempotently for legacy databases
ALTER TABLE teams ADD COLUMN IF NOT EXISTS abbreviation TEXT;

-- Ensure uniqueness by league for abbreviation where present (e.g., BOS, NYY)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_teams_league_abbreviation ON teams (league, abbreviation) WHERE abbreviation IS NOT NULL;

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

-- Track which profile created the pack
ALTER TABLE packs ADD COLUMN IF NOT EXISTS creator_profile_id UUID REFERENCES profiles(id);
CREATE INDEX IF NOT EXISTS idx_packs_creator ON packs (creator_profile_id);

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
-- Per-pack override for the pack-open SMS template
ALTER TABLE packs ADD COLUMN IF NOT EXISTS pack_open_sms_template TEXT;
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



-- Series: group of packs (packs can belong to multiple series)
CREATE TABLE IF NOT EXISTS series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id TEXT UNIQUE,
  title TEXT,
  summary TEXT,
  cover_url TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Join table for packs in a series (many-to-many)
CREATE TABLE IF NOT EXISTS series_packs (
  series_id UUID REFERENCES series(id) ON DELETE CASCADE,
  pack_id UUID REFERENCES packs(id) ON DELETE CASCADE,
  PRIMARY KEY (series_id, pack_id)
);
CREATE INDEX IF NOT EXISTS idx_series_packs_series ON series_packs (series_id);
CREATE INDEX IF NOT EXISTS idx_series_packs_pack ON series_packs (pack_id);


-- Series followers: per-user follow relationship for series
CREATE TABLE IF NOT EXISTS series_followers (
  series_id UUID REFERENCES series(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (series_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_series_followers_series ON series_followers (series_id);
CREATE INDEX IF NOT EXISTS idx_series_followers_profile ON series_followers (profile_id);



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
-- Whether redemption requires shipping address fields
ALTER TABLE items ADD COLUMN IF NOT EXISTS require_address BOOLEAN NOT NULL DEFAULT FALSE;
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

-- Item-specific unique code inventory for one-time redemption
CREATE TABLE IF NOT EXISTS item_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available', -- available | assigned | redeemed | disabled
  assigned_to_profile_id UUID REFERENCES profiles(id),
  assigned_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, code)
);
CREATE INDEX IF NOT EXISTS idx_item_codes_item_status ON item_codes (item_id, status);
CREATE INDEX IF NOT EXISTS idx_item_codes_assigned ON item_codes (assigned_to_profile_id);

-- Detailed redemption records (shipping/contact info and code linkage)
CREATE TABLE IF NOT EXISTS redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  exchange_id UUID REFERENCES exchanges(id) ON DELETE SET NULL,
  item_code_id UUID REFERENCES item_codes(id) ON DELETE SET NULL,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT,
  special_instructions TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | fulfilled | cancelled
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_redemptions_profile ON redemptions (profile_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_item ON redemptions (item_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_status ON redemptions (status);

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION set_redemptions_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_redemptions_updated_at'
  ) THEN
    CREATE TRIGGER set_redemptions_updated_at
    BEFORE UPDATE ON redemptions
    FOR EACH ROW
    EXECUTE FUNCTION set_redemptions_updated_at();
  END IF;
END $$;

-- Outbox
CREATE TABLE IF NOT EXISTS outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Store structured logs for outbox processing (errors, send attempts, metadata)
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS logs JSONB;

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

-- Extend notification preferences to support team and series subscriptions
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES series(id);

-- Helpful indexes for lookups
CREATE INDEX IF NOT EXISTS idx_notif_prefs_profile_cat ON notification_preferences (profile_id, category);
CREATE INDEX IF NOT EXISTS idx_notif_prefs_team ON notification_preferences (team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notif_prefs_series ON notification_preferences (series_id) WHERE series_id IS NOT NULL;

-- Ensure uniqueness for team and series rows separately (allowing NULLs for others)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notif_prefs_profile_cat_team
  ON notification_preferences (profile_id, category, team_id) WHERE team_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notif_prefs_profile_cat_series
  ON notification_preferences (profile_id, category, series_id) WHERE series_id IS NOT NULL;

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


-- Award Cards: one-time codes that grant free marketplace tokens
CREATE TABLE IF NOT EXISTS award_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  tokens INT NOT NULL CHECK (tokens > 0),
  status TEXT NOT NULL DEFAULT 'available', -- 'available' | 'redeemed' | 'disabled'
  redeemed_by_profile_id UUID REFERENCES profiles(id),
  redeemed_at TIMESTAMPTZ,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_award_cards_status ON award_cards (status);
-- Redirect target after successful claim (team slug)
ALTER TABLE award_cards ADD COLUMN IF NOT EXISTS redirect_team_slug TEXT;
-- Image shown on claim/success modals
ALTER TABLE award_cards ADD COLUMN IF NOT EXISTS image_url TEXT;
-- Redemption requirement fields (e.g., follow a specific team)
ALTER TABLE award_cards ADD COLUMN IF NOT EXISTS requirement_key TEXT; -- e.g., 'follow_team'
ALTER TABLE award_cards ADD COLUMN IF NOT EXISTS requirement_team_slug TEXT;
-- Team requirement as foreign key (optional, resolves from slug when not provided)
ALTER TABLE award_cards ADD COLUMN IF NOT EXISTS requirement_team_id UUID REFERENCES teams(id);
-- Series follow requirement (optional): either by UUID or text ID/slug
ALTER TABLE award_cards ADD COLUMN IF NOT EXISTS requirement_series_id UUID REFERENCES series(id);
ALTER TABLE award_cards ADD COLUMN IF NOT EXISTS requirement_series_slug TEXT;

-- Per-user award redemptions (allow many users, one redemption each)
CREATE TABLE IF NOT EXISTS award_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  award_card_id UUID REFERENCES award_cards(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (award_card_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_award_redemptions_card ON award_redemptions (award_card_id);
CREATE INDEX IF NOT EXISTS idx_award_redemptions_profile ON award_redemptions (profile_id);

-- Store referral enrichment context directly on redemptions (idempotent safe alters)
ALTER TABLE award_redemptions ADD COLUMN IF NOT EXISTS pack_id UUID REFERENCES packs(id);
ALTER TABLE award_redemptions ADD COLUMN IF NOT EXISTS referred_profile_id UUID REFERENCES profiles(id);
ALTER TABLE award_redemptions ADD COLUMN IF NOT EXISTS referred_take_id UUID REFERENCES takes(id);

-- Helpful indexes for profile view and analytics
CREATE INDEX IF NOT EXISTS idx_award_redemptions_profile_redeemed ON award_redemptions (profile_id, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS idx_award_redemptions_pack_referred ON award_redemptions (pack_id, referred_profile_id);

-- Admin Event Audit Log (generic, lightweight)
CREATE TABLE IF NOT EXISTS admin_event_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_key TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  source TEXT,
  pack_id UUID,
  pack_url TEXT,
  prop_id UUID,
  event_id UUID,
  profile_id UUID,
  message TEXT,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_admin_event_audit_log_created ON admin_event_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_event_audit_log_event_key ON admin_event_audit_log (event_key);
CREATE INDEX IF NOT EXISTS idx_admin_event_audit_log_pack ON admin_event_audit_log (pack_id);