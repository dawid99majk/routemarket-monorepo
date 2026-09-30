#!/usr/bin/env node
/**
 * Zatwierdzanie paczki do publikacji przez API Mety.
 *
 *   node zatwierdz.mjs stan   <wyniki/tydzien-RRRR-MM-DD>
 *       tabela pozycji kalendarza (IG/FB) i co jest zatwierdzone
 *   node zatwierdz.mjs zatwierdz <folder> [--temat 1,2] [--wszystko] [--klucz "<data|godzina|format|temat>"]
 *       przygotowuje pliki do publikacji (JPEG, teksty) i oznacza pozycje jako zatwierdzone
 *   node zatwierdz.mjs cofnij <folder> [--wszystko | --klucz ...]
 *       zdejmuje zatwierdzenie (pozycja, która nie poszła, przestaje być publikowana)
 *   node zatwierdz.mjs wyslij <folder>
 *       rsync na VPS (/root/routemarket-promo); publikator tam wybierze zatwierdzone i wymagalne
 *
 * Zatwierdzenie jest jedyną drogą do publikacji: publikator na VPS nie ruszy niczego,
 * czego tu nie odhaczono. Robi to człowiek, po obejrzeniu podglad.html paczki.
 *
 * Dlaczego JPEG: Instagram (Content Publishing API) przyjmuje wyłącznie JPEG w postach
 * i relacjach, a fabryka renderuje PNG. Konwersja jest tu, przy zatwierdzeniu, żeby
 * VPS nie potrzebował ffmpeg i żeby plik, który poszedł, był tym, który zatwierdzono.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [, , polecenie, folderArg, ...reszta] = process.argv;
const opcja = (n) => { const i = reszta.indexOf(`--${n}`); return i >= 0 ? reszta[i + 1] : null; };
const flaga = (n) => reszta.includes(`--${n}`);

const VPS = process.env.PROMO_VPS || 'leadminer-vps';
const ZDALNY = process.env.PROMO_ZDALNY || '/root/routemarket-promo';

function csv(tekst) {
  const wiersze = [];
  let w = [], pole = '', wCudzyslowie = false;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (wCudzyslowie) {
      if (c === '"' && tekst[i + 1] === '"') { pole += '"'; i++; } else if (c === '"') wCudzyslowie = false; else pole += c;
    } else if (c === '"') wCudzyslowie = true;
    else if (c === ',') { w.push(pole); pole = ''; }
    else if (c === '\n') { w.push(pole); wiersze.push(w); w = []; pole = ''; }
    else pole += c;
  }
  if (pole || w.length) { w.push(pole); wiersze.push(w); }
  const [naglowek, ...dane] = wiersze.filter((r) => r.length > 1);
  return dane.map((r) => Object.fromEntries(naglowek.map((h, i) => [h, r[i]])));
}

const klucz = (p) => `${p.data}|${p.godzina}|${p.format}|${p.temat}`;
const obslugiwane = (p) => /Instagram|Facebook/.test(p.kanaly) && ['karuzela', 'rolka', 'story'].includes(p.format);

if (!polecenie || !folderArg) {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(2, 20).join('\n').replace(/^ \* ?/gm, ''));
  process.exit(1);
}
const folder = path.resolve(folderArg);
const plikZatw = path.join(folder, 'zatwierdzone.json');
const pozycje = csv(fs.readFileSync(path.join(folder, 'kalendarz.csv'), 'utf8')).filter(obslugiwane);
const zatwierdzone = () => (fs.existsSync(plikZatw) ? JSON.parse(fs.readFileSync(plikZatw, 'utf8')) : []);
const zapisz = (lista) => fs.writeFileSync(plikZatw, JSON.stringify([...new Set(lista)].sort(), null, 1) + '\n');

/** Wybór pozycji z opcji: --wszystko, --temat 1,2 (numer folderu paczki), --klucz. */
function wybrane() {
  if (flaga('wszystko')) return pozycje;
  const k = opcja('klucz');
  if (k) return pozycje.filter((p) => klucz(p) === k);
  const t = opcja('temat');
  if (t) {
    const numery = t.split(',').map((x) => x.trim());
    return pozycje.filter((p) => numery.includes(path.basename(path.dirname(path.join(folder, p.pliki))).split('-')[0])
      || numery.includes(path.basename(path.join(folder, p.pliki)).split('-')[0])
      || numery.includes(p.pliki.split('/')[0].split('-')[0]));
  }
  console.error('Podaj --wszystko, --temat N albo --klucz "…". Nic nie zatwierdzono.');
  process.exit(2);
}

function sekcja(md, znacznik) {
  const i = md.indexOf(znacznik);
  if (i < 0) return null;
  const m = md.slice(i).match(/```\n([\s\S]*?)\n```/);
  return m ? m[1].trim() : null;
}

