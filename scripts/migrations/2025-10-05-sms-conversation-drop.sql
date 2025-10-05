-- 2025-10-05: SMS conversation drop support

-- Ensure pgcrypto for gen_random_uuid
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Per-pack drop strategy
ALTER TABLE packs
  ADD COLUMN IF NOT EXISTS drop_strategy TEXT NOT NULL DEFAULT 'link'
  CHECK (drop_strategy IN ('link','sms_conversation'));

-- 2) Per-user SMS take session state
CREATE TABLE IF NOT EXISTS sms_take_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id),
  phone TEXT NOT NULL,
  pack_id UUID NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  current_prop_index INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- active | completed | expired
  last_inbound_sid TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_take_sessions_pack ON sms_take_sessions (pack_id);
CREATE INDEX IF NOT EXISTS idx_sms_take_sessions_phone ON sms_take_sessions (phone);
CREATE INDEX IF NOT EXISTS idx_sms_take_sessions_status ON sms_take_sessions (status);

-- Ensure at most one active session per (user or phone)+pack
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uniq_active_sms_session'
  ) THEN
    CREATE UNIQUE INDEX uniq_active_sms_session
      ON sms_take_sessions ((COALESCE(profile_id::text, phone)), pack_id)
      WHERE status = 'active';
  END IF;
END $$;

-- Optional helper to keep updated_at fresh on updates
CREATE OR REPLACE FUNCTION set_sms_sessions_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_sms_take_sessions_updated_at'
  ) THEN
    CREATE TRIGGER set_sms_take_sessions_updated_at
      BEFORE UPDATE ON sms_take_sessions
      FOR EACH ROW
      EXECUTE FUNCTION set_sms_sessions_updated_at();
  END IF;
END $$;


