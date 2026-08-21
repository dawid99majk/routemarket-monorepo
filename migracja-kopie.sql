-- Licznik kopii podbija ten, kto kopiuje — a więc nie właściciel tablicy.
-- Polityka "Owners manage projects" słusznie mu tego zabrania, więc podbicie idzie
-- przez funkcję z podniesionymi uprawnieniami. Zakres jest wąski celowo: jedna
-- kolumna, wyłącznie na tablicy publicznej, bez możliwości podania wartości.

BEGIN;

CREATE OR REPLACE FUNCTION rm_podbij_kopie(p_project uuid) RETURNS void AS $$
BEGIN
  UPDATE trip_projects
     SET copy_count = COALESCE(copy_count, 0) + 1
   WHERE id = p_project
     AND is_public;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION rm_podbij_kopie(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rm_podbij_kopie(uuid) TO authenticated;

COMMIT;
