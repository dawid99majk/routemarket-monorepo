-- Preferencje twórcy: sześć osi sterujących doborem punktów i charakterem trasy.
-- Skala 0-100, gdzie 50 oznacza brak preferencji (środek suwaka).
create table if not exists public.route_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- 0 = zobaczyć więcej i szybciej, 100 = więcej czasu na każde miejsce
  pace smallint not null default 50 check (pace between 0 and 100),
  -- 0 = klasyki i must-see, 100 = miejsca niszowe i nieoczywiste
  popularity smallint not null default 50 check (popularity between 0 and 100),
  -- 0 = udeptane trasy przez kultowe miejsca, 100 = szwendanie bocznymi uliczkami
  wandering smallint not null default 50 check (wandering between 0 and 100),
  -- 0 = eleganckie restauracje i kawiarnie, 100 = street food i przydrożna kawa
  dining smallint not null default 50 check (dining between 0 and 100),
  -- 0 = spokojnie i płasko, 100 = podejścia i schody mile widziane
  effort smallint not null default 50 check (effort between 0 and 100),
  -- 0 = tłumy nie przeszkadzają, 100 = unikaj tłumów, także porą dnia
  crowds smallint not null default 50 check (crowds between 0 and 100),
  updated_at timestamptz not null default now()
);

alter table public.route_preferences enable row level security;

drop policy if exists "Users manage their own route preferences" on public.route_preferences;
create policy "Users manage their own route preferences"
  on public.route_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.route_preferences to authenticated;
