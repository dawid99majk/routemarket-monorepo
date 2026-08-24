-- Domknięcie roli raportującej.
--
-- Dwie poprawki po pierwszym uruchomieniu:
--
-- 1. RLS działał, ale roli brakowało polityk, więc widziała zero wierszy.
--    Poprawne zachowanie bazy — polityki trzeba dodać jawnie. Robimy to zamiast
--    nadawać BYPASSRLS: obejście RLS-a wymaga superużytkownika (którym `postgres`
--    w tym obrazie nie jest) i znosi ochronę hurtowo, zamiast punktowo.
--
-- 2. Nadałem za dużo kolumn. Raport liczy tablice i plany — nie potrzebuje ich
--    NAZW ani celów wyjazdu. Nazwa prywatnej tablicy to informacja o użytkowniku
--    („Wyjazd do lekarza w Wiedniu"), więc nie ma powodu, żeby agent ją widział.

BEGIN;

-- --- zawężenie: zdejmujemy kolumny opisowe z danych prywatnych ---------------
REVOKE SELECT (name, destination) ON public.trip_projects FROM raport_ro;
REVOKE SELECT (name) ON public.trip_plans FROM raport_ro;
REVOKE SELECT (name) ON public.trip_project_places FROM raport_ro;

-- --- polityki odczytu wyłącznie dla tej roli ---------------------------------
-- USING (true) jest tu bezpieczne, bo zakres wyznaczają uprawnienia kolumnowe:
-- rola nie ma prawa odczytać user_id ani żadnej nazwy, więc nawet widząc wszystkie
-- wiersze, nie umie powiedzieć, czyje są.
DROP POLICY IF EXISTS "Raport: odczyt zbiorczy" ON public.trip_projects;
CREATE POLICY "Raport: odczyt zbiorczy" ON public.trip_projects
  FOR SELECT TO raport_ro USING (true);

DROP POLICY IF EXISTS "Raport: odczyt zbiorczy" ON public.trip_project_places;
CREATE POLICY "Raport: odczyt zbiorczy" ON public.trip_project_places
  FOR SELECT TO raport_ro USING (true);

DROP POLICY IF EXISTS "Raport: odczyt zbiorczy" ON public.trip_plans;
CREATE POLICY "Raport: odczyt zbiorczy" ON public.trip_plans
  FOR SELECT TO raport_ro USING (true);

DROP POLICY IF EXISTS "Raport: odczyt zbiorczy" ON public.place_catalog;
CREATE POLICY "Raport: odczyt zbiorczy" ON public.place_catalog
  FOR SELECT TO raport_ro USING (true);

DROP POLICY IF EXISTS "Raport: odczyt zbiorczy" ON public.ai_usage_log;
CREATE POLICY "Raport: odczyt zbiorczy" ON public.ai_usage_log
  FOR SELECT TO raport_ro USING (true);

DROP POLICY IF EXISTS "Raport: odczyt zbiorczy" ON public.token_ledger;
CREATE POLICY "Raport: odczyt zbiorczy" ON public.token_ledger
  FOR SELECT TO raport_ro USING (true);

COMMIT;

\echo ''
\echo '=== kontrola: co rola widzi ==='
SET ROLE raport_ro;
SELECT 'tablice' AS co, count(*)::text AS ile FROM public.trip_projects
UNION ALL SELECT 'plany', count(*)::text FROM public.trip_plans
UNION ALL SELECT 'katalog', count(*)::text FROM public.place_catalog
UNION ALL SELECT 'wywolania modelu', count(*)::text FROM public.ai_usage_log;
RESET ROLE;
