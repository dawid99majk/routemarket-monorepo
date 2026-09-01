-- „Jeśli to Ci się podoba, rozważ też…" — podobne miejsca w tym samym mieście.
--
-- Katalog miał już wszystko, czego to potrzebuje, i nikt z tego nie korzystał:
-- `vibe_tags` wypełnione dla 1586 z 1590 miejsc, `waznosc` licząca wersje
-- językowe na Wikidacie, oraz indeks GIN `idx_place_catalog_vibe` założony
-- w sierpniu wprost pod ten przypadek („podobne (overlap vibe_tags)").
--
-- DLACZEGO NIE SAMA LICZBA WSPÓLNYCH TAGÓW. Zmierzone na Wrocławiu: przy
-- Ogrodzie Botanicznym {zielone,spacerowe,dla-dzieci,ikoniczne} wygrywał pomnik
-- Szermierza i Most Piaskowy, bo trafiały w `ikoniczne` i `spacerowe` — dwa
-- z trzech najczęstszych tagów w mieście, więc nic nie znaczące. `zielone` ma
-- w tym mieście trzy wystąpienia i to ono niesie informację.
-- Stąd waga rzadkości: ln(miejsc_w_miescie / miejsc_z_tym_tagiem).
--
-- DLACZEGO PRÓG DWÓCH WSPÓLNYCH TAGÓW. Sama waga rzadkości przestrzeliła
-- w drugą stronę: przy Rynku {historyczne,architektura,gwarne,ikoniczne}
-- na pierwsze miejsce wskoczył Teatr Komedia, bo trafił jeden rzadki tag
-- `gwarne` (dwa wystąpienia) i to przebiło Halę Stulecia, która ma trzy tagi
-- wspólne i ważność 46. Jeden wspólny tag to zbieg okoliczności, nie
-- podobieństwo. Przy miejscu o jednym tagu próg schodzi do jednego, żeby nie
-- zostawić go bez sąsiadów.
--
-- POKRYCIE po tych regułach (zmierzone): 1516 miejsc ma co najmniej sześciu
-- sąsiadów, 50 ma trzech do pięciu, 20 ma jednego lub dwóch, ŻADNE nie zostaje
-- z pustym paskiem.
--
-- Wagi liczymy w CTE zawężonym do miasta źródła — to kilkadziesiąt wierszy,
-- a nie przemiał całego katalogu przy każdym wywołaniu.

BEGIN;

-- Zmiana listy zwracanych kolumn wymaga usunięcia funkcji: CREATE OR REPLACE
-- nie potrafi zmienić typu zwracanego.
DROP FUNCTION IF EXISTS public.podobne_miejsca(uuid, int, uuid[], text);

CREATE FUNCTION public.podobne_miejsca(
  p_place uuid,
  p_limit int DEFAULT 6,
  p_pomin uuid[] DEFAULT '{}'::uuid[],
  p_jezyk text DEFAULT 'pl'
)
-- Zwracamy PEŁNY kształt miejsca, nie sam podgląd. Kafelek w pasku prowadzi
-- do otwarcia karty i do dopięcia na tablicę, a jedno i drugie potrzebuje
-- współrzędnych, godzin, opisu i wyróżnika. Bez nich front musiałby po każdym
-- kliknięciu dociągać ten sam wiersz drugi raz.
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
  wagi AS (
    SELECT t AS tag,
           ln(
             (SELECT count(*)::numeric FROM place_catalog q, z WHERE q.city = z.city)
             / count(*)::numeric
           ) AS waga
    FROM place_catalog p, z, unnest(p.vibe_tags) t
    WHERE p.city = z.city
    GROUP BY t
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
  SELECT k.id, k.slug, k.name, k.city, k.country, k.lat, k.lng, k.category, k.kind,
         k.description, k.wyroznik, k.photos, k.opening_hours, k.website, k.vibe_tags,
         k.visit_minutes, k.pin_count, k.waznosc, k.wspolne, k.trafnosc
  FROM kandydaci k
  -- Rodzaj przed trafnością: restauracja obok katedry byłaby poprawna tagowo
  -- i bez sensu w odbiorze.
  ORDER BY k.ten_sam_rodzaj DESC, k.trafnosc DESC,
           k.waznosc DESC NULLS LAST, k.pin_count DESC NULLS LAST
  LIMIT LEAST(GREATEST(coalesce(p_limit, 6), 1), 24)
$$;

-- Funkcja tylko czyta, a katalog i tak jest publiczny („Katalog czyta kazdy,
-- takze bez konta"), więc gość niezalogowany ma do niej prawo — Odkrywaj
-- działa bez konta i pasek podobnych miejsc ma tam działać tak samo.
GRANT EXECUTE ON FUNCTION public.podobne_miejsca(uuid, int, uuid[], text)
  TO anon, authenticated;

COMMIT;

-- Sprawdzenie: dwa różne punkty wyjścia muszą dać różne, sensowne zestawy.
\pset pager off
SELECT 'Rynek/Wrocław ->' AS zrodlo, name, waznosc, wspolne, round(trafnosc::numeric, 2) AS trafnosc
FROM podobne_miejsca(
  (SELECT id FROM place_catalog WHERE name = 'Rynek' AND city = 'Wrocław' LIMIT 1), 5);

SELECT 'Ogród Botaniczny/Wrocław ->' AS zrodlo, name, waznosc, wspolne, round(trafnosc::numeric, 2) AS trafnosc
FROM podobne_miejsca(
  (SELECT id FROM place_catalog WHERE name = 'Ogród Botaniczny' AND city = 'Wrocław' LIMIT 1), 5);
