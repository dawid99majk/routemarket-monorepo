-- Uporządkowanie nazw miast w katalogu i na tablicach.
--
-- Pole `city` nie jest etykietą, tylko kluczem dopasowania: repozytorium i front
-- szukają miejsc przez `ilike('city', destination)`, czyli równość bez względu na
-- wielkość liter. Rozjechane nazwy dawały więc dwa skutki naraz — brzydkie tytuły
-- w wynikach wyszukiwania ("Ateneul Român — bukareszt rumunia") i tablice, które
-- nie widzą własnych miejsc.
--
-- Znalezione przypadki:
--   * "Wieża Eiffla" figurowało jako MIASTO z 23 miejscami. Sprawdzone: wszystkie
--     leżą w granicach Paryża, a żadna nazwa nie powtarza się z istniejącym
--     miastem "Paryż" — scalenie nie tworzy duplikatów.
--   * Tablica z destination "Lipzig" nie widziała nic, bo katalog zna "Lipsk".
--   * Nazwy pisane raz małą, raz wielką literą.
--
-- Czego ta migracja NIE robi: nie rusza slugów. Slug niesie starą nazwę miasta
-- (ateneul-roman-bukareszt-rumunia-7csw) i jest adresem strony, który siedzi już
-- w mapie strony i w indeksie wyszukiwarki. Zmiana nazwy miasta poprawia tytuł
-- i dopasowanie, a adres zostaje ten sam.

BEGIN;

\echo '=== PRZED ==='
SELECT city, count(*) FROM public.place_catalog GROUP BY city ORDER BY 2 DESC;

-- 1. Scalenie błędnego "miasta" z Paryżem.
UPDATE public.place_catalog SET city = 'Paryż', updated_at = now()
WHERE city = 'Wieża Eiffla';

-- 2. Jedna konwencja zapisu: nazwa własna wielką literą, bez doklejonego kraju.
UPDATE public.place_catalog SET city = 'Bukareszt', updated_at = now() WHERE city = 'bukareszt rumunia';
UPDATE public.place_catalog SET city = 'Palermo',   updated_at = now() WHERE city = 'palermo';
UPDATE public.place_catalog SET city = 'Berat',     updated_at = now() WHERE city = 'berat';
UPDATE public.place_catalog SET city = 'Durrës',    updated_at = now() WHERE city IN ('dures', 'Dures');

-- 3. Tablice muszą wskazywać na te same nazwy, inaczej stracą swoje miejsca.
--    Trzy tablice miały jako cel wyjazdu nazwę atrakcji, a nie miasta — to wynik
--    automatycznego tworzenia tablicy z pojedynczego miejsca.
UPDATE public.trip_projects SET destination = 'Bukareszt', updated_at = now() WHERE destination = 'bukareszt rumunia';
UPDATE public.trip_projects SET destination = 'Palermo',   updated_at = now() WHERE destination = 'palermo';
UPDATE public.trip_projects SET destination = 'Berat',     updated_at = now() WHERE destination = 'berat';
UPDATE public.trip_projects SET destination = 'Durrës',    updated_at = now() WHERE destination IN ('dures', 'Dures', 'Port w Durrës');
UPDATE public.trip_projects SET destination = 'Lipsk',     updated_at = now() WHERE destination = 'Lipzig';
UPDATE public.trip_projects SET destination = 'Paryż',     updated_at = now() WHERE destination IN ('Wieża Eiffla', 'Palais Royal');

\echo ''
\echo '=== PO: katalog ==='
SELECT city, count(*) FROM public.place_catalog GROUP BY city ORDER BY 2 DESC;

\echo ''
\echo '=== PO: cele tablic ==='
SELECT destination, count(*) FROM public.trip_projects GROUP BY destination ORDER BY 2 DESC;

\echo ''
\echo '=== KONTROLA: czy kazda tablica widzi swoje miejsca w katalogu ==='
SELECT p.destination,
       count(DISTINCT c.id) AS miejsc_w_katalogu
FROM public.trip_projects p
LEFT JOIN public.place_catalog c ON lower(c.city) = lower(p.destination)
GROUP BY p.destination ORDER BY 2;

COMMIT;
