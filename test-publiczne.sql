-- Test zabezpieczeń copy_public_board i RLS. Każdy oczekiwany błąd siedzi we
-- własnym punkcie przywracania, żeby nie przerywał reszty. Całość wycofywana.
\set ON_ERROR_STOP off
begin;

select id as pub_id from trip_projects where is_public limit 1 \gset
select user_id as wlasciciel from trip_projects where id = :'pub_id' \gset
select id as priv_id from trip_projects where not is_public limit 1 \gset
select coalesce(
  (select id::text from auth.users where id <> :'wlasciciel' limit 1),
  '00000000-0000-0000-0000-000000000009') as obcy \gset

\echo ''
\echo '=== 1. Właściciel kopiuje własną tablicę — ma odmówić ==='
savepoint s1;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'wlasciciel')::text, true) \gset ignore_
select copy_public_board(:'pub_id');
rollback to savepoint s1;

\echo ''
\echo '=== 2. Ktoś inny kopiuje tablicę PRYWATNĄ — ma odmówić ==='
savepoint s2;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'obcy')::text, true) \gset ignore2_
select copy_public_board(:'priv_id');
rollback to savepoint s2;

\echo ''
\echo '=== 3. Obcy patrzy przez RLS: prywatna ma dać 0, publiczna więcej niż 0 ==='
savepoint s3;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'obcy')::text, true) \gset ignore3_
select
  (select count(*) from trip_project_places where project_id = :'priv_id') as prywatna_widoczne,
  (select count(*) from trip_project_places where project_id = :'pub_id')  as publiczna_widoczne;
select count(*) as prywatne_projekty_widoczne from trip_projects where id = :'priv_id';
rollback to savepoint s3;

\echo ''
\echo '=== 4. Ktoś inny kopiuje tablicę PUBLICZNĄ — ma się udać ==='
savepoint s4;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'obcy')::text, true) \gset ignore4_
select copy_public_board(:'pub_id') as nowy \gset
reset role;
select
  (select name from trip_projects where id = :'nowy') as nazwa_kopii,
  (select user_id = :'obcy' from trip_projects where id = :'nowy') as wlasciciel_to_kopiujacy,
  (select count(*) from trip_project_places where project_id = :'nowy') as skopiowane_miejsca,
  (select count(*) from trip_project_places where project_id = :'pub_id') as miejsca_zrodla,
  (select copy_count from trip_projects where id = :'pub_id') as licznik_kopii;
rollback to savepoint s4;

rollback;

\echo ''
\echo '=== 7. RLS route_builder/atlas (audyt 16.08): obcy i anon widzą 0 ==='
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'obcy')::text, true) \gset ignore7_
select count(*) as "cudze route_builder_projects (ma być 0)" from route_builder_projects where user_id <> :'obcy'::uuid;
select count(*) as "route_builder_jobs (ma być 0)" from route_builder_jobs;
select count(*) as "atlas_projects (ma być 0)" from atlas_projects;
rollback;
begin;
set local role anon;
select count(*) as "anon route_builder_projects (ma być 0)" from route_builder_projects;
select count(*) as "anon atlas_artifacts (ma być 0)" from atlas_artifacts;
rollback;