function przygotujPaczke(katalogPaczki) {
  const wyjscie = path.join(katalogPaczki, 'do-publikacji');
  fs.mkdirSync(wyjscie, { recursive: true });
  const md = fs.readFileSync(path.join(katalogPaczki, 'podpisy.md'), 'utf8');
  const ig = sekcja(md, '## Instagram');
  const komentarz = sekcja(md, 'Pierwszy komentarz');
  const fb = sekcja(md, '## Facebook');
  const rolka = sekcja(md, '## TikTok');
  if (!ig || !fb) throw new Error(`podpisy.md w ${katalogPaczki} nie ma podpisu Instagram/Facebook`);
  if (ig.length > 2200) throw new Error(`Podpis IG ma ${ig.length} znaków (limit 2200)`);
  const hashtagi = (ig.match(/#\S+/g) || []).length;
  if (hashtagi > 30) throw new Error(`Podpis IG ma ${hashtagi} hashtagów (limit 30)`);

  const jpeg = (zrodlo, cel) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', zrodlo, '-q:v', '2', '-pix_fmt', 'yuvj420p', cel]);
  const karuzela = [];
  const kat = path.join(katalogPaczki, 'karuzela');
  if (fs.existsSync(kat)) {
    fs.readdirSync(kat).filter((f) => f.endsWith('.png')).sort().forEach((f, i) => {
      const nazwa = `karuzela-${String(i + 1).padStart(2, '0')}.jpg`;
      jpeg(path.join(kat, f), path.join(wyjscie, nazwa));
      karuzela.push(nazwa);
    });
  }
  if (fs.existsSync(path.join(katalogPaczki, 'story.png'))) jpeg(path.join(katalogPaczki, 'story.png'), path.join(wyjscie, 'story.jpg'));
  if (fs.existsSync(path.join(katalogPaczki, 'rolka.mp4'))) fs.copyFileSync(path.join(katalogPaczki, 'rolka.mp4'), path.join(wyjscie, 'rolka.mp4'));
  const opis = { ig: { opis: ig, opisRolki: rolka, komentarz }, fb: { opis: fb }, karuzela, story: fs.existsSync(path.join(wyjscie, 'story.jpg')) ? 'story.jpg' : null, rolka: fs.existsSync(path.join(wyjscie, 'rolka.mp4')) ? 'rolka.mp4' : null };
  fs.writeFileSync(path.join(katalogPaczki, 'publikacja.json'), JSON.stringify(opis, null, 1) + '\n');
  return opis;
}

const katalogPaczki = (p) => path.join(folder, p.pliki.split('/')[0]);

if (polecenie === 'stan') {
  const zatw = new Set(zatwierdzone());
  console.log('zatwierdzone  data        godz.  format    temat');
  for (const p of pozycje) console.log(`${zatw.has(klucz(p)) ? '   TAK       ' : '   nie       '}${p.data}  ${p.godzina}  ${p.format.padEnd(8)}  ${p.temat}   [${p.kanaly}]`);
} else if (polecenie === 'zatwierdz') {
  const wyb = wybrane();
  const gotowe = new Set();
  for (const p of wyb) {
    const kp = katalogPaczki(p);
    if (!gotowe.has(kp)) { przygotujPaczke(kp); gotowe.add(kp); console.log(`paczka ${path.basename(kp)}: pliki JPEG i teksty gotowe`); }
  }
  zapisz([...zatwierdzone(), ...wyb.map(klucz)]);
  console.log(`zatwierdzono ${wyb.length} pozycji. Wyślij na serwer: node zatwierdz.mjs wyslij ${folderArg}`);
} else if (polecenie === 'cofnij') {
  const usun = new Set(wybrane().map(klucz));
  zapisz(zatwierdzone().filter((k) => !usun.has(k)));
  console.log(`cofnięto ${usun.size} pozycji (jeśli już wyszły na serwer: wyślij ponownie)`);
} else if (polecenie === 'wyslij') {
  const nazwa = path.basename(folder);
  execFileSync('ssh', [VPS, `mkdir -p ${ZDALNY}/${nazwa}`]);
  execFileSync('rsync', ['-a', '--delete', '--prune-empty-dirs',
    '--include=kalendarz.csv', '--include=zatwierdzone.json', '--include=*/', '--include=*/publikacja.json', '--include=*/do-publikacji/***',
    '--exclude=*', `${folder}/`, `${VPS}:${ZDALNY}/${nazwa}/`], { stdio: 'inherit' });
  console.log(`wysłano do ${VPS}:${ZDALNY}/${nazwa}`);
} else {
  console.error(`Nieznane polecenie: ${polecenie}`);
  process.exit(1);
}
