/**
 * Przydział miejsc z tablicy do dni: według czasu, godzin otwarcia i ważności.
 *
 * Dotychczasowy podział był geograficzny (zalążki grup, potem wyrównanie po
 * liczbie miejsc i po koszcie dnia), a godziny otwarcia sprawdzał dopiero przy
 * dopasowaniu grup do dni tygodnia. Stambuł przy oknie 17:00–21:00 pokazał, co to
 * daje: Hagia Sophia, Błękitny Meczet, cysterna i Ahmed I wylądowały razem w jednym
 * dniu (360 min na 240), a „być może" Dolmabahçe dostało dzień z Bazarem Egipskim,
 * który zamyka się o 19:00 — Dolmabahçe poszło pierwsze i zjadło mu godziny. Model
 * układający dzień dostawał więc zadanie nie do wykonania i gubił to, co akurat
 * wypadło mu z kolejności, czyli najczęściej najważniejsze miejsca.
 *
 * Tu każde miejsce jest kładzione tam, gdzie da się je naprawdę odwiedzić:
 *  - najpierw „na pewno", od najważniejszych (`waznosc` z katalogu), potem „być może"
 *    w to, co zostało — „być może" nigdy nie wypiera „na pewno";
 *  - do dnia wchodzi tylko to, co mieści się razem z resztą dnia WE WŁAŚCIWEJ
 *    KOLEJNOŚCI: dzień jest układany próbnie (kolejność, dojścia, godziny otwarcia
 *    w oknie), więc Błękitny Meczet, otwarty dla zwiedzających 17:45–18:30, dostaje
 *    swoje wejście, a Hagia Sophia nie zjada mu okna;
 *  - wizytę wolno skrócić do ok. 40% (na pewno) albo 60% (być może) — to ta sama
 *    zasada co „krótsza wizyta zamiast rezygnacji" w prompcie dnia;
 *  - miejsce, które nie mieści się w żadnym dniu, wypada z powodem liczonym z danych
 *    („otwarte w oknie tylko 17:45–18:30", „okno ma 4 h, a razem potrzeba 6 h"),
 *    zamiast z ogólnikiem modelu „brak czasu".
 *
 * Geografia zostaje miękkim kryterium: miejsce idzie do dnia, w którym leży blisko
 * pozostałych, o ile tam się mieści.
 */
import { openIntervalsOn } from './opening-hours.js';

export interface KotwicaWej {
  name: string;
  priority?: 'must' | 'nice';
  lat?: number | null;
  lng?: number | null;
  opening_hours?: string | null;
  visit_minutes?: number | null;
  /** Ważność z katalogu (0–176): po niej wybieramy, co zostaje, gdy miejsca brakuje. */
  waznosc?: number | null;
}

export interface DzienWej { dateObj: Date }

export interface Odpadla<T> { p: T; powod: string }

export interface WpisSzkieletu { name: string; start: number; minuty: number }

export interface WynikPrzydzialu<T> {
  /** Miejsca każdego dnia w kolejności zwiedzania wynikającej z godzin otwarcia i dojść. */
  grupy: T[][];
  odpadle: Odpadla<T>[];
  /** Policzony szkielet dnia: kotwice z godziną startu i czasem, w podanej kolejności. */
  szkielet: WpisSzkieletu[][];
}

const DOJSCIE_MIN = 8;

const fmt = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

const maPunkt = (p: { lat?: number | null; lng?: number | null }): p is { lat: number; lng: number } =>
  typeof p.lat === 'number' && typeof p.lng === 'number';

const dojscie = (a: { lat?: number | null; lng?: number | null }, b: { lat?: number | null; lng?: number | null }): number =>
  maPunkt(a) && maPunkt(b) ? Math.max(3, Math.round(km(a, b) * 1.3 * 15)) : DOJSCIE_MIN;

