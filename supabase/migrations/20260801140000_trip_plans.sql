-- Jedna tablica może rodzić wiele planów: inny wyjazd w to samo miejsce,
-- inny charakter, albo po prostu druga próba, bo pierwsza nie pasowała.
create table if not exists public.trip_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.trip_projects(id) on delete cascade,
  name text not null default 'Plan',
  window_start text,
  window_end text,
  start_date date,
  plan jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists trip_plans_project_idx on public.trip_plans(project_id, created_at desc);

alter table public.trip_plans enable row level security;

drop policy if exists "Users manage plans in their own projects" on public.trip_plans;
create policy "Users manage plans in their own projects"
  on public.trip_plans for all
  using (exists (select 1 from public.trip_projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.trip_projects p where p.id = project_id and p.user_id = auth.uid()));

grant select, insert, update, delete on public.trip_plans to authenticated;
