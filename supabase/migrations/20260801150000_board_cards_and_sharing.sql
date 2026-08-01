-- Bogatsza karta miejsca: strona, zdjęcie, skrót z Wikipedii.
alter table public.trip_project_places
  add column if not exists website text,
  add column if not exists image_url text,
  add column if not exists wiki_extract text,
  add column if not exists board_x smallint,
  add column if not exists board_y smallint;

-- Trzeci stan: odrzucone. Kartka wędruje między strefami tablicy.
alter table public.trip_project_places drop constraint if exists trip_project_places_priority_check;
alter table public.trip_project_places
  add constraint trip_project_places_priority_check
  check (priority in ('must', 'nice', 'rejected'));

-- Współdzielenie tablicy: druga osoba może dokładać i przestawiać miejsca.
create table if not exists public.trip_project_shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.trip_projects(id) on delete cascade,
  shared_with_email text not null,
  shared_with_user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (project_id, shared_with_email)
);

create index if not exists trip_project_shares_user_idx on public.trip_project_shares(shared_with_user_id);
create index if not exists trip_project_shares_email_idx on public.trip_project_shares(lower(shared_with_email));

alter table public.trip_project_shares enable row level security;

-- Czy bieżący użytkownik ma dostęp do projektu: jako właściciel albo przez udostępnienie
create or replace function public.has_project_access(pid uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.trip_projects p
    where p.id = pid and p.user_id = auth.uid()
  ) or exists (
    select 1 from public.trip_project_shares s
    where s.project_id = pid
      and (s.shared_with_user_id = auth.uid()
           or lower(s.shared_with_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  );
$$;

grant execute on function public.has_project_access(uuid) to authenticated;

-- Dostęp do projektów, miejsc i planów uwzględnia udostępnienia
drop policy if exists "Users manage their own trip projects" on public.trip_projects;
create policy "Owners manage projects" on public.trip_projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Shared users read projects" on public.trip_projects;
create policy "Shared users read projects" on public.trip_projects
  for select using (public.has_project_access(id));

drop policy if exists "Users manage places in their own projects" on public.trip_project_places;
create policy "Collaborators manage places" on public.trip_project_places
  for all using (public.has_project_access(project_id))
  with check (public.has_project_access(project_id));

drop policy if exists "Users manage plans in their own projects" on public.trip_plans;
create policy "Collaborators manage plans" on public.trip_plans
  for all using (public.has_project_access(project_id))
  with check (public.has_project_access(project_id));

drop policy if exists "Owners manage shares" on public.trip_project_shares;
create policy "Owners manage shares" on public.trip_project_shares
  for all using (exists (select 1 from public.trip_projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.trip_projects p where p.id = project_id and p.user_id = auth.uid()));
drop policy if exists "Invited users see their shares" on public.trip_project_shares;
create policy "Invited users see their shares" on public.trip_project_shares
  for select using (shared_with_user_id = auth.uid()
    or lower(shared_with_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

grant select, insert, update, delete on public.trip_project_shares to authenticated;
