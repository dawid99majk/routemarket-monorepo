-- Połączenia agentów AI (Claude, ChatGPT, Gemini) z kontem — podstawa pod serwer MCP.
--
-- Osobisty token połączenia: w bazie tylko jego skrót SHA-256, sam token widać
-- raz, przy tworzeniu. Tworzenie i unieważnianie idzie przez API (service role),
-- użytkownik z przeglądarki może tylko odczytać własne wpisy.

create table if not exists public.polaczenia_agentow (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent text not null default 'inny' check (agent in ('claude', 'chatgpt', 'gemini', 'inny')),
  nazwa text not null check (char_length(nazwa) between 1 and 60),
  token_hash text not null unique,
  utworzone timestamptz not null default now(),
  ostatnio_uzyte timestamptz,
  uniewaznione timestamptz
);

create index if not exists idx_polaczenia_agentow_user on public.polaczenia_agentow (user_id, utworzone desc);

alter table public.polaczenia_agentow enable row level security;

drop policy if exists "Własne połączenia widoczne" on public.polaczenia_agentow;
create policy "Własne połączenia widoczne" on public.polaczenia_agentow
  for select to authenticated using (user_id = auth.uid());

-- Skrót tokenu nie opuszcza bazy: klient dostaje tylko kolumny bez token_hash.
revoke all on public.polaczenia_agentow from anon, authenticated;
grant select (id, user_id, agent, nazwa, utworzone, ostatnio_uzyte, uniewaznione)
  on public.polaczenia_agentow to authenticated;
