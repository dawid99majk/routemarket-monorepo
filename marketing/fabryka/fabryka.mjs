#!/usr/bin/env node
/**
 * Fabryka materiałów RouteMarket.
 *
 *   node fabryka.mjs tablica <id>            karuzela, rolka, story, pin i podpisy z publicznej tablicy
 *   node fabryka.mjs miasto "Rzym" [--ile 8] to samo z najważniejszych miejsc miasta w katalogu
 *   node fabryka.mjs tydzien [--od 2026-10-05] [--tematy 3]
 *                                            paczka na tydzień + kalendarz publikacji (CSV)
 *   node fabryka.mjs tematy                  lista dostępnych tablic i miast
 *
 * Opcje: --formaty karuzela,rolka,story,pin   (domyślnie wszystkie)
 *
 * Fabryka niczego nie publikuje. Wynik ląduje w wyniki/…, a na zewnątrz wychodzi
 * dopiero po przejrzeniu podglad.html przez człowieka — publikacja jest w modelu
 * operacyjnym czynnością „do zatwierdzenia”, zawsze.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dane from './lib/dane.mjs';
import { wybierzZdjecie, listaZrodel } from './lib/zdjecia.mjs';
import * as S from './lib/szablony.mjs';
import * as R from './lib/render.mjs';
import * as V from './lib/wideo.mjs';
import { podpisy, wniosekAgenta } from './lib/teksty.mjs';
import { czas, godziny, ileMiejsc, ileDni, slug, wMiescie } from './lib/formaty.mjs';

const KATALOG = path.dirname(fileURLToPath(import.meta.url));
const WYNIKI = path.join(KATALOG, 'wyniki');
const HISTORIA = path.join(WYNIKI, 'historia.json');
const WSZYSTKIE = ['karuzela', 'rolka', 'story', 'pin'];

const argv = process.argv.slice(2);
const opcja = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const dzis = () => new Date().toISOString().slice(0, 10);
const log = (...a) => console.log('·', ...a);

const utm = (adres, zrodlo, kampania) => {
  const u = new URL(adres);
  u.searchParams.set('utm_source', zrodlo);
  u.searchParams.set('utm_medium', 'social');
  u.searchParams.set('utm_campaign', kampania);
  return u.href;
};

// ---------- tematy ----------

async function tematZTablicy(id) {
  const t = await dane.tablica(id);
  return {
    rodzaj: 'tablica',
    tytul: t.name,
    miasto: t.destination || t.miejsca[0]?.miasto,
    dni: t.days,
    adres: `https://routemarket.io/tablica/${t.id}`,
    klucz: `tablica:${t.id}`,
    miejsca: t.miejsca,
  };
}

async function tematZMiasta(nazwa, ile) {
  const miejsca = await dane.miasto(nazwa, { limit: ile });
  // Link do tablicy przykładowej tego miasta, jeśli jest — strona główna nie
  // pokaże gościowi miejsc z posta, a tablica pokaże dokładnie te.
  const tablice = await dane.publiczneTablice();
  const przyklad = tablice.find((t) => t.destination === nazwa && t.is_example) ?? tablice.find((t) => t.destination === nazwa);
  return {
    rodzaj: 'miasto',
    tytul: wMiescie(nazwa) ? `Co zobaczyć ${wMiescie(nazwa)}` : `${nazwa}: co zobaczyć`,
    miasto: nazwa,
    dni: null,
    adres: przyklad ? `https://routemarket.io/tablica/${przyklad.id}` : 'https://routemarket.io/',
    klucz: `miasto:${nazwa}`,
    miejsca,
  };
}

/** Do slajdów idą tylko miejsca z dozwolonym zdjęciem; każde zdjęcie raz. */
async function przygotujMiejsca(temat, ile, pion) {
  const wynik = [];
  const uzyte = [];
  for (const m of temat.miejsca) {
    if (wynik.length >= ile) break;
    const z = await wybierzZdjecie(m.zdjecia, { pion, pominiete: uzyte });
    if (!z) { log(`pomijam „${m.nazwa}” — brak zdjęcia z dozwoloną licencją`); continue; }
    uzyte.push(z.tytul);
    wynik.push({ ...m, zdjecie: z, czas: czas(m.minuty), godziny: godziny(m.godziny) });
  }
  return wynik;
}

