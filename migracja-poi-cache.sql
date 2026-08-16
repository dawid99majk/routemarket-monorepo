-- Trwały cache POI z Overpassa (16.08.2026). Pisze i czyta wyłącznie
-- route-builder-api przez service_role; RLS bez polityk = zero dostępu klientów.
BEGIN;
CREATE TABLE IF NOT EXISTS poi_cache (
  key        text PRIMARY KEY,
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE poi_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON poi_cache FROM anon, authenticated;
COMMIT;
