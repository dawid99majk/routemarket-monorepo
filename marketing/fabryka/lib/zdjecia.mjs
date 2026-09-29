/**
 * Zdjęcia z Wikimedia Commons — z autorem i licencją, albo wcale.
 *
 * Wszystkie zdjęcia katalogu pochodzą z Commons. To nie znaczy, że wolno je
 * wrzucić do reklamy bez słowa: CC BY i CC BY-SA wymagają podania autora,
 * licencji i źródła, a część plików jest na licencjach „non-commercial” albo
 * „no derivatives” — tych w materiałach promocyjnych użyć nie wolno w ogóle
 * (post promujący serwis to użycie komercyjne, a napis na zdjęciu to utwór
 * zależny). Pliki z wiki językowych (np. /wikipedia/en/) bywają „fair use”
 * i odpadają z tego samego powodu.
 *
 * Dlatego każde zdjęcie przechodzi przez API Commons: bierzemy licencję
 * i autora z metadanych pliku, a zdjęcie bez rozpoznanej, dozwolonej licencji
 * nie trafia do materiału. Lepiej slajd z innym ujęciem niż zgłoszenie
 * naruszenia na koncie, które dopiero zbiera obserwujących.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { UA, nazwaPliku, ocenLicencje, pobierzMetaCommons } from './licencje.mjs';

export { nazwaPliku, ocenLicencje };

const KATALOG = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE = path.join(KATALOG, '.cache');
fs.mkdirSync(path.join(CACHE, 'pliki'), { recursive: true });
const PLIK_META = path.join(CACHE, 'licencje.json');

let meta = fs.existsSync(PLIK_META) ? JSON.parse(fs.readFileSync(PLIK_META, 'utf8')) : {};
const zapiszMeta = () => fs.writeFileSync(PLIK_META, JSON.stringify(meta, null, 1));

/** Metadane wielu plików naraz — z cache na dysku, brakujące z Commons. */
async function pobierzMeta(nazwy) {
  const brak = nazwy.filter((n) => n && !meta[n]);
  if (!brak.length) return;
  Object.assign(meta, await pobierzMetaCommons(brak, { przy: zapiszMeta }));
  zapiszMeta();
}

/**
 * Dla listy adresów zwraca pierwsze zdjęcie, którego wolno użyć, wraz z plikiem
 * lokalnym i podpisem. Pionowy kadr (rolka, story) woli zdjęcia nie za szerokie —
 * panorama przycięta do 9:16 pokazuje fragment muru.
 */
export async function wybierzZdjecie(adresy, { pion = false, pominiete = [] } = {}) {
  const nazwy = [...new Set(adresy.map(nazwaPliku).filter(Boolean))];
  await pobierzMeta(nazwy);
  const kandydaci = nazwy
    .map((n) => meta[n])
    .filter((m) => m && !m.brak && m.wolno && m.szer >= 700 && !pominiete.includes(m.tytul));
  if (pion) kandydaci.sort((a, b) => (a.szer / a.wys > 2 ? 1 : 0) - (b.szer / b.wys > 2 ? 1 : 0));
  const m = kandydaci[0];
  if (!m) return null;
  return { ...m, plik: await pobierzPlik(m.url), podpis: podpisKrotki(m) };
}

async function pobierzPlik(url) {
  const plik = path.join(CACHE, 'pliki', crypto.createHash('sha1').update(url).digest('hex').slice(0, 16) + path.extname(new URL(url).pathname).toLowerCase());
  if (fs.existsSync(plik) && fs.statSync(plik).size > 0) return plik;
  for (let proba = 1; proba <= 3; proba++) {
    const odp = await fetch(url, { headers: { 'User-Agent': UA } });
    if (odp.ok) {
      fs.writeFileSync(plik, Buffer.from(await odp.arrayBuffer()));
      return plik;
    }
    if (odp.status !== 429 && odp.status < 500) throw new Error(`Zdjęcie ${odp.status}: ${url}`);
    await new Promise((r) => setTimeout(r, 1500 * proba));
  }
  throw new Error(`Zdjęcie nie do pobrania: ${url}`);
}

/** Podpis na zdjęciu: krótki, ale kompletny (autor · licencja · źródło). */
export function podpisKrotki(m) {
  if (m.rodzaj === 'PD') return `Fot. ${m.autor ? m.autor + ' · ' : ''}domena publiczna · Wikimedia Commons`;
  return `Fot. ${m.autor || 'autor nieznany'} · ${m.licencja} · Wikimedia Commons`;
}

/** Pełna lista źródeł do opisu posta i pliku źródeł (TASL: tytuł, autor, źródło, licencja). */
export function listaZrodel(zdjecia) {
  const unikalne = [...new Map(zdjecia.filter(Boolean).map((z) => [z.tytul, z])).values()];
  const linie = unikalne.map((z) =>
    `„${z.tytul.replace(/\.[a-z]+$/i, '').replace(/_/g, ' ')}”, ${z.autor || 'autor nieznany'}, ${z.rodzaj === 'PD' ? 'domena publiczna' : z.licencja}${z.licencjaUrl ? ` (${z.licencjaUrl})` : ''}, ${z.strona}`);
  const sa = unikalne.some((z) => z.naTychSamych);
  return {
    linie,
    uwagaSA: sa
      ? 'Grafiki zawierające zdjęcia na licencji CC BY-SA są udostępniane na tej samej licencji (CC BY-SA 4.0).'
      : null,
  };
}
