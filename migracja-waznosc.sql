-- Ważność miejsca — wymiar, którego katalog nie miał w ogóle.
--
-- Do dziś jedynym sygnałem był `pin_count`, czyli ile razy ktoś przypiął miejsce
-- do tablicy. Przy pięciu kontach jest to zero dla wszystkich 414 pozycji, więc
-- feed w /odkrywaj sortuje po samych zerach, planer dobiera wypełniacze na
-- chybił trafił, a tablica przykładowa wybrała na pierwszą wizytę w Porto kino
-- i przydrożną kapliczkę, pomijając katedrę.
--
-- Sygnał bierzemy z liczby wersji językowych artykułu na Wikipedii. To dobry
-- zamiennik rozpoznawalności: Livraria Lello ma kilkadziesiąt, przydrożna
-- kapliczka nie ma żadnej. Nie jest doskonały — miejsca świeżo otwarte i lokalne
-- perełki wypadają nisko — dlatego zostaje sygnałem POMOCNICZYM, a nie jedynym.
-- Gdy pojawią się użytkownicy, pin_count zacznie mówić o tym, co ludzie naprawdę
-- wybierają, i wtedy oba będą się uzupełniać.

BEGIN;

ALTER TABLE public.place_catalog
  ADD COLUMN IF NOT EXISTS waznosc smallint,
  ADD COLUMN IF NOT EXISTS waznosc_zrodlo text;

COMMENT ON COLUMN public.place_catalog.waznosc IS
  'Rozpoznawalność: liczba wersji językowych artykułu na Wikipedii. NULL = nie sprawdzano, 0 = sprawdzono i nie ma artykułu.';
COMMENT ON COLUMN public.place_catalog.waznosc_zrodlo IS
  'Skąd wzięta wartość — na razie zawsze "wikipedia", ale kolumna zostawia miejsce na inne źródła.';

-- Sortowanie feedu i doboru wypełniaczy idzie po ważności malejąco.
CREATE INDEX IF NOT EXISTS idx_place_catalog_waznosc
  ON public.place_catalog (city, waznosc DESC NULLS LAST);

COMMIT;

\echo ''
\echo '=== stan po migracji ==='
SELECT count(*) AS wszystkich,
       count(waznosc) AS ma_waznosc,
       count(*) FILTER (WHERE pin_count > 0) AS ma_przypiecia
FROM public.place_catalog;
