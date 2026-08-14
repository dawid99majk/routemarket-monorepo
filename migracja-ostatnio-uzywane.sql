-- Kolumna updated_at istniała od początku, ale nic do niej nie pisało: na żadnej
-- z 15 tablic nie różniła się od created_at, nawet po zmianie preferencji czy
-- dołożeniu miejsc. Sortowanie "po ostatniej zmianie" dawało więc dokładnie ten
-- sam wynik co "po dacie utworzenia".
--
-- Praca przy tablicy to nie tylko edycja samego wiersza. Najczęściej to dołożenie
-- miejsca albo wygenerowanie planu — jedno i drugie dotyka innych tabel, więc
-- one też muszą podbijać znacznik tablicy nadrzędnej.

BEGIN;

-- Edycja samej tablicy: nazwa, preferencje, punkt startowy, publikacja.
CREATE OR REPLACE FUNCTION rm_dotknij_tablice() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rm_trg_tablica_dotknieta ON trip_projects;
CREATE TRIGGER rm_trg_tablica_dotknieta
  BEFORE UPDATE ON trip_projects
  FOR EACH ROW EXECUTE FUNCTION rm_dotknij_tablice();

-- Dołożenie, przeniesienie do innego kubełka albo usunięcie miejsca.
CREATE OR REPLACE FUNCTION rm_dotknij_tablice_z_dziecka() RETURNS trigger AS $$
BEGIN
  UPDATE trip_projects SET updated_at = now()
   WHERE id = COALESCE(NEW.project_id, OLD.project_id);
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rm_trg_miejsce_dotyka_tablice ON trip_project_places;
CREATE TRIGGER rm_trg_miejsce_dotyka_tablice
  AFTER INSERT OR UPDATE OR DELETE ON trip_project_places
  FOR EACH ROW EXECUTE FUNCTION rm_dotknij_tablice_z_dziecka();

-- Wygenerowanie albo skasowanie planu.
DROP TRIGGER IF EXISTS rm_trg_plan_dotyka_tablice ON trip_plans;
CREATE TRIGGER rm_trg_plan_dotyka_tablice
  AFTER INSERT OR UPDATE OR DELETE ON trip_plans
  FOR EACH ROW EXECUTE FUNCTION rm_dotknij_tablice_z_dziecka();

-- Bez tego sortowanie "ostatnio używane" byłoby na starcie bezużyteczne: wszystkie
-- tablice miałyby znacznik z chwili założenia. Odtwarzamy go z tego, co faktycznie
-- się przy nich działo — najpóźniejszej daty spośród tablicy, jej miejsc i planów.
UPDATE trip_projects p SET updated_at = GREATEST(
  p.created_at,
  COALESCE((SELECT max(created_at) FROM trip_project_places WHERE project_id = p.id), p.created_at),
  COALESCE((SELECT max(created_at) FROM trip_plans          WHERE project_id = p.id), p.created_at)
);

COMMIT;

-- Cofnięcie, gdyby coś przeszkadzało:
--   DROP TRIGGER rm_trg_tablica_dotknieta ON trip_projects;
--   DROP TRIGGER rm_trg_miejsce_dotyka_tablice ON trip_project_places;
--   DROP TRIGGER rm_trg_plan_dotyka_tablice ON trip_plans;
--   DROP FUNCTION rm_dotknij_tablice, rm_dotknij_tablice_z_dziecka;
