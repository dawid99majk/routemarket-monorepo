import { kmBetween, medianOf } from '@/components/tripProjects/helpers';

/**
 * Bilans tablicy — co agent ma do powiedzenia o tym, co już zebrałeś.
 *
 * CZYSTA ARYTMETYKA, ZERO MODELU. Wszystkie te pytania da się rozstrzygnąć
 * liczbami, które i tak mamy: współrzędne, minuty wizyt, kategorie i okno
 * czasowe wyjazdu. Wołanie Gemini po to, żeby policzył sumę i porównał ją
 * z iloczynem, kosztowałoby sekundy oczekiwania i grosze przy każdym kliknięciu
 * na tablicy, a wynik byłby mniej pewny niż tutaj.
 *
 * MÓWIMY JEDNĄ RZECZ, NIE PIĘCIU. Lista uwag pod kartami to szum, który człowiek
 * przestaje czytać po trzecim wejściu. Uwagi są więc uszeregowane i wygrywa
 * pierwsza, która ma pokrycie w danych — od tej, która najbardziej boli.
 *
 * KOLEJNOŚĆ WAŻNOŚCI I DLACZEGO TAKA:
 *   1. przeładowanie   — plan, którego nie da się przejść, psuje cały wyjazd
 *   2. rozrzut         — jeden punkt na uboczu zjada pół dnia na dojazd
 *   3. brak posiłku    — zmierzone: na 476 miejsc na tablicach tylko 4 to jedzenie
 *   4. za mało kotwic  — agent nie ma z czego układać
 *   5. gotowe          — można klikać „Ułóż plan"
 */

export type RodzajUwagi = 'przeladowane' | 'rozrzut' | 'brak_jedzenia' | 'za_malo' | 'gotowe';

export interface Uwaga {
  rodzaj: RodzajUwagi;
  /** Zdanie do pokazania. Bez wykrzykników, z liczbą tam, gdzie liczba istnieje. */
  tekst: string;
}

export interface MiejsceBilansu {
  lat?: number | null;
  lng?: number | null;
  category?: string | null;
  visit_minutes?: number | null;
  priority?: string | null;
}

export interface WejscieBilansu {
  /** Miejsca BEZ odrzuconych — odrzucone nie zajmują dnia. */
  aktywne: MiejsceBilansu[];
  pewnych: number;
  doRozwazenia: number;
  dni?: number | null;
  /** Minuty zajęte razem z przejściami; null, gdy wyjazd nie ma jeszcze ram czasowych. */
  zajeteMinut?: number | null;
  /** Ile minut przewiduje okno wyjazdu po uwzględnieniu suwaka wypełnienia. */
  planowaneMinut?: number | null;
}

/** Ile kilometrów od środka ciężkości uznajemy za „na uboczu". */
const PROG_ODDALENIA_KM = 12;
/** Poniżej tylu punktów z współrzędnymi rozrzut nic nie znaczy. */
const MIN_PUNKTOW_DO_ROZRZUTU = 4;
/** Powyżej tego stosunku zajętego do planowanego mówimy o przeładowaniu. */
const PROG_PRZELADOWANIA = 1.05;

/** Kategorie, które liczą się jako posiłek. Katalog i agent nazywają je różnie. */
const JEDZENIE = /^(food|restaurant|cafe|bakery|fast_food|ice_cream|bar|pub|jedzenie|restauracja|kawiarnia)$/i;

const godziny = (minut: number) => (minut / 60).toFixed(1).replace('.', ',');

/**
 * Miejsca leżące dalej niż `PROG_ODDALENIA_KM` od mediany pozostałych.
 * Mediana, a nie średnia, bo jeden punkt na uboczu przeciąga średnią w swoją
 * stronę i sam przestaje wyglądać na odstający.
 */
