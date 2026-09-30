/**
 * Klient Graph API Mety: publikacja na Instagramie i stronie na Facebooku.
 *
 * Tylko oficjalne API — nic nie steruje przeglądarką ani aplikacją. Konto
 * profesjonalne Instagrama powiązane ze stroną, aplikacja deweloperska Mety
 * w trybie deweloperskim (własne konta nie wymagają App Review) i token strony.
 *
 * Instagram nie ma planowania w API: publikacja jest natychmiastowa, więc
 * o czasie decyduje harmonogram (cron na VPS), a nie API. Facebook ma
 * `scheduled_publish_time`, ale trzymamy jeden model dla obu — cron.
 *
 * Tryb „sucho” nie wykonuje żadnego żądania POST: zwraca planowane wywołania,
 * żeby dało się przejrzeć, co pójdzie do Mety, zanim cokolwiek pójdzie.
 */
const WERSJA = process.env.META_API_VERSION || 'v23.0';
const HOST = 'https://graph.facebook.com';

export class BladMety extends Error {}

export function konfiguracja(env = process.env) {
  const wymagane = ['META_PAGE_ID', 'META_PAGE_TOKEN', 'META_IG_USER_ID', 'PROMO_BASE_URL'];
  const brak = wymagane.filter((k) => !env[k]);
  if (brak.length) throw new BladMety(`Brak konfiguracji: ${brak.join(', ')} (plik ${env.META_ENV || '/root/.routemarket-meta.env'})`);
  return {
    strona: env.META_PAGE_ID, token: env.META_PAGE_TOKEN, ig: env.META_IG_USER_ID,
    baza: env.PROMO_BASE_URL.replace(/\/$/, ''),
  };
}

export function klient(cfg, { sucho = false, log = () => {} } = {}) {
  let licznik = 0;
  async function zapytanie(metoda, sciezka, parametry = {}) {
    const url = new URL(`${HOST}/${WERSJA}/${sciezka}`);
    const cialo = new URLSearchParams();
    for (const [k, v] of Object.entries(parametry)) {
      if (v == null) continue;
      cialo.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    if (sucho && metoda !== 'GET') {
      licznik += 1;
      log(`[sucho] ${metoda} /${sciezka} ${JSON.stringify(parametry).slice(0, 300)}`);
      return { id: `SUCHO-${licznik}`, status_code: 'FINISHED' };
    }
    // Token idzie w nagłówku, nie w adresie: adresy trafiają do logów serwerów pośrednich.
    const opcje = { method: metoda, headers: { Authorization: `Bearer ${cfg.token}` } };
    if (metoda === 'GET') for (const [k, v] of cialo) url.searchParams.set(k, v);
    else { opcje.body = cialo; opcje.headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
    const odp = await fetch(url, opcje);
    const dane = await odp.json().catch(() => ({}));
    if (!odp.ok || dane.error) {
      const e = dane.error || {};
      throw new BladMety(`Meta ${odp.status} ${metoda} /${sciezka}: ${e.message || 'błąd'} (kod ${e.code ?? '?'}/${e.error_subcode ?? '-'})`);
    }
    return dane;
  }
  return { post: (s, p) => zapytanie('POST', s, p), get: (s, p) => zapytanie('GET', s, p) };
}

const pauza = (ms) => new Promise((r) => setTimeout(r, ms));

/** Kontenery wideo przetwarzają się asynchronicznie; publikować wolno dopiero po FINISHED. */
async function czekajNaKontener(api, id, { sucho, maxSekund = 300 } = {}) {
  if (sucho) return;
  const start = Date.now();
  while (Date.now() - start < maxSekund * 1000) {
    const s = await api.get(id, { fields: 'status_code,status' });
    if (s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new BladMety(`Kontener ${id}: ${s.status_code} ${s.status || ''}`);
    await pauza(5000);
  }
  throw new BladMety(`Kontener ${id}: przetwarzanie trwa dłużej niż ${maxSekund} s`);
}

export const instagram = {
  async karuzela(api, cfg, { adresy, opis, sucho }) {
    if (adresy.length < 2 || adresy.length > 20) throw new BladMety(`Karuzela IG ma mieć 2–20 slajdów, jest ${adresy.length}`);
    const dzieci = [];
    for (const image_url of adresy) dzieci.push((await api.post(`${cfg.ig}/media`, { image_url, is_carousel_item: true })).id);
    const kontener = await api.post(`${cfg.ig}/media`, { media_type: 'CAROUSEL', children: dzieci.join(','), caption: opis });
    await czekajNaKontener(api, kontener.id, { sucho });
    return (await api.post(`${cfg.ig}/media_publish`, { creation_id: kontener.id })).id;
  },
  async rolka(api, cfg, { adres, opis, sucho }) {
    const kontener = await api.post(`${cfg.ig}/media`, { media_type: 'REELS', video_url: adres, caption: opis, share_to_feed: true });
    await czekajNaKontener(api, kontener.id, { sucho });
    return (await api.post(`${cfg.ig}/media_publish`, { creation_id: kontener.id })).id;
  },
  async story(api, cfg, { adres, sucho }) {
    const kontener = await api.post(`${cfg.ig}/media`, { media_type: 'STORIES', image_url: adres });
    await czekajNaKontener(api, kontener.id, { sucho });
    return (await api.post(`${cfg.ig}/media_publish`, { creation_id: kontener.id })).id;
  },
  /** Pierwszy komentarz (źródła zdjęć). Wymaga uprawnienia do komentarzy; brak nie przerywa publikacji. */
  async komentarz(api, mediaId, tekst) {
    try { return (await api.post(`${mediaId}/comments`, { message: tekst })).id; }
    catch (e) { return `POMINIĘTO: ${e.message}`; }
  },
};

export const facebook = {
  async zdjecia(api, cfg, { adresy, opis }) {
    const ids = [];
    for (const url of adresy) ids.push((await api.post(`${cfg.strona}/photos`, { url, published: false })).id);
    return (await api.post(`${cfg.strona}/feed`, { message: opis, attached_media: ids.map((media_fbid) => ({ media_fbid })) })).id;
  },
  async wideo(api, cfg, { adres, opis }) {
    return (await api.post(`${cfg.strona}/videos`, { file_url: adres, description: opis })).id;
  },
  async story(api, cfg, { adres }) {
    const foto = await api.post(`${cfg.strona}/photos`, { url: adres, published: false });
    return (await api.post(`${cfg.strona}/photo_stories`, { photo_id: foto.id })).id;
  },
};
