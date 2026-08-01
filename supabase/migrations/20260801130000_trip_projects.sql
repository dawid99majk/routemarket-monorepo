-- Projekty wyjazdowe: miejsce, w którym użytkownik zbiera miejsca do zobaczenia
-- na długo przed wygenerowaniem trasy.
create table if not exists public.trip_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  destination text not null,
  destination_lat double precision,
  destination_lng double precision,
  days smallint,
  hours_per_day numeric(4,1),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trip_projects_user_idx on public.trip_projects(user_id, updated_at desc);

-- Przypięte miejsca. priority: 'must' = koniecznie, 'nice' = jeśli wyjdzie.
create table if not exists public.trip_project_places (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.trip_projects(id) on delete cascade,
  name text not null,
  category text not null default 'attraction',
  priority text not null default 'nice' check (priority in ('must', 'nice')),
  lat double precision,
  lng double precision,
  description text default '',
  opening_hours text,
  visit_minutes smallint,
  source text default 'discover',
  created_at timestamptz not null default now()
);

create index if not exists trip_project_places_project_idx on public.trip_project_places(project_id);

alter table public.trip_projects enable row level security;
alter table public.trip_project_places enable row level security;

drop policy if exists "Users manage their own trip projects" on public.trip_projects;
create policy "Users manage their own trip projects"
  on public.trip_projects for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage places in their own projects" on public.trip_project_places;
create policy "Users manage places in their own projects"
  on public.trip_project_places for all
  using (exists (select 1 from public.trip_projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.trip_projects p where p.id = project_id and p.user_id = auth.uid()));

grant select, insert, update, delete on public.trip_projects to authenticated;
grant select, insert, update, delete on public.trip_project_places to authenticated;