/** Odcinki okna, w których miejsce jest otwarte tego dnia. Godzin nie znamy → całe okno. */
function odcinki(spec: string | null | undefined, data: Date, oknoOd: number, oknoDo: number): [number, number][] {
  const iv = openIntervalsOn(spec, data);
  if (iv === null) return [[oknoOd, oknoDo]];
  return iv
    .map((i): [number, number] => [Math.max(i.from, oknoOd), Math.min(i.to, oknoDo)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
}

interface Odc<T> {
  p: T;
  segs: [number, number][];
  /** Czas, jaki chcemy poświęcić (ograniczony do najdłuższego odcinka otwarcia). */
  d: number;
  /** Najkrótsza wizyta, którą jeszcze uznajemy za wizytę. */
  dmin: number;
}

/** Miejsce w danym dniu: null, gdy zamknięte w oknie albo otwarte za krótko na cokolwiek. */
function wDniu<T extends KotwicaWej>(p: T, data: Date, oknoOd: number, oknoDo: number): Odc<T> | null {
  const d0 = Math.max(10, Math.round(p.visit_minutes || 60));
  const okno = oknoDo - oknoOd;
  const segs = odcinki(p.opening_hours, data, oknoOd, oknoDo);
  if (!segs.length) return null;
  const najdluzszy = Math.max(...segs.map(([a, b]) => b - a));
  const dmin = Math.min(d0, Math.max(25, Math.round(d0 * (p.priority === 'must' ? 0.4 : 0.6))));
  if (najdluzszy < dmin) return null;
  const d = Math.min(d0, najdluzszy, okno);
  return { p, segs, d, dmin: Math.min(dmin, d) };
}

interface Uklad<T> {
  kolejnosc: Odc<T>[];
  starty: number[];
  minuty: number[];
  suma: number;
  koniec: number;
  dlugoscKm: number;
  /** O ile skrócono wizyty w tym dniu (1 = bez skracania, 0,75 = do trzech czwartych). */
  skala?: number;
}

/** Docelowy czas wizyty przy danej skali skracania — nigdy poniżej minimum i nigdy ponad żądany. */
const cel = <T extends KotwicaWej>(a: Odc<T>, skala: number): number =>
  Math.min(a.d, Math.max(a.dmin, Math.round(a.d * skala)));

/**
 * Najlepsza kolejność miejsc w jednym dniu albo null, gdy wszystkie się nie mieszczą.
 *
 * Wizyty skracamy RÓWNOMIERNIE, tyle, ile trzeba: próbujemy od pełnych czasów, a gdy dzień
 * się nie domyka, schodzimy co 5% aż do `minSkala`. Wcześniejsza wersja wpuszczała miejsce
 * w całości albo wcale, więc Hydropolis (180 min) wypadał z dwudniowej tablicy 13 miejsc
 * „na pewno", choć wszystkie wizyty skrócone o ćwierć dawały plan — a po skracaniu
 * pojedynczych miejsc Hagia Sophia kończyła z 72 z 180 minut.
 *
 * Przeszukanie z przycinaniem: dla kilku miejsc dziennie to ułamek milisekundy,
 * a wynik uwzględnia to, czego zachłanne „według zamknięcia" nie widzi — że warto
 * wstawić krótkie miejsce bez godzin przed wejściem otwierającym się za 45 minut.
 */
function ulozDzienProbnie<T extends KotwicaWej>(
  odc: Odc<T>[], oknoOd: number, oknoDo: number, baza: { lat: number; lng: number } | null, minSkala: number,
): Uklad<T> | null {
  if (!odc.length) return { kolejnosc: [], starty: [], minuty: [], suma: 0, koniec: oknoOd, dlugoscKm: 0, skala: 1 };
  for (let skala = 1; skala >= minSkala - 1e-9; skala -= 0.05) {
    const s = Math.round(skala * 100) / 100;
    // Dzień z wieloma krótkimi miejscami (długie okno, same małe przystanki) — przeszukiwanie
    // wszystkich kolejności rośnie silnią, więc układamy zachłannie: wcześniej zamykane pierwsze.
    const uklad = odc.length > 8 ? ulozZachlannie(odc, oknoOd, baza, s) : przeszukajKolejnosci(odc, oknoOd, baza, s);
    if (uklad) return { ...uklad, skala: s };
  }
  return null;
}

function przeszukajKolejnosci<T extends KotwicaWej>(
  odc: Odc<T>[], oknoOd: number, baza: { lat: number; lng: number } | null, skala: number,
): Uklad<T> | null {
  const n = odc.length;
  let najlepszy: Uklad<T> | null = null;
  let wezly = 0;
  const uzyte: boolean[] = new Array(n).fill(false);
  const kolejnosc: Odc<T>[] = [];
  const starty: number[] = [];
  const minuty: number[] = [];

  const lepszy = (a: Uklad<T>, b: Uklad<T> | null): boolean => {
    if (!b) return true;
    if (a.suma !== b.suma) return a.suma > b.suma;
    if (Math.abs(a.dlugoscKm - b.dlugoscKm) > 0.05) return a.dlugoscKm < b.dlugoscKm;
    return a.koniec < b.koniec;
  };

  const szukaj = (kursor: number, suma: number, poprzedni: T | null, dl: number) => {
    if (++wezly > 40000) return;
    if (kolejnosc.length === n) {
      const kandydat: Uklad<T> = {
        kolejnosc: [...kolejnosc], starty: [...starty], minuty: [...minuty],
        suma, koniec: kursor,
        dlugoscKm: dl + (baza && poprzedni && maPunkt(poprzedni) ? km(poprzedni, baza) : 0),
      };
      if (lepszy(kandydat, najlepszy)) najlepszy = kandydat;
      return;
    }
    for (let i = 0; i < n; i++) {
      if (uzyte[i]) continue;
      const a = odc[i];
      const czas = cel(a, skala);
      const chod = poprzedni
        ? dojscie(poprzedni, a.p)
        : (baza && maPunkt(a.p) ? Math.max(3, Math.round(km(baza, a.p) * 1.3 * 15)) : 0);
      const od = kursor + chod;
      let start = -1;
      for (const [sa, sb] of a.segs) {
        const s = Math.max(od, sa);
        if (s + czas <= sb) { start = s; break; }
      }
      if (start < 0) continue;
      uzyte[i] = true; kolejnosc.push(a); starty.push(start); minuty.push(czas);
      const odl = poprzedni && maPunkt(poprzedni) && maPunkt(a.p) ? km(poprzedni, a.p) : (baza && maPunkt(a.p) ? km(baza, a.p) : 0);
      szukaj(start + czas, suma + czas, a.p, dl + odl);
      uzyte[i] = false; kolejnosc.pop(); starty.pop(); minuty.pop();
    }
  };
  szukaj(oknoOd, 0, null, 0);
  // Limit węzłów przerwał przeszukiwanie, zanim cokolwiek znaleziono: nie uznajemy dnia za
  // niemożliwy tylko dlatego, że go nie przeszukaliśmy do końca.
  if (!najlepszy && wezly > 40000) return ulozZachlannie(odc, oknoOd, baza, skala);
  return najlepszy;
}

/** Zapas dla dużych dni: kolejność „kto zamyka się pierwszy", bez przeszukiwania wszystkich. */
function ulozZachlannie<T extends KotwicaWej>(
  odc: Odc<T>[], oknoOd: number, baza: { lat: number; lng: number } | null, skala: number,
): Uklad<T> | null {
  const zamkniecie = (a: Odc<T>) => Math.max(...a.segs.map(([, b]) => b));
  const kolejnosc = [...odc].sort((a, b) => zamkniecie(a) - zamkniecie(b));
  const starty: number[] = [];
  const minuty: number[] = [];
  let kursor = oknoOd;
  let poprzedni: T | null = null;
  let dl = 0;
  for (const a of kolejnosc) {
    const chod = poprzedni ? dojscie(poprzedni, a.p) : (baza && maPunkt(a.p) ? Math.max(3, Math.round(km(baza, a.p) * 1.3 * 15)) : 0);
    const od = kursor + chod;
    const czas = cel(a, skala);
    let start = -1;
    for (const [sa, sb] of a.segs) {
      const s = Math.max(od, sa);
      if (s + czas <= sb) { start = s; break; }
    }
    if (start < 0) return null;
    if (poprzedni && maPunkt(poprzedni) && maPunkt(a.p)) dl += km(poprzedni, a.p);
    starty.push(start); minuty.push(czas);
    kursor = start + czas;
    poprzedni = a.p;
  }
  return { kolejnosc, starty, minuty, suma: minuty.reduce((s, x) => s + x, 0), koniec: kursor, dlugoscKm: dl };
}

const waga = (p: KotwicaWej): number => (typeof p.waznosc === 'number' && p.waznosc > 0 ? p.waznosc : 0);

/** Powód, dla którego miejsce nie weszło do żadnego dnia — z danych, nie z domysłu. */
function powodOdpadniecia<T extends KotwicaWej>(
  p: T, dni: DzienWej[], oknoOd: number, oknoDo: number, dniaWolne: number,
): string {
  const okno = `${fmt(oknoOd)}–${fmt(oknoDo)}`;
  const d0 = Math.max(10, Math.round(p.visit_minutes || 60));
  const naDzien = dni.map((d) => odcinki(p.opening_hours, d.dateObj, oknoOd, oknoDo));
  if (naDzien.every((s) => !s.length)) {
    return `Zamknięte w godzinach okna ${okno} we wszystkie dni wyjazdu.`;
  }
  const najdluzszy = Math.max(...naDzien.map((s) => (s.length ? Math.max(...s.map(([a, b]) => b - a)) : 0)));
  const dmin = Math.min(d0, Math.max(25, Math.round(d0 * (p.priority === 'must' ? 0.4 : 0.6))));
  if (najdluzszy < dmin) {
    const spec = naDzien.flat().sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]))[0];
    return `W oknie ${okno} jest otwarte najwyżej ${spec ? `${fmt(spec[0])}–${fmt(spec[1])}` : 'chwilę'} (${najdluzszy} min), a na zwiedzanie trzeba co najmniej ${dmin} min.`;
  }
  // Otwarte tylko w części okna: powiedz, w której, bo to ona jest wąskim gardłem.
  const wszystkieOdcinki = naDzien.flat();
  const otwarteOd = Math.min(...wszystkieOdcinki.map(([a]) => a));
  const otwarteDo = Math.max(...wszystkieOdcinki.map(([, b]) => b));
  if (otwarteOd > oknoOd || otwarteDo < oknoDo) {
    return `Otwarte w oknie ${okno} tylko ${fmt(otwarteOd)}–${fmt(otwarteDo)}, a w tych godzinach każdy dzień ma już ważniejsze miejsca. Przesuń okno albo dodaj dzień.`;
  }
  return dniaWolne <= 0
    ? `Dni wyjazdu są już pełne miejsc ważniejszych od tego — okno ${okno} nie pozwala na więcej. Dodaj dzień albo wydłuż okno.`
    : `Nie mieści się w żadnym dniu razem z pozostałymi miejscami przy godzinach otwarcia w oknie ${okno}. Dodaj dzień albo wydłuż okno.`;
}

