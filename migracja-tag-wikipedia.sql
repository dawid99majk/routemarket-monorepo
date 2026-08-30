-- Tag `wikipedia` z OpenStreetMap w katalogu.
--
-- `/catalog/seed` przekazywał go do dobierania zdjęć jako powiązanie twarde:
-- obiekt sam wskazuje swój artykuł, a artykuł ma zdjęcie wiodące wybrane przez
-- człowieka. `/catalog/refresh-photos` tego tagu NIE przekazywał — nie miał go
-- skąd wziąć, bo katalog trzymał tylko `osm_id`. Odświeżanie zdjęć zostawało
-- więc z wyszukiwaniem po nazwie i po okolicy, a to potrafi wziąć zdjęcie
-- sąsiedniego budynku: Opera Wrocławska dostała kościół stojący 200 m dalej,
-- choć jej własny artykuł ma poprawne zdjęcie opery.
--
-- Kolumna jest wypełniana z Overpassa dla pozycji z `osm_id`.

BEGIN;

ALTER TABLE public.place_catalog
  ADD COLUMN IF NOT EXISTS wikipedia text;

COMMIT;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'place_catalog' AND column_name = 'wikipedia';

SELECT count(*) FILTER (WHERE osm_id IS NOT NULL) AS z_osm_id,
       count(*) FILTER (WHERE wikipedia IS NOT NULL) AS z_tagiem,
       count(*) AS razem
FROM public.place_catalog;
