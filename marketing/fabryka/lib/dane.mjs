/**
 * Dane do materiałów — wyłącznie to, co i tak jest publiczne.
 *
 * Fabryka czyta bazę kluczem anonimowym, tym samym, który przeglądarka dostaje
 * w bundlu strony. Widzi więc dokładnie to, co widzi niezalogowany gość:
 * katalog miejsc i opublikowane tablice. Prywatne tablice są dla niej
 * niewidoczne z samej zasady (RLS), a nie dlatego, że ktoś pamiętał o filtrze.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KATALOG = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function wczytajEnv() {
  const plik = path.join(KATALOG, '.env');
  const env = {};
  if (fs.existsSync(plik)) {
    for (const linia of fs.readFileSync(plik, 'utf8').split('\n')) {
      const m = linia.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2];
    }
  }
  return { ...env, ...process.env };
}

const ENV = wczytajEnv();
const URL_BAZY = ENV.SB_URL || 'https://supabase.routemarket.io';
const KLUCZ = ENV.SB_KEY;
if (!KLUCZ) throw new Error('Brak SB_KEY w .env — to publiczny klucz anon z bundla strony.');

async function rest(sciezka) {
  const odp = await fetch(`${URL_BAZY}/rest/v1/${sciezka}`, {
    headers: { apikey: KLUCZ, Authorization: `Bearer ${KLUCZ}` },
  });
  if (!odp.ok) throw new Error(`Baza ${odp.status}: ${(await odp.text()).slice(0, 200)}`);
  return odp.json();
}

const POLA_MIEJSCA = 'id,slug,name,city,country,lat,lng,kind,category,description,wyroznik,photos,opening_hours,visit_minutes,waznosc,vibe_tags';

/** Publiczne tablice z liczbą miejsc — do wyboru tematów. */
export async function publiczneTablice() {
  const tablice = await rest('trip_projects?select=id,name,destination,days,trip_type,author_display,is_example,copy_count,like_count,published_at&is_public=eq.true&order=published_at.desc.nullslast');
  const miejsca = await rest(`trip_project_places?select=project_id,image_url&project_id=in.(${tablice.map((t) => t.id).join(',')})`);
  const ile = {};
  for (const m of miejsca) {
    const w = (ile[m.project_id] ??= { miejsc: 0, zdjec: 0 });
    w.miejsc += 1;
    if (m.image_url) w.zdjec += 1;
  }
  return tablice.map((t) => ({ ...t, miejsc: ile[t.id]?.miejsc ?? 0, zdjec: ile[t.id]?.zdjec ?? 0 }));
}

/**
 * Tablica z miejscami. Miejsca z katalogu dostają jego pola (wyróżnik, godziny,
 * zdjęcia), bo kopia na tablicy bywa uboższa niż wpis w katalogu.
 */
export async function tablica(id) {
  const [t] = await rest(`trip_projects?select=id,name,destination,days,trip_type,author_display,is_example,is_public&id=eq.${id}`);
  if (!t || !t.is_public) throw new Error(`Tablica ${id} nie istnieje albo nie jest publiczna.`);
  const miejsca = await rest(`trip_project_places?select=id,name,category,priority,lat,lng,description,opening_hours,visit_minutes,image_url,catalog_id,sort_order&project_id=eq.${id}&order=sort_order.asc.nullslast`);
  const idKatalogu = miejsca.map((m) => m.catalog_id).filter(Boolean);
  const katalog = idKatalogu.length
    ? await rest(`place_catalog?select=${POLA_MIEJSCA}&id=in.(${idKatalogu.join(',')})`)
    : [];
  const wgId = Object.fromEntries(katalog.map((k) => [k.id, k]));
  return {
    ...t,
    miejsca: miejsca.filter((m) => m.priority !== 'rejected').map((m) => {
      const k = wgId[m.catalog_id] ?? {};
      return {
        nazwa: m.name,
        slug: k.slug ?? null,
        miasto: k.city ?? t.destination,
        wyroznik: k.wyroznik ?? null,
        opis: k.description ?? m.description ?? null,
        godziny: k.opening_hours ?? m.opening_hours ?? null,
        minuty: k.visit_minutes ?? m.visit_minutes ?? null,
        zdjecia: [m.image_url, ...(k.photos ?? [])].filter(Boolean),
        pewne: m.priority === 'must',
        waznosc: k.waznosc ?? 0,
      };
    }),
  };
}

/** Najważniejsze atrakcje miasta z katalogu (kolejność wg „ważności”). */
export async function miasto(nazwa, { limit = 10 } = {}) {
  const wiersze = await rest(`place_catalog?select=${POLA_MIEJSCA}&city=eq.${encodeURIComponent(nazwa)}&kind=eq.attraction&order=waznosc.desc.nullslast&limit=${limit * 2}`);
  if (!wiersze.length) throw new Error(`Brak miasta „${nazwa}” w katalogu.`);
  return wiersze
    .filter((w) => (w.photos ?? []).length > 0)
    .slice(0, limit)
    .map((k) => ({
      nazwa: k.name,
      slug: k.slug,
      miasto: k.city,
      wyroznik: k.wyroznik,
      opis: k.description,
      godziny: k.opening_hours,
      minuty: k.visit_minutes,
      zdjecia: k.photos ?? [],
      waznosc: k.waznosc ?? 0,
    }));
}

export async function miasta() {
  const odp = await fetch(`${URL_BAZY}/rest/v1/rpc/catalog_cities`, {
    method: 'POST',
    headers: { apikey: KLUCZ, Authorization: `Bearer ${KLUCZ}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  return (await odp.json()).map((r) => r.city);
}
