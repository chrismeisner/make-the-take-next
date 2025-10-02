BEGIN;

-- Ensure award_cards.kind exists for promo/award split
ALTER TABLE award_cards
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'award';

-- Allow NULL/0 tokens for promo; keep >0 for award
ALTER TABLE award_cards
  ALTER COLUMN tokens DROP NOT NULL;

-- Drop old tokens checks if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'award_cards' AND constraint_name = 'award_cards_tokens_check'
  ) THEN
    ALTER TABLE award_cards DROP CONSTRAINT award_cards_tokens_check;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'award_cards' AND constraint_name = 'award_cards_tokens_kind_check'
  ) THEN
    ALTER TABLE award_cards DROP CONSTRAINT award_cards_tokens_kind_check;
  END IF;
END $$;

ALTER TABLE award_cards
  ADD CONSTRAINT award_cards_tokens_kind_check CHECK (
    (kind = 'award' AND tokens IS NOT NULL AND tokens > 0)
    OR
    (kind = 'promo' AND (tokens IS NULL OR tokens = 0))
  );

-- Add optional item columns referenced by admin items API
ALTER TABLE items ADD COLUMN IF NOT EXISTS item_type TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS external_url TEXT;

-- Ensure notification_preferences has team_id/series_id columns used for follows
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES series(id);

-- Ensure unique constraints to support ON CONFLICT in follow endpoints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uniq_notif_prefs_profile_cat_team'
  ) THEN
    ALTER TABLE notification_preferences
      ADD CONSTRAINT uniq_notif_prefs_profile_cat_team UNIQUE (profile_id, category, team_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uniq_notif_prefs_profile_cat_series'
  ) THEN
    ALTER TABLE notification_preferences
      ADD CONSTRAINT uniq_notif_prefs_profile_cat_series UNIQUE (profile_id, category, series_id);
  END IF;
END $$;

COMMIT;


