import { Bed, MapPin, Music, Utensils } from 'lucide-react';
import type { PinnedPlace, Priority } from './types';

/**
 * Priorytet w bazie jest zwykłym tekstem, więc typy wygenerowane ze schematu
 * oddają go jako `string`. Zamiast rzutować wynik zapytania — co wyłącza
 * sprawdzanie i przepuściłoby literówkę w nazwie kubełka — zawężamy wartość
 * przy wejściu. Nieznana wpada do „być może": to kubełek bez konsekwencji,
 * a zgubienie miejsca byłoby gorsze niż zaklasyfikowanie go nie tam.
 */
export const jakoPriorytet = (v: string | null | undefined): Priority =>
  v === 'must' || v === 'rejected' ? v : 'nice';

/**
 * Wiersz z bazy jako miejsce tablicy, z zawężonym priorytetem.
 *
 * `image_url` zapisuje się raz, przy dodawaniu miejsca. Zdjęcia w katalogu
 * dochodzą później, więc bez tego kafelek raz dodany bez zdjęcia zostawał
 * pusty na zawsze — mimo że galeria miejsca już istniała.
 */
export const jakoMiejsce = (r: Record<string, unknown>): PinnedPlace => {
  const zKatalogu = (r.place_catalog as { photos?: unknown } | null | undefined)?.photos;
  const pierwszeZKatalogu = Array.isArray(zKatalogu)
    ? (zKatalogu.find((u) => typeof u === 'string' && u) as string | undefined)
    : undefined;
  return {
    ...r,
    image_url: (r.image_url as string | null) || pierwszeZKatalogu || null,
    priority: jakoPriorytet(r.priority as string),
  } as PinnedPlace;
};

/** "1 g 30 min" zamiast "90 min" — tak ludzie mówią o czasie zwiedzania. */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h} g ${m} min`;
  if (h) return `${h} g`;
  return `${m} min`;
}

/** Strefy tablicy — kartkę przeciąga się między nimi. */
export const ZONES: { id: Priority; label: string; short: string; hint: string }[] = [
  { id: 'must', label: 'Na pewno', short: 'Na pewno', hint: 'Tu trafia to, bez czego wyjazd nie ma sensu.' },
  { id: 'nice', label: 'Być może', short: 'Może', hint: 'Wypełnią luki, jeśli zostanie czas.' },
  { id: 'rejected', label: 'Nie', short: 'Nie', hint: 'Odrzucone zostają tu — bez usuwania.' }
];

export const CATEGORY_ICON: Record<string, any> = {
  attraction: MapPin,
  food: Utensils,
  nightlife: Music,
  hotel: Bed,
  other: MapPin
};

/**
 * Pusta tablica jest gorsza niż puste pole czatu: czat sam coś proponuje, tablica
 * każe wymyślić zapytanie. Gotowe tropy zdejmują ten pierwszy opór, a ich dobór
 * idzie za charakterem wyjazdu — na delegacji i z dziećmi szuka się czego innego.
 */
export const SUGGESTION_SETS: Record<string, string[]> = {
  default: [
    'klasyki, których nie wypada pominąć',
    'miejsca nieoczywiste, z dala od tłumów',
    'parki, bulwary i zieleń',
    'lokalny street food, nie turystyczne pułapki',
    'klimatyczne kawiarnie',
    'co robić wieczorem'
  ],
  family: [
    'atrakcje dla dzieci',
    'parki i place zabaw',
    'muzea, w których można czegoś dotknąć',
    'gdzie zjeść z dzieckiem',
    'klasyki, których nie wypada pominąć',
    'miejsce na przerwę i lody'
  ],
  business: [
    'jedna rzecz, którą trzeba zobaczyć',
    'dobra kolacja blisko centrum',
    'kawiarnia do pracy',
    'krótki spacer na godzinę'
  ],
  couple: [
    'klimatyczne kawiarnie',
    'punkty widokowe o zachodzie',
    'kolacja na wieczór',
    'miejsca nieoczywiste, z dala od tłumów',
    'spacer wzdłuż wody'
  ],
  solo: [
    'miejsca nieoczywiste, z dala od tłumów',
    'najlepsze kadry w mieście',
    'targi, bazary i codzienne życie',
    'sztuka współczesna i galerie'
  ]
};

/**
 * Pozycja organizacyjna planu — przejście, przerwa, posiłek, nocleg. Nie jest
 * przystankiem: nie idzie do geokodera i nie dostaje wiersza z dystansem, bo
 * sama JEST tym, co dzieje się między przystankami.
 */
const POZYCJA_ORGANIZACYJNA =
  /^(przejazd|przej[śs]cie|przerwa|czas wolny|wolny czas|powr[óo]t|dojazd|transfer|lunch|obiad|kolacja|śniadanie|odpoczynek|spacer(\s|$)|nocleg)/i;

export function czyPrzystanek(it: any): boolean {
  if (['walk', 'transit', 'break', 'meal'].includes(it?.kind)) return false;
  return !POZYCJA_ORGANIZACYJNA.test(String(it?.name || '').trim());
}

/** Odległość w km po prostej — do wykrywania odstających punktów i duplikatów. */
export function kmBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = (aLat - bLat) * 111;
  const dLng = (aLng - bLng) * 111 * Math.cos((aLat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/** Odległość w metrach po prostej (haversine). Do przejścia w mieście
 *  dokładamy 30% na to, że ulice nie biegną po linii prostej. */
export function metryMiedzy(a: any, b: any): number | null {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.asin(Math.sqrt(s)) * 1.3);
}

/** Dystans po polsku: przecinek dziesiętny, metry poniżej kilometra. */
export function opisDystansu(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${m} m`;
}

export function medianOf(nums: number[]): number {
  const a = [...nums].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
