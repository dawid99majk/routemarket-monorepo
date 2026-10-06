-- Wkład użytkowników: własne miejsca i zdjęcia przy istniejących miejscach.
--
-- 1) Miejsce dodane przez użytkownika wchodzi do katalogu od razu, ale dopiero po
--    automatycznej kontroli jest widoczne dla wszystkich (status 'published');
--    inaczej czeka ('pending') i widzi je tylko autor oraz administrator.
--    Dotąd polityki czytania katalogu miały USING (true), więc wiersz 'pending'
--    byłby publiczny — polityki zawężamy do opublikowanych albo własnych.
-- 2) Zdjęcia od podróżnych: osobna tabela, bo to treść cudzych autorów z własnym
--    cyklem życia (usunięcie, zgłoszenie, moderacja), a nie pole katalogu.
--    Pliki leżą w publicznym koszyku user-photos; zapisuje wyłącznie API (service role).
-- 3) Zgłoszenia zdjęć: trzy zgłoszenia od różnych osób chowają zdjęcie do przeglądu.

BEGIN;

-- ── Katalog: pending niewidoczny dla obcych ─────────────────────────────────
DROP POLICY IF EXISTS "Katalog czyta kazdy, takze bez konta" ON place_catalog;
DROP POLICY IF EXISTS "Anyone reads catalog" ON place_catalog;

CREATE POLICY "Katalog czyta kazdy, takze bez konta" ON place_catalog
  FOR SELECT TO anon USING (status = 'published');

CREATE POLICY "Anyone reads catalog" ON place_catalog
  FOR SELECT TO authenticated USING (status = 'published' OR created_by = auth.uid());

CREATE INDEX IF NOT EXISTS place_catalog_autor_idx ON place_catalog (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS place_catalog_status_idx ON place_catalog (status) WHERE status <> 'published';

-- ── Zdjęcia od podróżnych ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS place_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id     uuid NOT NULL REFERENCES place_catalog(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  path         text NOT NULL,              -- w koszyku user-photos
  thumb_path   text NOT NULL,
  width        integer NOT NULL,
  height       integer NOT NULL,
  caption      text,
  status       text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'pending', 'removed')),
  moderacja    jsonb NOT NULL DEFAULT '{}'::jsonb,   -- wynik kontroli automatycznej
  report_count integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS place_photos_place_idx ON place_photos (place_id, created_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS place_photos_user_idx  ON place_photos (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS place_photos_status_idx ON place_photos (status) WHERE status <> 'published';

CREATE TABLE IF NOT EXISTS place_photo_reports (
  user_id    uuid NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  photo_id   uuid NOT NULL REFERENCES place_photos(id)  ON DELETE CASCADE,
  reason     text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, photo_id)
);

ALTER TABLE place_photos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_photo_reports ENABLE ROW LEVEL SECURITY;   -- bez polityk: tylko API

DROP POLICY IF EXISTS "Zdjecia podroznych: opublikowane i wlasne" ON place_photos;
CREATE POLICY "Zdjecia podroznych: opublikowane i wlasne" ON place_photos
  FOR SELECT TO anon, authenticated
  USING (status = 'published' OR user_id = auth.uid());
GRANT SELECT ON place_photos TO anon, authenticated;

-- Licznik zgłoszeń + automatyczne ukrycie po trzech od różnych osób.
CREATE OR REPLACE FUNCTION rm_zgloszenie_zdjecia() RETURNS trigger AS $$
BEGIN
  UPDATE place_photos p
     SET report_count = (SELECT count(*) FROM place_photo_reports WHERE photo_id = NEW.photo_id),
         status = CASE WHEN p.status = 'published'
                        AND (SELECT count(*) FROM place_photo_reports WHERE photo_id = NEW.photo_id) >= 3
                       THEN 'pending' ELSE p.status END
   WHERE p.id = NEW.photo_id;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS rm_trg_zgloszenie_zdjecia ON place_photo_reports;
CREATE TRIGGER rm_trg_zgloszenie_zdjecia
  AFTER INSERT ON place_photo_reports
  FOR EACH ROW EXECUTE FUNCTION rm_zgloszenie_zdjecia();

-- ── Koszyk plików ───────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('user-photos', 'user-photos', true, 3145728, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 3145728, allowed_mime_types = ARRAY['image/jpeg'];

COMMIT;
