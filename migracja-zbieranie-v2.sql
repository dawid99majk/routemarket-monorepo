-- Audyt 10 (28.09.2026): zbieranie miast v2.
--
-- nazwa_lokalna     — nazwa z OSM, gdy karta pokazuje polską („Colosseo” → „Koloseum”).
-- slugi_poprzednie  — stare adresy strony miejsca; /miejsce/<stary> przekierowuje
--                     na nowy (poprawka transliteracji „ł” i spółki).
-- katalog_miasta    — stan zbierania miasta dla pętli dozbierania w API.
-- katalog_braki     — widok: czego miastu brakuje (kategorie, opisy, wyróżniki).

alter table public.place_catalog add column if not exists nazwa_lokalna text;
alter table public.place_catalog add column if not exists slugi_poprzednie text[] not null default '{}';
create index if not exists idx_place_catalog_slugi_poprzednie
  on public.place_catalog using gin (slugi_poprzednie);

create table if not exists public.katalog_miasta (
  city text primary key,
  wersja_zbierania int not null default 0,
  ostatnia_proba timestamptz,
  -- kategorie, dla których Overpass odpowiedział poprawnie i pusto: nie ponawiamy
  puste text[] not null default '{}',
  -- kategorie, które ostatnio padły (504, limit czasu): ponawiamy
  braki text[] not null default '{}'
);
alter table public.katalog_miasta enable row level security;
revoke all on public.katalog_miasta from anon, authenticated;

create or replace view public.katalog_braki with (security_invoker = true) as
select c.city,
  count(*) filter (where c.category = 'attraction') as zwiedzanie,
  count(*) filter (where c.category = 'food') as jedzenie,
  count(*) filter (where c.category = 'nightlife') as wieczory,
  count(*) filter (where c.category = 'hotel') as noclegi,
  count(*) filter (where coalesce(c.description, '') = ''
                     and coalesce(c.description_i18n->>'pl', '') = '') as bez_opisu,
  coalesce(k.wersja_zbierania, 0) as wersja,
  k.ostatnia_proba,
  coalesce(k.puste, '{}') as puste
from public.place_catalog c
left join public.katalog_miasta k on k.city = c.city
where c.city is not null
group by c.city, k.wersja_zbierania, k.ostatnia_proba, k.puste;
revoke all on public.katalog_braki from anon, authenticated;
