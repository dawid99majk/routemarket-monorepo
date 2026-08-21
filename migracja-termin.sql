-- Termin wyjazdu należy do tablicy, nie do planu.
--
-- Do tej pory datę wpisywało się przy zakładaniu wyjazdu, parseTermin poprawnie ją
-- rozpoznawał — i utworzWyjazd brał z wyniku wyłącznie liczbę dni, wyrzucając samą
-- datę startu. Tablica nie miała gdzie jej trzymać. Efekt: termin wpisany na
-- pierwszym ekranie znikał bezpowrotnie, a na tablicy nie było jak go dodać.
--
-- Data jest opcjonalna i taka zostaje. Wyjazd bez terminu ma działać normalnie —
-- to szkic, o którym mówi przewodnik. Dopiero gdy termin jest, zaczyna sterować
-- godzinami otwarcia i kolejnością wydarzeń.

BEGIN;

ALTER TABLE trip_projects
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date   date;

COMMENT ON COLUMN trip_projects.start_date IS
  'Pierwszy dzień wyjazdu. NULL = wyjazd bez terminu, czyli szkic.';
COMMENT ON COLUMN trip_projects.end_date IS
  'Ostatni dzień wyjazdu. Wyliczany z start_date i days, gdy nie podano wprost.';

-- Część tablic ma już plany z datą — to jedyny ślad terminu, jaki przetrwał.
-- Przenosimy go na tablicę, żeby sortowanie wydarzeń miało od czego zacząć.
UPDATE trip_projects p
   SET start_date = z.start_date,
       end_date   = z.start_date + (COALESCE(p.days, 1) - 1)
  FROM (
    SELECT DISTINCT ON (project_id) project_id, start_date
      FROM trip_plans
     WHERE start_date IS NOT NULL
     ORDER BY project_id, created_at DESC
  ) z
 WHERE z.project_id = p.id
   AND p.start_date IS NULL;

COMMIT;

-- Cofnięcie:
--   ALTER TABLE trip_projects DROP COLUMN start_date, DROP COLUMN end_date;
