/**
 * Wizytówki odnośników: prawdziwe znaczniki dla publicznych tablic i miejsc.
 *
 * Aplikacja jest jednostronicowa, więc nginx oddaje ten sam index.html na każdy
 * adres — a w nim jeden komplet znaczników opisujących stronę główną. Odnośnik do
 * „Wrocław z dziećmi, 21 miejsc" wklejony na Facebooka wyglądał więc identycznie
 * jak odnośnik do strony startowej: ten sam tytuł, opis i obrazek. To samo widziały
 * wyszukiwarki, dla których wszystkie podstrony były duplikatem strony głównej.
 *
 * Rozwiązanie nie wymaga renderowania aplikacji po stronie serwera. Bierzemy gotowy
 * index.html — ten sam, który dostaje przeglądarka, więc z aktualnymi nazwami plików
 * po ostatnim wdrożeniu — i podmieniamy w nim same znaczniki. Aplikacja startuje
 * potem normalnie i przejmuje stronę; robot czyta to, co zdążył dostać.
 */
import { repo } from '../db/repository.js';

const SZABLON_URL = 'https://routemarket.io/index.html';
const SZABLON_TTL_MS = 60_000;

let szablon: { html: string; at: number } | null = null;

async function pobierzSzablon(): Promise<string> {
  if (szablon && Date.now() - szablon.at < SZABLON_TTL_MS) return szablon.html;
  const res = await fetch(SZABLON_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`szablon: HTTP ${res.status}`);
  const html = await res.text();
  szablon = { html, at: Date.now() };
  return html;
}

/** Zawartość znacznika musi przetrwać cudzysłowy w nazwie miejsca. */
function bezpieczny(t: string): string {
  return String(t ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface Wizytowka {
  tytul: string;
  opis: string;
  obrazek: string | null;
  url: string;
  typ: 'article' | 'website';
  dane?: Record<string, unknown>;
  /**
   * Treść strony w zwykłym HTML, wstawiana do <div id="root">. Google renderuje
   * JavaScript z opóźnieniem, a Bing, podglądy linków i roboty modeli językowych
   * wcale — bez tego widziały pustą powłokę aplikacji. React przy starcie i tak
   * zastępuje zawartość #root, więc człowiek widzi aplikację, a robot to samo,
   * co aplikacja pokazuje, tylko bez interakcji.
   */
  tresc?: string;
}

/** Opis do znacznika: pełne zdania do 158 znaków, nigdy ucięte w pół słowa. */
export function skrocOpis(tekst: string, limit = 158): string {
  const t = tekst.replace(/\s+/g, ' ').trim();
  if (t.length <= limit) return t;
  const zdania = t.match(/[^.!?]+[.!?]+/g) ?? [];
  let wynik = '';
  for (const z of zdania) {
    if ((wynik + z).trim().length > limit) break;
    wynik += z;
  }
  if (wynik.trim()) return wynik.trim();
  const ciecie = t.slice(0, limit - 1);
  return ciecie.slice(0, ciecie.lastIndexOf(' ')).replace(/[,;:—–-]\s*$/, '') + '…';
}

const h = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const czasZwiedzania = (min: number | null) => {
  if (!min) return null;
  const g = Math.floor(min / 60), m = min % 60;
  return g ? (m ? `${g} g ${m} min` : `${g} g`) : `${m} min`;
};

/** Wspólna oprawa treści dla robotów: prosty, czytelny HTML bez zależności od CSS aplikacji. */
function oprawa(srodek: string): string {
  return `<main style="font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;line-height:1.55;color:#25243A">
${srodek}
<nav style="margin-top:32px"><a href="/">RouteMarket — planer wyjazdów</a> · <a href="/tablice">Tablice od podróżników</a></nav>
</main>`;
}

/**
 * Podmiana zamiast doklejania: dopisane znaczniki dublowałyby te ze strony głównej,
 * a Facebook przy dwóch og:title bierze pierwszy — czyli ten niewłaściwy.
 */
function podmienZnaczniki(html: string, w: Wizytowka): string {
  const t = bezpieczny(w.tytul);
  const o = bezpieczny(w.opis);
  const img = w.obrazek ? bezpieczny(w.obrazek) : null;

  let out = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${t}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${o}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/i,
      `<meta property="og:title" content="${t}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/i,
      `<meta property="og:description" content="${o}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/?>/i,
      `<meta property="og:url" content="${bezpieczny(w.url)}" />`)
    .replace(/<meta property="og:type" content="[^"]*"\s*\/?>/i,
      `<meta property="og:type" content="${w.typ}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/i,
      `<link rel="canonical" href="${bezpieczny(w.url)}" />`);

  if (img) {
    out = out
      .replace(/<meta property="og:image" content="[^"]*"\s*\/?>/i,
        `<meta property="og:image" content="${img}" />`)
      .replace(/<meta name="twitter:image" content="[^"]*"\s*\/?>/i,
        `<meta name="twitter:image" content="${img}" />`);
  }

  out = out
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:title" content="${t}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:description" content="${o}" />`);

  if (w.tresc) {
    // index.html ma w #root treść strony głównej między znacznikami tresc;
    // podstrona dostaje w tym miejscu własną, a nie duplikat strony głównej.
    out = out.replace(/<div id="root">(?:<!--tresc-->[\s\S]*?<!--\/tresc-->)?<\/div>/,
      () => `<div id="root">${w.tresc}</div>`);
  }

  if (w.dane) {
    out = out.replace('</head>',
      `<script type="application/ld+json">${JSON.stringify(w.dane)}</script></head>`);
  }
  return out;
}

