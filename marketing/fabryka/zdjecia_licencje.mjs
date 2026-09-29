#!/usr/bin/env node
/**
 * Uzupełnia tabelę zdjecia_licencje: autor i licencja każdego zdjęcia z Wikimedia
 * Commons, które pokazuje serwis. Uruchamiany NA VPS (psql przez docker exec),
 * z crona co godzinę, bo katalog dozbiera miejsca w tle i nowe zdjęcia same
 * nie mają wpisu.
 *
 *   node zdjecia_licencje.mjs            # tylko pliki bez wpisu
 *   node zdjecia_licencje.mjs --odswiez  # także wpisy starsze niż 90 dni
 *   node zdjecia_licencje.mjs --raport   # bez zapisu: policz i pokaż licencje niedozwolone
 *
 * Wpis ma serwis dla pliku, który zna. Plik, którego Commons nie zna (usunięty),
 * dostaje wiersz z dozwolona=false i licencją null — front pokaże wtedy tylko
 * odnośnik do źródła, a raport pokaże go w liście do sprawdzenia.
 */
import { execFileSync } from 'node:child_process';
import { nazwaPliku, pobierzMetaCommons } from './lib/licencje.mjs';

const ODSWIEZ = process.argv.includes('--odswiez');
const RAPORT = process.argv.includes('--raport');
const DB = ['exec', '-i', 'supabase-db', 'psql', '-q', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];

const psql = (sql) => execFileSync('docker', DB, { input: sql, encoding: 'utf8', maxBuffer: 64 << 20 });
const wiersze = (sql) => psql(`\\pset format unaligned\n\\pset tuples_only on\n\\pset fieldsep '\t'\n${sql}`)
  .split('\n').filter(Boolean);
const q = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);

// Pliki, które serwis faktycznie pokazuje: katalog, zdjęcia na tablicach.
const adresy = [
  ...wiersze(`SELECT DISTINCT jsonb_array_elements_text(photos) FROM place_catalog WHERE jsonb_typeof(photos) = 'array';`),
  ...wiersze(`SELECT DISTINCT image_url FROM trip_project_places WHERE image_url IS NOT NULL;`),
];
const pliki = [...new Set(adresy.map(nazwaPliku).filter(Boolean))];

const znane = new Set(wiersze(
  `SELECT plik FROM zdjecia_licencje ${ODSWIEZ ? "WHERE sprawdzono_at > now() - interval '90 days'" : ''};`));
const doSprawdzenia = pliki.filter((p) => !znane.has(p));
console.log(`plików w serwisie: ${pliki.length}, z wpisem: ${pliki.length - doSprawdzenia.length}, do sprawdzenia: ${doSprawdzenia.length}`);

if (doSprawdzenia.length && !RAPORT) {
  await pobierzMetaCommons(doSprawdzenia, {
    pauzaMs: 400,
    przy: (paczka, zrobione, razem) => {
      const wartosci = Object.entries(paczka).map(([plik, m]) => m.brak
        ? `(${q(plik)}, NULL, NULL, NULL, NULL, 'INNA', false, now())`
        : `(${q(plik)}, ${q(m.autor)}, ${q(m.licencja)}, ${q(m.licencjaUrl)}, ${q(m.strona)}, ${q(m.rodzaj ?? 'INNA')}, ${m.wolno ? 'true' : 'false'}, now())`);
      if (wartosci.length) {
        psql(`INSERT INTO zdjecia_licencje (plik, autor, licencja, licencja_url, strona, rodzaj, dozwolona, sprawdzono_at) VALUES
${wartosci.join(',\n')}
ON CONFLICT (plik) DO UPDATE SET autor = EXCLUDED.autor, licencja = EXCLUDED.licencja,
  licencja_url = EXCLUDED.licencja_url, strona = EXCLUDED.strona, rodzaj = EXCLUDED.rodzaj,
  dozwolona = EXCLUDED.dozwolona, sprawdzono_at = EXCLUDED.sprawdzono_at;`);
      }
      process.stdout.write(`\r${zrobione}/${razem}`);
    },
  });
  console.log('');
}

// Raport: co jest w bazie po zapisie.
console.log('--- licencje (wszystkie pliki z wpisem)');
console.log(wiersze(`SELECT rodzaj, dozwolona, count(*) FROM zdjecia_licencje GROUP BY 1, 2 ORDER BY 3 DESC;`).join('\n'));
console.log('--- niedozwolone lub bez metadanych (pierwsze 25) — do decyzji, czy zostawić na stronie');
console.log(wiersze(`SELECT plik, coalesce(licencja, 'BRAK W COMMONS') FROM zdjecia_licencje WHERE NOT dozwolona ORDER BY 2, 1 LIMIT 25;`).join('\n'));
console.log('--- bez autora (dozwolone, ale autor nieznany)');
console.log(wiersze(`SELECT count(*) FROM zdjecia_licencje WHERE dozwolona AND autor IS NULL;`).join('\n'));