/**
 * Główny przydział. Zwraca grupy w kolejności dni wyjazdu, w każdej miejsca w policzonej
 * kolejności zwiedzania, oraz listę tych, które się nie zmieściły, z powodem.
 */
export function rozdzielKotwice<T extends KotwicaWej>(
  places: T[], dni: DzienWej[], oknoOd: number, oknoDo: number,
  baza: { lat: number; lng: number } | null,
): WynikPrzydzialu<T> {
  const n = dni.length;
  const grupyOdc: Odc<T>[][] = Array.from({ length: n }, () => []);
  const ulozone: (Uklad<T> | null)[] = Array.from({ length: n }, () => ({
    kolejnosc: [], starty: [], minuty: [], suma: 0, koniec: oknoOd, dlugoscKm: 0,
  }));
  const odpadle: Odpadla<T>[] = [];
  const okno = oknoDo - oknoOd;

  // Najpierw „na pewno" od najważniejszych, potem „być może". Remisy (brak ważności)
  // zostają w kolejności z tablicy — sort jest stabilny.
  const kolejka = [...places].sort((a, b) => {
    const am = a.priority === 'must' ? 0 : 1, bm = b.priority === 'must' ? 0 : 1;
    return am - bm || waga(b) - waga(a);
  });

  const srodek = (g: Odc<T>[]): { lat: number; lng: number } | null => {
    const pkt = g.filter((o) => maPunkt(o.p));
    if (!pkt.length) return null;
    return {
      lat: pkt.reduce((s, o) => s + (o.p.lat as number), 0) / pkt.length,
      lng: pkt.reduce((s, o) => s + (o.p.lng as number), 0) / pkt.length,
    };
  };

  for (const p of kolejka) {
    let najlepszyDzien = -1;
    let najlepszyKoszt = Infinity;
    let najlepszyUklad: Uklad<T> | null = null;
    let najlepszyOdc: Odc<T> | null = null;

    // Dwa przebiegi. Najpierw miejsce ma wejść BEZ BÓLU: dzień może skrócić wizyty co
    // najwyżej do 75% (pierwsza wersja dokładała cysternę do dnia z Hagią Sophią i zostawiała
    // jej 72 z 180 minut). Dopiero gdy nigdzie się tak nie mieści, „na pewno" może wejść kosztem
    // skrócenia wizyt w dniu do 55%; „być może" wtedy po prostu odpada.
    for (const minSkala of (p.priority === 'must' ? [0.75, 0.55] : [0.75])) {
      for (let i = 0; i < n; i++) {
        const odc = wDniu(p, dni[i].dateObj, oknoOd, oknoDo);
        if (!odc) continue;
        // Dla każdego dnia odcinki liczymy od nowa: to samo miejsce ma w poniedziałek inne godziny niż w piątek.
        const probny = [...grupyOdc[i].map((o) => wDniu(o.p, dni[i].dateObj, oknoOd, oknoDo) ?? o), odc];
        const uklad = ulozDzienProbnie(probny, oknoOd, oknoDo, baza, minSkala);
        if (!uklad) continue;
        const cel = srodek(grupyOdc[i]);
        const odleglosc = cel && maPunkt(p) ? km(cel, p) : (grupyOdc[i].length ? 0 : 1.5);
        // Bliskość liczy się wprost, zapełnienie dnia łagodnie: bez tego wszystko z zwartej
        // starówki lądowałoby w pierwszym dniu, a ostatni zostawał pusty.
        const koszt = odleglosc + 3 * (uklad.suma / okno);
        if (koszt < najlepszyKoszt) {
          najlepszyKoszt = koszt; najlepszyDzien = i; najlepszyUklad = uklad; najlepszyOdc = odc;
        }
      }
      if (najlepszyDzien >= 0) break;
    }

    if (najlepszyDzien < 0 || !najlepszyUklad || !najlepszyOdc) {
      const wolne = ulozone.reduce((s, u) => s + Math.max(0, okno - (u?.suma ?? 0)), 0);
      odpadle.push({ p, powod: powodOdpadniecia(p, dni, oknoOd, oknoDo, wolne) });
      continue;
    }
    grupyOdc[najlepszyDzien] = najlepszyUklad.kolejnosc;
    ulozone[najlepszyDzien] = najlepszyUklad;
    void najlepszyOdc;
  }

  return {
    grupy: grupyOdc.map((g) => g.map((o) => o.p)),
    odpadle,
    szkielet: ulozone.map((u) => (u ? u.kolejnosc.map((o, i) => ({ name: o.p.name, start: u.starty[i], minuty: u.minuty[i] })) : [])),
  };
}

/** Szkielet dnia jako tekst do promptu: godzina startu, czas i — gdy ograniczone — okno otwarcia. */
export function opisSzkieletu(s: WpisSzkieletu[]): string {
  return s.map((w) => `- ${fmt(w.start)} ${w.name} (${w.minuty} min)`).join('\n');
}
