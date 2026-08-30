-- Tablice przykładowe bez zdjęć.
--
-- `przykladowa.py` kopiuje `image_url` z katalogu w chwili zakładania tablicy.
-- Budapeszt i Warszawa powstały wtedy, gdy `zdjecia.py` uzupełnił dla nich zero
-- galerii (Wikimedia odmawiała), więc tablice zapisały pustkę i już jej nie
-- odzyskały — katalog dostał zdjęcia później, tablice zostały z tym, co miały.
--
-- Uzupełniamy TYLKO braki i tylko tam, gdzie miejsce ma twarde powiązanie
-- z katalogiem (`catalog_id`). Zdjęć już ustawionych nie ruszamy: mogły zostać
-- zmienione ręcznie na tablicy i nie ma powodu ich nadpisywać.

BEGIN;

UPDATE public.trip_project_places pl
SET image_url = c.photos->>0
FROM public.place_catalog c
WHERE pl.catalog_id = c.id
  AND (pl.image_url IS NULL OR pl.image_url = '')
  AND c.photos->>0 IS NOT NULL;

COMMIT;

-- Kontrola: ile tablic przykładowych nadal nie ma ani jednego zdjęcia.
SELECT p.name,
       count(*) FILTER (WHERE pl.image_url IS NOT NULL AND pl.image_url <> '') AS ze_zdjeciem,
       count(*) AS miejsc
FROM public.trip_projects p
JOIN public.trip_project_places pl ON pl.project_id = p.id
WHERE p.is_example
GROUP BY p.name
ORDER BY ze_zdjeciem ASC, p.name
LIMIT 6;
