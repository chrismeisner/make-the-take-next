-- Create SMS inbox table in Postgres
-- Safe to run multiple times

CREATE TABLE IF NOT EXISTS sms_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_sid TEXT,
  from_e164 TEXT NOT NULL,
  to_e164 TEXT,
  body TEXT,
  matched_keyword TEXT,
  webhook_status TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_inbox_received_at ON sms_inbox (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_inbox_from ON sms_inbox (from_e164);

-- Trigger to keep updated_at fresh (idempotent)
CREATE OR REPLACE FUNCTION set_sms_inbox_updated_at()
RETURNS TRIGGER AS $func$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sms_inbox_set_updated_at ON sms_inbox;
CREATE TRIGGER trg_sms_inbox_set_updated_at
  BEFORE UPDATE ON sms_inbox
  FOR EACH ROW
  EXECUTE FUNCTION set_sms_inbox_updated_at();


