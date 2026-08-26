-- Lista obiektów OSM, które NIE MAJĄ wracać do katalogu.
--
-- Scalanie duplikatów przez skasowanie wiersza nie jest trwałe: `/catalog/seed`
-- pyta Overpassa o miasto i wstawia wszystko, czego nie zna, więc obiekt
-- z żywym identyfikatorem OSM wraca przy najbliższym zbieraniu. Po rozszerzeniu
-- katalogu wróciły cztery z pięciu wcześniej scalonych duplikatów — w tym
-- „Torre dos Clérigos", która stanęła na tablicy przykładowej Porto obok
-- „Igreja e Torre dos Clérigos", czyli obok samej siebie.
--
-- Powód zapisujemy razem z wykluczeniem: bez niego za pół roku nikt nie będzie
-- wiedział, czy wiersza brakuje z decyzji, czy z pomyłki.

BEGIN;

CREATE TABLE IF NOT EXISTS public.katalog_wykluczenia (
  osm_id     text PRIMARY KEY,
  nazwa      text NOT NULL,
  powod      text NOT NULL,
  scalono_z  text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.katalog_wykluczenia IS
  'Obiekty OSM pominięte przy zbieraniu katalogu — duplikaty i wpisy odrzucone świadomie.';

ALTER TABLE public.katalog_wykluczenia ENABLE ROW LEVEL SECURITY;
-- Czyta wyłącznie warstwa serwisowa przez rolę service_role; anon nie ma tu nic
-- do roboty, więc nie dodajemy polityki SELECT dla ról publicznych.

COMMIT;

\echo ''
\echo '=== tabela gotowa ==='
SELECT count(*) AS wykluczen FROM public.katalog_wykluczenia;
