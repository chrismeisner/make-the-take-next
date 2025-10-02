-- Create a consolidated view for leaderboard calculations
-- Dependencies: takes, props, packs, events, props_teams, profiles, packs_events

CREATE OR REPLACE VIEW v_take_facts AS
WITH pack_events AS (
  SELECT p.id AS pack_id, e.event_time
    FROM packs p
    LEFT JOIN events e ON e.id = p.event_id
  UNION ALL
  SELECT pe.pack_id, e.event_time
    FROM packs_events pe
    JOIN events e ON e.id = pe.event_id
),
take_base AS (
  SELECT
    t.id               AS take_id,
    t.take_mobile      AS take_mobile,
    t.profile_id       AS profile_id,
    t.take_status      AS take_status,
    t.take_result      AS take_result,
    COALESCE(t.take_pts, 0) AS take_pts,
    t.prop_id          AS prop_id,
    t.prop_id_text     AS prop_id_text,
    t.pack_id          AS pack_id,
    t.created_at       AS take_created_at
  FROM takes t
  WHERE t.take_status = 'latest'
),
joined AS (
  SELECT
    tb.take_id,
    tb.take_mobile,
    tb.profile_id,
    tb.take_status,
    tb.take_result,
    tb.take_pts,
    tb.prop_id,
    tb.prop_id_text,
    tb.pack_id,
    tb.take_created_at,
    COALESCE(pe.event_time, e.event_time) AS event_time
  FROM take_base tb
  LEFT JOIN packs pk ON pk.id = tb.pack_id
  LEFT JOIN events e ON e.id = pk.event_id
  LEFT JOIN pack_events pe ON pe.pack_id = tb.pack_id
)
SELECT DISTINCT ON (j.take_id, pt.team_id)
  j.take_id,
  j.take_mobile,
  j.profile_id,
  j.take_status,
  j.take_result,
  j.take_pts,
  j.prop_id,
  j.prop_id_text,
  j.pack_id,
  j.take_created_at,
  j.event_time,
  pt.team_id
FROM joined j
LEFT JOIN props_teams pt ON pt.prop_id = j.prop_id;

-- Helpful indexes for the view consumers (note: indexes on views require materialization; these are left as comments)
-- For heavier traffic, promote to a MATERIALIZED VIEW and add indexes:
-- CREATE MATERIALIZED VIEW v_take_facts_mat AS SELECT * FROM v_take_facts;
-- CREATE INDEX idx_vtf_profile ON v_take_facts_mat (profile_id);
-- CREATE INDEX idx_vtf_team ON v_take_facts_mat (team_id);
-- CREATE INDEX idx_vtf_pack ON v_take_facts_mat (pack_id);
-- CREATE INDEX idx_vtf_event_time ON v_take_facts_mat (event_time);


