-- Tablice przykładowe odróżnione od tablic użytkowników.
--
-- Galeria nazywa się „Tablice od podróżników", a każdy kafelek pokazuje autora
-- z kółkiem inicjałów — czyli wizualnie deklaruje, że za tablicą stoi człowiek,
-- który tam był. Publikowanie tam planów wygenerowanych maszynowo byłoby
-- fabrykowaniem dowodu społecznego.
--
-- Flaga nie zmienia uprawnień: tablica przykładowa to zwykła tablica publiczna,
-- podlega tym samym politykom. Zmienia wyłącznie to, co widzi czytający.

BEGIN;

ALTER TABLE public.trip_projects
  ADD COLUMN IF NOT EXISTS is_example boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.trip_projects.is_example IS
  'Tablica przygotowana przez RouteMarket jako przykład, nie relacja z wyjazdu użytkownika. Kafelek pokazuje wtedy etykietę zamiast autora.';

-- Indeks częściowy: przykładów będzie garstka wobec tablic użytkowników,
-- a filtrowanie po nich ma być tanie także wtedy, gdy tych drugich przybędzie.
CREATE INDEX IF NOT EXISTS idx_trip_projects_przykladowe
  ON public.trip_projects (is_example) WHERE is_example;

COMMIT;

\echo ''
\echo '=== kolumna po migracji ==='
SELECT count(*) FILTER (WHERE is_example) AS przykladowych,
       count(*) FILTER (WHERE is_public AND NOT is_example) AS publicznych_uzytkownikow,
       count(*) AS wszystkich
FROM public.trip_projects;
