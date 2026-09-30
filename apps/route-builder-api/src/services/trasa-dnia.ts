/**
 * Trasa dnia planu — to, co dotąd robił osobny kreator (Atlas), liczone wprost
 * z zapisanego planu.
 *
 * Kreator dostawał od przeglądarki gotową listę punktów, zakładał osobny projekt
 * i żył dalej bez związku z planem. Tu punkty bierzemy z planu po stronie serwera:
 * klient mówi tylko, który dzień i którędy po drodze, więc nie da się wyznaczyć za
 * darmo trasy przez dowolne punkty, podszywając się pod przeliczenie opłaconego dnia.
 *
 * Reguły rozpoznawania noclegu i przystanków są tymi samymi co w froncie
 * (`tripProjects/helpers.ts`: czyPrzystanek, czyBaza, punktyDnia) — mapa dnia
 * i przebieg muszą iść przez te same punkty.
 */

export interface PunktTrasy { name: string; lat: number; lng: number; via?: boolean }

const POZYCJA_ORGANIZACYJNA =
  /^(przejazd|przej[śs]cie|przerwa|czas wolny|wolny czas|powr[óo]t|dojazd|transfer|lunch|obiad|kolacja|śniadanie|odpoczynek|spacer(\s|$)|nocleg)/i;

const kluczNazwy = (s: unknown): string =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

function czyPrzystanek(it: any): boolean {
  if (['walk', 'transit', 'break', 'meal'].includes(it?.kind)) return false;
  return !POZYCJA_ORGANIZACYJNA.test(String(it?.name || '').trim());
}

function czyBaza(it: any, nazwaBazy: string): boolean {
  if (it?.baza === true) return true;
  if (it?.kind === 'walk' || !czyPrzystanek(it)) return false;
  const nazwa = kluczNazwy(it?.name);
  if (nazwaBazy && (nazwa === nazwaBazy || (nazwaBazy.length >= 4 && nazwa.includes(nazwaBazy)))) return true;
  return it?.kind === 'hotel' && !nazwaBazy;
}

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/** Punkty dnia w kolejności planu: nocleg z ustawień wyjazdu, przystanki, bez przejść. */
export function punktyDnia(
  items: any[],
  baza: { name?: string | null; lat?: number | null; lng?: number | null } | null,
): PunktTrasy[] {
  const nazwaBazy = kluczNazwy(baza?.name);
  const maBaza = baza?.lat != null && baza?.lng != null;
  const punkty: PunktTrasy[] = [];
  for (const it of items || []) {
    if (czyBaza(it, nazwaBazy)) {
      const lat = maBaza ? baza!.lat! : (it.approx ? null : it.lat);
      const lng = maBaza ? baza!.lng! : (it.approx ? null : it.lng);
      if (lat != null && lng != null) punkty.push({ name: baza?.name || it.name, lat, lng });
      continue;
    }
    if (!czyPrzystanek(it) || typeof it.lat !== 'number' || typeof it.lng !== 'number') continue;
    punkty.push({ name: it.name, lat: it.lat, lng: it.lng });
  }
  // Dzień wychodzi z noclegu i do niego wraca, także w planach, w których model
  // go pominął — inaczej odcinek i plik GPX zaczynały się przy pierwszej atrakcji
  // i start wypadał każdego dnia gdzie indziej. Dotyczy też planów zapisanych
  // wcześniej, bez układania ich od nowa.
  if (maBaza && punkty.length > 0) {
    const b = { name: baza!.name || punkty[0].name, lat: baza!.lat!, lng: baza!.lng! };
    if (km(punkty[0], b) > 0.01) punkty.unshift({ ...b });
    if (km(punkty[punkty.length - 1], b) > 0.01) punkty.push({ ...b });
  }
  // Koniec jednego odcinka i początek następnego w tym samym miejscu to jeden punkt.
  return punkty.filter((p, i) => i === 0 || km(p, punkty[i - 1]) > 0.01);
}

/**
 * Punkty „po drodze" dodane na mapie — np. bulwar, którym chce się iść, zamiast
 * najkrótszej ulicy. Każdy trafia tam, gdzie dokłada najmniej drogi. Nie trzymamy
 * przy nim numeru odcinka: po przeniesieniu przystanku numer by się zdezaktualizował,
 * a położenie zostaje prawdziwe.
 */
export function wstawPoDrodze(punkty: PunktTrasy[], via: { lat: number; lng: number }[]): PunktTrasy[] {
  const wynik = [...punkty];
  for (const v of via) {
    if (!Number.isFinite(v?.lat) || !Number.isFinite(v?.lng) || wynik.length < 2) continue;
    let gdzie = 1;
    let najmniej = Infinity;
    for (let i = 1; i < wynik.length; i++) {
      const koszt = km(wynik[i - 1], v) + km(v, wynik[i]) - km(wynik[i - 1], wynik[i]);
      if (koszt < najmniej) { najmniej = koszt; gdzie = i; }
    }
    wynik.splice(gdzie, 0, { name: 'Po drodze', lat: v.lat, lng: v.lng, via: true });
  }
  return wynik;
}

/**
 * Suma podejść w metrach. Wysokości z modelu terenu drgają o metr–dwa między
 * sąsiednimi punktami, więc liczymy dopiero zmiany większe niż próg — inaczej
 * płaski bulwar dostawałby sto metrów „podejścia" z samego szumu.
 */
export function podejscie(slad: [number, number, number?][], prog = 3): number {
  let suma = 0;
  let odniesienie: number | null = null;
  for (const p of slad) {
    const h = p[2];
    if (typeof h !== 'number' || !Number.isFinite(h) || h === 0) continue;
    if (odniesienie == null) { odniesienie = h; continue; }
    const roznica = h - odniesienie;
    if (roznica > prog) { suma += roznica; odniesienie = h; }
    else if (roznica < -prog) { odniesienie = h; }
  }
  return Math.round(suma);
}

/**
 * Profil routingu trasy dnia: spacer chodnikami (GraphHopper foot). Rower został
 * wycofany na razie — profil `trekking` BRoutera (`bicycle` w routing.ts) wróci
 * razem z wyborem trybu w interfejsie.
 */
export const PROFIL_TRASY = 'city_walk';
