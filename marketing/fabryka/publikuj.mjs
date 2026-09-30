#!/usr/bin/env node
/**
 * Publikator: bierze ZATWIERDZONE pozycje kalendarza, których czas już nadszedł,
 * i publikuje je na Instagramie i stronie Facebook przez Graph API.
 *
 * Działa na VPS, z crona co 10 minut:
 *   node publikuj.mjs            publikuje wymagalne i zatwierdzone
 *   node publikuj.mjs --sucho    pokazuje, co poszłoby do Mety, bez żadnego żądania POST
 *   node publikuj.mjs --stan     lista: zatwierdzone / opublikowane / czekające
 *
 * Zasady:
 *  - nic bez zatwierdzenia: pozycji nie ma w zatwierdzone.json (zatwierdz.mjs, na Macu) → pominięta;
 *  - nic po czasie: pozycja spóźniona o ponad 36 h jest pomijana i zgłoszona, a nie publikowana
 *    „na wszelki wypadek” w środku nocy po awarii;
 *  - każda pozycja najwyżej raz: wynik zapisujemy zaraz po sukcesie, przed następną pozycją,
 *    a po błędzie nie ponawiamy więcej niż 3 razy (limit chroni przed publikacją w pętli);
 *  - token tylko z pliku środowiskowego (chmod 600), nigdy z argumentów ani z repozytorium.
 */
import fs from 'node:fs';
import path from 'node:path';
import { konfiguracja, klient, instagram, facebook } from './lib/meta.mjs';

const argv = process.argv.slice(2);
const SUCHO = argv.includes('--sucho');
const STAN = argv.includes('--stan');
const PLIK_ENV = process.env.META_ENV || '/root/.routemarket-meta.env';
const PACZKI = process.env.PROMO_PACZKI || '/root/routemarket-promo';
const PROMO_DIR = process.env.PROMO_DIR || '/var/www/promo';
const STAN_DIR = path.join(PACZKI, 'stan');
const MAX_SPOZNIENIE_H = 36;
const MAX_BLEDOW = 3;

const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);

function wczytajEnv(plik) {
  if (!fs.existsSync(plik)) return {};
  const tryb = fs.statSync(plik).mode & 0o077;
  if (tryb) throw new Error(`${plik} ma za szerokie uprawnienia (chmod 600) — token nie może być czytelny dla innych`);
  return Object.fromEntries(fs.readFileSync(plik, 'utf8').split('\n')
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
}

function csv(tekst) {
  const wiersze = [];
  let w = [], pole = '', wc = false;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (wc) { if (c === '"' && tekst[i + 1] === '"') { pole += '"'; i++; } else if (c === '"') wc = false; else pole += c; }
    else if (c === '"') wc = true; else if (c === ',') { w.push(pole); pole = ''; }
    else if (c === '\n') { w.push(pole); wiersze.push(w); w = []; pole = ''; } else pole += c;
  }
  const [naglowek, ...dane] = wiersze.filter((r) => r.length > 1);
  return dane.map((r) => Object.fromEntries(naglowek.map((h, i) => [h, r[i]])));
}

/** Czas pozycji w strefie Europe/Warsaw → moment w UTC (DST liczy Intl, nie stała +2). */
function moment(data, godzina) {
  const [y, m, d] = data.split('-').map(Number);
  const [h, min] = godzina.split(':').map(Number);
  const naiwny = Date.UTC(y, m - 1, d, h, min);
  const strefa = (t) => {
    const cz = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t));
    const g = (n) => Number(cz.find((p) => p.type === n).value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - t;
  };
  return naiwny - strefa(naiwny - strefa(naiwny));
}

const klucz = (p) => `${p.data}|${p.godzina}|${p.format}|${p.temat}`;
const wJson = (plik, dom) => (fs.existsSync(plik) ? JSON.parse(fs.readFileSync(plik, 'utf8')) : dom);

