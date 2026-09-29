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

const KATALOG = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE = path.join(KATALOG, '.cache');
fs.mkdirSync(path.join(CACHE, 'pliki'), { recursive: true });
const PLIK_META = path.join(CACHE, 'licencje.json');

// Wikimedia wymaga identyfikującego User-Agenta; anonimowe skrypty są dławione.
const UA = 'RouteMarketFabryka/0.1 (https://routemarket.io/kontakt)';

let meta = fs.existsSync(PLIK_META) ? JSON.parse(fs.readFileSync(PLIK_META, 'utf8')) : {};
const zapiszMeta = () => fs.writeFileSync(PLIK_META, JSON.stringify(meta, null, 1));

/** Nazwa pliku Commons z adresu upload.wikimedia.org (miniatury i oryginału). */
export function nazwaPliku(url) {
  const m = String(url).match(/\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const bezHtml = (s) => String(s ?? '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

/**
 * Pole autora w Commons bywa zdaniem („This Photo was taken by X. Feel free…”)
 * albo zawiera „Own work”. Na slajd idzie samo nazwisko lub nazwa konta.
 */
function czyscAutora(s) {
  if (!s) return null;
  let a = s.replace(/\bown work\b[,;:]?/ig, '').trim();
  const m = a.match(/(?:taken|photo(?:graph)?(?:ed)?|made|created)\s+by\s+([^.,;(]+)/i);
  if (m) a = m[1];
  a = a.replace(/\s*\[\d+\]/g, '').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/^(photo|foto|fot\.?|by)\s*:?\s*/i, '').replace(/\s*\(talk\)|\s*\(discussion\)/ig, '').trim();
  // Dopiski stron dyskusji z Commons („(discuter/talk/hablar)”, „(talk | contribs)”) i powtórzenia.
  a = a.replace(/\((?:[^)]*\b(?:talk|discuter|hablar|falar|diskussion|dyskusja|contribs)\b[^)]*)\)/ig, '').trim();
  a = a.replace(/^(.+?)\s+\1$/i, '$1');
  if (/^(unknown|anonymous|nieznany)\b/i.test(a)) return null;
  if (a.length > 40) a = a.split(/[.;,(]/)[0].trim();
  if (a.length > 40) a = a.slice(0, 38).trim() + '…';
  return a || null;
}

/**
 * Licencja → czy wolno, i co trzeba napisać. Rozpoznajemy po krótkiej nazwie
 * licencji z Commons, a przy braku — po polu License (np. „cc-by-sa-4.0”).
 */
export function ocenLicencje(krotka, kod) {
  const s = `${krotka ?? ''} ${kod ?? ''}`.toLowerCase();
  if (/\bnc\b|non-?commercial|\bnd\b|no ?deriv|fair use|non-free/.test(s)) return { wolno: false, powod: 'licencja zabrania użycia komercyjnego lub przeróbek' };
  if (/public domain|\bpd\b|pd-|cc0|cc-zero/.test(s)) return { wolno: true, rodzaj: 'PD', wymagaAutora: false, naTychSamych: false };
  if (/cc[- ]by[- ]sa|by-sa/.test(s)) return { wolno: true, rodzaj: 'BY-SA', wymagaAutora: true, naTychSamych: true };
  if (/cc[- ]by\b|cc-by-\d/.test(s)) return { wolno: true, rodzaj: 'BY', wymagaAutora: true, naTychSamych: false };
  if (/gfdl/.test(s) && /cc/.test(s)) return { wolno: true, rodzaj: 'BY-SA', wymagaAutora: true, naTychSamych: true };
  return { wolno: false, powod: `nierozpoznana licencja: ${krotka || kod || 'brak'}` };
}

/** Metadane wielu plików naraz (API przyjmuje do 50 tytułów). */
async function pobierzMeta(nazwy) {
  const brak = nazwy.filter((n) => n && !meta[n]);
  for (let i = 0; i < brak.length; i += 40) {
    const paczka = brak.slice(i, i + 40);
    const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo',
      iiprop: 'url|size|extmetadata', iiurlwidth: '1600',
      titles: paczka.map((n) => `File:${n}`).join('|'),
    });
    const odp = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!odp.ok) throw new Error(`Commons ${odp.status}`);
    const dane = await odp.json();
    const normalizacja = Object.fromEntries((dane.query?.normalized ?? []).map((n) => [n.to, n.from]));
    for (const strona of dane.query?.pages ?? []) {
      const tytul = normalizacja[strona.title] ?? strona.title;
      const nazwa = tytul.replace(/^File:/, '');
      const klucz = paczka.find((p) => p === nazwa || p.replace(/_/g, ' ') === nazwa) ?? nazwa;
      const ii = strona.imageinfo?.[0];
      if (!ii) { meta[klucz] = { brak: true }; continue; }
      const em = ii.extmetadata ?? {};
      const autor = czyscAutora(bezHtml(em.Artist?.value) || bezHtml(em.Credit?.value));
      const krotka = bezHtml(em.LicenseShortName?.value);
      const ocena = ocenLicencje(krotka, em.License?.value);
      meta[klucz] = {
        tytul: nazwa,
        autor: autor && autor.length > 80 ? autor.slice(0, 77) + '…' : autor,
        licencja: krotka || em.License?.value || null,
        licencjaUrl: em.LicenseUrl?.value ?? null,
        strona: ii.descriptionurl,
        url: ii.thumburl || ii.url,
        szer: ii.thumbwidth || ii.width,
        wys: ii.thumbheight || ii.height,
        ...ocena,
      };
    }
    zapiszMeta();
  }
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
