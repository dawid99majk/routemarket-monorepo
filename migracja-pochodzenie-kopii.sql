-- Skąd wzięła się kopia tablicy.
--
-- Bez tego pola nic nie łączyło kopii ze źródłem: „Skopiuj do swojego wyjazdu"
-- dawało się klikać w nieskończoność i za każdym razem powstawał kolejny,
-- identyczny wyjazd. Użytkownik nie miał też jak trafić do kopii, którą już zrobił.
--
-- ON DELETE SET NULL, nie CASCADE: skasowanie cudzej tablicy źródłowej nie może
-- zabrać ze sobą MOJEGO wyjazdu, który z niej powstał i który od tamtej pory
-- mogłem zmienić nie do poznania.

BEGIN;

ALTER TABLE public.trip_projects
  ADD COLUMN IF NOT EXISTS copied_from uuid
    REFERENCES public.trip_projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS copied_at timestamptz;

-- Szukamy zawsze po parze (właściciel, źródło) — „czy JA już to skopiowałem".
CREATE INDEX IF NOT EXISTS trip_projects_kopia_idx
  ON public.trip_projects (user_id, copied_from)
  WHERE copied_from IS NOT NULL;

COMMIT;

-- Kontrola: obie kolumny istnieją, indeks stoi, dotychczasowe wiersze mają NULL.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'trip_projects' AND column_name IN ('copied_from', 'copied_at')
ORDER BY column_name;

SELECT count(*) AS wierszy_z_pochodzeniem
FROM public.trip_projects WHERE copied_from IS NOT NULL;
