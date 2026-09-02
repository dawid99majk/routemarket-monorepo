-- Podobne miejsca ważone tym, co użytkownik już wybrał na tablicy.
--
-- DLACZEGO NIE „PREMIUJ TAGI, KTÓRE LUBI". Zmierzone na prawdziwej tablicy
-- (Warszawa, 14 wyborów): `historyczne` jest na 14 z 14, `architektura` na 13,
-- `ikoniczne` na 10. Wyglądają jak gust, a są tłem — w katalogu Warszawy te same
-- tagi siedzą odpowiednio na 51%, 47% i 28% miejsc. Premiowanie ich wzmocniłoby
-- rzeczy pospolite, czyli dokładnie ten błąd, który ranking podobnych już raz
-- popełnił przy samej liczbie wspólnych tagów.
--
-- CO NIESIE INFORMACJĘ. Przewaga nad tłem miasta, nie sam udział:
--
--   tag           na tablicy   w mieście   przewaga
--   widokowe          14%          3%        4.86
--   zielone           21%          9%        2.43
--   ikoniczne         71%         28%        2.56
--   historyczne      100%         51%        1.94
--   muzealne           7%         10%        0.69
--   sztuka             7%         21%        0.35
--
-- Ta osoba wybiera monumenty i punkty widokowe, a omija muzea i sztukę. Sygnał
-- „czego unika" jest tu równie mocny jak „co lubi", dlatego skala jest
-- logarytmiczna wokół zera: przewaga 1 (tak jak w mieście) daje 0, powyżej
-- premię, poniżej karę.
--
-- WAGA 0,4 I DLACZEGO NIE WIĘCEJ. `trafnosc` odpowiada na pytanie „czy to jest
-- PODOBNE do tego, co oglądasz", i to jest pytanie główne. Gust odpowiada na
-- „które z podobnych pasuje akurat Tobie" i ma rozstrzygać remisy, a nie
-- przestawiać ranking. Przy 0,4 suma logarytmów z trzech-czterech tagów mieści
-- się w granicach jednego-dwóch punktów, a remisów jest dużo (przy Rynku pięć
-- miejsc miało identyczne 1.79).
--
-- PRÓG PIĘCIU WYBORÓW. Przy dwóch przypiętych miejscach „gust" to szum jednej
-- decyzji. Poniżej progu funkcja zachowuje się dokładnie jak dotąd.
--
-- PRZEPLATANIE RODZAJAMI. Ranking po samym wyniku zwracał zestawy monotonne
-- i robił to JUŻ BEZ GUSTU: przy Zamku Królewskim wychodziło sześć muzeów pod
-- rząd, a po dołożeniu gustu pięć kościołów. Dla przeglądania to porażka —
-- pasek ma pokazać, dokąd jeszcze można pójść, a nie sześć wariantów jednej
-- rzeczy. Numerujemy więc kandydatów w obrębie `kind` i bierzemy najpierw
-- pierwszego z każdego rodzaju, potem drugiego z każdego. Najlepszy wynik
-- zostaje pierwszy, ale kolejne miejsca idą do innych rodzajów.
--
-- Świadomie NIE twardy limit „najwyżej dwa z rodzaju": w mieście, gdzie
-- kandydaci są jednego rodzaju, limit zwracałby dwa miejsca zamiast sześciu.
-- Przeplatanie nie gubi niczego, zmienia tylko kolejność.

BEGIN;

DROP FUNCTION IF EXISTS public.podobne_miejsca(uuid, int, uuid[], text);
DROP FUNCTION IF EXISTS public.podobne_miejsca(uuid, int, uuid[], text, uuid);

