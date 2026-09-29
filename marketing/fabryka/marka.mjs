#!/usr/bin/env node
/**
 * Pliki marki z jednego źródła (znak z Logo.tsx):
 *   logo-512.png   — logo w danych strukturalnych (Organization.logo), kwadrat
 *   awatar.png     — zdjęcie profilowe kont społecznościowych (1080×1080, znak w kole)
 *   favicon.png    — 192×192, ten sam znak co w nagłówku strony
 *
 *   node marka.mjs [katalog]
 */
import * as R from './lib/render.mjs';
import { znak } from './lib/szablony.mjs';

const kat = process.argv[2] ?? 'wyniki/marka';
const strona = (w, h, tlo, srodek) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700&family=Figtree:wght@700&display=block" rel="stylesheet">
<style>*{margin:0}html,body{width:${w}px;height:${h}px;background:${tlo};display:grid;place-items:center;overflow:hidden}
.x{font-family:'Bricolage Grotesque';position:absolute;opacity:0}</style></head><body><span class="x">.</span>${srodek}</body></html>`;

await R.png(strona(512, 512, 'transparent', znak(512)), `${kat}/logo-512.png`, { w: 512, h: 512, przezroczyste: true });
await R.png(strona(1080, 1080, '#F5F1EC', znak(760)), `${kat}/awatar.png`, { w: 1080, h: 1080 });
await R.png(strona(192, 192, 'transparent', znak(192)), `${kat}/favicon.png`, { w: 192, h: 192, przezroczyste: true });

/**
 * Okładki kont. Wymiary i strefy bezpieczne platform:
 *   Facebook: 1640×624 (na telefonie przycinany z boków — treść w środkowych 1100 px)
 *   YouTube:  2560×1440, telewizor pokazuje całość, komputer 2560×423, telefon i „bezpieczna” strefa
 *             na każdym urządzeniu to środkowe 1546×423 — treść tylko tam.
 */
const okladka = (w, h, szer) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Figtree:wght@500;600&display=block" rel="stylesheet">
<style>*{margin:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;background:#F5F1EC;color:#25243A;overflow:hidden;font-family:Figtree,sans-serif}
.tresc{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${szer}px;display:flex;align-items:center;gap:${szer / 16}px}
.tytul{font-family:'Bricolage Grotesque';font-weight:800;letter-spacing:-0.025em;line-height:1;font-size:${szer / 13}px;white-space:nowrap}
.pod{font-size:${szer / 40}px;color:#5F5E72;margin-top:${szer / 60}px;line-height:1.35}
.pig{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:${szer / 130}px ${szer / 60}px;font-size:${szer / 50}px;font-weight:600}
.pig::before{content:"";width:.5em;height:.5em;border-radius:50%;background:currentColor}
</style></head><body><span style="font-family:'Bricolage Grotesque';position:absolute;opacity:0">.</span>
<div class="tresc"><div style="flex:none">${znak(szer / 6)}</div>
<div><div class="tytul">Zbierz miejsca.<br>Resztę ułoży agent.</div>
<div class="pod">Plan dni z godzinami otwarcia i plik GPX.</div>
<div style="display:flex;gap:${szer / 100}px;margin-top:${szer / 45}px">
<span class="pig" style="background:#2E6B50;color:#fff">Na pewno</span><span class="pig" style="background:#F6CFAE;color:#4A2A10">Być może</span><span class="pig" style="background:#E3DED7">Nie</span></div></div></div></body></html>`;
await R.png(okladka(1640, 624, 1000), `${kat}/okladka-facebook.png`, { w: 1640, h: 624 });
await R.png(okladka(2560, 1440, 1400), `${kat}/baner-youtube.png`, { w: 2560, h: 1440 });
await R.stop();
console.log('·', kat);
