-- Rola do odczytu dla agenta raportującego.
--
-- Kuszące jest podanie agentowi klucza `service_role` — działa od razu i widzi
-- wszystko. To jest właśnie problem: omija RLS całkowicie, więc agent dostaje
-- dostęp do kont, prywatnych tablic, adresów e-mail i historii płatności.
-- Do policzenia, ile powstało planów, nie jest to potrzebne.
--
-- Ta rola widzi wyłącznie to, co potrzebne do raportu, i nie widzi ani jednego
-- wiersza danych osobowych. Nie ma prawa zapisu do niczego.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'raport_ro') THEN
    CREATE ROLE raport_ro NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO raport_ro;

-- Liczniki produktu. Kolumny wybrane pojedynczo, bo `GRANT SELECT ON tabela`
-- objęłoby też te, które dojdą później — a nowa kolumna nie powinna z automatu
-- stawać się widoczna dla agenta.
GRANT SELECT (id, name, destination, days, is_public, is_example, copy_count,
              like_count, created_at, updated_at, published_at)
  ON public.trip_projects TO raport_ro;

GRANT SELECT (id, project_id, name, category, priority, created_at)
  ON public.trip_project_places TO raport_ro;

GRANT SELECT (id, project_id, name, start_date, created_at)
  ON public.trip_plans TO raport_ro;

GRANT SELECT (id, slug, name, city, country, category, kind, photos,
              description_i18n, pin_count, created_at, updated_at)
  ON public.place_catalog TO raport_ro;

-- Koszt i czas pracy modelu. Bez user_id: raport ma mówić ile i za ile,
-- a nie kto.
GRANT SELECT (id, operation, model, duration_ms, success, created_at,
              prompt_tokens, completion_tokens, cost_micro_usd)
  ON public.ai_usage_log TO raport_ro;

-- Rozliczenia jako sumy, bez wskazywania osób.
GRANT SELECT (id, amount, reason, created_at) ON public.token_ledger TO raport_ro;

-- Domyślne uprawnienia dla przyszłych tabel: żadne. Nowa tabela nie staje się
-- widoczna sama z siebie — to musi być świadoma decyzja.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM raport_ro;

COMMIT;

\echo ''
\echo '=== do czego rola ma dostep ==='
SELECT table_name, count(*) AS kolumn
FROM information_schema.column_privileges
WHERE grantee = 'raport_ro' AND privilege_type = 'SELECT'
GROUP BY table_name ORDER BY table_name;

\echo ''
\echo '=== kontrola: czy widzi cokolwiek z danych osobowych ==='
SELECT count(*) AS tabel_z_danymi_osobowymi
FROM information_schema.column_privileges
WHERE grantee = 'raport_ro'
  AND table_name IN ('profiles', 'user_roles', 'trip_project_shares', 'place_favorites');
