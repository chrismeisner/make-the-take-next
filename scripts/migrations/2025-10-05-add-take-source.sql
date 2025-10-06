-- Adds take_source attribution to takes
-- Safe to run multiple times

ALTER TABLE takes
  ADD COLUMN IF NOT EXISTS take_source TEXT NOT NULL DEFAULT 'unknown'
  CHECK (take_source IN ('web','sms','admin','api','unknown'));

-- Helpful filter for analytics on current latest takes
CREATE INDEX IF NOT EXISTS idx_takes_source_latest ON takes (take_source)
  WHERE take_status = 'latest';


