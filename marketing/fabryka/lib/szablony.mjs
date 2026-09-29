/**
 * Szablony slajdów w kierunku „Pocztówka” (tokeny z systemu designu produktu).
 *
 * Każda funkcja zwraca pełny dokument HTML w stałym rozmiarze. Kolory mają te
 * same znaczenia co w aplikacji: zieleń tylko przy „na pewno”, lawenda tylko
 * przy głosie agenta, akcja atramentowa. Dzięki temu ktoś, kto zobaczy post,
 * a potem wejdzie na stronę, trafia do tego samego świata.
 *
 * Podpis zdjęcia jest częścią szablonu, a nie opcją: slajd ze zdjęciem bez
 * autora i licencji po prostu się nie renderuje (patrz `wymagajPodpisu`).
 */
import { pathToFileURL } from 'node:url';

export const ROZMIARY = {
  karuzela: { w: 1080, h: 1350 },
  pion: { w: 1080, h: 1920 },
  pin: { w: 1000, h: 1500 },
};

/**
 * Znak marki — ten sam romb „RM” z linią trasy co `RMMark` w Logo.tsx.
 * Na ciemnym tle romb jest jasny, inaczej atrament znika w atramencie.
 */
export function znak(px = 40, ciemne = false) {
  const romb = ciemne ? '#F5F1EC' : '#25243A';
  const litery = ciemne ? '#25243A' : '#F5F1EC';
  return `<svg width="${px}" height="${px}" viewBox="0 0 40 40" fill="none" style="flex:none">
<g transform="rotate(45 20 20)"><rect x="4" y="4" width="32" height="32" rx="6" fill="${romb}"/></g>
<path d="M6 30 Q 14 22, 20 20 T 34 10" stroke="#F6CFAE" stroke-width="2.25" stroke-linecap="round" fill="none"/>
<circle cx="6" cy="30" r="2" fill="#F6CFAE"/><circle cx="34" cy="10" r="2.4" fill="${litery}" stroke="#F6CFAE" stroke-width="1.5"/>
<text x="20" y="24" text-anchor="middle" font-family="Figtree, sans-serif" font-weight="700" font-size="11" letter-spacing="0.05em" fill="${litery}" opacity="0.92">RM</text></svg>`;
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const src = (plik) => pathToFileURL(plik).href;

function wymagajPodpisu(z) {
  if (!z?.plik || !z?.podpis) throw new Error('Slajd ze zdjęciem wymaga pliku i podpisu (autor · licencja · źródło).');
}

const BAZA = (w, h, tlo = 'var(--tlo)') => `<!doctype html><html lang="pl"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&display=block" rel="stylesheet">
<style>
:root{--tlo:#F5F1EC;--karta:#FFFFFF;--muted:#EDE6DD;--atrament:#25243A;--cichy:#5F5E72;--linia:#E6E0D8;
--zielen:#2E6B50;--brzoskwinia:#F6CFAE;--brzoskwinia-tekst:#4A2A10;--lawenda:#ECE7FB;--lawenda-tekst:#2B2360;--agent:#3A2E7C;--zdjecie:#E7DCCF}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:${tlo};color:var(--atrament);
font-family:Figtree,system-ui,sans-serif;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.display{font-family:'Bricolage Grotesque',Figtree,sans-serif;font-weight:700;letter-spacing:-0.02em;line-height:1.02;text-wrap:balance}
.znak{display:inline-flex;align-items:center;gap:14px;font-weight:700;font-size:30px;letter-spacing:-0.01em}
.pigulka{display:inline-flex;align-items:center;gap:10px;border-radius:999px;padding:12px 22px;font-size:26px;font-weight:600;background:var(--karta);box-shadow:0 2px 8px rgba(37,36,58,.08)}
.pigulka.pewne{background:var(--zielen);color:#fff}
.pigulka.moze{background:var(--brzoskwinia);color:var(--brzoskwinia-tekst)}
.kropka{width:12px;height:12px;border-radius:50%;background:currentColor;display:inline-block}
.podpis{font-size:17px;line-height:1.3;color:var(--cichy)}
.podpis.na-zdjeciu{position:absolute;right:22px;bottom:18px;color:rgba(255,255,255,.88);text-shadow:0 1px 3px rgba(0,0,0,.6);max-width:80%;text-align:right}
.dymek{display:flex;gap:22px;align-items:flex-start}
.dymek .a{flex:none;width:72px;height:72px;border-radius:50%;background:var(--agent);color:#fff;font-weight:700;font-size:34px;display:grid;place-items:center}
.dymek .tresc{background:var(--lawenda);color:var(--lawenda-tekst);border-radius:8px 34px 34px 34px;padding:34px 40px;font-size:var(--dymek,40px);line-height:1.32;font-weight:500}
.dymek .kto{font-size:24px;font-weight:700;margin-bottom:10px;opacity:.75}
</style></head><body>`;

/** Okładka: zdjęcie do krawędzi, tytuł na przyciemnieniu u dołu. */
export function okladka({ w, h, zdjecie, nadtytul, tytul, fakty }) {
  wymagajPodpisu(zdjecie);
  const pion = h / w > 1.5;
  return BAZA(w, h, '#1d1c2b') + `
<div style="position:absolute;inset:0;background:url('${src(zdjecie.plik)}') center/cover"></div>
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,19,32,.35) 0%,rgba(20,19,32,0) 22%,rgba(20,19,32,0) 42%,rgba(20,19,32,.88) 100%)"></div>
<div style="position:absolute;left:64px;top:64px" class="znak"><span style="color:#fff;display:inline-flex;gap:14px;align-items:center">${znak(44, true)}routemarket</span></div>
<div style="position:absolute;left:64px;right:64px;bottom:${pion ? 300 : 120}px;color:#fff">
  ${nadtytul ? `<div style="font-size:30px;font-weight:600;opacity:.9;margin-bottom:22px">${esc(nadtytul)}</div>` : ''}
  <div class="display" style="font-size:${tytul.length > 22 ? 104 : 124}px">${esc(tytul)}</div>
  ${fakty?.length ? `<div style="margin-top:34px;display:flex;flex-wrap:wrap;gap:14px">${fakty.map((f) => `<span class="pigulka" style="background:rgba(255,255,255,.94);color:var(--atrament)">${esc(f)}</span>`).join('')}</div>` : ''}
</div>
<div class="podpis na-zdjeciu">${esc(zdjecie.podpis)}</div>
</body></html>`;
}

/** Miejsce: zdjęcie w karcie, nazwa, fakty w pigułkach, wyróżnik. */
export function miejsce({ w, h, nr, razem, m, zdjecie, pewne }) {
  wymagajPodpisu(zdjecie);
  const pion = h / w > 1.5;
  const wysZdj = pion ? 1020 : 700;
  const fakty = [m.czas && `${m.czas} zwiedzania`, m.godziny].filter(Boolean);
  return BAZA(w, h) + `
<div style="position:absolute;left:48px;right:48px;top:${pion ? 150 : 48}px;height:${wysZdj}px;border-radius:28px;overflow:hidden;background:var(--zdjecie);box-shadow:0 10px 30px rgba(37,36,58,.14)">
  <div style="position:absolute;inset:0;background:url('${src(zdjecie.plik)}') center/cover"></div>
  <div style="position:absolute;left:0;right:0;bottom:0;height:120px;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.45))"></div>
  <div class="podpis na-zdjeciu">${esc(zdjecie.podpis)}</div>
  <div style="position:absolute;left:26px;top:26px" class="pigulka">${String(nr).padStart(2, '0')} / ${String(razem).padStart(2, '0')}</div>
  ${pewne ? '<div style="position:absolute;right:26px;top:26px" class="pigulka pewne"><span class="kropka"></span>Na pewno</div>' : ''}
</div>
<div style="position:absolute;left:64px;right:64px;top:${(pion ? 150 : 48) + wysZdj + 44}px">
  <div class="display" style="font-size:${m.nazwa.length > 26 ? 62 : 76}px">${esc(m.nazwa)}</div>
  ${fakty.length ? `<div style="margin-top:24px;display:flex;flex-wrap:wrap;gap:12px">${fakty.map((f) => `<span class="pigulka">${esc(f)}</span>`).join('')}</div>` : ''}
  ${m.wyroznik ? `<div style="margin-top:28px;font-size:${pion ? 38 : 33}px;line-height:1.36;color:var(--atrament);max-width:940px">${esc(m.wyroznik)}</div>` : ''}
</div>
<div style="position:absolute;left:64px;bottom:${pion ? 250 : 44}px" class="znak">${znak(44)}routemarket</div>
</body></html>`;
}

/** Głos agenta: obserwacja policzona z danych, w lawendowym dymku. */
export function agent({ w, h, tytul, tekst }) {
  const pion = h / w > 1.5;
  return BAZA(w, h) + `
<div style="position:absolute;left:64px;right:64px;top:${pion ? 560 : 120}px;${pion ? '--dymek:54px' : '--dymek:40px'}">
  <div class="display" style="font-size:${pion ? 96 : 78}px;margin-bottom:60px">${esc(tytul)}</div>
  <div class="dymek"><div class="a">A</div><div class="tresc"><div class="kto">Agent RouteMarket</div>${esc(tekst)}</div></div>
</div>
<div style="position:absolute;left:64px;bottom:${pion ? 250 : 56}px" class="znak">${znak(44)}routemarket</div>
</body></html>`;
}

/** Wezwanie do działania: atramentowe tło, obietnica produktu, adres. */
export function cta({ w, h, tytul, tekst, adres }) {
  const pion = h / w > 1.5;
  return BAZA(w, h, 'var(--atrament)') + `
<div style="position:absolute;left:64px;right:64px;top:${pion ? 520 : 150}px;color:#fff">
  <div class="znak" style="color:#fff">${znak(44, true)}routemarket</div>
  <div class="display" style="font-size:112px;margin-top:70px">${esc(tytul)}</div>
  <div style="font-size:40px;line-height:1.35;margin-top:44px;opacity:.86;max-width:900px">${esc(tekst)}</div>
  <div style="margin-top:64px;display:inline-flex;border-radius:999px;background:#fff;color:var(--atrament);padding:26px 44px;font-size:40px;font-weight:700">${esc(adres)}</div>
</div>
<div style="position:absolute;left:64px;right:64px;bottom:${pion ? 250 : 56}px;display:flex;gap:14px;color:#fff;font-size:26px;opacity:.8">
  <span>Na pewno · Być może · Nie</span><span>—</span><span>plan dni · GPX</span>
</div>
</body></html>`;
}

/** Źródła zdjęć — ostatni slajd karuzeli. Wymóg licencji, nie ozdoba. */
export function zrodla({ w, h, linie, uwagaSA }) {
  const rozmiar = linie.length > 8 ? 19 : 22;
  return BAZA(w, h) + `
<div style="position:absolute;left:64px;right:64px;top:64px">
  <div class="display" style="font-size:52px">Zdjęcia</div>
  <div style="margin-top:14px;font-size:24px;color:var(--cichy)">Wikimedia Commons. Autor, licencja i źródło każdego zdjęcia:</div>
  <ol style="margin-top:34px;padding-left:30px;font-size:${rozmiar}px;line-height:1.42;color:var(--atrament)">
    ${linie.map((l) => `<li style="margin-bottom:12px;word-break:break-word">${esc(l)}</li>`).join('')}
  </ol>
  ${uwagaSA ? `<div style="margin-top:22px;font-size:20px;color:var(--cichy)">${esc(uwagaSA)}</div>` : ''}
</div>
<div style="position:absolute;left:64px;bottom:44px" class="znak">${znak(44)}routemarket</div>
</body></html>`;
}

/** Pin na Pinterest: kolaż trzech zdjęć i tytuł-fraza z wyszukiwarki. */
export function pin({ w, h, tytul, podtytul, zdjecia, adres }) {
  zdjecia.forEach(wymagajPodpisu);
  const kafel = (z, css) => `<div style="position:absolute;${css};border-radius:22px;overflow:hidden;background:url('${src(z.plik)}') center/cover"></div>`;
  const [a, b, c] = zdjecia;
  return BAZA(w, h) + `
${a ? kafel(a, 'left:36px;top:36px;width:580px;height:780px') : ''}
${b ? kafel(b, 'left:632px;top:36px;width:332px;height:382px') : ''}
${c ? kafel(c, 'left:632px;top:434px;width:332px;height:382px') : ''}
<div style="position:absolute;left:56px;right:56px;top:872px">
  <div class="display" style="font-size:${tytul.length > 24 ? 84 : 100}px">${esc(tytul)}</div>
  <div style="margin-top:26px;font-size:36px;line-height:1.35;color:var(--cichy)">${esc(podtytul)}</div>
</div>
<div style="position:absolute;left:56px;right:56px;bottom:56px;display:flex;justify-content:space-between;align-items:center">
  <span class="znak">${znak(44)}routemarket</span>
  <span class="pigulka" style="background:var(--atrament);color:#fff">${esc(adres)}</span>
</div>
<div style="position:absolute;left:56px;right:56px;bottom:124px;font-size:15px;color:var(--cichy);line-height:1.3">${esc(zdjecia.map((z) => z.podpis.replace(/^Fot\. /, '')).join(' | '))}</div>
</body></html>`;
}

/** Nakładka tekstowa rolki (przezroczyste tło) na scenę ze zdjęciem. */
export function nakladkaRolki({ w, h, gora, tytul, fakty, podpis }) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Figtree:wght@500;600;700&display=block" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;background:transparent;font-family:Figtree,sans-serif;color:#fff;-webkit-font-smoothing:antialiased}
.display{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;letter-spacing:-0.02em;line-height:1.02;text-wrap:balance}
.pig{display:inline-flex;border-radius:999px;padding:14px 26px;font-size:34px;font-weight:700;background:rgba(255,255,255,.95);color:#25243A}</style></head><body>
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,19,32,.55) 0%,rgba(20,19,32,0) 20%,rgba(20,19,32,0) 50%,rgba(20,19,32,.85) 100%)"></div>
${gora ? `<div style="position:absolute;left:60px;right:60px;top:170px;font-size:44px;font-weight:700;text-shadow:0 2px 8px rgba(0,0,0,.5)">${esc(gora)}</div>` : ''}
<div style="position:absolute;left:60px;right:60px;bottom:360px">
  <div class="display" style="font-size:${tytul.length > 24 ? 96 : 118}px;text-shadow:0 3px 14px rgba(0,0,0,.35)">${esc(tytul)}</div>
  ${fakty?.length ? `<div style="margin-top:30px;display:flex;flex-wrap:wrap;gap:14px">${fakty.map((f) => `<span class="pig">${esc(f)}</span>`).join('')}</div>` : ''}
</div>
${podpis ? `<div style="position:absolute;left:60px;right:60px;bottom:250px;font-size:22px;opacity:.85;text-shadow:0 1px 3px rgba(0,0,0,.7)">${esc(podpis)}</div>` : ''}
</body></html>`;
}
