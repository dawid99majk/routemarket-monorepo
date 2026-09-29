#!/usr/bin/env node
/**
 * Obrazek podglądu odnośnika (og:image) dla strony głównej — 1200×630.
 *
 *   node og.mjs [plik.png]
 *
 * Bez zdjęcia: podgląd linku wisi potem latami w cudzych rozmowach i postach,
 * a zdjęcie z Commons wymagałoby podpisu, którego w miniaturze nikt nie
 * przeczyta. Zamiast tego to, co produkt naprawdę robi: trzy kubełki decyzji
 * i zdanie agenta z przykładu na stronie głównej.
 */
import * as R from './lib/render.mjs';
import { znak } from './lib/szablony.mjs';

const W = 1200, H = 630;
const wyjscie = process.argv[2] ?? 'wyniki/og-image.png';

const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&display=block" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;background:#F5F1EC;color:#25243A;font-family:Figtree,sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden}
.display{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;letter-spacing:-0.025em;line-height:1}
.znak{display:inline-flex;align-items:center;gap:12px;font-weight:700;font-size:26px}
.pig{display:inline-flex;align-items:center;gap:9px;border-radius:999px;padding:11px 20px;font-size:22px;font-weight:700}
.pig b{width:10px;height:10px;border-radius:50%;background:currentColor}
.karta{background:#fff;border-radius:22px;box-shadow:0 10px 30px rgba(37,36,58,.12);padding:22px 24px}
</style></head><body>
<div style="position:absolute;left:64px;top:56px" class="znak">${znak(40)}routemarket</div>
<div style="position:absolute;left:64px;top:128px;width:600px">
  <div class="display" style="font-size:76px">Zbierz miejsca. Resztę ułoży agent.</div>
  <div style="margin-top:28px;font-size:25px;line-height:1.4;color:#5F5E72">Plan dni z godzinami otwarcia i kolejnością, a na końcu plik GPX do zegarka albo nawigacji.</div>
</div>
<div style="position:absolute;left:64px;bottom:56px;display:flex;gap:12px">
  <span class="pig" style="background:#2E6B50;color:#fff"><b></b>Na pewno</span>
  <span class="pig" style="background:#F6CFAE;color:#4A2A10"><b></b>Być może</span>
  <span class="pig" style="background:#E3DED7;color:#25243A"><b></b>Nie</span>
</div>
<div style="position:absolute;right:56px;top:70px;width:410px;display:flex;flex-direction:column;gap:16px">
  <div class="karta"><div style="font-size:15px;font-weight:700;color:#5F5E72">Dzień 1 — stare miasto · 3 g 25 min · 3,8 km pieszo</div>
    <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px;font-size:21px;font-weight:600">
      <div style="display:flex;gap:12px;align-items:center"><span style="width:12px;height:12px;border-radius:50%;background:#2E6B50"></span>Amfiteatr</div>
      <div style="display:flex;gap:12px;align-items:center"><span style="width:12px;height:12px;border-radius:50%;background:#2E6B50"></span>Forum bizantyjskie</div>
      <div style="display:flex;gap:12px;align-items:center"><span style="width:12px;height:12px;border-radius:50%;background:#2E6B50"></span>Wieża Wenecka</div>
    </div></div>
  <div style="display:flex;gap:12px;align-items:flex-start">
    <div style="flex:none;width:44px;height:44px;border-radius:50%;background:#3A2E7C;color:#fff;font-weight:700;font-size:20px;display:grid;place-items:center">A</div>
    <div style="background:#ECE7FB;color:#2B2360;border-radius:6px 22px 22px 22px;padding:16px 18px;font-size:19px;line-height:1.38;font-weight:500">Trzy punkty na 3,5 godziny. Zmieściłby się czwarty, ale amfiteatr i mury to dużo schodów jak na jedno popołudnie.</div>
  </div>
</div>
</body></html>`;

await R.png(html, wyjscie, { w: W, h: H });
await R.stop();
console.log('·', wyjscie);
