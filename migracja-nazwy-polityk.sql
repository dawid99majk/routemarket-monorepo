-- Nazwy polityk zgodne z tym, co naprawdę robią.
--
-- Audyt wyłapał polityki, których nazwa obiecuje dostęp publiczny, a warunek
-- go nie daje. Sprawdzone po kolei: w obu przypadkach ZAKRES JEST POPRAWNY,
-- kłamie nazwa.
--
--   place_events  — wydarzenia czyta wyłącznie tablica wyjazdu, czyli widok za
--                   logowaniem. Strona miejsca ich nie pokazuje, więc gość nie
--                   ma po co ich widzieć.
--   collections   — wszystkie trasy kolekcji są za ProtectedRoute, więc gość
--                   nie ma jak wyświetlić kolekcji, także publicznej.
--
-- Nie otwieramy więc dostępu, którego nic nie potrzebuje. Poprawiamy nazwy,
-- żeby następny czytający nie musiał sprawdzać warunku, by poznać zakres —
-- dokładnie ta pomyłka kosztowała nas 414 stron indeksowanych za logowaniem.

BEGIN;

ALTER POLICY "Anyone reads events" ON public.place_events
  RENAME TO "Wydarzenia czyta zalogowany";

ALTER POLICY "Public collections readable" ON public.collections
  RENAME TO "Kolekcje publiczne czyta zalogowany";

COMMIT;

\echo ''
\echo '=== kontrola: polityki obiecujace wiecej niz daja ==='
SELECT tablename, policyname, roles::text
FROM pg_policies
WHERE schemaname='public'
  AND (policyname ILIKE '%anyone%' OR policyname ILIKE '%public%' OR policyname ILIKE '%kazd%')
  AND roles::text NOT LIKE '%anon%'
  AND roles::text <> '{public}';