// ---------- formaty ----------

async function karuzela(temat, miejsca, wniosek, kat) {
  const { w, h } = S.ROZMIARY.karuzela;
  const dir = path.join(kat, 'karuzela');
  const pliki = [];
  const nr = () => String(pliki.length + 1).padStart(2, '0');
  const fakty = [ileMiejsc(temat.miejsca.length), temat.dni ? ileDni(temat.dni) : null, `${czas(wniosek.suma)} zwiedzania`].filter(Boolean);
  pliki.push(await R.png(S.okladka({ w, h, zdjecie: temat.okladka, nadtytul: temat.rodzaj === 'tablica' ? 'Tablica wyjazdu' : temat.miasto, tytul: temat.tytul, fakty }), path.join(dir, `${nr()}-okladka.png`), { w, h }));
  for (const [i, m] of miejsca.entries()) {
    pliki.push(await R.png(S.miejsce({ w, h, nr: i + 1, razem: miejsca.length, m, zdjecie: m.zdjecie, pewne: m.pewne }), path.join(dir, `${nr()}-${slug(m.nazwa)}.png`), { w, h }));
  }
  pliki.push(await R.png(S.agent({ w, h, tytul: 'Ile to naprawdę dni', tekst: wniosek.tekst }), path.join(dir, `${nr()}-agent.png`), { w, h }));
  pliki.push(await R.png(S.cta({ w, h, tytul: 'Zbierz miejsca. Resztę ułoży agent.', tekst: 'Na pewno, być może, nie — a z tego plan dni z godzinami otwarcia i plik GPX.', adres: 'routemarket.io' }), path.join(dir, `${nr()}-routemarket.png`), { w, h }));
  const zr = listaZrodel([temat.okladka, ...miejsca.map((m) => m.zdjecie)]);
  pliki.push(await R.png(S.zrodla({ w, h, ...zr }), path.join(dir, `${nr()}-zrodla-zdjec.png`), { w, h }));
  return pliki;
}

async function rolka(temat, miejsca, wniosek, kat) {
  const { w, h } = S.ROZMIARY.pion;
  const tmp = path.join(kat, '.rolka');
  fs.mkdirSync(tmp, { recursive: true });
  const sceny = [];
  const scena = (n) => path.join(tmp, `s${String(n).padStart(2, '0')}.mp4`);

  // 1. Zaczepienie: pierwsza sekunda decyduje, czy ktoś zostanie.
  const zaczep = await R.png(S.nakladkaRolki({ w, h, gora: temat.rodzaj === 'tablica' ? 'Tablica wyjazdu' : 'Katalog RouteMarket', tytul: temat.tytul, fakty: [ileMiejsc(temat.miejsca.length), `${czas(wniosek.suma)} zwiedzania`], podpis: temat.okladka.podpis }), path.join(tmp, 'n00.png'), { w, h, przezroczyste: true });
  sceny.push(V.scenaZdjecie({ zdjecie: temat.okladka.plik, nakladka: zaczep, sekundy: 2.8, wyjscie: scena(0), odRazu: true }));

  for (const [i, m] of miejsca.slice(0, 6).entries()) {
    const nak = await R.png(S.nakladkaRolki({ w, h, gora: `${i + 1} / ${Math.min(6, miejsca.length)}`, tytul: m.nazwa, fakty: [m.czas, m.godziny].filter(Boolean), podpis: m.zdjecie.podpis }), path.join(tmp, `n${i + 1}.png`), { w, h, przezroczyste: true });
    sceny.push(V.scenaZdjecie({ zdjecie: m.zdjecie.plik, nakladka: nak, sekundy: 2.3, wyjscie: scena(i + 1), kierunek: i % 2 ? -1 : 1 }));
  }
  const ag = await R.png(S.agent({ w, h, tytul: 'Ile to naprawdę dni', tekst: wniosek.tekst }), path.join(tmp, 'agent.png'), { w, h });
  sceny.push(V.scenaPlansza({ obraz: ag, sekundy: 4.2, wyjscie: scena(20) }));
  const koniec = await R.png(S.cta({ w, h, tytul: 'Zbierz miejsca. Resztę ułoży agent.', tekst: 'Plan dni z godzinami otwarcia i plik GPX.', adres: 'routemarket.io' }), path.join(tmp, 'cta.png'), { w, h });
  sceny.push(V.scenaPlansza({ obraz: koniec, sekundy: 3, wyjscie: scena(21) }));

  const plik = V.sklej(sceny, path.join(kat, 'rolka.mp4'));
  for (const f of fs.readdirSync(tmp)) fs.unlinkSync(path.join(tmp, f));
  fs.rmdirSync(tmp);
  return plik;
}

