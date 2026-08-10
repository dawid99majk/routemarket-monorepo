-- Publiczne tablice: właściciel świadomie udostępnia wyjazd innym do skopiowania.
-- Domyślnie wyłączone; nic nie staje się publiczne bez wyraźnego działania.
begin;

alter table public.trip_projects
  add column if not exists is_public boolean not null default false,
  add column if not exists copy_count integer not null default 0,
  add column if not exists published_at timestamptz,
  -- Nazwa autora zapisana przy publikacji. Świadomie nie sięgamy do auth.users
  -- z widoku publicznego: wystarczy imię i inicjał, a adres e-mail nie ma prawa
  -- opuścić schematu autoryzacji.
  add column if not exists author_display text;

create index if not exists trip_projects_public_idx
  on public.trip_projects (destination, copy_count desc)
  where is_public;

-- Odczyt opublikowanych tablic przez każdego zalogowanego. Polityki są sumowane,
-- więc właściciel i współdzielący zachowują dotychczasowy dostęp.
drop policy if exists "Public boards are readable" on public.trip_projects;
create policy "Public boards are readable"
  on public.trip_projects for select
  to authenticated
  using (is_public = true);

drop policy if exists "Public board places are readable" on public.trip_project_places;
create policy "Public board places are readable"
  on public.trip_project_places for select
  to authenticated
  using (exists (
    select 1 from public.trip_projects p
    where p.id = trip_project_places.project_id and p.is_public = true
  ));

-- Skopiowanie cudzej tablicy do własnych wyjazdów. Funkcja działa z prawami
-- właściciela, bo musi podbić licznik kopii na cudzym wierszu — dlatego sama
-- sprawdza, że źródło jest publiczne, i sama ustawia właściciela kopii na
-- wywołującego. Bez tego byłaby furtką do czytania prywatnych tablic.
create or replace function public.copy_public_board(p_source uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src public.trip_projects;
  v_new uuid;
begin
  if auth.uid() is null then
    raise exception 'Wymagane zalogowanie';
  end if;

  select * into v_src from public.trip_projects
   where id = p_source and is_public = true;
  if not found then
    raise exception 'Ta tablica nie jest publiczna';
  end if;

  if v_src.user_id = auth.uid() then
    raise exception 'To jest Twoja własna tablica';
  end if;

  insert into public.trip_projects
    (user_id, name, destination, destination_lat, destination_lng, days, hours_per_day,
     trip_type, pace, popularity, wandering, dining, effort, crowds, fill_percent, notes)
  values
    (auth.uid(), v_src.name, v_src.destination, v_src.destination_lat, v_src.destination_lng,
     v_src.days, v_src.hours_per_day, v_src.trip_type, v_src.pace, v_src.popularity,
     v_src.wandering, v_src.dining, v_src.effort, v_src.crowds, v_src.fill_percent, v_src.notes)
  returning id into v_new;

  -- Kopiujemy miejsca z zachowaniem wag: kopiujący dostaje tablicę taką, jaką
  -- widział, a nie stertę nieposortowanych punktów.
  insert into public.trip_project_places
    (project_id, catalog_id, name, category, priority, lat, lng, description,
     opening_hours, visit_minutes, image_url, website, source)
  select v_new, catalog_id, name, category, priority, lat, lng, description,
         opening_hours, visit_minutes, image_url, website, source
    from public.trip_project_places
   where project_id = p_source;

  update public.trip_projects
     set copy_count = copy_count + 1
   where id = p_source;

  return v_new;
end;
$$;

revoke all on function public.copy_public_board(uuid) from public;
grant execute on function public.copy_public_board(uuid) to authenticated;

commit;
