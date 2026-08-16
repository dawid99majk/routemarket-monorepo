-- Odchudzenie zapytań feedu (16.08.2026):
-- 1. Lista miast szła jako 500 wierszy do przeglądarki i deduplikacja w JS —
--    teraz DISTINCT robi baza.
-- 2. Indeksy pod realne filtry: feed (city ilike + pin_count), okolica (bbox
--    po lat/lng), podobne (overlap vibe_tags).
BEGIN;

CREATE OR REPLACE FUNCTION public.catalog_cities()
RETURNS TABLE(city text)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT DISTINCT city FROM place_catalog
  WHERE city IS NOT NULL AND status <> 'hidden'
  ORDER BY 1
$$;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_place_catalog_city_pin  ON place_catalog (city, pin_count DESC);
CREATE INDEX IF NOT EXISTS idx_place_catalog_city_trgm ON place_catalog USING gin (city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_place_catalog_latlng    ON place_catalog (lat, lng);
CREATE INDEX IF NOT EXISTS idx_place_catalog_vibe      ON place_catalog USING gin (vibe_tags);
CREATE INDEX IF NOT EXISTS idx_tpp_project             ON trip_project_places (project_id);

COMMIT;