async function story(temat, miejsca, wniosek, kat) {
  const { w, h } = S.ROZMIARY.pion;
  return R.png(S.okladka({ w, h, zdjecie: temat.okladka, nadtytul: 'Nowa tablica · link w naklejce', tytul: temat.tytul, fakty: [ileMiejsc(temat.miejsca.length), `${czas(wniosek.suma)} zwiedzania`] }), path.join(kat, 'story.png'), { w, h });
}

async function pin(temat, miejsca, wniosek, kat) {
  const { w, h } = S.ROZMIARY.pin;
  const tytul = wMiescie(temat.miasto) ? `Co zobaczyć ${wMiescie(temat.miasto)}` : `${temat.miasto}: co zobaczyć`;
  const podtytul = `${ileMiejsc(temat.miejsca.length)} i ${czas(wniosek.suma)} zwiedzania. Plan dni z godzinami otwarcia.`;
  return R.png(S.pin({ w, h, tytul, podtytul, zdjecia: miejsca.slice(0, 3).map((m) => m.zdjecie), adres: 'routemarket.io' }), path.join(kat, 'pin.png'), { w, h });
}

// ---------- podgląd i zapis ----------

function zapiszTeksty(temat, miejsca, kat, nr) {
  const zdjecia = [temat.okladka, ...miejsca.map((m) => m.zdjecie)];
  const p = podpisy({ ...temat, miejsca: temat.miejsca }, zdjecia, nr);
  const kampania = slug(temat.tytul);
  const zr = listaZrodel(zdjecia);
  const komentarz = ['Źródła zdjęć (Wikimedia Commons):', ...zr.linie, zr.uwagaSA].filter(Boolean).join('\n');
  const md = `# ${temat.tytul}

Adres: ${temat.adres}
Wniosek agenta: ${p.wniosek.tekst}

## Instagram (karuzela / rolka)

\`\`\`
${p.instagram}
\`\`\`

Pierwszy komentarz (źródła zdjęć):

\`\`\`
${komentarz}
\`\`\`

## TikTok / YouTube Shorts

\`\`\`
${p.tiktok}
\`\`\`

## Facebook

\`\`\`
${p.facebook.replace(temat.adres, utm(temat.adres, 'facebook', kampania))}
\`\`\`

## Pinterest

- Tytuł: ${p.pinterest.tytul}
- Link: ${utm(p.pinterest.link, 'pinterest', kampania)}
- Opis:

\`\`\`
${p.pinterest.opis}
\`\`\`

## Przed publikacją

- [ ] Liczby na slajdach zgadzają się z tablicą (${temat.adres})
- [ ] Na każdym slajdzie ze zdjęciem widać podpis autora i licencji
- [ ] Muzyka dodana w aplikacji, z biblioteki dozwolonej dla kont firmowych
- [ ] Źródła zdjęć wklejone w pierwszy komentarz (Instagram) albo w opis
`;
  fs.writeFileSync(path.join(kat, 'podpisy.md'), md);
  fs.writeFileSync(path.join(kat, 'zrodla-zdjec.txt'), komentarz + '\n');
  fs.writeFileSync(path.join(kat, 'zrodla.json'), JSON.stringify(zdjecia.map(({ plik, ...z }) => z), null, 2));
  return p;
}

