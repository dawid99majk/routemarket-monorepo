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

/** Punkt startowy wyjazdu, tak jak leży w ustawieniach tablicy. */
export interface BazaWyjazdu { name?: string | null; lat?: number | null; lng?: number | null }

const kluczNazwy = (s: unknown): string =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/**
 * Pozycja planu w noclegu — start albo koniec dnia.
 *
 * Nowe plany niosą z serwera flagę `baza`. Starsze jej nie mają, a ich pozycja
 * hotelu dostawała współrzędne sąsiedniego miejsca (w planie Hagi rano w
 * Mauritshuis, wieczorem w Delft), więc rozpoznajemy ją po nazwie noclegu
 * z ustawień i rysujemy tam, gdzie nocleg naprawdę stoi.
 */
export function czyBaza(it: any, baza: BazaWyjazdu | null): boolean {
  if (it?.baza === true) return true;
  if (it?.kind === 'walk') return false;
  const nazwa = kluczNazwy(it?.name);
  const nazwaBazy = kluczNazwy(baza?.name);
  if (!czyPrzystanek(it)) return false;
  if (nazwaBazy && (nazwa === nazwaBazy || (nazwaBazy.length >= 4 && nazwa.includes(nazwaBazy)))) return true;
  return it?.kind === 'hotel' && !nazwaBazy;
}

export interface PunktDnia {
  name: string;
  lat: number;
  lng: number;
  /** Numer przystanku na osi i na pinezce; `null` dla noclegu. */
  nr: number | null;
  /** Indeks pozycji w `day.items`. */
  pozycja: number;
  propozycja: boolean;
}

/**
 * Co z dnia planu trafia na mapę i pod jakim numerem — jedno źródło dla osi
 * godzinowej, mapy, dystansu dnia i przeliczenia przebiegu.
 *
 * Przejścia nie są punktami: "Spacer do Mauritshuis" stał dotąd pinezką w samym
 * muzeum i razem z hotelem dawał trzy pinezki jedna na drugiej. Nocleg dostaje
 * punkt z ustawień wyjazdu i nie ma numeru, żeby nie przesuwał numeracji
 * przystanków. `numery` i `bazy` idą równolegle do `items`.
 */
export function punktyDnia(items: any[], baza: BazaWyjazdu | null): {
  punkty: PunktDnia[]; numery: (number | null)[]; bazy: boolean[];
} {
  const maPunktBazy = baza?.lat != null && baza?.lng != null;
  const punkty: PunktDnia[] = [];
  const numery: (number | null)[] = [];
  const bazy: boolean[] = [];
  let nr = 0;
  items.forEach((it, i) => {
    if (czyBaza(it, baza)) {
      numery.push(null);
      bazy.push(true);
      // Bez punktu w ustawieniach nie ufamy współrzędnym przybliżonym — to były
      // współrzędne sąsiada, nie hotelu.
      const lat = maPunktBazy ? baza!.lat! : (it.approx ? null : it.lat);
      const lng = maPunktBazy ? baza!.lng! : (it.approx ? null : it.lng);
      if (lat != null && lng != null) {
        punkty.push({ name: baza?.name || it.name, lat, lng, nr: null, pozycja: i, propozycja: false });
      }
      return;
    }
    bazy.push(false);
    if (!czyPrzystanek(it) || it.lat == null || it.lng == null) {
      numery.push(null);
      return;
    }
    nr += 1;
    numery.push(nr);
    punkty.push({ name: it.name, lat: it.lat, lng: it.lng, nr, pozycja: i, propozycja: it.source === 'suggested' });
  });
  // Dzień wychodzi z noclegu i do niego wraca, także gdy model pominął nocleg
  // w planie. Bez tego linia dnia i plik GPX zaczynały się przy pierwszej atrakcji,
  // choć dom na mapie stał w hotelu — start wypadał każdego dnia gdzie indziej.
  // Dopisany punkt nie wskazuje żadnej pozycji planu, stąd `pozycja: -1`;
  // `numery` i `bazy` zostają równoległe do `items`.
  if (maPunktBazy && punkty.some((p) => p.nr != null)) {
    const nocleg = (): PunktDnia => ({
      name: baza!.name || 'Nocleg', lat: baza!.lat!, lng: baza!.lng!, nr: null, pozycja: -1, propozycja: false,
    });
    if (punkty[0].nr != null) punkty.unshift(nocleg());
    if (punkty[punkty.length - 1].nr != null) punkty.push(nocleg());
  }
  return { punkty, numery, bazy };
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

/**
 * Tempo marszu po mieście — to samo co w planerze (15 min/km, services/planer.ts).
 * Oś dnia liczyła 80 m/min, statystyka dnia 4,5 km/h, a ostrzeżenia planera
 * 15 min/km: te same 1,6 km wychodziły raz jako 20, raz jako 24 minuty.
 */
export const MINUT_NA_KM = 15;

/** Minuty pieszo dla dystansu w metrach (już z doliczonymi 30% na ulice). */
export function minutPieszo(metry: number): number {
  return Math.max(1, Math.round((metry / 1000) * MINUT_NA_KM));
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
