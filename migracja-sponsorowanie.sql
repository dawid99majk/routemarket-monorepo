-- Model danych pod pozycje sponsorowane. Sam model, bez serwowania.
--
-- Zakładamy go teraz, bo dołożony po fakcie wymagałby przerabiania zapytań
-- wyszukiwania. Przy pięciu kontach nie ma komu sprzedawać reklam, więc nic tego
-- jeszcze nie odczytuje — ale kiedy przyjdzie moment, nie będzie migracji na
-- żywym ruchu.
--
-- Sponsorowanie to relacja w czasie, nie cecha miejsca — dlatego osobna tabela,
-- a nie flaga na place_catalog. Umowa ma początek i koniec, więc wygasa sama
-- i nie zostawia "sponsorowanego na zawsze" po zakończeniu współpracy.

BEGIN;

CREATE TABLE IF NOT EXISTS place_sponsorships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id    uuid NOT NULL REFERENCES place_catalog(id) ON DELETE CASCADE,

  -- Zasięg: puste miasto znaczy "wszędzie", pusta kategoria — "w każdej".
  -- Restauracja płaci zwykle za jedno miasto i jedną kategorię.
  city        text,
  category    text,

  starts_on   date NOT NULL,
  ends_on     date NOT NULL,

  -- Dane rozliczeniowe trzymamy przy umowie, nie przy miejscu.
  advertiser  text NOT NULL,
  note        text,

  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sponsorship_okres CHECK (ends_on >= starts_on)
);

-- Zapytanie brzmi zawsze tak samo: co jest wykupione w tym mieście, w tej
-- kategorii, dzisiaj.
CREATE INDEX IF NOT EXISTS place_sponsorships_lookup_idx
  ON place_sponsorships (city, category, starts_on, ends_on);

COMMENT ON TABLE place_sponsorships IS
  'Wykupione pozycje sponsorowane. Wynik wyszukiwania NIE jest po nich przestawiany — '
  'pozycja sponsorowana jest przypinana nad listą i oznaczana, a lista organiczna '
  'zostaje nietknięta. Nigdy nie trafia do wygenerowanego planu dnia.';

-- ── Kto to widzi ───────────────────────────────────────────────────────────
-- Odczyt jest publiczny, bo pozycja sponsorowana ma się wyświetlać każdemu,
-- także gościowi bez konta. Zapis zostaje wyłącznie przy service_role, czyli
-- po stronie serwera — sprzedaż reklam nie idzie przez przeglądarkę.
ALTER TABLE place_sponsorships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sponsorowane sa jawne" ON place_sponsorships;
CREATE POLICY "Sponsorowane sa jawne" ON place_sponsorships
  FOR SELECT TO anon, authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON place_sponsorships FROM anon, authenticated;

COMMIT;

-- Cofnięcie:
--   DROP TABLE place_sponsorships;
