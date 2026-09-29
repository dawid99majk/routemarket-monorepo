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
await R.stop();
console.log('·', kat);
