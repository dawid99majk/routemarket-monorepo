-- Nowa tablica powstaje jako publiczna.
--
-- Decyzja produktowa właściciela: przełącznik dostępu ma z automatu stać na
-- „Publiczna", a użytkownik przełącza go na „Prywatna", jeśli chce.
--
-- ZMIENIAMY WYŁĄCZNIE WARTOŚĆ DOMYŚLNĄ DLA NOWYCH WIERSZY. Istniejące tablice
-- zostają nietknięte — jedenaście z nich jest dziś prywatnych i ich autorzy
-- wybrali to świadomie. Retroaktywne opublikowanie cudzej prywatnej tablicy
-- byłoby ujawnieniem treści, na które nikt się nie zgodził.
--
-- Skutek do świadomego przyjęcia: od teraz każdy nowy wyjazd obejrzy każdy, kto
-- dostanie odnośnik — także bez konta — razem z nazwą, którą podpisuje się autor.

BEGIN;

ALTER TABLE public.trip_projects
  ALTER COLUMN is_public SET DEFAULT true;

COMMIT;

-- Kontrola: default ma być `true`, a rozkład istniejących wierszy bez zmian
-- (przed migracją: 30 publicznych, 11 prywatnych).
SELECT column_default AS domyslna
FROM information_schema.columns
WHERE table_name = 'trip_projects' AND column_name = 'is_public';

SELECT is_public, count(*) AS ile
FROM public.trip_projects
GROUP BY is_public
ORDER BY is_public;
