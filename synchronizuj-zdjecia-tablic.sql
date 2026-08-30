-- Miniatury na tablicach starzeją się względem katalogu.
--
-- `trip_project_places.image_url` to KOPIA zrobiona w chwili przypięcia miejsca.
-- Gdy katalog dostaje lepsze zdjęcie, tablice zostają ze starym: Opera Wrocławska
-- trzymała zdjęcie sąsiedniego kościoła jeszcze długo po tym, jak katalog dostał
-- właściwe. Poprzednie uzupełnienie ruszało tylko PUSTE pola, więc błędnych
-- (ale niepustych) nie tknęło.
--
-- Nadpisujemy tylko tam, gdzie jest twarde powiązanie `catalog_id`, i tylko gdy
-- wartość faktycznie się różni. Zdjęcia na tablicy nie są edytowalne z interfejsu
-- — nic ich nie zapisuje poza kopiowaniem z katalogu — więc nie ma tu czyjegoś
-- ręcznego wyboru do nadpisania.

BEGIN;

UPDATE public.trip_project_places pl
SET image_url = c.photos->>0
FROM public.place_catalog c
WHERE pl.catalog_id = c.id
  AND c.photos->>0 IS NOT NULL
  AND pl.image_url IS DISTINCT FROM c.photos->>0;

COMMIT;

-- Kontrola: Opera na obu tablicach ma pokazywać operę, nie kościół.
SELECT p.name AS tablica, pl.name, split_part(replace(pl.image_url, '%C5%82', 'l'), '/', 8) AS plik
FROM public.trip_project_places pl
JOIN public.trip_projects p ON p.id = pl.project_id
WHERE pl.name ILIKE '%opera wroc%';

-- Ile miejsc nadal odbiega od katalogu (powinno być 0).
SELECT count(*) AS rozjechanych
FROM public.trip_project_places pl
JOIN public.place_catalog c ON c.id = pl.catalog_id
WHERE c.photos->>0 IS NOT NULL
  AND pl.image_url IS DISTINCT FROM c.photos->>0;