export function odstajace(aktywne: MiejsceBilansu[]): MiejsceBilansu[] {
  const zeWspolrzednymi = aktywne.filter((p) => p.lat != null && p.lng != null);
  if (zeWspolrzednymi.length < MIN_PUNKTOW_DO_ROZRZUTU) return [];
  const cLat = medianOf(zeWspolrzednymi.map((p) => p.lat as number));
  const cLng = medianOf(zeWspolrzednymi.map((p) => p.lng as number));
  return zeWspolrzednymi.filter(
    (p) => kmBetween(p.lat as number, p.lng as number, cLat, cLng) > PROG_ODDALENIA_KM,
  );
}

export function maPosilek(aktywne: MiejsceBilansu[]): boolean {
  return aktywne.some((p) => JEDZENIE.test(String(p.category ?? '').trim()));
}

/**
 * Jedna uwaga o tablicy albo `null`, gdy nie ma jeszcze o czym mówić
 * (pusta tablica nie potrzebuje komentarza, tylko miejsc).
 */
export function bilansTablicy(w: WejscieBilansu): Uwaga | null {
  const { aktywne, pewnych, doRozwazenia, dni, zajeteMinut, planowaneMinut } = w;
  if (aktywne.length === 0) return null;

  // 1. Przeładowanie. Liczby podajemy obie, bo „za dużo" bez punktu odniesienia
  //    nie mówi, o ile za dużo.
  if (zajeteMinut != null && planowaneMinut != null && planowaneMinut > 0
      && zajeteMinut > planowaneMinut * PROG_PRZELADOWANIA) {
    const nadmiar = zajeteMinut - planowaneMinut;
    return {
      rodzaj: 'przeladowane',
      tekst: `Zebrane miejsca zajmą około ${godziny(zajeteMinut)} h, a okno wyjazdu przewiduje `
        + `${godziny(planowaneMinut)} h — to ${godziny(nadmiar)} h za dużo. `
        + `Ułożę z tego plan, ale część punktów będzie musiała wypaść.`,
    };
  }

  // 2. Rozrzut. Dojazd na drugi koniec miasta zjada dzień skuteczniej niż
  //    dołożenie dwóch punktów w centrum.
  const daleko = odstajace(aktywne);
  if (daleko.length > 0) {
    return {
      rodzaj: 'rozrzut',
      tekst: daleko.length === 1
        ? `Jedno miejsce leży ponad ${PROG_ODDALENIA_KM} km od reszty — dojazd tam zajmie `
          + `sporą część dnia. Zaplanuję to, ale warto wiedzieć zawczasu.`
        : `${daleko.length} miejsca leżą ponad ${PROG_ODDALENIA_KM} km od reszty — same dojazdy `
          + `zjedzą wtedy dużą część dnia.`,
    };
  }

  // 3. Posiłek. Zmierzone na żywych tablicach: na 476 zebranych miejsc tylko
  //    cztery były jedzeniem. Ludzie zbierają atrakcje i zapominają, że dzień
  //    trzeba czymś przerwać.
  if (!maPosilek(aktywne) && aktywne.length >= 3) {
    return {
      rodzaj: 'brak_jedzenia',
      tekst: 'Na tablicy nie ma ani jednego miejsca na posiłek. Dobiorę coś po drodze '
        + 'przy układaniu planu, ale jeśli masz swoje miejsce — dorzuć je teraz.',
    };
  }

  // 4. Za mało kotwic. Dwa punkty na dzień to minimum, z którego da się ułożyć
  //    coś więcej niż listę.
  const zebrane = pewnych + doRozwazenia;
  const potrzeba = dni ? dni * 2 : 3;
  if (zebrane < potrzeba) {
    return {
      rodzaj: 'za_malo',
      tekst: `Do planu na ${dni ?? 1} ${dni === 1 || !dni ? 'dzień' : 'dni'} przyda się jeszcze `
        + `${potrzeba - zebrane} ${potrzeba - zebrane === 1 ? 'miejsce' : 'miejsca'} — `
        + `z tylu punktów ułożę trasę, która ma sens.`,
    };
  }

  return {
    rodzaj: 'gotowe',
    tekst: 'To zbalansowana baza kotwic — kliknij „Ułóż plan”, a ułożę je w realną trasę '
      + 'z dojściami i posiłkami.',
  };
}