const odmiana = (n: number, a: string, b: string, c: string) => {
  if (n === 1) return a;
  const l = n % 10, ll = n % 100;
  return l >= 2 && l <= 4 && (ll < 12 || ll > 14) ? b : c;
};

/** Wizytówka publicznej tablicy. Null, gdy tablicy nie ma albo nie jest publiczna. */
export async function wizytowkaTablicy(id: string): Promise<Wizytowka | null> {
  const t = await repo.publicBoardCard(id);
  if (!t) return null;

  const ile = t.place_count ?? 0;
  const czesci = [
    t.destination,
    ile ? `${ile} ${odmiana(ile, 'miejsce', 'miejsca', 'miejsc')}` : null,
    t.days ? `${t.days} ${odmiana(t.days, 'dzień', 'dni', 'dni')}` : null,
  ].filter(Boolean);

  return {
    tytul: `${t.name} — ${czesci.join(' · ')} | RouteMarket`,
    // Nazwy miejsc zamiast ogólników: to one mówią, czy tablica jest warta kliknięcia.
    opis: t.sample_names?.length
      // Tablica przykładowa nie ma autora i nie wolno jej podpisywać cudzą ręką —
      // karta odnośnika jest tym, co ludzie widzą po wklejeniu linku.
      ? (t.is_example
          ? `Przykładowy plan RouteMarket: ${t.sample_names.slice(0, 4).join(', ')}${ile > 4 ? ' i więcej' : ''}. Skopiuj go do siebie i zmień, co nie pasuje.`
          : `Gotowa tablica od ${t.author_display || 'podróżnika'}: ${t.sample_names.slice(0, 4).join(', ')}${ile > 4 ? ' i więcej' : ''}. Skopiuj ją do siebie i zmień, co nie pasuje.`)
      : `Gotowa tablica wyjazdu do ${t.destination ?? 'miasta'}. Skopiuj ją do siebie i zmień, co nie pasuje.`,
    obrazek: t.photo ?? null,
    url: `https://routemarket.io/tablica/${id}`,
    typ: 'article',
    dane: {
      '@context': 'https://schema.org', '@type': 'ItemList',
      name: t.name, numberOfItems: (t.places ?? []).length,
      author: t.is_example
        ? { '@type': 'Organization', name: 'RouteMarket' }
        : { '@type': 'Person', name: t.author_display || 'Podróżnik' },
      itemListElement: (t.places ?? []).map((p: any, i: number) => ({
        '@type': 'ListItem', position: i + 1, name: p.name,
        ...(p.slug ? { url: `https://routemarket.io/miejsce/${p.slug}` } : {}),
      })),
    },
    tresc: oprawa(`<h1>${h(t.name)}</h1>
<p>${h(czesci.join(' · '))}${t.is_example ? ' · przykładowy plan RouteMarket' : t.author_display ? ` · ${h(t.author_display)}` : ''}</p>
<p>Tablica wyjazdu w RouteMarket: miejsca podzielone na „na pewno” i „być może”. Z tablicy agent układa plan dni z godzinami otwarcia i kolejnością, a na koniec daje plik GPX. Możesz ją skopiować do siebie i zmienić, co nie pasuje.</p>
<h2>Miejsca na tablicy</h2>
<ol>${(t.places ?? []).map((p: any) => `<li>${p.slug ? `<a href="/miejsce/${h(p.slug)}">${h(p.name)}</a>` : h(p.name)}${czasZwiedzania(p.minutes) ? ` — ${czasZwiedzania(p.minutes)} zwiedzania` : ''}${p.priority === 'nice' ? ' (być może)' : ''}</li>`).join('')}</ol>`),
  };
}

