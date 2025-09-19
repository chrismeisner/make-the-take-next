-- Create redemptions table to store detailed redemption information
-- This extends the exchanges table with additional shipping/contact details

CREATE TABLE IF NOT EXISTS redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id),
  item_id UUID REFERENCES items(id),
  exchange_id UUID REFERENCES exchanges(id), -- Link to the exchange record
  
  -- Contact information
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  
  -- Shipping address
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  country TEXT NOT NULL,
  
  -- Additional details
  special_instructions TEXT,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, shipped, delivered, cancelled
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Admin notes
  admin_notes TEXT,
  tracking_number TEXT,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_redemptions_profile ON redemptions (profile_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_item ON redemptions (item_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_exchange ON redemptions (exchange_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_status ON redemptions (status);
CREATE INDEX IF NOT EXISTS idx_redemptions_created ON redemptions (created_at DESC);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION set_redemptions_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_redemptions_updated_at
  BEFORE UPDATE ON redemptions
  FOR EACH ROW
  EXECUTE FUNCTION set_redemptions_updated_at();
