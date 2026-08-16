-- Jedna polityka ALL na collection_places obsługiwała czytanie i pisanie tym samym
-- warunkiem USING:
--
--   (c.user_id = auth.uid()) OR c.is_public
--
-- Dla SELECT to poprawne — publiczną kolekcję ma widzieć każdy. Ale przy ALL ten
-- sam warunek rządzi też DELETE i UPDATE, więc dowolny zalogowany użytkownik mógł
-- usuwać miejsca z cudzej publicznej kolekcji. WITH CHECK pilnował tylko wstawiania.
--
-- Dziura była dotąd teoretyczna, bo w całym froncie nie istniał żaden zapis do tej
-- tabeli — kolekcje mogły być wyłącznie puste. Od teraz da się do nich dodawać,
-- więc warunek trzeba rozdzielić, zanim ktokolwiek coś tam odłoży.

BEGIN;

DROP POLICY IF EXISTS "Collection places follow collection" ON collection_places;

-- Czytać: swoje oraz cudze publiczne.
CREATE POLICY "Odczyt: swoje i publiczne" ON collection_places
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM collections c
             WHERE c.id = collection_places.collection_id
               AND (c.user_id = auth.uid() OR c.is_public))
  );

-- Dokładać, zmieniać i usuwać: wyłącznie we własnych kolekcjach.
CREATE POLICY "Dokładanie: tylko swoje" ON collection_places
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM collections c
             WHERE c.id = collection_places.collection_id AND c.user_id = auth.uid())
  );

CREATE POLICY "Zmiana: tylko swoje" ON collection_places
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM collections c
             WHERE c.id = collection_places.collection_id AND c.user_id = auth.uid())
  );

CREATE POLICY "Usuwanie: tylko swoje" ON collection_places
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM collections c
             WHERE c.id = collection_places.collection_id AND c.user_id = auth.uid())
  );

COMMIT;
