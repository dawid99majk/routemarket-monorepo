/**
 * Licencje i autorzy zdjęć z Wikimedia Commons — logika wspólna.
 *
 * Używana w dwóch miejscach, które MUSZĄ oceniać zdjęcia tak samo:
 *   - fabryka materiałów (lib/zdjecia.mjs) — decyduje, czy zdjęcie wolno dać do posta,
 *   - serwis (zdjecia_licencje.mjs) — zapisuje autora i licencję do podpisu na stronie.
 * Zmiana oceny licencji w jednym miejscu bez drugiego dawałaby posty i stronę
 * z różnym zdaniem o tym samym zdjęciu.
 */

// Wikimedia wymaga identyfikującego User-Agenta; anonimowe skrypty są dławione.
export const UA = 'RouteMarketFabryka/0.1 (https://routemarket.io/kontakt)';

/** Nazwa pliku Commons z adresu upload.wikimedia.org (miniatury i oryginału). */
export function nazwaPliku(url) {
  const m = String(url).match(/\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export const bezHtml = (s) => String(s ?? '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

/**
 * Pole autora w Commons bywa zdaniem („This Photo was taken by X. Feel free…”)
 * albo zawiera „Own work”. Na slajd idzie samo nazwisko lub nazwa konta.
 */
export function czyscAutora(s) {
  if (!s) return null;
  let a = s.replace(/\bown work\b[,;:]?/ig, '').trim();
  const m = a.match(/(?:taken|photo(?:graph)?(?:ed)?|made|created)\s+by\s+([^.,;(]+)/i);
  if (m) a = m[1];
  a = a.replace(/\s*\[\d+\]/g, '').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/^(photo|foto|fot\.?|by)\s*:?\s*/i, '').replace(/\s*\(talk\)|\s*\(discussion\)/ig, '').trim();
  // Dopiski stron dyskusji z Commons („(discuter/talk/hablar)”, „(talk | contribs)”) i powtórzenia.
  a = a.replace(/\((?:[^)]*\b(?:talk|discuter|hablar|falar|diskussion|dyskusja|contribs)\b[^)]*)\)/ig, '').trim();
  a = a.replace(/^(.+?)\s+\1$/i, '$1');
  if (/^(unknown|anonymous|nieznany)\b/i.test(a)) return null;
  // „Uris took this photograph…”, „Erik Zachte at Dutch Wikipedia…” — samo nazwisko.
  a = a.replace(/^(.+?)\s+(?:took|made|shot)\s+this\b.*$/i, '$1').replace(/^(.+?)\s+at\s+\w+\s+Wikipedia\b.*$/i, '$1').trim();
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


/**
 * Metadane wielu plików naraz (API przyjmuje do 50 tytułów; bierzemy 40).
 * Zwraca mapę nazwa pliku → dane; plik, którego Commons nie zna, dostaje { brak: true }.
 * `przy` (opcjonalnie) jest wołane po każdej paczce — do zapisu cache lub postępu.
 */
export async function pobierzMetaCommons(nazwy, { przy, szerokosc = 1600, pauzaMs = 0 } = {}) {
  const wynik = {};
  for (let i = 0; i < nazwy.length; i += 40) {
    const paczka = nazwy.slice(i, i + 40);
    const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo',
      iiprop: 'url|size|extmetadata', iiurlwidth: String(szerokosc),
      titles: paczka.map((n) => `File:${n}`).join('|'),
    });
    let dane;
    for (let proba = 1; proba <= 4; proba++) {
      const odp = await fetch(url, { headers: { 'User-Agent': UA } });
      if (odp.ok) { dane = await odp.json(); break; }
      if (odp.status !== 429 && odp.status < 500) throw new Error(`Commons ${odp.status}`);
      await new Promise((r) => setTimeout(r, 2000 * proba));
    }
    if (!dane) throw new Error('Commons: brak odpowiedzi po 4 próbach');
    const normalizacja = Object.fromEntries((dane.query?.normalized ?? []).map((n) => [n.to, n.from]));
    for (const strona of dane.query?.pages ?? []) {
      const tytul = normalizacja[strona.title] ?? strona.title;
      const nazwa = tytul.replace(/^File:/, '');
      const klucz = paczka.find((p) => p === nazwa || p.replace(/_/g, ' ') === nazwa) ?? nazwa;
      const ii = strona.imageinfo?.[0];
      if (!ii) { wynik[klucz] = { brak: true }; continue; }
      const em = ii.extmetadata ?? {};
      const autor = czyscAutora(bezHtml(em.Artist?.value) || bezHtml(em.Credit?.value));
      const krotka = bezHtml(em.LicenseShortName?.value);
      wynik[klucz] = {
        tytul: nazwa,
        autor: autor && autor.length > 80 ? autor.slice(0, 77) + '…' : autor,
        licencja: krotka || em.License?.value || null,
        licencjaUrl: em.LicenseUrl?.value ?? null,
        strona: ii.descriptionurl,
        url: ii.thumburl || ii.url,
        szer: ii.thumbwidth || ii.width,
        wys: ii.thumbheight || ii.height,
        ...ocenLicencje(krotka, em.License?.value),
      };
    }
    if (przy) przy(wynik, i + paczka.length, nazwy.length);
    if (pauzaMs) await new Promise((r) => setTimeout(r, pauzaMs));
  }
  return wynik;
}