function podglad(kat, temat, wyniki) {
  const rel = (f) => path.relative(kat, f);
  const obraz = (f, szer) => `<figure><img src="${rel(f)}" style="width:${szer}px"><figcaption>${path.basename(f)}</figcaption></figure>`;
  const html = `<!doctype html><meta charset="utf-8"><title>${temat.tytul} — podgląd</title>
<style>body{font-family:system-ui;background:#F5F1EC;color:#25243A;margin:24px}h1{font-size:26px}h2{font-size:18px;margin-top:32px}
.rzad{display:flex;flex-wrap:wrap;gap:14px}figure{margin:0}img,video{border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.12)}
figcaption{font-size:12px;color:#5F5E72;margin-top:4px}pre{white-space:pre-wrap;background:#fff;padding:14px;border-radius:10px;max-width:760px}</style>
<h1>${temat.tytul}</h1><p><a href="${temat.adres}">${temat.adres}</a></p>
${wyniki.karuzela ? `<h2>Karuzela 1080×1350</h2><div class="rzad">${wyniki.karuzela.map((f) => obraz(f, 216)).join('')}</div>` : ''}
${wyniki.rolka ? `<h2>Rolka 1080×1920 · ${V.dlugosc(wyniki.rolka).toFixed(1)} s</h2><video src="${rel(wyniki.rolka)}" controls style="width:270px"></video>` : ''}
<div class="rzad">${wyniki.story ? `<div><h2>Story</h2>${obraz(wyniki.story, 270)}</div>` : ''}${wyniki.pin ? `<div><h2>Pin</h2>${obraz(wyniki.pin, 300)}</div>` : ''}</div>
<h2>Podpisy</h2><pre>${fs.readFileSync(path.join(kat, 'podpisy.md'), 'utf8').replace(/</g, '&lt;')}</pre>`;
  fs.writeFileSync(path.join(kat, 'podglad.html'), html);
}

export async function wyprodukuj(temat, { formaty = WSZYSTKIE, nr = 0, katalog } = {}) {
  const kat = katalog ?? path.join(WYNIKI, `${dzis()}-${slug(temat.tytul)}`);
  fs.mkdirSync(kat, { recursive: true });
  log(`temat: ${temat.tytul} (${ileMiejsc(temat.miejsca.length)}) → ${path.relative(KATALOG, kat)}`);
  const miejsca = await przygotujMiejsca(temat, 8, false);
  if (miejsca.length < 3) throw new Error(`Za mało miejsc ze zdjęciem na dozwolonej licencji (${miejsca.length}) — temat odpada.`);
  const wniosek = wniosekAgenta(temat.miejsca, temat.dni);
  // Okładka i pierwszy slajd miejsca nie mogą mieć tego samego zdjęcia —
  // bierzemy inne ujęcie pierwszego miejsca, a gdy go nie ma, zdjęcie drugiego.
  const uzyte = miejsca.map((m) => m.zdjecie.tytul);
  temat.okladka = null;
  for (const m of [...miejsca, ...temat.miejsca.filter((x) => !miejsca.some((y) => y.nazwa === x.nazwa))]) {
    temat.okladka = await wybierzZdjecie(m.zdjecia, { pominiete: uzyte });
    if (temat.okladka) break;
  }
  temat.okladka ??= miejsca[0].zdjecie; // ostateczność: powtórzone ujęcie lepsze niż brak okładki
  const wyniki = {};
  if (formaty.includes('karuzela')) { wyniki.karuzela = await karuzela(temat, miejsca, wniosek, kat); log(`karuzela: ${wyniki.karuzela.length} slajdów`); }
  if (formaty.includes('rolka')) { wyniki.rolka = await rolka(temat, miejsca, wniosek, kat); log(`rolka: ${V.dlugosc(wyniki.rolka).toFixed(1)} s`); }
  if (formaty.includes('story')) { wyniki.story = await story(temat, miejsca, wniosek, kat); log('story'); }
  if (formaty.includes('pin')) { wyniki.pin = await pin(temat, miejsca, wniosek, kat); log('pin'); }
  const p = zapiszTeksty(temat, miejsca, kat, nr);
  podglad(kat, temat, wyniki);
  const hist = fs.existsSync(HISTORIA) ? JSON.parse(fs.readFileSync(HISTORIA, 'utf8')) : [];
  hist.push({ data: dzis(), klucz: temat.klucz, tytul: temat.tytul, katalog: path.relative(WYNIKI, kat) });
  fs.writeFileSync(HISTORIA, JSON.stringify(hist, null, 1));
  log(`gotowe: ${path.relative(KATALOG, path.join(kat, 'podglad.html'))}`);
  return { kat, wyniki, podpisy: p, temat };
}

