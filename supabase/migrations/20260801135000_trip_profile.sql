-- Profil wyjazdu: te same osie co w profilu użytkownika, ale NULL oznacza
-- "dziedzicz z profilu". Delegacja i urlop z dziećmi to różne potrzeby tej
-- samej osoby, więc preferencje muszą dać się nadpisać per wyjazd.
alter table public.trip_projects
  add column if not exists trip_type text,
  add column if not exists pace smallint check (pace between 0 and 100),
  add column if not exists popularity smallint check (popularity between 0 and 100),
  add column if not exists wandering smallint check (wandering between 0 and 100),
  add column if not exists dining smallint check (dining between 0 and 100),
  add column if not exists effort smallint check (effort between 0 and 100),
  add column if not exists crowds smallint check (crowds between 0 and 100);
