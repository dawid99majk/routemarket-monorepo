-- Opisy miejsc pisane przez agenta (Antigravity) — miejsce na dostawy i zatwierdzoną treść.
--
-- Trzy tabele, bo to trzy różne rzeczy:
--   opisy_partie   — jedno zlecenie (miasto, ile miejsc, numer zadania w kanale agent-bus);
--   opisy_dostawy  — surowy wynik agenta + wynik kontroli, zanim cokolwiek trafi na stronę;
--   place_opisy    — treść zatwierdzona, jedna aktualna wersja na miejsce, czytana przez aplikację.
-- Surowa dostawa nigdy nie nadpisuje opisu w place_catalog: wchodzi dopiero po kontroli
-- (styl, źródła) i po przeglądzie, a stara wersja zostaje w dostawach.

BEGIN;

CREATE TABLE IF NOT EXISTS opisy_partie (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  miasto     text NOT NULL,
  rodzaj     text NOT NULL DEFAULT 'opisy' CHECK (rodzaj IN ('opisy', 'nowe_miejsca')),
  liczba     integer NOT NULL DEFAULT 0,
  zlecenie   text,                       -- numer zadania w kanale agent-bus
  status     text NOT NULL DEFAULT 'przygotowana'
             CHECK (status IN ('przygotowana', 'zlecona', 'dostarczona', 'przyjeta', 'blad')),
  uwagi      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS opisy_dostawy (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partia_id  uuid NOT NULL REFERENCES opisy_partie(id) ON DELETE CASCADE,
  place_id   uuid REFERENCES place_catalog(id) ON DELETE CASCADE,
  surowe     jsonb NOT NULL,             -- dokładnie to, co odesłał agent
  kontrola   jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {ok: bool, bledy: [...], uwagi: [...]}
  status     text NOT NULL DEFAULT 'do_przegladu'
             CHECK (status IN ('do_przegladu', 'zatwierdzona', 'odrzucona')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS opisy_dostawy_partia_idx ON opisy_dostawy (partia_id, status);
CREATE INDEX IF NOT EXISTS opisy_dostawy_place_idx  ON opisy_dostawy (place_id);

CREATE TABLE IF NOT EXISTS place_opisy (
  place_id      uuid PRIMARY KEY REFERENCES place_catalog(id) ON DELETE CASCADE,
  opis          text NOT NULL,                          -- 450–900 znaków: co to jest i po co tu iść
  co_zobaczyc   text[] NOT NULL DEFAULT '{}',           -- 2–4 konkrety na miejscu
  praktyka      jsonb NOT NULL DEFAULT '{}'::jsonb,     -- czas_min, bilet, kiedy, tlok, ograniczenia
  ciekawostki   text[] NOT NULL DEFAULT '{}',
  zrodla        jsonb NOT NULL DEFAULT '[]'::jsonb,     -- [{url, tytul}]
  opis_i18n     jsonb NOT NULL DEFAULT '{}'::jsonb,     -- tłumaczenia (te same klucze co description_i18n)
  dostawa_id    uuid REFERENCES opisy_dostawy(id) ON DELETE SET NULL,
  model         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE opisy_partie  ENABLE ROW LEVEL SECURITY;   -- bez polityk: tylko API / administrator
ALTER TABLE opisy_dostawy ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_opisy   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads place_opisy" ON place_opisy;
CREATE POLICY "Anyone reads place_opisy" ON place_opisy FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON place_opisy TO anon, authenticated;

COMMIT;
