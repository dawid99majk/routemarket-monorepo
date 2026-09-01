-- Wyróżnik: czym to miejsce różni się od sąsiadów, których właśnie pokazujemy obok.
--
-- Pasek „Jeśli to Ci się podoba" postawił pytanie, na które karta nie odpowiada:
-- skoro obok Mauritshuis stoi Ridderzaal, Vredespaleis i Paleis Noordeinde, to
-- czemu miałbym wybrać akurat to? Opis mówi, CZYM miejsce jest. Nie mówi, czym
-- jest INNE niż pięć podobnych.
--
-- Kolumna idzie parą, dokładnie tak jak opis: `wyroznik_i18n` jest tym, co czyta
-- front i z czego tłumaczy się na kolejne języki, a `wyroznik` zostaje jako zapas
-- dla odczytów, które sięgają wprost do kolumny. Rozjazd między tymi dwoma
-- kosztował już raz przy opisach — powtarzamy wzorzec, żeby nie wymyślać drugiego.

BEGIN;

ALTER TABLE place_catalog
  ADD COLUMN IF NOT EXISTS wyroznik      text,
  ADD COLUMN IF NOT EXISTS wyroznik_i18n jsonb;

COMMENT ON COLUMN place_catalog.wyroznik IS
  'Jedno zdanie: co odróżnia to miejsce od podobnych w tym samym mieście. Zapas dla wyroznik_i18n.';
COMMENT ON COLUMN place_catalog.wyroznik_i18n IS
  'Wyróżnik per język, np. {"pl": "...", "en": "..."}. To z tego czyta front.';

COMMIT;

\pset pager off
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'place_catalog' AND column_name LIKE 'wyroznik%'
ORDER BY column_name;
