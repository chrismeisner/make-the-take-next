-- Safe performance indexes for Make The Take (run in production with CONCURRENTLY where supported)

-- packs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_packs_created_at ON packs (created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_packs_pack_status ON packs (pack_status);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uidx_packs_pack_url ON packs (pack_url);

-- props
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_props_pack_id ON props (pack_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_props_open_time ON props (open_time);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_props_close_time ON props (close_time);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_props_prop_id ON props (prop_id);

-- takes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_takes_pack_status ON takes (pack_id, take_status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_takes_status_mobile ON takes (take_status, take_mobile);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_takes_prop_status ON takes (prop_id_text, take_status);

-- profiles
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_mobile ON profiles (mobile_e164);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uidx_profiles_profile_id ON profiles (profile_id);

-- items
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_status ON items (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_tokens ON items (tokens);

