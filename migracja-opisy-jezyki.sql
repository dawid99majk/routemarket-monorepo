-- Opisy miejsc w wielu językach.
--
-- Katalog trzymał jeden opis w jednej kolumnie, a wszystkie były po polsku, bo
-- taki był prompt generujący. Przy sześciu językach interfejsu to znaczy, że
-- Niemiec dostaje niemieckie menu i polski opis Hali Stulecia.
--
-- Kluczowe rozróżnienie: opisy w katalogu są WSPÓŁDZIELONE, a nie generowane na
-- żądanie. Gdyby wystarczyło dopisać do promptu "napisz po niemiecku", to
-- pierwszy Niemiec, który zasieje miasto, nadpisałby opisy dla wszystkich
-- pozostałych. Dlatego język musi być wymiarem danych, a nie parametrem
-- pojedynczego zapytania.
--
-- Zostawiamy `description` nietknięte i używamy go jako zapasu. Kolumna jest
-- czytana w kilkunastu miejscach frontu i w API; wywalenie jej teraz zamieniłoby
-- migrację danych w przepisywanie połowy aplikacji. Nowa kolumna dokłada się
-- obok, a odczyt wybiera język z zapasem na starą wartość.

BEGIN;

ALTER TABLE public.place_catalog
  ADD COLUMN IF NOT EXISTS description_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.place_catalog.description_i18n IS
  'Opis per język: {"pl": "...", "en": "..."}. Odczyt: description_i18n->>lang, z zapasem na description.';

-- Istniejące opisy są po polsku — przenosimy je pod klucz "pl", żeby polski
-- użytkownik czytał z tego samego miejsca co wszyscy inni, a nie z wyjątku.
UPDATE public.place_catalog
SET description_i18n = jsonb_build_object('pl', description)
WHERE description <> ''
  AND NOT (description_i18n ? 'pl');

-- Wyszukiwanie po języku bez skanowania całej tabeli.
CREATE INDEX IF NOT EXISTS idx_place_catalog_opis_jezyki
  ON public.place_catalog USING gin (description_i18n jsonb_path_ops);

COMMIT;

\echo ''
\echo '=== stan po migracji ==='
SELECT
  count(*) AS wszystkich,
  count(*) FILTER (WHERE description_i18n ? 'pl') AS ma_pl,
  count(*) FILTER (WHERE description_i18n ? 'en') AS ma_en,
  count(*) FILTER (WHERE description_i18n = '{}'::jsonb) AS bez_zadnego
FROM public.place_catalog;
