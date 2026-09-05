/**
 * Nazwy naszych miast tak, jak nazywa je Wikimedia Commons.
 *
 * PO CO TO JEST. Zapytanie do Commons budowaliśmy jako "nazwa miejsca + miasto",
 * gdzie miasto brało się z katalogu, czyli po polsku. Commons polskich egzonimów
 * nie zna, więc dokładanie ich do zapytania nie zawężało wyszukiwania — ono je
 * psuło. Zmierzone:
 *
 *   "Haags Historisch Museum haga"  -> mapy z XVI wieku i katalog biblioteczny
 *   "Haags Historisch Museum"       -> Haags Historisch Museum.jpg, pierwszy wynik
 *   "De Haagsche Kluis haga"        -> zero wyników
 *   "De Haagsche Kluis"             -> właściwe zdjęcia lokalu
 *
 * Dotyczy każdego miasta, którego polska nazwa różni się od miejscowej — a to
 * większość katalogu: Wiedeń, Lizbona, Praga, Rzym, Bruksela, Genua, Bukareszt.
 *
 * Druga rola tej listy: rozpoznanie, że plik mówi o INNYM mieście. Praski
 * "Hemingway Bar" dostawał zdjęcie pliku "Hemingway Bar in Como (Italy).jpg" —
 * plik bez geotagu, z pasującym słowem "Hemingway" w tytule. Odległość tego nie
 * odsiewa (nie ma współrzędnych), token też nie (zgadza się). Odsiewa to dopiero
 * spostrzeżenie, że "Como" i "Italy" nie są tym miastem ani tym krajem.
 */

/** Klucz to nazwa miasta z katalogu, wartości — jak pisze o nim Commons. */
const NAZWY_MIAST: Record<string, string[]> = {
  amsterdam: ['amsterdam'],
  barcelona: ['barcelona'],
  berat: ['berat'],
  berlin: ['berlin'],
  bruksela: ['brussels', 'bruxelles', 'brussel', 'bruessel'],
  budapeszt: ['budapest'],
  bukareszt: ['bucharest', 'bucuresti'],
  durres: ['durres', 'durazzo'],
  florencja: ['florence', 'firenze'],
  gdansk: ['gdansk', 'danzig'],
  genua: ['genoa', 'genova'],
  haga: ['den haag', 'the hague', 'gravenhage', 'haag'],
  krakow: ['krakow', 'cracow', 'krakau'],
  lipsk: ['leipzig'],
  lizbona: ['lisbon', 'lisboa'],
  londyn: ['london'],
  'nowy jork': ['new york', 'nyc', 'manhattan', 'brooklyn'],
  palermo: ['palermo'],
  paryz: ['paris'],
  porto: ['porto', 'oporto'],
  praga: ['prague', 'praha'],
  ryga: ['riga'],
  rzym: ['rome', 'roma'],
  stambul: ['istanbul', 'constantinople'],
  tallinn: ['tallinn', 'reval'],
  warszawa: ['warsaw', 'warszawa'],
  wieden: ['vienna', 'wien'],
  wroclaw: ['wroclaw', 'breslau'],
};

/**
 * Kraje po kodzie ISO — w formach, jakie pojawiają się w tytułach na Commons.
 * Wystarczą te, które mamy w katalogu; nieznany kod nie blokuje niczego.
 */
const NAZWY_KRAJOW: Record<string, string[]> = {
  AL: ['albania'],
  CZ: ['czech', 'czechia', 'cesko'],
  DE: ['germany', 'deutschland'],
  EE: ['estonia', 'eesti'],
  ES: ['spain', 'espana'],
  FR: ['france'],
  GB: ['united kingdom', 'england', 'britain'],
  HU: ['hungary', 'magyarorszag'],
  IT: ['italy', 'italia'],
  LV: ['latvia', 'latvija'],
  NL: ['netherlands', 'nederland', 'holland'],
  PL: ['poland', 'polska'],
  PT: ['portugal'],
  RO: ['romania'],
  TR: ['turkey', 'turkiye'],
  US: ['united states', 'usa'],
};

const bezOgonkow = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').toLowerCase();

/** Jak Commons nazywa to miasto. Nieznane miasto zwraca własną nazwę. */
export function aliasyMiasta(miasto: string | undefined): string[] {
  if (!miasto) return [];
  const klucz = bezOgonkow(miasto.trim());
  return NAZWY_MIAST[klucz] ?? [klucz];
}

/** Nazwy kraju po kodzie ISO; nieznany kod nie zawęża niczego. */
export function aliasyKraju(kod: string | undefined | null): string[] {
  if (!kod) return [];
  return NAZWY_KRAJOW[kod.trim().toUpperCase()] ?? [];
}

/**
 * Wszystkie miasta i kraje POZA tym jednym — do rozpoznania, że tytuł pliku
 * mówi o czymś w innym miejscu na świecie.
 */
export function obceNazwyGeograficzne(miasto: string | undefined, kraj: string | null | undefined): string[] {
  const nasze = new Set([...aliasyMiasta(miasto), ...aliasyKraju(kraj)]);
  const obce: string[] = [];
  for (const lista of Object.values(NAZWY_MIAST)) {
    for (const n of lista) if (!nasze.has(n)) obce.push(n);
  }
  for (const lista of Object.values(NAZWY_KRAJOW)) {
    for (const n of lista) if (!nasze.has(n)) obce.push(n);
  }
  // Miasta spoza katalogu, na ktore realnie wpadalismy przy identycznych
  // nazwach lokali. Lista rosnie o przypadki zaobserwowane, nie o zgadywanie.
  obce.push('como', 'floridita', 'havana', 'habana', 'ritz');
  return obce;
}
