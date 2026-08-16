-- Audyt RLS 16.08.2026: pięć tabel w schemacie public miało WYŁĄCZONE RLS przy
-- pełnych grantach (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) dla ról anon
-- i authenticated. Klucz anon jest publiczny (siedzi w bundlu frontendu), więc
-- każdy mógł czytać, nadpisywać i czyścić: atlas_projects, atlas_artifacts,
-- route_builder_projects, route_builder_jobs, route_builder_artifacts.
--
-- Oba backendy (route-builder-api, atlas-api) łączą się kluczem service_role,
-- który omija RLS — włączenie polityk niczego im nie psuje.
--
-- Osobna sprawa: TRUNCATE w ogóle nie podlega RLS, więc sam grant TRUNCATE
-- pozwala opróżnić tabelę nawet z włączonymi politykami. Zabieramy go klientom
-- na wszystkich tabelach public.

BEGIN;

REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

ALTER TABLE atlas_projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_artifacts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_builder_projects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_builder_jobs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_builder_artifacts ENABLE ROW LEVEL SECURITY;

-- atlas_projects / atlas_artifacts: frontend ich nie dotyka (sprawdzone grepem),
-- pisze i czyta wyłącznie atlas-api przez service_role. RLS bez żadnych polityk
-- = zero dostępu dla klientów, dokładnie tak ma być.

-- route_builder_projects: frontend robi pełne CRUD na własnych projektach
-- (MyRoutes, RouteBuilderV2, kreator); AdminDashboard liczy wszystkie.
CREATE POLICY "Odczyt: swoje lub admin" ON route_builder_projects
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dodawanie: tylko swoje" ON route_builder_projects
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Zmiana: tylko swoje" ON route_builder_projects
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Usuwanie: tylko swoje" ON route_builder_projects
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Joby i artefakty: właściciel projektu tylko czyta (postęp, wyniki);
-- zapisuje wyłącznie worker przez service_role.
CREATE POLICY "Odczyt: przez własny projekt" ON route_builder_jobs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM route_builder_projects p
                  WHERE p.id = route_builder_jobs.project_id
                    AND p.user_id = auth.uid()));

CREATE POLICY "Odczyt: przez własny projekt" ON route_builder_artifacts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM route_builder_projects p
                  WHERE p.id = route_builder_artifacts.project_id
                    AND p.user_id = auth.uid()));

COMMIT;
