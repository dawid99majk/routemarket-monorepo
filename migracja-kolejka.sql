-- Kolejka zatwierdzeń — jedno miejsce na wszystko, co czeka na decyzję.
--
-- Bez niej rozbudowa zestawu agentów zamienia człowieka w wąskie gardło:
-- ośmiu agentów po pięć rzeczy dziennie to czterdzieści decyzji rozsypanych po
-- mailach, czatach i plikach. Zebrane i uszeregowane zajmują kwadrans.
--
-- Dlaczego tabela, a nie plik w repo: agenci piszą z VPS-a i z komputera
-- jednocześnie, a plik w gicie kończyłby się konfliktami przy każdym zbiegu.
-- Baza daje jedno źródło, porządkowanie i pytania w rodzaju „co czeka dłużej
-- niż tydzień" bez pisania czegokolwiek.
--
-- Pole `polecenie` jest tu po to, żeby zatwierdzenie PROWADZIŁO DO DZIAŁANIA.
-- Zgoda, po której i tak trzeba wykonać robotę ręcznie, nie oszczędza niczego.
-- Ale wykonanie NIE dzieje się automatycznie przy zatwierdzeniu — to osobny,
-- świadomy krok, bo automat uruchamiający zapisane polecenia byłby dokładnie
-- tą furtką, której cały ten model ma unikać.

BEGIN;

CREATE TABLE IF NOT EXISTS public.kolejka_zatwierdzen (
  id                    bigserial PRIMARY KEY,
  utworzono             timestamptz NOT NULL DEFAULT now(),

  -- kto zgłasza i czego dotyczy
  agent                 text NOT NULL,
  obszar                text NOT NULL,

  -- waga decyduje o kolejności; skala celowo krótka, żeby dało się jej używać
  -- bez zastanowienia: pilne (blokuje albo szkodzi), wazne, drobne
  waga                  text NOT NULL DEFAULT 'wazne'
                        CHECK (waga IN ('pilne', 'wazne', 'drobne')),

  tytul                 text NOT NULL,
  opis                  text NOT NULL DEFAULT '',

  -- dowód: to, co pozwala sprawdzić zgłoszenie bez wiary na słowo
  dowod                 jsonb NOT NULL DEFAULT '{}'::jsonb,

  proponowane_dzialanie text NOT NULL DEFAULT '',
  -- dokładne polecenie do wykonania po zgodzie; NULL, gdy działanie nie da się
  -- sprowadzić do jednej komendy
  polecenie             text,

  stan                  text NOT NULL DEFAULT 'czeka'
                        CHECK (stan IN ('czeka', 'zatwierdzone', 'odrzucone', 'wykonane')),
  rozstrzygnieto        timestamptz,
  uwaga                 text,
  wynik                 text,

  -- ten sam problem zgłoszony ponownie ma podbić licznik, a nie zasypać kolejkę
  odcisk                text NOT NULL,
  powtorzen             integer NOT NULL DEFAULT 1,
  ostatnio_widziane     timestamptz NOT NULL DEFAULT now()
);

-- Jeden otwarty wpis na problem. Zamknięte mogą się powtarzać — gdy coś wróci
-- po naprawie, to jest nowa informacja, a nie duplikat.
CREATE UNIQUE INDEX IF NOT EXISTS idx_kolejka_odcisk_otwarte
  ON public.kolejka_zatwierdzen (odcisk) WHERE stan = 'czeka';

CREATE INDEX IF NOT EXISTS idx_kolejka_czekajace
  ON public.kolejka_zatwierdzen (waga, utworzono) WHERE stan = 'czeka';

COMMENT ON TABLE public.kolejka_zatwierdzen IS
  'Wszystko, co wymaga decyzji człowieka. Jedno miejsce, uszeregowane po wadze.';

-- --- dostęp -----------------------------------------------------------------
ALTER TABLE public.kolejka_zatwierdzen ENABLE ROW LEVEL SECURITY;

-- Kolejka nie jest widokiem użytkownika serwisu — czytają ją narzędzia i Ty.
-- Brak polityki dla anon i authenticated jest tu decyzją, nie przeoczeniem.
DROP POLICY IF EXISTS "Kolejka: odczyt dla raportu" ON public.kolejka_zatwierdzen;
CREATE POLICY "Kolejka: odczyt dla raportu" ON public.kolejka_zatwierdzen
  FOR SELECT TO raport_ro USING (true);

GRANT SELECT (id, utworzono, agent, obszar, waga, tytul, stan, powtorzen)
  ON public.kolejka_zatwierdzen TO raport_ro;

COMMIT;

\echo ''
\echo '=== tabela gotowa ==='
SELECT count(*) AS wpisow FROM public.kolejka_zatwierdzen;
