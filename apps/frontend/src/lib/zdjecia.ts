/**
 * Adres miniatury Wikimedia Commons o szerokości pasującej do miejsca wyświetlenia.
 *
 * Galeria tablic pobierała 146 MB na jedno wejście: 59 zdjęć, najcięższe 17,3 MB
 * ładowane 41 sekund — w kafelkach szerokich na 324 piksele. Produkt obiecuje
 * działanie w terenie, a jedno wejście potrafiło zjeść pakiet danych.
 *
 * Poprawienie samych danych nie wystarczy, bo szerokość zależy od tego, GDZIE
 * zdjęcie się pokazuje — ten sam wpis trafia na kafelek i na stronę miejsca.
 * Dlatego przeliczamy adres przy wyświetlaniu: działa natychmiast na tym, co już
 * jest w bazie, i nie wymaga migracji.
 *
 * WIKIMEDIA PRZYJMUJE TYLKO WYBRANE SZEROKOŚCI. Adres z dowolną liczbą zwraca
 * 400 z komunikatem „Use thumbnail sizes listed on…" — sprawdzone pomiarem:
 * 320, 400, 480, 640 i 800 są odrzucane, a 120, 250, 330, 500, 960 i 1280
 * przechodzą. Prosimy więc o najbliższą dozwoloną szerokość NIE MNIEJSZĄ od
 * potrzebnej; mniejsza dałaby rozmyty obraz, a większa marnuje transfer.
 */

/** Szerokości, które Wikimedia faktycznie generuje. Zmierzone, nie z dokumentacji. */
const DOZWOLONE = [120, 250, 330, 500, 960, 1280] as const;

/** Szerokości docelowe w miejscach, gdzie pokazujemy zdjęcia. */
export const SZEROKOSC = {
  kafelek: 330,   // siatka tablic i feed odkrywania
  karta: 500,     // strona miejsca
  bohater: 1280,  // zdjęcie na pełną szerokość
} as const;

const COMMONS = /^https?:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//i;
const OBRAZ = /\.(jpe?g|png|gif|webp|tiff?)$/i;

export function miniatura(url: string | null | undefined, szerokosc: number): string {
  if (!url) return '';
  if (!COMMONS.test(url)) return url;

  const docelowa = DOZWOLONE.find((d) => d >= szerokosc) ?? DOZWOLONE[DOZWOLONE.length - 1];

  // Adres bywa z ogonem `?utm_source=…` — parametry nie należą do ścieżki pliku.
  const [sciezka, zapytanie] = url.split('?');
  const ogon = zapytanie ? `?${zapytanie}` : '';

  // Już miniatura: podmieniamy samą szerokość.
  const jakoMiniatura = sciezka.match(/^(.*\/thumb\/.*\/)(\d+)px-([^/]+)$/);
  if (jakoMiniatura) {
    return `${jakoMiniatura[1]}${docelowa}px-${jakoMiniatura[3]}${ogon}`;
  }

  // Oryginał: wstawiamy `thumb` i doczepiamy plik o żądanej szerokości.
  const jakoOryginal = sciezka.match(/^(.*\/wikipedia\/commons\/)([0-9a-f]\/[0-9a-f]{2}\/)(.+)$/i);
  if (jakoOryginal) {
    const [, baza, katalogi, plik] = jakoOryginal;
    // Commons nie przeskaluje pliku dźwiękowego ani wideo — taki adres zostawiamy
    // w spokoju zamiast podawać ścieżkę, która zwróci błąd.
    if (!OBRAZ.test(plik)) return url;
    return `${baza}thumb/${katalogi}${plik}/${docelowa}px-${plik}${ogon}`;
  }

  return url;
}