// ---------- tydzień ----------

/**
 * Wybór tematów: najpierw to, czego jeszcze nie było, potem najdawniej użyte.
 * Przeplatamy tablice (pokazują produkt: kubełki, kopiowanie) z miastami
 * (łapią frazę „co zobaczyć w…”).
 */
async function wybierzTematy(ile) {
  const hist = fs.existsSync(HISTORIA) ? JSON.parse(fs.readFileSync(HISTORIA, 'utf8')) : [];
  const ostatnio = (k) => hist.filter((h) => h.klucz === k).map((h) => h.data).sort().pop() ?? '0000';
  // Tylko tablice przykładowe RouteMarketu: testowe tablice użytkowników („Nowy Jork z dziećmi”) potrafią
  // otwierać się pomnikiem 11 września, a to nie jest okładka wesołego posta. Tablicę użytkownika
  // promujemy świadomie (fabryka.mjs tablica <id>), nie z automatu.
  const tablice = (await dane.publiczneTablice()).filter((t) => t.is_example && t.miejsc >= 6 && t.zdjec >= 4)
    .map((t) => ({ klucz: `tablica:${t.id}`, id: t.id, miasto: t.destination, waga: (t.like_count ?? 0) + (t.copy_count ?? 0) * 2 + (t.is_example ? 0 : 3) }));
  const miasta = (await dane.miasta()).map((m) => ({ klucz: `miasto:${m}`, miasto: m, waga: 0 }));
  const sortuj = (l) => l.sort((a, b) => ostatnio(a.klucz).localeCompare(ostatnio(b.klucz)) || b.waga - a.waga);
  const [t, m] = [sortuj(tablice), sortuj(miasta)];
  const wybrane = [];
  const miastaUzyte = new Set();
  while (wybrane.length < ile && (t.length || m.length)) {
    const zrodlo = wybrane.length % 2 === 0 ? (t.length ? t : m) : (m.length ? m : t);
    const i = zrodlo.findIndex((x) => !miastaUzyte.has(x.miasto));
    const [x] = zrodlo.splice(i >= 0 ? i : 0, 1);
    miastaUzyte.add(x.miasto);
    wybrane.push(x);
  }
  return wybrane;
}

const PLAN_TYGODNIA = [
  // [dzień tygodnia od 0, godzina, kanały, format, temat]
  [0, '18:30', 'Instagram, Facebook', 'karuzela', 0],
  [1, '19:00', 'Instagram Reels, TikTok, YouTube Shorts', 'rolka', 0],
  [1, '20:00', 'Pinterest', 'pin', 0],
  [2, '18:30', 'Instagram, Facebook', 'karuzela', 1],
  [3, '19:00', 'Instagram Reels, TikTok, YouTube Shorts', 'rolka', 1],
  [3, '20:00', 'Pinterest', 'pin', 1],
  [4, '12:00', 'Instagram Stories, Facebook Stories', 'story', 0],
  [4, '18:30', 'Instagram, Facebook', 'karuzela', 2],
  [5, '11:00', 'Instagram Reels, TikTok, YouTube Shorts', 'rolka', 2],
  [5, '12:00', 'Pinterest', 'pin', 2],
  [6, '12:00', 'Instagram Stories, Facebook Stories', 'story', 1],
  [6, '19:00', 'Instagram Stories, Facebook Stories', 'story', 2],
];

