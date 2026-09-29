-- Licencje zdjęć z Wikimedia Commons — żeby serwis mógł podpisać autora.
--
-- Zdjęcia katalogu i tablic to pliki z Commons (upload.wikimedia.org). Licencje
-- CC BY i CC BY-SA wymagają podania autora, licencji i źródła przy każdym użyciu;
-- serwis pokazywał je bez podpisu. Metadane pobiera skrypt wsadowy (zdjecia_licencje.mjs)
-- z API Commons, jeden wiersz na plik — to samo zdjęcie na wielu tablicach to jeden wpis.
--
-- Tylko odczyt dla wszystkich (podpis jest publiczny z natury), zapis wyłącznie
-- rolą serwisową. Tabela jest pochodna: da się ją w całości odtworzyć skryptem.

BEGIN;

CREATE TABLE IF NOT EXISTS public.zdjecia_licencje (
  plik          text PRIMARY KEY,          -- nazwa pliku w Commons, np. „Colosseo_2020.jpg”
  autor         text,                      -- oczyszczone pole Artist; null = autor nieznany
  licencja      text,                      -- krótka nazwa, np. „CC BY-SA 4.0”, „Public domain”
  licencja_url  text,
  strona        text,                      -- strona pliku w Commons (źródło)
  rodzaj        text CHECK (rodzaj IN ('PD', 'BY', 'BY-SA', 'INNA')),
  dozwolona     boolean NOT NULL DEFAULT false,  -- PD/CC0/CC BY/CC BY-SA
  sprawdzono_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.zdjecia_licencje IS
  'Autor i licencja zdjęć z Wikimedia Commons do podpisów w serwisie. Pochodna — odtwarzalna skryptem zdjecia_licencje.mjs.';

ALTER TABLE public.zdjecia_licencje ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zdjecia_licencje: odczyt dla wszystkich" ON public.zdjecia_licencje;
CREATE POLICY "zdjecia_licencje: odczyt dla wszystkich"
  ON public.zdjecia_licencje FOR SELECT TO anon, authenticated USING (true);

REVOKE ALL ON public.zdjecia_licencje FROM anon, authenticated;
GRANT SELECT ON public.zdjecia_licencje TO anon, authenticated;

-- Kontrola: tabela istnieje, RLS włączone, klient ma tylko SELECT.
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'zdjecia_licencje';
SELECT grantee, string_agg(privilege_type, ', ') FROM information_schema.role_table_grants
 WHERE table_name = 'zdjecia_licencje' AND grantee IN ('anon', 'authenticated') GROUP BY grantee;

COMMIT;