CREATE FUNCTION public.podobne_miejsca(
  p_place uuid,
  p_limit int DEFAULT 6,
  p_pomin uuid[] DEFAULT '{}'::uuid[],
  p_jezyk text DEFAULT 'pl',
  -- Tablica, z której czytamy gust. NULL = ranking bez personalizacji.
  p_tablica uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  city text,
  country text,
  lat double precision,
  lng double precision,
  category text,
  kind text,
  description text,
  wyroznik text,
  photos jsonb,
  opening_hours text,
  website text,
  vibe_tags text[],
  visit_minutes smallint,
  pin_count int,
  waznosc smallint,
  wspolne int,
  trafnosc real
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH z AS (
    SELECT pc.id, pc.city, pc.vibe_tags, pc.category
    FROM place_catalog pc
    WHERE pc.id = p_place
  ),
  w_miescie AS (
    SELECT count(*)::numeric AS n FROM place_catalog q, z WHERE q.city = z.city
  ),
  wagi AS (
    SELECT t AS tag, ln((SELECT n FROM w_miescie) / count(*)::numeric) AS waga
    FROM place_catalog p, z, unnest(p.vibe_tags) t
    WHERE p.city = z.city
    GROUP BY t
  ),
  -- Udział tagu w mieście — tło, względem którego liczy się przewaga wyborów.
  udzial_miasta AS (
    SELECT t AS tag, count(*)::numeric / (SELECT n FROM w_miescie) AS udzial
    FROM place_catalog p, z, unnest(p.vibe_tags) t
    WHERE p.city = z.city
    GROUP BY t
  ),
  -- Miejsca, które użytkownik już wybrał na tej tablicy, w tym samym mieście.
  wybory AS (
    SELECT c.vibe_tags
    FROM trip_project_places t
    JOIN place_catalog c ON c.id = t.catalog_id
    CROSS JOIN z
    WHERE p_tablica IS NOT NULL
      AND t.project_id = p_tablica
      AND t.priority IN ('must', 'nice')
      AND c.city = z.city
      AND c.id <> z.id
  ),
  ile_wyborow AS (SELECT count(*)::numeric AS n FROM wybory),
  gust AS (
    SELECT policzone.tag,
           ln((policzone.ile / (SELECT n FROM ile_wyborow)) / u.udzial) AS sila
    FROM (
      SELECT t AS tag, count(*)::numeric AS ile
      FROM wybory w, unnest(w.vibe_tags) t
      GROUP BY t
    ) policzone
    JOIN udzial_miasta u ON u.tag = policzone.tag
    -- Poniżej pięciu wyborów to szum pojedynczej decyzji, nie gust.
    WHERE (SELECT n FROM ile_wyborow) >= 5
  ),
  kandydaci AS (
    SELECT p.id, p.slug, p.name, p.city, p.country, p.lat, p.lng, p.category, p.kind,
           coalesce(p.description_i18n->>p_jezyk, p.description_i18n->>'pl', p.description) AS description,
           coalesce(p.wyroznik_i18n->>p_jezyk, p.wyroznik_i18n->>'pl', p.wyroznik) AS wyroznik,
           p.photos, p.opening_hours, p.website, p.vibe_tags, p.visit_minutes,
           p.pin_count, p.waznosc,
           cardinality(ARRAY(SELECT unnest(p.vibe_tags) INTERSECT SELECT unnest(z.vibe_tags)))::int AS wspolne,
           (SELECT coalesce(sum(w.waga), 0) FROM wagi w
             WHERE w.tag = ANY(p.vibe_tags) AND w.tag = ANY(z.vibe_tags))::real AS trafnosc,
           (SELECT coalesce(sum(g.sila), 0) FROM gust g
             WHERE g.tag = ANY(p.vibe_tags))::real AS gust_pkt,
           (p.category = z.category) AS ten_sam_rodzaj
    FROM place_catalog p, z
    WHERE p.city = z.city
      AND p.id <> z.id
      AND coalesce(p.status, '') <> 'hidden'
      AND NOT (p.id = ANY(coalesce(p_pomin, '{}'::uuid[])))
      AND p.vibe_tags && z.vibe_tags
      AND cardinality(ARRAY(SELECT unnest(p.vibe_tags) INTERSECT SELECT unnest(z.vibe_tags)))
          >= LEAST(2, cardinality(z.vibe_tags))
  )
  , przeplecione AS (
    SELECT k.*,
           row_number() OVER (
             PARTITION BY coalesce(k.kind, '?')
             ORDER BY (k.trafnosc + 0.4 * k.gust_pkt) DESC, k.waznosc DESC NULLS LAST
           ) AS nr_w_rodzaju
    FROM kandydaci k
  )
  SELECT p.id, p.slug, p.name, p.city, p.country, p.lat, p.lng, p.category, p.kind,
         p.description, p.wyroznik, p.photos, p.opening_hours, p.website, p.vibe_tags,
         p.visit_minutes, p.pin_count, p.waznosc, p.wspolne, p.trafnosc
  FROM przeplecione p
  -- Kategoria przed wszystkim: restauracja obok katedry byłaby poprawna tagowo
  -- i bez sensu w odbiorze. Potem runda przeplatania (pierwszy z każdego rodzaju,
  -- dopiero potem drugi), a w obrębie rundy podobieństwo z gustem jako
  -- modyfikatorem o wadze 0,4.
  ORDER BY p.ten_sam_rodzaj DESC,
           p.nr_w_rodzaju ASC,
           (p.trafnosc + 0.4 * p.gust_pkt) DESC,
           p.waznosc DESC NULLS LAST, p.pin_count DESC NULLS LAST
  LIMIT LEAST(GREATEST(coalesce(p_limit, 6), 1), 24)
$$;

GRANT EXECUTE ON FUNCTION public.podobne_miejsca(uuid, int, uuid[], text, uuid)
  TO anon, authenticated;

COMMIT;