async function tydzien() {
  const od = opcja('od', (() => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.toISOString().slice(0, 10); })());
  const ile = Number(opcja('tematy', 3));
  const kat = path.join(WYNIKI, `tydzien-${od}`);
  fs.mkdirSync(kat, { recursive: true });
  const wybrane = await wybierzTematy(ile);
  const paczki = [];
  for (const [i, x] of wybrane.entries()) {
    const temat = x.id ? await tematZTablicy(x.id) : await tematZMiasta(x.miasto, 8);
    try {
      paczki.push(await wyprodukuj(temat, { nr: i, katalog: path.join(kat, `${i + 1}-${slug(temat.tytul)}`) }));
    } catch (e) {
      log(`temat „${temat.tytul}” odpada: ${e.message}`);
    }
  }
  const wiersze = [['data', 'godzina', 'kanaly', 'format', 'temat', 'pliki', 'podpisy', 'link']];
  for (const [dz, godz, kanaly, format, t] of PLAN_TYGODNIA) {
    const p = paczki[t];
    if (!p) continue;
    const d = new Date(od); d.setDate(d.getDate() + dz);
    const pliki = format === 'karuzela' ? path.relative(kat, path.join(p.kat, 'karuzela')) + '/' : path.relative(kat, p.wyniki[format]);
    wiersze.push([d.toISOString().slice(0, 10), godz, kanaly, format, p.temat.tytul, pliki, path.relative(kat, path.join(p.kat, 'podpisy.md')), p.temat.adres]);
  }
  const csv = wiersze.map((w) => w.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  fs.writeFileSync(path.join(kat, 'kalendarz.csv'), csv + '\n');
  const html = `<!doctype html><meta charset="utf-8"><title>Tydzień od ${od}</title>
<style>body{font-family:system-ui;background:#F5F1EC;color:#25243A;margin:24px}table{border-collapse:collapse;background:#fff}td,th{padding:8px 12px;border-bottom:1px solid #E6E0D8;text-align:left;font-size:14px}a{color:#25243A}</style>
<h1>Tydzień od ${od}</h1><table><tr>${wiersze[0].slice(0, 6).map((c) => `<th>${c}</th>`).join('')}</tr>
${wiersze.slice(1).map((w) => `<tr><td>${w[0]}</td><td>${w[1]}</td><td>${w[2]}</td><td>${w[3]}</td><td>${w[4]}</td><td><a href="${w[5]}">${w[5]}</a></td></tr>`).join('')}</table>
<h2>Paczki</h2><ul>${paczki.map((p) => `<li><a href="${path.relative(kat, path.join(p.kat, 'podglad.html'))}">${p.temat.tytul}</a></li>`).join('')}</ul>`;
  fs.writeFileSync(path.join(kat, 'tydzien.html'), html);
  log(`kalendarz: ${path.relative(KATALOG, path.join(kat, 'kalendarz.csv'))} (${wiersze.length - 1} publikacji)`);
  log(`przegląd tygodnia: ${path.relative(KATALOG, path.join(kat, 'tydzien.html'))}`);
}

// ---------- start ----------

async function main() {
  const [polecenie, arg] = argv;
  const formaty = (opcja('formaty', WSZYSTKIE.join(','))).split(',');
  try {
    if (polecenie === 'tablica' && arg) await wyprodukuj(await tematZTablicy(arg), { formaty });
    else if (polecenie === 'miasto' && arg) await wyprodukuj(await tematZMiasta(arg, Number(opcja('ile', 8))), { formaty });
    else if (polecenie === 'tydzien') await tydzien();
    else if (polecenie === 'tematy') {
      for (const t of await dane.publiczneTablice()) console.log(`tablica ${t.id}  ${t.name} · ${ileMiejsc(t.miejsc)}${t.is_example ? ' · przykład' : ''}`);
      console.log('miasta:', (await dane.miasta()).join(', '));
    } else {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(2, 17).join('\n').replace(/^ \* ?/gm, ''));
    }
  } finally {
    await R.stop();
  }
}

main().catch((e) => { console.error('BŁĄD:', e.message); process.exit(1); });
