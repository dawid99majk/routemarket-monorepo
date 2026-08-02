-- Rejestracja padała od usunięcia marketplace'u: wyzwalacz nadal wpisywał salda
-- kredytów i tokenów promocyjnych oraz logi transakcji do tabel, których już nie
-- ma. Nowy użytkownik dostaje profil i rolę — bonusy powitalne wrócą, gdy
-- powstanie właściwy system tokenów AI.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  )
  on conflict (user_id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict do nothing;

  return new;
end;
$$;
