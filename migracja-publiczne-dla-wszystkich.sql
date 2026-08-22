-- Publiczna tablica staje się publiczna naprawdę: widoczna także bez konta.
--
-- Do tej pory obie polityki odczytu obejmowały wyłącznie rolę authenticated, więc
-- niezalogowany gość widział zero tablic — łącznie z galerią na stronie głównej,
-- czyli dokładnie tam, gdzie trafiają ludzie bez konta. Publikowanie nie mogło
-- więc nikogo z zewnątrz zaprosić.
--
-- Rozszerzamy WYŁĄCZNIE odczyt i WYŁĄCZNIE na tablice oznaczone jako publiczne.
-- Gość niczego nie kliknie: polubienia i licznik kopii wymagają roli authenticated
-- na mocy własnych polityk, a zapis do tablic i miejsc zostaje przy właścicielu
-- i współtwórcach. Zmiana nie dotyka tablic prywatnych ani udostępnionych imiennie.

BEGIN;

DROP POLICY IF EXISTS "Public boards are readable" ON trip_projects;
CREATE POLICY "Public boards are readable" ON trip_projects
  FOR SELECT TO anon, authenticated
  USING (is_public = true);

DROP POLICY IF EXISTS "Public board places are readable" ON trip_project_places;
CREATE POLICY "Public board places are readable" ON trip_project_places
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM trip_projects p
     WHERE p.id = trip_project_places.project_id
       AND p.is_public = true
  ));

COMMIT;

-- Cofnięcie: te same polityki z "TO authenticated" zamiast "TO anon, authenticated".
