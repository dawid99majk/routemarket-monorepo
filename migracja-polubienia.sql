-- Polubienia tablic.
--
-- Licznik trzymamy przy tablicy, a nie liczymy przy każdym wyświetleniu: strona
-- główna ma sortować i wyszukiwać po popularności, a zliczanie przy każdym
-- zapytaniu robi z tego skanowanie całej tabeli polubień.

BEGIN;

CREATE TABLE IF NOT EXISTS board_likes (
  user_id    uuid NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES trip_projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS board_likes_project_idx ON board_likes (project_id);

ALTER TABLE trip_projects
  ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;

-- ── Licznik utrzymywany triggerem ─────────────────────────────────────────
-- SECURITY DEFINER, bo polubienie zakłada ktoś, kto tablicy nie jest właścicielem,
-- a polityka "Owners manage projects" zablokowałaby mu UPDATE na cudzym wierszu.
CREATE OR REPLACE FUNCTION rm_przelicz_polubienia() RETURNS trigger AS $$
BEGIN
  UPDATE trip_projects p
     SET like_count = (SELECT count(*) FROM board_likes WHERE project_id = p.id)
   WHERE p.id = COALESCE(NEW.project_id, OLD.project_id);
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS rm_trg_polubienia ON board_likes;
CREATE TRIGGER rm_trg_polubienia
  AFTER INSERT OR DELETE ON board_likes
  FOR EACH ROW EXECUTE FUNCTION rm_przelicz_polubienia();

-- ── „Ostatnio używane" nie reaguje na cudze polubienia ─────────────────────
-- Trigger updated_at podbija znacznik przy każdym zapisie, który go nie dotyka —
-- więc polubienie od obcej osoby przestawiałoby moją tablicę na początek MOJEJ
-- listy. To nie jest praca przy tablicy, tylko sygnał od kogoś z zewnątrz.
CREATE OR REPLACE FUNCTION rm_dotknij_tablice() RETURNS trigger AS $$
BEGIN
  IF to_jsonb(NEW) - 'like_count' - 'copy_count' - 'updated_at'
     = to_jsonb(OLD) - 'like_count' - 'copy_count' - 'updated_at' THEN
    RETURN NEW;
  END IF;
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ── Kto co może ────────────────────────────────────────────────────────────
ALTER TABLE board_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Odczyt: swoje polubienia" ON board_likes;
CREATE POLICY "Odczyt: swoje polubienia" ON board_likes
  FOR SELECT USING (user_id = auth.uid());

-- Polubić da się wyłącznie tablicę, którą wolno zobaczyć — czyli publiczną.
-- Bez tego dałoby się nabijać licznik cudzej prywatnej tablicy, znając jej id.
DROP POLICY IF EXISTS "Polubienie: tylko publiczne i w swoim imieniu" ON board_likes;
CREATE POLICY "Polubienie: tylko publiczne i w swoim imieniu" ON board_likes
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM trip_projects p WHERE p.id = project_id AND p.is_public)
  );

DROP POLICY IF EXISTS "Cofniecie: tylko swoje" ON board_likes;
CREATE POLICY "Cofniecie: tylko swoje" ON board_likes
  FOR DELETE USING (user_id = auth.uid());

COMMIT;

-- Cofnięcie:
--   DROP TABLE board_likes;
--   ALTER TABLE trip_projects DROP COLUMN like_count;
--   DROP FUNCTION rm_przelicz_polubienia;
