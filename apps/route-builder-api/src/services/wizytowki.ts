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
      ? `Gotowa tablica od ${t.author_display || 'podróżnika'}: ${t.sample_names.slice(0, 4).join(', ')}${ile > 4 ? ' i więcej' : ''}. Skopiuj ją do siebie i zmień, co nie pasuje.`
      : `Gotowa tablica wyjazdu do ${t.destination ?? 'miasta'}. Skopiuj ją do siebie i zmień, co nie pasuje.`,
    obrazek: t.photo ?? null,
    url: `https://routemarket.io/tablica/${id}`,
    typ: 'article',
    dane: {
      '@context': 'https://schema.org', '@type': 'ItemList',
      name: t.name, numberOfItems: ile,
      author: { '@type': 'Person', name: t.author_display || 'Podróżnik' },
    },
  };
}

/** Wizytówka miejsca z katalogu. */
export async function wizytowkaMiejsca(slug: string): Promise<Wizytowka | null> {
  const m = await repo.catalogCardBySlug(slug);
  if (!m) return null;

  const gdzie = [m.city, m.country].filter(Boolean).join(', ');
  const opis = (m.description || m.wiki_extract || '').trim();
  return {
    tytul: `${m.name}${gdzie ? ` — ${gdzie}` : ''} | RouteMarket`,
    opis: opis
      ? opis.slice(0, 200)
      : `${m.name}${gdzie ? ` w ${gdzie}` : ''} — dodaj to miejsce do tablicy wyjazdu i zaplanuj wokół niego dzień.`,
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

export async function stronaZWizytowka(w: Wizytowka | null): Promise<string> {
  const html = await pobierzSzablon();
  return w ? podmienZnaczniki(html, w) : html;
}
