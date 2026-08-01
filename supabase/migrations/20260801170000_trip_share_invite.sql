-- Zaproszenie do tablicy wysyłane mailem. Link prowadzi na stronę: kto ma konto,
-- loguje się swoim; kto nie ma — zakłada, a dostęp i tak czeka podpięty pod adres.
create or replace function public.notify_trip_share()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  proj record;
  inviter_email text;
  link text;
begin
  select p.name, p.destination into proj
  from public.trip_projects p where p.id = new.project_id;

  select email into inviter_email from auth.users where id = auth.uid();

  link := 'https://routemarket.io/profile?share=' || new.id::text;

  perform public.enqueue_email('transactional_emails', jsonb_build_object(
    'message_id', 'trip-share-' || new.id::text,
    'label', 'trip_share_invite',
    'to', new.shared_with_email,
    'from', 'RouteMarket <noreply@routemarket.io>',
    'subject', coalesce(inviter_email, 'Ktoś') || ' zaprasza Cię do wspólnego planowania: ' || coalesce(proj.name, 'wyjazd'),
    'text', coalesce(inviter_email, 'Ktoś') || ' udostępnił Ci tablicę wyjazdową "' || coalesce(proj.name, 'wyjazd') ||
            '" (' || coalesce(proj.destination, '') || ') w RouteMarket.' || chr(10) || chr(10) ||
            'Otwórz tablicę: ' || link || chr(10) || chr(10) ||
            'Jeśli nie masz jeszcze konta, załóż je na ten adres e-mail — tablica będzie czekać.',
    'html', '<p><strong>' || coalesce(inviter_email, 'Ktoś') || '</strong> udostępnił Ci tablicę wyjazdową ' ||
            '<strong>' || coalesce(proj.name, 'wyjazd') || '</strong>' ||
            case when proj.destination is not null then ' (' || proj.destination || ')' else '' end ||
            ' w RouteMarket.</p>' ||
            '<p><a href="' || link || '" style="display:inline-block;padding:10px 18px;background:#059669;color:#fff;border-radius:9999px;text-decoration:none">Otwórz tablicę</a></p>' ||
            '<p style="color:#666;font-size:13px">Jeśli nie masz jeszcze konta, załóż je na ten adres e-mail — tablica będzie czekać po zalogowaniu.</p>'
  ));

  return new;
end;
$$;

drop trigger if exists trip_share_invite on public.trip_project_shares;
create trigger trip_share_invite
  after insert on public.trip_project_shares
  for each row execute function public.notify_trip_share();

-- Po założeniu konta podpinamy oczekujące zaproszenia pod nowego użytkownika
create or replace function public.claim_pending_trip_shares()
returns integer
language sql
security definer
set search_path to 'public'
as $$
  with updated as (
    update public.trip_project_shares s
    set shared_with_user_id = auth.uid()
    where s.shared_with_user_id is null
      and lower(s.shared_with_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    returning 1
  )
  select count(*)::integer from updated;
$$;

grant execute on function public.claim_pending_trip_shares() to authenticated;