/** Wizytówka miejsca z katalogu. */
export async function wizytowkaMiejsca(slug: string): Promise<Wizytowka | null> {
  const m = await repo.catalogCardBySlug(slug);
  if (!m) return null;

  const gdzie = [m.city, m.country].filter(Boolean).join(', ');
  const opis = (m.description || m.wiki_extract || '').trim();
  const tablice = m.city ? await repo.publicBoardsList(m.city).catch(() => []) : [];
  const fakty = [
    czasZwiedzania(m.visit_minutes) ? `<li>Czas zwiedzania: ${czasZwiedzania(m.visit_minutes)}</li>` : '',
    m.opening_hours ? `<li>Godziny otwarcia (OpenStreetMap): ${h(m.opening_hours)}</li>` : '',
    m.nazwa_lokalna && m.nazwa_lokalna !== m.name ? `<li>Nazwa lokalna: ${h(m.nazwa_lokalna)}</li>` : '',
  ].join('');
  const tresc = oprawa(`<h1>${h(m.name)}</h1>
${gdzie ? `<p>${h(gdzie)}</p>` : ''}
${m.wyroznik ? `<p><strong>${h(m.wyroznik)}</strong></p>` : ''}
${opis ? `<p>${h(opis)}</p>` : ''}
${fakty ? `<ul>${fakty}</ul>` : ''}
<p>Dodaj to miejsce do tablicy wyjazdu w RouteMarket — agent ułoży wokół niego plan dnia z godzinami otwarcia.</p>
${tablice.length ? `<h2>Tablice z miasta ${h(m.city)}</h2><ul>${tablice.slice(0, 8).map((b: any) => `<li><a href="/tablica/${h(b.id)}">${h(b.name)}</a></li>`).join('')}</ul>` : ''}`);
  return {
    tytul: `${m.name}${gdzie ? ` — ${gdzie}` : ''} | RouteMarket`,
    opis: opis
      ? skrocOpis(opis)
      : `${m.name}${gdzie ? ` w ${gdzie}` : ''} — dodaj to miejsce do tablicy wyjazdu i zaplanuj wokół niego dzień.`,
    tresc,
    obrazek: Array.isArray(m.photos) && m.photos.length ? m.photos[0] : null,
    url: `https://routemarket.io/miejsce/${slug}`,
    typ: 'article',
    dane: {
      '@context': 'https://schema.org', '@type': 'TouristAttraction',
      name: m.name,
      address: gdzie ? { '@type': 'PostalAddress', addressLocality: m.city, addressCountry: m.country } : undefined,
      geo: m.lat != null ? { '@type': 'GeoCoordinates', latitude: m.lat, longitude: m.lng } : undefined,
      image: Array.isArray(m.photos) && m.photos.length ? m.photos[0] : undefined,
    },
  };
}

/** Galeria publicznych tablic — /tablice, jedyna ścieżka robota do wszystkich tablic naraz. */
export async function wizytowkaGalerii(): Promise<Wizytowka> {
  const tablice = await repo.publicBoardsList();
  const wg = new Map<string, any[]>();
  for (const t of tablice) {
    const k = t.destination || 'Inne';
    wg.set(k, [...(wg.get(k) ?? []), t]);
  }
  const miasta = [...wg.keys()].sort((a, b) => a.localeCompare(b, 'pl'));
  return {
    tytul: 'Tablice od podróżników — gotowe plany wyjazdów | RouteMarket',
    opis: skrocOpis(`Publiczne tablice wyjazdów z ${miasta.length} miast: miejsca podzielone na „na pewno” i „być może”, gotowe do skopiowania i przerobienia pod własny wyjazd.`),
    obrazek: null,
    url: 'https://routemarket.io/tablice',
    typ: 'website',
    dane: {
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: 'Tablice od podróżników', url: 'https://routemarket.io/tablice',
    },
    tresc: oprawa(`<h1>Tablice od podróżników</h1>
<p>Nie zaczynaj od pustej tablicy. Skopiuj tablicę kogoś, kto był tam przed Tobą, i wyrzuć z niej to, co do Ciebie nie pasuje.</p>
${miasta.map((m) => `<h2>${h(m)}</h2><ul>${wg.get(m)!.map((t: any) => `<li><a href="/tablica/${h(t.id)}">${h(t.name)}</a>${t.days ? ` · ${t.days} ${odmiana(t.days, 'dzień', 'dni', 'dni')}` : ''}</li>`).join('')}</ul>`).join('\n')}`),
  };
}

export async function stronaZWizytowka(w: Wizytowka | null): Promise<string> {
  const html = await pobierzSzablon();
  return w ? podmienZnaczniki(html, w) : html;
}
