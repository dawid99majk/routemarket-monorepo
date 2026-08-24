-- Katalog miejsc czytelny bez konta.
--
-- Polityka nazywala sie "Anyone reads catalog", ale przyznawala dostep wylacznie
-- roli `authenticated`. Nazwa mowila jedno, warunek drugie — i przez to 414 stron
-- miejsc bylo indeksowanych przez wyszukiwarki (serwer oddaje im pelna wizytowke),
-- a czlowiek po klknieciu w wynik trafial na formularz logowania.
--
-- Katalog pochodzi z OpenStreetMap i Wikipedii, a wizytowki i tak juz go botom
-- pokazuja, wiec otwarcie odczytu nie ujawnia niczego, co bylo prywatne.
-- ZAPIS pozostaje zamkniety: katalog jest wspolnym dobrem i nie moze byc
-- przepisywalny z przegladarki — zmiany ida wylacznie przez API.

BEGIN;

DROP POLICY IF EXISTS "Anyone reads catalog" ON public.place_catalog;

CREATE POLICY "Katalog czyta kazdy, takze bez konta"
  ON public.place_catalog
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMIT;

\echo ''
\echo '=== polityki na place_catalog po zmianie ==='
SELECT policyname, cmd, roles::text FROM pg_policies
WHERE schemaname='public' AND tablename='place_catalog';
