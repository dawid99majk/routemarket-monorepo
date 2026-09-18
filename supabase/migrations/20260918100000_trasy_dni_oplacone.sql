-- Opłacone trasy dni planu.
--
-- Trasa dnia żyje teraz w planie (trip_plans.plan, pole dnia `track`), a nie
-- w osobnym projekcie kreatora. Za wyznaczenie trasy dnia płaci się raz;
-- każde kolejne przeliczenie tego samego dnia — po przeniesieniu punktu, zmianie
-- trybu na rower, dodaniu punktu po drodze — jest bez opłaty. Dotąd każde
-- przeliczenie kosztowało 10 tokenów, także po przeciągnięciu jednej pinezki.
--
-- Znacznik opłaty nie może leżeć w JSON-ie planu: ten zapisuje przeglądarka, więc
-- wystarczyłoby dopisać tam `oplacona: true`. Tabela bez żadnej polityki RLS jest
-- dostępna wyłącznie dla API (service role).
begin;

create table if not exists public.trasy_dni_oplacone (
  plan_id uuid not null references public.trip_plans(id) on delete cascade,
  dzien integer not null check (dzien >= 1),
  user_id uuid not null,
  tokeny integer not null,
  created_at timestamptz not null default now(),
  primary key (plan_id, dzien)
);

alter table public.trasy_dni_oplacone enable row level security;
revoke all on public.trasy_dni_oplacone from anon, authenticated;

commit;

-- kontrola: tabela jest, RLS włączone, zero polityk (dostęp tylko z API)
select c.relname, c.relrowsecurity as rls,
       (select count(*) from pg_policies p where p.tablename = c.relname) as polityk
from pg_class c where c.relname = 'trasy_dni_oplacone';
