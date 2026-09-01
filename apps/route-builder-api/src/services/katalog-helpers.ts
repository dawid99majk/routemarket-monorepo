/**
 * Slug miejsca. Ma być czytelny w adresie i stabilny, więc powstaje z nazwy i
 * miasta, a krótki przyrostek z współrzędnych rozróżnia dwa "Rynki" w dwóch
 * miastach o tej samej nazwie.
 */
export function placeSlug(name: string, city: string | null, lat: number, lng: number): string {
  const base = [name, city].filter(Boolean).join(' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const suffix = Math.abs(Math.round(lat * 10000) ^ Math.round(lng * 10000)).toString(36).slice(0, 5);
  return `${base || 'miejsce'}-${suffix}`;
}

/**
 * Zamknięty słownik znaczników nastroju. Gdyby model wymyślał je swobodnie,
 * "podobne w klimacie" nigdy by nie zadziałało: każde miejsce dostałoby własny,
 * niepowtarzalny zestaw określeń i część wspólna zawsze byłaby pusta.
 */
export const VIBE_TAGS = [
  'historyczne', 'sakralne', 'muzealne', 'sztuka', 'architektura',
  'widokowe', 'zielone', 'nadwodne', 'spacerowe', 'kameralne',
  'gwarne', 'nocne', 'kulinarne', 'targowe', 'dla-dzieci',
  'industrialne', 'nietypowe', 'ikoniczne', 'lokalne', 'darmowe'
];

/**
 * Rodzaj z OpenStreetMap na kategorię tablicy.
 *
 * Warunek sprawdzał dotąd tylko restaurację i kawiarnię, choć zapytanie o jedzenie
 * zwraca sześć rodzajów — bar, pub, fast_food i lodziarnia lądowały wśród atrakcji.
 */
export function kategoriaZRodzaju(kind: string | null | undefined): string {
  if (!kind) return 'attraction';
  if (/^(restaurant|cafe|fast_food|ice_cream|bakery)$/.test(kind)) return 'food';
  if (/^(bar|pub|nightclub|biergarten)$/.test(kind)) return 'nightlife';
  if (/^(hotel|hostel|guest_house|apartment)$/.test(kind)) return 'hotel';
  return 'attraction';
}
