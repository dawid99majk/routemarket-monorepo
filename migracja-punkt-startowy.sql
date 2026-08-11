-- Punkt startowy wyjazdu: hotel, parking, dworzec — miejsce, w którym zaczyna się
-- i kończy każdy dzień. Planer już umie go przyjąć (pole "hotel" w /plan-trip),
-- brakowało tylko miejsca, żeby go zapamiętać.
begin;

alter table public.trip_projects
  add column if not exists start_name text,
  add column if not exists start_lat double precision,
  add column if not exists start_lng double precision;

commit;