async function pozycja(api, cfg, p, paczka, tekst) {
  const kanaly = p.kanaly;
  const slug = `${path.basename(path.dirname(paczka))}-${path.basename(paczka)}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const celDir = path.join(PROMO_DIR, slug);
  const wynik = {};
  const url = (f) => `${cfg.baza}/${slug}/${f}`;
  const udostepnij = (pliki) => {
    fs.mkdirSync(celDir, { recursive: true });
    for (const f of pliki) fs.copyFileSync(path.join(paczka, 'do-publikacji', f), path.join(celDir, f));
  };
  try {
    if (p.format === 'karuzela') {
      udostepnij(tekst.karuzela);
      const adresy = tekst.karuzela.map(url);
      if (/Instagram/.test(kanaly)) {
        wynik.ig = await instagram.karuzela(api, cfg, { adresy, opis: tekst.ig.opis, sucho: SUCHO });
        if (tekst.ig.komentarz) wynik.ig_komentarz = await instagram.komentarz(api, wynik.ig, tekst.ig.komentarz);
      }
      if (/Facebook/.test(kanaly)) wynik.fb = await facebook.zdjecia(api, cfg, { adresy, opis: tekst.fb.opis });
    } else if (p.format === 'rolka') {
      udostepnij([tekst.rolka]);
      if (/Instagram/.test(kanaly)) // Rolka nie ma „ostatniego slajdu ze źródłami”, więc dostaje krótki podpis (jak TikTok), a źródła
        // zdjęć idą w komentarzu — wymóg licencji CC BY / CC BY-SA spełniony tak samo jak przy karuzeli.
        wynik.ig = await instagram.rolka(api, cfg, { adres: url(tekst.rolka), opis: tekst.ig.opisRolki || tekst.ig.opis, sucho: SUCHO });
        if (tekst.ig.komentarz) wynik.ig_komentarz = await instagram.komentarz(api, wynik.ig, tekst.ig.komentarz);
    } else if (p.format === 'story') {
      udostepnij([tekst.story]);
      if (/Instagram/.test(kanaly)) wynik.ig = await instagram.story(api, cfg, { adres: url(tekst.story), sucho: SUCHO });
      if (/Facebook/.test(kanaly)) wynik.fb = await facebook.story(api, cfg, { adres: url(tekst.story) });
    }
  } finally {
    // Kopie publiczne nie zostają: po publikacji (albo błędzie) plik nie ma powodu być pod adresem.
    if (!SUCHO) fs.rmSync(celDir, { recursive: true, force: true });
  }
  return wynik;
}

async function main() {
  const env = { ...wczytajEnv(PLIK_ENV), ...process.env };
  const tygodnie = fs.existsSync(PACZKI) ? fs.readdirSync(PACZKI).filter((f) => f.startsWith('tydzien-')).sort() : [];
  let cfg = null, api = null;
  if (!STAN) { cfg = konfiguracja(env); api = klient(cfg, { sucho: SUCHO, log }); }
  fs.mkdirSync(STAN_DIR, { recursive: true });
  // PROMO_TERAZ (ISO) istnieje wyłącznie do testów na sucho — produkcyjnie zawsze zegar systemowy.
  const teraz = process.env.PROMO_TERAZ ? Date.parse(process.env.PROMO_TERAZ) : Date.now();
  let bledy = 0, wyslane = 0;

  for (const t of tygodnie) {
    const folder = path.join(PACZKI, t);
    const zatw = new Set(wJson(path.join(folder, 'zatwierdzone.json'), []));
    const plikStanu = path.join(STAN_DIR, `${t}.json`);
    const stan = wJson(plikStanu, {});
    const pozycje = csv(fs.readFileSync(path.join(folder, 'kalendarz.csv'), 'utf8'))
      .filter((p) => /Instagram|Facebook/.test(p.kanaly) && ['karuzela', 'rolka', 'story'].includes(p.format));

    for (const p of pozycje) {
      const k = klucz(p);
      const czas = moment(p.data, p.godzina);
      const opoznienie = (teraz - czas) / 3600_000;
      const s = stan[k];
      if (STAN) {
        const etykieta = s?.ok ? `OPUBLIKOWANE ${s.ok}` : !zatw.has(k) ? 'nie zatwierdzone' : opoznienie < 0 ? `czeka do ${p.data} ${p.godzina}` : `wymagalne (błędów: ${s?.bledy ?? 0})`;
        console.log(`${p.data} ${p.godzina}  ${p.format.padEnd(8)} ${p.temat.padEnd(28)} ${etykieta}`);
        continue;
      }
      if (s?.ok || !zatw.has(k) || opoznienie < 0) continue;
      if ((s?.bledy ?? 0) >= MAX_BLEDOW) continue;
      if (opoznienie > MAX_SPOZNIENIE_H) { log(`POMINIĘTO (spóźnione ${opoznienie.toFixed(0)} h): ${k}`); continue; }

      const paczka = path.join(folder, p.pliki.split('/')[0]);
      const tekst = wJson(path.join(paczka, 'publikacja.json'), null);
      if (!tekst) { log(`BRAK publikacja.json: ${k}`); continue; }
      log(`${SUCHO ? '[sucho] ' : ''}publikuję: ${k}`);
      try {
        const wynik = await pozycja(api, cfg, p, paczka, tekst);
        if (!SUCHO) { stan[k] = { ok: new Date().toISOString(), ...wynik }; fs.writeFileSync(plikStanu, JSON.stringify(stan, null, 1)); }
        log(`OK ${k} ${JSON.stringify(wynik)}`);
        wyslane += 1;
      } catch (e) {
        bledy += 1;
        stan[k] = { ...(stan[k] || {}), bledy: (stan[k]?.bledy ?? 0) + 1, blad: e.message.slice(0, 300) };
        if (!SUCHO) fs.writeFileSync(plikStanu, JSON.stringify(stan, null, 1));
        log(`BŁĄD ${k}: ${e.message}`);
      }
    }
  }
  if (!STAN) log(`koniec: wysłano ${wyslane}, błędów ${bledy}`);
  process.exit(bledy ? 1 : 0);
}

main().catch((e) => { console.error('BŁĄD KRYTYCZNY:', e.message); process.exit(2); });
