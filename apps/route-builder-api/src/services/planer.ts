/**
 * Planer wyjazdu układany dzień po dniu.
 *
 * Poprzedni planer prosił model o cały wyjazd jednym wywołaniem. Działało, ale
 * z pomiarów z trzydziestu dni wychodziło średnio 43 s, a w ogonie 112 s — i przez
 * cały ten czas użytkownik patrzył w licznik sekund, nie mając pojęcia, czy coś
 * się dzieje. To najdroższy moment produktu: człowiek już wybrał miejsca, już
 * chce zobaczyć wynik i właśnie wtedy dostaje najdłuższe czekanie.
 *
 * Jeden wielki prompt miał też drugą wadę: przy kilkunastu miejscach i czterech
 * dniach odpowiedź potrafiła się uciąć w połowie JSON-a, bo budżet wyjściowy
 * dzielił się między rozumowanie a treść.
 *
 * Tutaj każdy dzień powstaje osobnym, krótszym wywołaniem, a dni lecą równolegle.
 * Czas oczekiwania przestaje rosnąć z długością wyjazdu — czteroddniowy plan trwa
 * tyle, co najwolniejszy z czterech dni, a nie tyle, co ich suma. Pierwszy dzień
 * może pokazać się na ekranie, zanim pozostałe w ogóle się policzą.
 *
 * Cena tego podziału jest realna i warto ją nazwać: model nie widzi już całego
 * wyjazdu naraz, więc nie może samodzielnie przerzucić miejsca z dnia na dzień.
 * Dlatego przydział miejsc do dni przestaje być podpowiedzią, a staje się decyzją
 * podjętą tutaj — z geometrii i z godzin otwarcia, czyli z danych, które i tak
 * liczymy dokładniej niż model.
 */
import { callGeminiTracked } from './ai-usage.js';
import { geocodingService } from './geocoding.js';
import { poiService, type PoiCandidate } from './poi.js';
import { describeAvailability, isOpenDuring } from './opening-hours.js';
import { instrukcjaJezyka, type KodJezyka } from './jezyki.js';

export interface MiejsceWejscie {
  name: string;
  category?: string;
  priority?: 'must' | 'nice';
  lat?: number | null;
  lng?: number | null;
  opening_hours?: string | null;
  visit_minutes?: number | null;
  description?: string | null;
}

export interface ZadaniePlanu {
  destination: string;
  days: number;
  window: { start: string; end: string };
  start_date?: string;
  hotel?: { name: string; lat?: number; lng?: number } | null;
  fill_percent?: number;
  fixed?: { time: string; label: string; minutes?: number }[];
  places: MiejsceWejscie[];
  creator_preferences?: Record<string, number>;
}

export interface PozycjaDnia {
  time: string; name: string; kind?: string; minutes?: number;
  note?: string; source?: 'pinned' | 'suggested';
  lat?: number; lng?: number; approx?: boolean;
  /** Pozycja w noclegu (start lub koniec dnia) — punkt z ustawień wyjazdu, nie z modelu. */
  baza?: boolean;
}

export interface DzienPlanu {
  day: number;
  date?: string;
  weekday?: string;
  summary?: string;
  items: PozycjaDnia[];
  not_scheduled?: { name: string; reason?: string }[];
  warnings?: string[];
}

/**
 * Preferencje jako zdania, nie liczby. Model dostawał w planerze surowe
 * "pace=100, effort=15" i musiał zgadywać, co znaczy każdy klucz i w którą stronę
 * rośnie — a kierunki są nieoczywiste: wysokie effort znaczy "chętnie podejdę pod
 * górę", nie "unikam wysiłku". Wyszukiwanie miało to opisane po ludzku od początku,
 * planer nie; teraz oba korzystają z jednego źródła.
 *
 * Osie w okolicach środka pomijamy: brak zdania to nie jest wskazówka.
 */
export function opiszPreferencje(prefs: Record<string, number> | null | undefined): string[] {
  if (!prefs) return [];
  const OSIE: Record<string, { gora: string; dol: string }> = {
    pace: {
      gora: 'Woli mniej miejsc, ale spędzić w każdym więcej czasu.',
      dol: 'Woli zobaczyć więcej miejsc, nawet krócej w każdym.',
    },
    popularity: {
      gora: 'Woli miejsca niszowe i nieoczywiste niż największe ikony.',
      dol: 'Chce przede wszystkim klasyków i miejsc must-see.',
    },
    wandering: {
      gora: 'Lubi błądzenie po okolicy — zostaw luz między punktami.',
      dol: 'Woli trasę konkretną, od punktu do punktu, bez nadkładania drogi.',
    },
    dining: {
      gora: 'W jedzeniu preferuje lokalny street food i tanie, autentyczne miejsca.',
      dol: 'W jedzeniu preferuje eleganckie restauracje i kawiarnie z górnej półki.',
    },
    effort: {
      gora: 'Podejścia, schody i wzniesienia są mile widziane.',
      dol: 'Unikaj długiego chodzenia, stromych podejść i schodów.',
    },
    crowds: {
      gora: 'Unika tłumów — doceni miejsca mniej oblegane.',
      dol: 'Tłumy nie przeszkadzają — popularne miejsca są w porządku.',
    },
  };

  const out: string[] = [];
  for (const [klucz, opis] of Object.entries(OSIE)) {
    const v = prefs[klucz];
    if (v == null) continue;
    if (v > 60) out.push(opis.gora);
    else if (v < 40) out.push(opis.dol);
  }
  return out;
}

/**
 * Podział miejsc na dni po położeniu. Model potrafi napisać, że grupuje punkty
 * blisko siebie, ale geometrii nie liczy — i wychodziły dni skaczące przez całe
 * miasto. Prościej policzyć to tutaj.
 *
 * Algorytm: k najdalszych od siebie zalążków, potem przypisanie każdego miejsca
 * do najbliższego z nich. Bez iteracji — przy kilkunastu punktach i 2-4 dniach
 * wynik jest stabilny.
 */
export function clusterPlacesByProximity<T extends { name: string; lat?: number | null; lng?: number | null }>(
  places: T[],
  groups: number
): T[][] {
  const located = places.filter((p) => p.lat != null && p.lng != null);
  if (groups <= 1 || located.length <= groups) return [places];

  const km = (a: any, b: any) => {
    const dLat = (a.lat - b.lat) * 111;
    const dLng = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
    return Math.sqrt(dLat * dLat + dLng * dLng);
  };

  const seeds: T[] = [located[0]];
  while (seeds.length < groups) {
    let best: T | null = null;
    let bestDist = -1;
    for (const p of located) {
      if (seeds.includes(p)) continue;
      const nearest = Math.min(...seeds.map((sd) => km(p, sd)));
      if (nearest > bestDist) { bestDist = nearest; best = p; }
    }
    if (!best) break;
    seeds.push(best);
  }

  const buckets: T[][] = seeds.map(() => []);
  for (const p of located) {
    let idx = 0;
    let bestDist = Infinity;
    seeds.forEach((sd, i) => {
      const d = km(p, sd);
      if (d < bestDist) { bestDist = d; idx = i; }
    });
    buckets[idx].push(p);
  }
  // Miejsca bez współrzędnych trafiają do najliczniejszej grupy — nie mamy czym
  // ich przypisać, a gubienie ich po cichu byłoby gorsze.
  const unlocated = places.filter((p) => p.lat == null || p.lng == null);
  if (unlocated.length) {
    const biggest = buckets.reduce((a, b) => (b.length > a.length ? b : a), buckets[0]);
    biggest.push(...unlocated);
  }

  wyrownajGrupy(buckets, km);
  return buckets.filter((b) => b.length > 0);
}

/**
 * Wyrównanie liczebności grup po podziale geograficznym.
 *
 * Sam podział po odległości wystarcza w mieście rozciągniętym, ale w zwartej
 * starówce wszystkie punkty leżą bliżej jednego zalążka i wychodzi podział
 * w rodzaju trzynaście do jednego. Dzień z trzynastoma kotwicami zgłasza potem
 * dziewięć jako niemieszczące się, a dzień z jedną wypełnia się propozycjami
 * agenta — użytkownik dostaje plan, w którym większość jego wyborów wypadła.
 *
 * Przesuwamy najmniej pasujące punkty: z grupy przeładowanej ten najdalszy od
 * jej środka ciężkości, do grupy, której jest bliżej. Geometria zostaje
 * kryterium, tylko przestaje być jedynym.
 */
function wyrownajGrupy<T extends { lat?: number | null; lng?: number | null }>(
  grupy: T[][],
  km: (a: any, b: any) => number
): void {
  const wszystkich = grupy.reduce((s, g) => s + g.length, 0);
  const gorny = Math.ceil(wszystkich / grupy.length);
  const srodek = (g: T[]) => {
    const zPunktem = g.filter((p) => p.lat != null && p.lng != null);
    if (!zPunktem.length) return null;
    return {
      lat: zPunktem.reduce((s, p) => s + (p.lat as number), 0) / zPunktem.length,
      lng: zPunktem.reduce((s, p) => s + (p.lng as number), 0) / zPunktem.length,
    };
  };

  // Kilka przebiegów wystarcza; pętla bez limitu mogłaby się zapętlić przy
  // punktach równoodległych, a to jest dobieranie kolejności, nie optymalizacja.
  for (let runda = 0; runda < wszystkich; runda++) {
    const zaDuza = grupy.findIndex((g) => g.length > gorny);
    if (zaDuza === -1) break;
    const zaMala = grupy.findIndex((g) => g.length < gorny);
    if (zaMala === -1) break;

    const s = srodek(grupy[zaDuza]);
    const kandydaci = grupy[zaDuza].filter((p) => p.lat != null && p.lng != null);
    if (!s || !kandydaci.length) break;

    // Najdalszy od środka własnej grupy — jego przynależność jest najsłabsza.
    let najdalszy = kandydaci[0];
    let dystans = -1;
    for (const p of kandydaci) {
      const d = km(p, s);
      if (d > dystans) { dystans = d; najdalszy = p; }
    }
    grupy[zaDuza].splice(grupy[zaDuza].indexOf(najdalszy), 1);
    grupy[zaMala].push(najdalszy);
  }
}

interface InfoDnia { index: number; date: string; weekday: string; dateObj: Date }

export interface KontekstPlanu {
  zadanie: ZadaniePlanu;
  klucz: string;
  userId: string | null;
  jezyk: KodJezyka;
  dni: InfoDnia[];
  /** Miejsca przypisane do konkretnego dnia (indeks 0 = dzień 1). */
  grupy: MiejsceWejscie[][];
  minutNaDzien: number;
  fillPercent: number;
  prefLines: string;
  /** Surowe kandydaty, nie gotowy tekst: każdy dzień dostaje własny wycinek. */
  zabytki: PoiCandidate[];
  lokale: PoiCandidate[];
  /** Wycinki ROZŁĄCZNE — dzień N nie zobaczy niczego, co dostał dzień M. */
  zabytkiDnia: PoiCandidate[][];
  lokaleDnia: PoiCandidate[][];
  /** Pula ze współrzędnymi do rozwiązywania pozycji planu. */
  pulaWspolrzednych: { name: string; lat: any; lng: any }[];
  center: { lat: number; lng: number } | null;
  /** Punkt startowy wyjazdu ze współrzędnymi — nocleg, z którego wychodzi każdy dzień. */
  baza: { name: string; lat: number; lng: number } | null;
}

/**
 * Jak daleko od miejsc danego dnia wolno szukać propozycji.
 *
 * Pula POI przychodzi z kwadratu ±8 km od środka miasta, a to dla Hagi obejmuje
 * rynek w Delft. Dzień z kotwicami przy Binnenhofie dostał więc „Nieuwe Kerk"
 * i „Oude Kerk" z Delft, a model wstawił je z trzydziestominutowym przejściem na
 * dystansie ośmiu kilometrów. Dwa i pół kilometra to kwadrans do pół godziny
 * spaceru — wciąż okolica dnia. Szerszy promień jest zapasem dla miejsc, gdzie
 * w najbliższym otoczeniu nie ma z czego wybierać.
 */
const PROMIEN_PROPOZYCJI_KM = 2.5;
const PROMIEN_ZAPASOWY_KM = 4;
const MIN_PROPOZYCJI = 5;

/**
 * Czy wizyta zmieści się gdziekolwiek w oknie dnia.
 *
 * Poprzednio pytaliśmy, czy miejsce jest otwarte przez cały czas wizyty licząc
 * od pierwszej minuty dnia — a to zupełnie inne pytanie. Muzeum otwierane
 * o 10:00 przy dniu zaczynającym się o 9:00 „nie mieściło się", choć mieściło
 * się doskonale, tylko później.
 *
 * Skanujemy co kwadrans, bo o tyle mniej więcej przesuwa się realny plan dnia.
 * Zwracamy null, gdy godzin nie da się odczytać — brak wiedzy to nie to samo
 * co zamknięte i nie może kończyć się wyrzuceniem miejsca.
 */
function mieciSieWOknie(
  godziny: string | null | undefined,
  dzien: Date,
  oknoOd: number,
  oknoDo: number,
  minuty: number
): boolean | null {
  if (!godziny) return null;
  const trwa = Math.max(1, Math.min(minuty, oknoDo - oknoOd));
  let bylNull = false;
  for (let start = oknoOd; start + trwa <= oknoDo; start += 15) {
    const wynik = isOpenDuring(godziny, dzien, start, trwa);
    if (wynik === true) return true;
    if (wynik === null) bylNull = true;
  }
  return bylNull ? null : false;
}

const czasNaMinuty = (t: string): number => {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

/**
 * Przydział grup geograficznych do konkretnych dni.
 *
 * Grupa 1 nie musi wypaść dnia pierwszego. Jeśli w skupisku siedzi muzeum
 * zamknięte w poniedziałek, a wyjazd zaczyna się w poniedziałek, to lepiej
 * zacząć od innego skupiska niż wpisywać do planu wizytę pod zamkniętymi
 * drzwiami. Przy wyjeździe do sześciu dni sprawdzamy wszystkie permutacje —
 * to najwyżej 720 kombinacji, każda licząca kilka porównań, więc taniej niż
 * jedno wywołanie modelu. Dłuższe wyjazdy zostawiamy w kolejności naturalnej,
 * bo koszt rośnie silnią, a zysk maleje.
 */
function przydzielGrupyDoDni(grupy: MiejsceWejscie[][], dni: InfoDnia[], oknoOd: number, minutNaDzien: number): MiejsceWejscie[][] {
  const n = dni.length;
  if (grupy.length <= 1 || n <= 1) {
    const wynik: MiejsceWejscie[][] = Array.from({ length: n }, () => []);
    grupy.forEach((g, i) => { if (i < n) wynik[i] = g; });
    return wynik;
  }

  // Ile miejsc "koniecznych" z danej grupy da się faktycznie zobaczyć danego dnia.
  const ocena = (grupa: MiejsceWejscie[], dzien: InfoDnia): number => {
    let punkty = 0;
    for (const p of grupa) {
      const minuty = Math.min(p.visit_minutes || 60, minutNaDzien);
      const otwarte = mieciSieWOknie(p.opening_hours, dzien.dateObj, oknoOd, oknoOd + minutNaDzien, minuty);
      if (otwarte === false) punkty -= p.priority === 'must' ? 3 : 1;
      else if (otwarte === true) punkty += p.priority === 'must' ? 2 : 1;
    }
    return punkty;
  };

  const wypelnione = [...grupy];
  while (wypelnione.length < n) wypelnione.push([]);
  const doRozdania = wypelnione.slice(0, n);

  if (n > 6) {
    return doRozdania;
  }

  let najlepszy: number[] | null = null;
  let najlepszaOcena = -Infinity;
  const permutacje = (reszta: number[], biezaca: number[]) => {
    if (!reszta.length) {
      const suma = biezaca.reduce((s, gi, di) => s + ocena(doRozdania[gi], dni[di]), 0);
      if (suma > najlepszaOcena) { najlepszaOcena = suma; najlepszy = [...biezaca]; }
      return;
    }
    for (let i = 0; i < reszta.length; i++) {
      permutacje([...reszta.slice(0, i), ...reszta.slice(i + 1)], [...biezaca, reszta[i]]);
    }
  };
  permutacje(doRozdania.map((_, i) => i), []);

  return (najlepszy ?? doRozdania.map((_, i) => i)).map((gi) => doRozdania[gi]);
}

/**
 * Wszystko, co jest wspólne dla wszystkich dni, liczymy raz: geokodowanie miasta,
 * pulę POI z Overpassa, opisy preferencji i przydział miejsc do dni. To ta część,
 * która wcześniej i tak wykonywała się raz — dzielenie jej na dni oznaczałoby
 * kilkukrotne odpytywanie Overpassa o to samo miasto.
 */
export async function przygotujKontekst(
  zadanieWejscie: ZadaniePlanu,
  userId: string | null,
  jezyk: KodJezyka = 'pl'
): Promise<KontekstPlanu> {
  // Odrzucone z tablicy nie są kotwicami — dotąd szły do planu jako "jeśli wyjdzie",
  // bo planer znał tylko dwa priorytety, a front wysyłał wszystkie przypięte.
  const zadanie: ZadaniePlanu = {
    ...zadanieWejscie,
    places: scalDuplikaty(zadanieWejscie.places.filter((p) => (p.priority as string) !== 'rejected')),
  };
  const oknoOd = czasNaMinuty(zadanie.window.start);
  const oknoDo = czasNaMinuty(zadanie.window.end);
  const minutNaDzien = Math.max(0, oknoDo - oknoOd);
  const ileDni = Math.max(1, zadanie.days || 1);

  const bazowaData = zadanie.start_date ? new Date(`${zadanie.start_date}T12:00:00`) : new Date();
  const nazwyDni = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
  const dni: InfoDnia[] = Array.from({ length: ileDni }, (_, i) => {
    const date = new Date(bazowaData);
    date.setDate(date.getDate() + i);
    return {
      index: i + 1,
      date: date.toISOString().slice(0, 10),
      weekday: nazwyDni[date.getDay()],
      dateObj: date,
    };
  });

  const suroweGrupy = ileDni > 1
    ? clusterPlacesByProximity(zadanie.places, ileDni)
    : [zadanie.places];
  const grupy = przydzielGrupyDoDni(suroweGrupy, dni, oknoOd, minutNaDzien);

  let fillerSights: PoiCandidate[] = [];
  let fillerFood: PoiCandidate[] = [];
  let center: { lat: number; lng: number } | null = null;
  let fillerPois: PoiCandidate[] = [];
  try {
    center = await geocodingService.geocodeSettlement(zadanie.destination);
    const [sights, food] = await Promise.all([
      poiService.fetchCandidates({ lat: center.lat, lng: center.lng }, 'city_walk', { limit: 40 }),
      poiService.fetchCandidates({ lat: center.lat, lng: center.lng }, 'food', { limit: 15 }).catch(() => []),
    ]);
    const przypiete = new Set(zadanie.places.map((p) => p.name.toLowerCase()));
    const nieprzypiete = (c: any) => !przypiete.has(c.name.toLowerCase());
    fillerSights = sights.filter(nieprzypiete);
    fillerFood = (food as PoiCandidate[]).filter(nieprzypiete);
    fillerPois = [...fillerSights, ...fillerFood];
  } catch (err: any) {
    console.warn('[planer] Pula POI niedostępna:', err.message);
  }

  const pulaWspolrzednych = [
    ...zadanie.places.map((pl) => ({ name: pl.name, lat: pl.lat, lng: pl.lng })),
    ...fillerPois.map((f) => ({ name: f.name, lat: f.lat, lng: f.lng })),
  ].filter((x) => x.lat != null && x.lng != null);

  const prefOpisy = opiszPreferencje(zadanie.creator_preferences);

  const h = zadanie.hotel;
  const baza = h?.name && Number.isFinite(h.lat) && Number.isFinite(h.lng)
    ? { name: h.name, lat: h.lat as number, lng: h.lng as number }
    : null;
  // Dzień bez własnych kotwic mierzy okolicę od noclegu, a gdy go nie ma — od środka miasta.
  const zapas = baza ?? center;

  return {
    zadanie,
    klucz: process.env.GEMINI_API_KEY || '',
    userId,
    jezyk,
    dni,
    grupy,
    minutNaDzien,
    fillPercent: Math.min(100, Math.max(0, zadanie.fill_percent ?? 70)),
    prefLines: prefOpisy.map((o) => `- ${o}`).join('\n'),
    zabytki: fillerSights,
    lokale: fillerFood,
    zabytkiDnia: rozdzielPoi(fillerSights, grupy, 14, zapas),
    lokaleDnia: rozdzielPoi(fillerFood, grupy, 6, zapas),
    pulaWspolrzednych,
    center,
    baza,
  };
}

const SCHEMAT_DNIA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          time: { type: 'string' },
          name: { type: 'string' },
          kind: { type: 'string' },
          minutes: { type: 'integer' },
          note: { type: 'string' },
          source: { type: 'string', enum: ['pinned', 'suggested'] },
          lat: { type: 'number' },
          lng: { type: 'number' },
        },
        required: ['time', 'name'],
      },
    },
    not_scheduled: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, reason: { type: 'string' } },
        required: ['name'],
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['items'],
};

/**
 * Propozycje z okolicy tego dnia, a nie z całego miasta.
 *
 * Dotąd każdy dzień dostawał tę samą listę czterdziestu pięciu miejsc z całego
 * miasta. Model musiał więc sam odsiewać te leżące po drugiej stronie rzeki,
 * a prompt puchł tak samo dla każdego dnia. Wycinek liczony od środka ciężkości
 * kotwic dnia jest krótszy i trafniejszy naraz: krótszy prompt liczy się szybciej,
 * a podpowiedzi są w zasięgu spaceru od miejsc, w których użytkownik i tak będzie.
 *
 * Gdy dzień nie ma ani jednej kotwicy ze współrzędnymi, okolicę mierzymy od
 * noclegu albo od środka miasta. Dopiero bez żadnego punktu odniesienia wracamy
 * do pierwszych z listy, uporządkowanej już wcześniej po ważności.
 */
function wOkolicy(
  kandydaci: PoiCandidate[],
  kotwice: MiejsceWejscie[],
  ile: number,
  zapas: { lat: number; lng: number } | null
): PoiCandidate[] {
  const srodek = srodekKotwic(kotwice) ?? zapas;
  if (!srodek || !kandydaci.length) return kandydaci.slice(0, ile);
  const posortowane = [...kandydaci]
    .filter((c) => c.lat != null && c.lng != null)
    .sort((a, b) => kmOd(srodek, a as any) - kmOd(srodek, b as any));
  return wZasiegu(posortowane, srodek).slice(0, ile);
}

/**
 * Kandydaci w zasięgu spaceru, już posortowani po odległości. Najpierw ciasny
 * promień; szerszy tylko wtedy, gdy w ciasnym jest za mało, żeby było z czego
 * wybierać. Poza szerszym nie bierzemy nic — lepiej nazwany spacer niż kościół
 * z sąsiedniego miasta.
 */
function wZasiegu(posortowane: PoiCandidate[], srodek: { lat: number; lng: number }): PoiCandidate[] {
  const blisko = posortowane.filter((c) => kmOd(srodek, c as any) <= PROMIEN_PROPOZYCJI_KM);
  if (blisko.length >= MIN_PROPOZYCJI) return blisko;
  return posortowane.filter((c) => kmOd(srodek, c as any) <= PROMIEN_ZAPASOWY_KM);
}

function srodekKotwic(kotwice: MiejsceWejscie[]): { lat: number; lng: number } | null {
  const zPunktem = kotwice.filter((p) => p.lat != null && p.lng != null);
  if (!zPunktem.length) return null;
  return {
    lat: zPunktem.reduce((s, p) => s + (p.lat as number), 0) / zPunktem.length,
    lng: zPunktem.reduce((s, p) => s + (p.lng as number), 0) / zPunktem.length,
  };
}

function kmOd(srodek: { lat: number; lng: number }, a: { lat?: any; lng?: any }): number {
  const dLat = (a.lat - srodek.lat) * 111;
  const dLng = (a.lng - srodek.lng) * 111 * Math.cos((srodek.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * Rozdziela pulę propozycji na dni ROZŁĄCZNIE.
 *
 * Dni układają się równolegle i żaden nie wie, co wybrał drugi — na tym polega
 * przyspieszenie z 79 do 5,5 sekundy. Dopóki każdy dzień dostawał najbliższe
 * kandydatury liczone od własnego środka ciężkości, listy potrafiły być
 * identyczne: w tablicy przykładowej dla Palermo oba dni siedzą w tym samym
 * centrum, więc oba dostały tę samą trattorię i oba ją wstawiły na obiad.
 *
 * Rozwiązaniem NIE jest mówienie dniom o sobie nawzajem — to przywróciłoby
 * zależność, którą równoległość miała usunąć. Wystarczy podzielić pulę z góry:
 * kandydat trafia do dnia, którego środek ciężkości ma najbliżej, a dzień widzi
 * wyłącznie swój przydział. Powtórzenie przestaje być możliwe, zamiast być
 * odradzane w prompcie.
 *
 * Dzień, któremu po podziale zostało za mało, dobiera najbliższe z tego, czego
 * nikt nie wziął — inaczej dzień w ciasnym sąsiedztwie zostałby bez propozycji.
 */
function rozdzielPoi(
  kandydaci: PoiCandidate[],
  grupy: MiejsceWejscie[][],
  ile: number,
  zapas: { lat: number; lng: number } | null
): PoiCandidate[][] {
  const ileDni = Math.max(1, grupy.length);
  const puste = () => Array.from({ length: ileDni }, () => [] as PoiCandidate[]);
  if (ileDni === 1) return [wOkolicy(kandydaci, grupy[0] ?? [], ile, zapas)];

  const srodki = grupy.map((g) => srodekKotwic(g) ?? zapas);
  const zPunktem = kandydaci.filter((c) => c.lat != null && c.lng != null);

  // Bez współrzędnych nie ma od czego mierzyć — rozdajemy po kolei, byle rozłącznie.
  if (!srodki.some((s) => s) || !zPunktem.length) {
    const wynik = puste();
    kandydaci.forEach((c, i) => {
      const d = i % ileDni;
      if (wynik[d].length < ile) wynik[d].push(c);
    });
    return wynik;
  }

  const kubelki = puste();
  for (const c of zPunktem) {
    let naj = -1;
    let najD = Infinity;
    srodki.forEach((s, i) => {
      if (!s) return;
      const d = kmOd(s, c as any);
      if (d < najD) { najD = d; naj = i; }
    });
    if (naj >= 0) kubelki[naj].push(c);
  }

  const wynik = puste();
  const wziete = new Set<PoiCandidate>();
  kubelki.forEach((kubel, i) => {
    const s = srodki[i];
    const posortowane = s
      ? wZasiegu([...kubel].sort((a, b) => kmOd(s, a as any) - kmOd(s, b as any)), s)
      : kubel;
    for (const c of posortowane.slice(0, ile)) { wynik[i].push(c); wziete.add(c); }
  });

  wynik.forEach((lista, i) => {
    const s = srodki[i];
    if (lista.length >= ile || !s) return;
    const wolne = wZasiegu(zPunktem
      .filter((c) => !wziete.has(c))
      .sort((a, b) => kmOd(s, a as any) - kmOd(s, b as any)), s);
    for (const c of wolne.slice(0, ile - lista.length)) { lista.push(c); wziete.add(c); }
  });

  return wynik;
}

function promptDnia(k: KontekstPlanu, numer: number): string {
  const z = k.zadanie;
  const info = k.dni[numer - 1];
  const moje = k.grupy[numer - 1] ?? [];
  const cudze = k.grupy.flatMap((g, i) => (i === numer - 1 ? [] : g));

  const opisMiejsca = (pl: MiejsceWejscie) => {
    const minuty = pl.visit_minutes || 60;
    const mieciSie = mieciSieWOknie(
      pl.opening_hours, info.dateObj,
      czasNaMinuty(z.window.start), czasNaMinuty(z.window.end), minuty);
    const dostepnosc = describeAvailability(pl.opening_hours, info.dateObj);
    const werdykt = mieciSie === false ? ' — NIE MIEŚCI SIĘ W TWOIM OKNIE' : '';
    return `- "${pl.name}" [${pl.priority === 'must' ? 'KONIECZNIE' : 'jeśli wyjdzie'}, ${pl.category || 'attraction'}, ok. ${minuty} min] ${dostepnosc}${werdykt}`;
  };

  const opisPoi = (c: any) =>
    `- "${c.name}" (${c.kind}${c.openingHours ? `, godziny: ${c.openingHours}` : ''})`;
  const zabytkiDnia = (k.zabytkiDnia[numer - 1] ?? []).map(opisPoi).join('\n');
  const lokaleDnia = (k.lokaleDnia[numer - 1] ?? []).map(opisPoi).join('\n');

  const minutyWizyt = moje.reduce((s, p) => s + (p.visit_minutes || 60), 0);
  const budzetDnia = Math.round(k.minutNaDzien * k.fillPercent / 100);
  const stale = (z.fixed || [])
    .map((f) => `- ${f.time} ${f.label}${f.minutes ? ` (${f.minutes} min)` : ''}`).join('\n');

  return `Ułóż plan JEDNEGO DNIA zwiedzania miasta ${z.destination}.

TO JEST DZIEŃ ${numer} Z ${k.dni.length} — ${info.weekday}, ${info.date}.
Układasz wyłącznie ten dzień. Pozostałe dni układane są osobno, więc nie pisz o nich
i nie planuj w nich niczego.

RAMY DNIA: od ${z.window.start} do ${z.window.end} (${Math.round(k.minutNaDzien / 60 * 10) / 10} h).
${z.hotel?.name ? `BAZA: ${z.hotel.name} — dzień zaczyna się i kończy tutaj.` : ''}
${stale ? `STAŁE PUNKTY DNIA (nie do przesunięcia):\n${stale}` : ''}
${k.prefLines ? `PREFERENCJE UŻYTKOWNIKA — uwzględnij je przy doborze miejsc, długości postojów i kolejności:\n${k.prefLines}` : ''}

MIEJSCA PRZYPIĘTE PRZEZ UŻYTKOWNIKA NA TEN DZIEŃ — to KOTWICE dnia, nie cały dzień
(przydzielone tutaj po położeniu, dostępność policzona dla ${info.weekday}):
${moje.length ? moje.map(opisMiejsca).join('\n') : '(na ten dzień nie przypadło żadne przypięte miejsce — zbuduj dzień z propozycji poniżej)'}

${cudze.length ? `MIEJSCA PRZYPISANE DO INNYCH DNI TEGO WYJAZDU — nie umieszczaj ich
tutaj, żeby się nie zdublowały. To NIE są miejsca odrzucone przez użytkownika:
NIE wpisuj ich do "not_scheduled" i nie tłumacz się z ich nieobecności, bo są
w planie, tylko innego dnia:
${cudze.map((p) => `- "${p.name}"`).join('\n')}` : ''}

${zabytkiDnia ? `ZWERYFIKOWANE MIEJSCA W TYM MIEŚCIE, KTÓRYCH UŻYTKOWNIK NIE PRZYPIĄŁ
(możesz i POWINIENEŚ nimi wypełnić resztę dnia — kopiuj nazwy dokładnie):
${zabytkiDnia}` : ''}

${lokaleDnia ? `LOKALE NA POSIŁKI W TYM MIEŚCIE (kopiuj nazwy dokładnie):
${lokaleDnia}` : ''}

BILANS DNIA: kotwice to ok. ${Math.round(minutyWizyt / 60 * 10) / 10} h, a całe okno to ${Math.round(k.minutNaDzien / 60 * 10) / 10} h.

WYPEŁNIENIE DNIA: ${k.fillPercent}%. Zaplanuj ok. ${Math.round(budzetDnia / 60 * 10) / 10} h konkretnych punktów, a POZOSTAŁE ${Math.round((k.minutNaDzien - budzetDnia) / 60 * 10) / 10} h ZOSTAW PUSTE Z ROZMYSŁU. To nie jest czas do zapełnienia — użytkownik świadomie poprosił o luz na włóczenie się, przypadkowe przystanki i dłuższe siedzenie tam, gdzie mu się spodoba.${k.fillPercent <= 40 ? ' Przy tak niskim wypełnieniu wybierz TYLKO najważniejsze kotwice i nie dokładaj propozycji z listy.' : ''}${k.fillPercent >= 90 ? ' Przy tak wysokim wypełnieniu możesz zagęścić dzień i dołożyć propozycje z listy.' : ''}
W polu "summary" napisz jednym zdaniem, ile czasu zostaje wolnego i co można w nim zrobić w tej okolicy. Doliczaj jeszcze przejścia między miejscami (pieszo ok. 15 min na kilometr) oraz przerwy.

ZASADY:
1. KOTWICE PRZED PROPOZYCJAMI — reguła nadrzędna wobec wszystkich pozostałych.
   Najpierw wstaw WSZYSTKIE miejsca oznaczone KONIECZNIE, dopiero potem wypełniaj
   to, co zostało. Pominięcie kotwicy przy jednoczesnym dołożeniu własnej
   propozycji jest BŁĘDEM PLANU, nawet gdy propozycja wydaje się ciekawsza:
   użytkownik wybrał te miejsca świadomie, a Twoje propozycje są wypełniaczem
   czasu, nie konkurencją dla nich.
   Gdy kotwica naprawdę się nie mieści, najpierw skróć wizytę (zasada 5). Dopiero
   gdy i to nie pomaga, wpisz ją do "not_scheduled" z prawdziwym powodem.
2. NIGDY nie planuj wizyty w miejscu oznaczonym jako ZAMKNIĘTE tego dnia ani takiego, które NIE MIEŚCI SIĘ W OKNIE.
3. Dzień ma być spójny geograficznie — kolejność układaj tak, żeby nie biegać przez miasto tam i z powrotem.
4. NIGDY NIE ZOSTAWIAJ PUSTEGO DNIA. "Czas wolny" na kilka godzin przy niewykorzystanych miejscach to błąd planu, nie wynik.
5. KRÓTSZA WIZYTA ZAMIAST REZYGNACJI. Jeśli miejsce jest otwarte, ale zostało mniej czasu, niż wynosi pełne zwiedzanie, ZAPLANUJ JE NA TYLE, ILE ZOSTAŁO, i napisz to wprost w "note", np. "zamykają o 18:00 — masz 60 z 90 min, wejdź od razu". Do "not_scheduled" trafia tylko to, co jest ZAMKNIĘTE tego dnia albo czego naprawdę nie da się wcisnąć.
6. TABLICA TO INSPIRACJA, NIE RAMA. Wypełnij wolny czas konkretnymi miejscami z listy propozycji, dobranymi do preferencji i leżącymi blisko kotwic tego dnia. W polu "source" wpisz "pinned" dla miejsc przypiętych przez użytkownika i "suggested" dla Twoich propozycji.
   Gdy w okolicy naprawdę nie ma czego dodać, dopiero wtedy zaproponuj nazwany spacer ("spacer po Starym Mieście: Rynek, Katharinenstraße"). Samo "czas wolny" jest zawsze błędem.
7. POSIŁEK TO MIEJSCE, NIE GODZINA. Jeśli w stałych punktach dnia jest obiad albo kolacja,
   wstaw w tym czasie KONKRETNY LOKAL z listy powyżej i jego nazwę wpisz w "name" — wybierz
   taki, który leży blisko punktu, w którym użytkownik akurat wtedy będzie. Sama "Kolacja"
   bez nazwy lokalu jest pustą pozycją: nie da się jej pokazać na mapie ani sprawdzić godzin.
   Uwzględnij preferencje użytkownika co do jedzenia, jeśli je podano.
8. Nie upychaj na siłę ponad ramy czasowe. Jeśli coś naprawdę się nie mieści, zostaw to w "not_scheduled" z konkretnym powodem.
   "not_scheduled" DOTYCZY WYŁĄCZNIE KOTWIC TEGO DNIA. Niewykorzystanych propozycji NIE WYPISUJ TAM.
9. W "warnings" napisz rzeczy, o których użytkownik musi wiedzieć (np. "Muzeum X dziś zamknięte", "do zamknięcia zostanie 20 minut — trzeba się streszczać").

ZWIĘZŁOŚĆ: "note" najwyżej 80 znaków, "summary" najwyżej 120 znaków, "reason" najwyżej 80 znaków. Żadnych rozbudowanych opisów — to harmonogram, nie przewodnik.

Odpowiedz WYŁĄCZNIE obiektem JSON opisującym ten jeden dzień.
${instrukcjaJezyka(k.jezyk)}`;
}


/**
 * Kontrola godzin po stronie serwera, zamiast wiary w to, że model dotrzymał zasady.
 *
 * W pomiarach zdarzyło się, że plan zawierał wizytę o 16:30 w miejscu, o którym
 * model sam dopisał w notatce „zamykają o 15:00 — nie jest dziś dostępne". Reguła
 * w prompcie była, dane o godzinach były, a mimo to pozycja weszła do planu.
 * Turysta pod zamkniętymi drzwiami to najgorszy możliwy błąd tego produktu, więc
 * nie zostawiamy tego perswazji — godziny mamy w danych i da się je sprawdzić.
 *
 * Sprawdzamy wyłącznie moment wejścia, nie całą wizytę. Wizyta wystająca poza
 * zamknięcie jest dopuszczona świadomie (zasada 5: lepiej wejść na godzinę niż
 * odpuścić), więc karanie za nią wycięłoby poprawne pozycje. Zamknięte drzwi
 * w chwili przyjścia to co innego — tam nie ma czego skracać.
 *
 * Działamy tylko przy pewnym dopasowaniu nazwy i jednoznacznym „zamknięte":
 * `isOpenDuring` oddaje `null`, gdy nie umie odczytać zapisu godzin, i wtedy
 * pozycja zostaje. Lepiej przepuścić wątpliwą niż wyciąć poprawną.
 */
function odsiejZamkniete(k: KontekstPlanu, dzien: DzienPlanu, numer: number): void {
  const info = k.dni[numer - 1];
  const klucz = (s: string) =>
    String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

  const godziny = new Map<string, string>();
  for (const pl of k.zadanie.places) {
    if (pl.opening_hours) godziny.set(klucz(pl.name), pl.opening_hours);
  }
  for (const c of [...k.zabytki, ...k.lokale]) {
    if ((c as any).openingHours) godziny.set(klucz(c.name), (c as any).openingHours);
  }
  if (!godziny.size) return;

  const zostaja: PozycjaDnia[] = [];
  for (const poz of dzien.items) {
    const spec = godziny.get(klucz(poz.name));
    const wejscie = czasNaMinuty(poz.time);
    if (spec && wejscie > 0 && isOpenDuring(spec, info.dateObj, wejscie, 1) === false) {
      (dzien.warnings ??= []).push(
        `${poz.name}: o ${poz.time} jest zamknięte, więc wypadło z planu — ${describeAvailability(spec, info.dateObj)}.`
      );
      (dzien.not_scheduled ??= []).push({ name: poz.name, reason: 'zamknięte o zaplanowanej godzinie' });
      continue;
    }
    zostaja.push(poz);
  }

  const wyciete = dzien.items.length - zostaja.length;
  if (wyciete) console.warn(`[planer] dzień ${numer}: wycięto ${wyciete} poz. zaplanowanych na zamknięte godziny`);
  dzien.items = zostaja;
}

/** Jeden dzień: wywołanie modelu, parsowanie, uzupełnienie współrzędnych. */
export async function ulozDzien(k: KontekstPlanu, numer: number): Promise<DzienPlanu> {
  if (!k.klucz) throw new Error('Missing GEMINI_API_KEY');
  const info = k.dni[numer - 1];

  const dane = await callGeminiTracked(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${k.klucz}`,
    {
      contents: [{ parts: [{ text: promptDnia(k, numer) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: SCHEMAT_DNIA,
        // Jeden dzień mieści się w ułamku dawnego budżetu, ale model 2.5 zużywa
        // część na rozumowanie — zostawiamy zapas, żeby JSON nie urwał się w pół.
        maxOutputTokens: 8192,
        // Rozumowanie bez limitu było największą pojedynczą pozycją w czasie
        // odpowiedzi: jeden dzień liczył się 35 s, z czego większość szła na nie.
        // Zerowy budżet psuje arytmetykę godzin, więc zostaje wąski — tyle, ile
        // trzeba na poukładanie godzin otwarcia, i nic ponadto.
        thinkingConfig: { thinkingBudget: 512 },
      },
    },
    { operation: 'plan-dzien', model: 'gemini-2.5-flash', userId: k.userId }
  );

  const tekst = dane?.candidates?.[0]?.content?.parts?.[0]?.text;
  const powod = dane?.candidates?.[0]?.finishReason;
  if (!tekst) throw new Error(`Pusta odpowiedź planera dla dnia ${numer} (finishReason: ${powod})`);

  let surowy: any;
  try {
    surowy = JSON.parse(tekst.replace(/```json/g, '').replace(/```/g, '').trim());
  } catch {
    console.error(`[planer] Dzień ${numer}: niepoprawny JSON (${tekst.length} zn., finishReason=${powod})`);
    throw new Error(`Planer zwrócił niekompletną odpowiedź dla dnia ${numer}. Spróbuj ponownie.`);
  }

  const dzien: DzienPlanu = {
    day: numer,
    date: info.date,
    weekday: info.weekday,
    summary: surowy.summary,
    items: Array.isArray(surowy.items) ? surowy.items : [],
    not_scheduled: Array.isArray(surowy.not_scheduled) ? surowy.not_scheduled : [],
    warnings: Array.isArray(surowy.warnings) ? surowy.warnings : [],
  };

  uzupelnijBraki(k, dzien);
  // Przejścia i nocleg rozpoznajemy PRZED szukaniem współrzędnych: inaczej
  // "Spacer do Mauritshuis" dostawał punkt muzeum, a hotel punkt sąsiada.
  oznaczPrzejscia(dzien);
  przypnijBaze(k, dzien);
  uzupelnijWspolrzedne(k, dzien);
  sprawdzOdleglosci(k, dzien, numer);
  // Kolejność ma znaczenie: strażnik dokłada wpisy do not_scheduled, więc musi
  // zadziałać przed filtrem, który zostawia tam wyłącznie kotwice tego dnia.
  odsiejZamkniete(k, dzien, numer);
  // Na końcu, żeby żaden wcześniejszy krok nie przesunął ani nie wyciął noclegu.
  dopnijBazeDoDnia(k, dzien);

  // "Nie zmieściło się" ma mówić o tym, co użytkownik przypiął na ten dzień.
  const kotwice = new Set((k.grupy[numer - 1] ?? []).map((p) => p.name.trim().toLowerCase()));
  dzien.not_scheduled = (dzien.not_scheduled || [])
    .filter((n) => n?.name && kotwice.has(String(n.name).trim().toLowerCase()))
    .filter((n, i, arr) =>
      arr.findIndex((x) => String(x.name).trim().toLowerCase() === String(n.name).trim().toLowerCase()) === i);

  return dzien;
}

const NAME_STOP = new Set(['w', 'we', 'na', 'pod', 'przy', 'the', 'of', 'i', 'oraz',
  'pw', 'sw', 'swietej', 'swietego', 'sw.', 'stary', 'stare', 'nowy', 'nowe']);

const nameTokens = (raw: string): string[] => [...new Set(
  String(raw || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !NAME_STOP.has(t))
)];

const TRANSITION = /^(przejscie|przejazd|spacer|powrot|wyjazd|zejscie|wejscie|dojazd|dojscie|obiad|lunch|kolacja|sniadanie|przerwa)[a-z ]*?\b(do|pod|na|w|we|z|ze|przez|przy|obok)\b/;

/**
 * Każda pozycja planu dostaje współrzędne, jeśli tylko da się je ustalić.
 *
 * Dopasowanie po samej równości nazw prawie nie działało: model przeformułowuje
 * nazwy — "Amfiteatr w Durrës" wraca jako "Amfiteatr rzymski" — więc równość
 * łapała jedną pozycję na dzień i mapa pokazywała jedną pinezkę. Porównujemy
 * zbiory słów znaczących, ważone rzadkością: "muzeum" powtarza się w całej puli,
 * "amfiteatr" występuje raz, więc to drugie znaczy dużo więcej.
 */
/**
 * Dopełnia pola, których model nie musiał podać.
 *
 * Schemat wymaga tylko `time` i `name` — reszta jest opcjonalna, więc pozycja
 * potrafi przyjść bez czasu trwania i rodzaju. W tablicy przykładowej dla
 * Palermo wyszła tak „Galleria d'arte moderna": sama nazwa i godzina, w planie
 * dnia widoczna jako punkt bez czasu.
 *
 * Zaostrzenie schematu nie byłoby lepsze: wymuszony `minutes` to liczba
 * zgadnięta przez model pod przymusem, a nie wiedza. Czas trwania odczytujemy
 * z tego, co model NAPRAWDĘ powiedział — z godziny kolejnej pozycji. Skoro
 * następny punkt zaczyna się o 17:10, to na ten została godzina, niezależnie od
 * tego, czy model wpisał to w osobne pole.
 *
 * Odstęp bije wartość z katalogu celowo, choć katalog jest dokładniejszy co do
 * samego zwiedzania: wpisanie tam 90 minut tam, gdzie plan zostawił 60, kazałoby
 * pozycji nachodzić na następną. Spójność osi czasu jest ważniejsza niż nominalna
 * długość wizyty — z katalogu korzystamy dopiero dla ostatniej pozycji dnia,
 * po której nie ma czego zmierzyć.
 */
function uzupelnijBraki(k: KontekstPlanu, dzien: DzienPlanu): void {
  const wKatalogu = new Map<string, { minuty?: number; rodzaj?: string }>();
  for (const p of k.zadanie.places) {
    wKatalogu.set(p.name.trim().toLowerCase(),
      { minuty: p.visit_minutes ?? undefined, rodzaj: p.category ?? undefined });
  }
  for (const c of [...k.zabytki, ...k.lokale]) {
    const klucz = String(c.name || '').trim().toLowerCase();
    if (klucz && !wKatalogu.has(klucz)) wKatalogu.set(klucz, { rodzaj: (c as any).kind });
  }

  dzien.items.forEach((item, i) => {
    item.name = String(item.name || '').trim();

    // Przejście bez celu dostaje cel z następnej pozycji.
    //
    // Prompt żąda spaceru NAZWANEGO, bo bezimienny wypełniacz nie mówi nic i nie
    // da się go pokazać na mapie. Model zwykle to robi („Spacer do Acquario di
    // Genova"), ale w planie Porto wstawił „Spacer w okolicy" PIĘĆ RAZY w jednym
    // dniu — między miejscami odległymi o trzy minuty. Cel bierzemy z sąsiada,
    // zamiast prosić model jeszcze raz: on i tak wie, dokąd idzie, bo wstawił to
    // przejście właśnie przed tym punktem.
    const przejscie = /^(spacer|przej[śs]cie|dojazd|walk|transfer)\b/i.test(item.name)
      || ['walk', 'travel', 'transport'].includes(String(item.kind || '').toLowerCase());
    const maCel = /\b(do|na|w stronę|to|towards)\b/i.test(item.name);
    if (przejscie && !maCel) {
      const nastepna = dzien.items[i + 1];
      const cel = String(nastepna?.name || '').trim();
      if (cel) item.name = `Spacer do ${cel}`;
    }

    const znane = wKatalogu.get(item.name.toLowerCase());

    if (item.source !== 'pinned' && item.source !== 'suggested') {
      item.source = k.zadanie.places.some(
        (p) => p.name.trim().toLowerCase() === item.name.toLowerCase()) ? 'pinned' : 'suggested';
    }
    if (!item.kind) item.kind = znane?.rodzaj || 'attraction';

    if (typeof item.minutes !== 'number' || item.minutes <= 0) {
      const nastepna = dzien.items[i + 1];
      const od = czasNaMinuty(item.time);
      const doNast = nastepna ? czasNaMinuty(nastepna.time) : NaN;
      const zOdstepu = Number.isFinite(od) && Number.isFinite(doNast) ? doNast - od : NaN;
      item.minutes = zOdstepu > 0 && zOdstepu <= 240
        ? zOdstepu
        : (znane?.minuty && znane.minuty > 0 ? znane.minuty : 45);
    }
  });
}

export function uzupelnijWspolrzedne(k: KontekstPlanu, dzien: DzienPlanu): void {
  const pula = k.pulaWspolrzednych.map((x) => ({ ...x, tokens: nameTokens(x.name) }));
  if (!pula.length) return;

  const docFreq = new Map<string, number>();
  for (const x of pula) for (const t of x.tokens) docFreq.set(t, (docFreq.get(t) || 0) + 1);
  const weight = (t: string) => Math.log((pula.length + 1) / ((docFreq.get(t) || 0) + 1)) + 1;
  const mass = (tokens: string[]) => tokens.reduce((sum, t) => sum + weight(t), 0);

  const similarity = (a: string[], b: string[]): number => {
    if (a.length === 0 || b.length === 0) return 0;
    const inB = new Set(b);
    const shared = a.filter((t) => inB.has(t)).reduce((sum, t) => sum + weight(t), 0);
    const base = Math.min(mass(a), mass(b));
    return base > 0 ? shared / base : 0;
  };

  const kmOdSrodka = (lat: number, lng: number): number => {
    if (!k.center) return 0;
    const dLat = (lat - k.center.lat) * 111;
    const dLng = (lng - k.center.lng) * 111 * Math.cos((k.center.lat * Math.PI) / 180);
    return Math.sqrt(dLat * dLat + dLng * dLng);
  };

  // Przejścia nie są miejscami, a nocleg ma już punkt z przypnijBaze — żadnego
  // z nich nie dopasowujemy do puli ani nie interpolujemy z sąsiadów.
  const pomin = (item: PozycjaDnia) => item.kind === 'walk' || item.baza === true;

  for (const item of dzien.items) {
    if (pomin(item)) continue;
    const raw = String(item.name || '');
    const exact = pula.find((x) => x.name.trim().toLowerCase() === raw.trim().toLowerCase());
    let hit: { lat: any; lng: any } | undefined = exact;

    if (!hit) {
      const tokens = nameTokens(raw);
      const scored = pula
        .map((x) => ({ x, score: similarity(tokens, x.tokens) }))
        .filter((r) => r.score >= 0.5)
        .sort((a, b) => b.score - a.score);
      hit = scored[0]?.x;
    }

    if (hit) { item.lat = hit.lat; item.lng = hit.lng; continue; }

    // Bez dopasowania zostają współrzędne od modelu, a te bywają zmyślone.
    // Przyjmujemy je wyłącznie w zasięgu miasta; lepszy brak pinezki niż
    // pinezka w innym mieście. 40 km przepuszczało sąsiednie miasta — Delft
    // leży 8 km od Hagi — a to dalej niż dzień zwiedzania ma prawo sięgać.
    if (!(typeof item.lat === 'number' && typeof item.lng === 'number' && kmOdSrodka(item.lat, item.lng) < 15)) {
      delete item.lat;
      delete item.lng;
    }
  }

  // Druga runda dla pozycji bez punktu. To niemal zawsze pozycje przejściowe —
  // "Przejście do Ogrodu Botanicznego", "Obiad w Hali Targowej" — gdzie cel siedzi
  // w końcówce nazwy, tyle że odmieniony. Porównujemy rdzenie słów, a gdy i to
  // zawiedzie, pozycja dostaje punkt między sąsiadami: pinezka "po drodze" jest
  // bliżej prawdy niż dziura w mapie dnia i w pliku GPX.
  dzien.items.forEach((item, i) => {
    if (pomin(item)) return;
    if (typeof item.lat === 'number' && typeof item.lng === 'number') return;
    const raw = String(item.name || '');
    const norm = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const m = norm.match(TRANSITION);
    const cel = m ? norm.slice((m.index ?? 0) + m[0].length) : norm;
    const rdzenie = nameTokens(cel).map((t) => t.slice(0, 5));
    if (rdzenie.length > 0) {
      const scored = pula
        .map((x) => {
          const xs = new Set(x.tokens.map((t) => t.slice(0, 5)));
          return { x, score: rdzenie.filter((t) => xs.has(t)).length / rdzenie.length };
        })
        .filter((r) => r.score >= 0.6)
        .sort((a, b) => b.score - a.score);
      if (scored[0]) { item.lat = scored[0].x.lat; item.lng = scored[0].x.lng; return; }
    }
    const prev = dzien.items.slice(0, i).reverse().find((x) => typeof x.lat === 'number');
    const next = dzien.items.slice(i + 1).find((x) => typeof x.lat === 'number');
    const kotwica = prev && next
      ? { lat: (prev.lat! + next.lat!) / 2, lng: (prev.lng! + next.lng!) / 2 }
      : (prev || next);
    if (kotwica) {
      item.lat = kotwica.lat;
      item.lng = kotwica.lng;
      item.approx = true;
    }
  });
}

const kluczNazwy = (s: unknown): string =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/**
 * To samo miejsce przypięte dwa razy liczy się raz.
 *
 * Tablica Hagi miała Mauritshuis i Museum Bredius po dwa razy — raz z wyszukiwarki,
 * raz z katalogu — bo przy przypinaniu duplikat rozpoznaje się tylko po id katalogu.
 * Grupowanie po położeniu rozdzieliło bliźniaki na różne dni i Bredius wypadło
 * w planie w sobotę i w niedzielę. Za to samo miejsce uznajemy tę samą nazwę
 * w odległości do 200 m; łączymy priorytet w górę i uzupełniamy brakujące pola.
 */
function scalDuplikaty(miejsca: MiejsceWejscie[]): MiejsceWejscie[] {
  const wynik: MiejsceWejscie[] = [];
  for (const m of miejsca) {
    const nazwa = kluczNazwy(m.name);
    const blizniak = wynik.find((w) => kluczNazwy(w.name) === nazwa && (
      w.lat == null || w.lng == null || m.lat == null || m.lng == null
      || kmOd({ lat: w.lat, lng: w.lng }, m) < 0.2));
    if (!blizniak) { wynik.push({ ...m }); continue; }
    if (m.priority === 'must') blizniak.priority = 'must';
    if ((blizniak.lat == null || blizniak.lng == null) && m.lat != null && m.lng != null) {
      blizniak.lat = m.lat;
      blizniak.lng = m.lng;
    }
    blizniak.opening_hours ||= m.opening_hours;
    blizniak.visit_minutes ||= m.visit_minutes;
    blizniak.description ||= m.description;
    blizniak.category ||= m.category;
  }
  if (wynik.length < miejsca.length) {
    console.log(`[planer] scalono ${miejsca.length - wynik.length} zdublowanych miejsc z tablicy`);
  }
  return wynik;
}

const PRZEJSCIE = /^(spacer|przej[śs]cie|przejazd|dojazd|doj[śs]cie|powr[óo]t|transfer|walk)\b/i;

/**
 * Przejście to odcinek między miejscami, a nie miejsce.
 *
 * Dostawało dotąd własny punkt: "Spacer do Mauritshuis" dopasowywał się do
 * Mauritshuis i na mapie w jednym punkcie stały trzy pinezki — nocleg, spacer
 * i muzeum. Oznaczone `walk` zostaje na osi dnia, ale bez współrzędnych: czas
 * przejścia widać w harmonogramie, a mapa pokazuje tylko to, dokąd się idzie.
 */
export function oznaczPrzejscia(dzien: DzienPlanu): void {
  for (const item of dzien.items) {
    const rodzaj = String(item.kind || '').toLowerCase();
    if (PRZEJSCIE.test(item.name.trim()) || ['walk', 'travel', 'transport', 'transit'].includes(rodzaj)) {
      item.kind = 'walk';
      delete item.lat;
      delete item.lng;
      delete item.approx;
    }
  }
}

/**
 * Nocleg zawsze w swoim miejscu.
 *
 * Punkt startowy wyjazdu przychodzi ze współrzędnymi, ale nie trafiał do puli
 * dopasowań, więc "Ibis Styles" dostawał punkt sąsiedniej pozycji: rano stał
 * w Mauritshuis, wieczorem w Delft. W czterodniowym planie Hagi hotel miał osiem
 * różnych położeń i ani jednego prawdziwego. Teraz pozycję w noclegu rozpoznajemy
 * po nazwie i przypinamy do współrzędnych z ustawień. Gdy wyjazd ich nie ma,
 * lepiej zostawić nocleg bez pinezki niż wstawić go w cudzy punkt.
 */
export function przypnijBaze(k: KontekstPlanu, dzien: DzienPlanu): void {
  const nazwaBazy = kluczNazwy(k.zadanie.hotel?.name);
  for (const item of dzien.items) {
    if (item.kind === 'walk') continue;
    const nazwa = kluczNazwy(item.name);
    const poNazwie = !!nazwaBazy
      && (nazwa === nazwaBazy || (nazwaBazy.length >= 4 && nazwa.includes(nazwaBazy)));
    const ogolna = /^(hotel|nocleg|baza|kwatera|apartament)$/.test(nazwa);
    // Rodzaj "hotel" bez nazwy noclegu w ustawieniach też jest noclegiem; przy
    // ustawionym noclegu inny hotel to zwykłe miejsce (np. kawiarnia w Des Indes).
    const bezNazwyBazy = item.kind === 'hotel' && !nazwaBazy;
    if (!poNazwie && !ogolna && !bezNazwyBazy) continue;

    item.kind = 'hotel';
    item.baza = true;
    delete item.approx;
    if (k.baza) {
      item.lat = k.baza.lat;
      item.lng = k.baza.lng;
    } else {
      delete item.lat;
      delete item.lng;
    }
  }
}

const GODZINA = /^\d{1,2}:\d{2}$/;

/** Odwrotność `czasNaMinuty`: 520 → "08:40". */
const minutyNaCzas = (m: number): string => {
  const x = Math.max(0, Math.min(23 * 60 + 59, Math.round(m)));
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

/** Dojście pieszo w pełnych pięciu minutach — ta sama miara co w sprawdzOdleglosci. */
const dojsciePieszo = (a: { lat: number; lng: number }, b: { lat?: any; lng?: any }): number =>
  Math.ceil((kmOd(a, b) * 1.3 * 15) / 5) * 5;

const maPunkt = (it: PozycjaDnia): boolean =>
  it.kind !== 'walk' && typeof it.lat === 'number' && typeof it.lng === 'number';

/**
 * Każdy dzień wychodzi z noclegu i do niego wraca.
 *
 * Prompt prosił o to od dawna („dzień zaczyna się i kończy tutaj"), ale prośba to
 * nie gwarancja. W czterodniowym planie Hagi dni 1 i 3 zaczynały się w hotelu,
 * a 2 i 4 przy pierwszej atrakcji i do hotelu nie wracały — na mapie start
 * wypadał każdego dnia gdzie indziej, choć nocleg był jeden. `przypnijBaze`
 * poprawia tylko pozycje, które model sam napisał; tu dopisujemy brakujące.
 *
 * Godzina wyjścia jest liczona wstecz od pierwszej pozycji: model zwykle stawia
 * pierwszą atrakcję na samym początku dnia i nie zostawia czasu na dojście.
 * Powrót — od końca ostatniej pozycji plus dojście. Bez `minutes`: w noclegu
 * nic się nie zwiedza, a zero wyrenderowałoby się na osi dnia jako „0".
 */
export function dopnijBazeDoDnia(k: KontekstPlanu, dzien: DzienPlanu): void {
  const baza = k.baza;
  if (!baza) return;
  const items = dzien.items;
  // Dzień bez żadnego miejsca na mapie nie potrzebuje wyjścia ani powrotu.
  if (!items.some((it) => maPunkt(it) && !it.baza)) return;

  const nocleg = (time: string, note: string): PozycjaDnia => ({
    time, note,
    name: k.zadanie.hotel?.name || baza.name,
    kind: 'hotel', baza: true, source: 'pinned',
    lat: baza.lat, lng: baza.lng,
  });

  const pierwszeMiejsce = items.find((it) => it.kind !== 'walk');
  if (!pierwszeMiejsce?.baza) {
    const pierwsza = items[0];
    let godzina = pierwsza.time;
    // Przejście na początku dnia już zawiera dojście — wtedy wychodzimy o jego godzinie.
    if (maPunkt(pierwsza) && GODZINA.test(pierwsza.time)) {
      godzina = minutyNaCzas(czasNaMinuty(pierwsza.time) - dojsciePieszo(baza, pierwsza));
    }
    items.unshift(nocleg(godzina, 'Wyjście z noclegu.'));
  }

  const ostatnieMiejsce = [...items].reverse().find((it) => it.kind !== 'walk');
  if (!ostatnieMiejsce?.baza) {
    const ostatnia = items[items.length - 1];
    let godzina = ostatnia.time;
    if (GODZINA.test(ostatnia.time)) {
      let koniec = czasNaMinuty(ostatnia.time) + (ostatnia.minutes || 0);
      if (maPunkt(ostatnia)) koniec += dojsciePieszo(baza, ostatnia);
      godzina = minutyNaCzas(koniec);
    }
    items.push(nocleg(godzina, 'Powrót do noclegu.'));
  }
}

/**
 * Deterministyczna kontrola geografii dnia — ta sama zasada co przy godzinach
 * otwarcia: reguła w prompcie była, a mimo to plan kazał przejść osiem kilometrów
 * w pół godziny.
 *
 * 1. Propozycja agenta leżąca dalej niż zasięg dnia wypada. Pinezki użytkownika
 *    zostają zawsze — to jego decyzja, co najwyżej dostanie ostrzeżenie.
 * 2. Gdy między dwoma kolejnymi punktami pieszo wychodzi wyraźnie więcej, niż plan
 *    zostawia czasu, użytkownik dostaje ostrzeżenie z liczbami.
 */
export function sprawdzOdleglosci(k: KontekstPlanu, dzien: DzienPlanu, numer: number): void {
  const kotwice = (k.grupy[numer - 1] ?? []).filter((p) => p.lat != null && p.lng != null);
  const srodek = srodekKotwic(kotwice) ?? k.baza ?? k.center;

  if (srodek) {
    // Zasięg rośnie z rozrzutem kotwic: dzień z Watykanem i Zatybrzem ma prawo
    // sięgać dalej niż dzień wokół jednego rynku.
    const rozrzut = kotwice.reduce((m, p) => Math.max(m, kmOd(srodek, p)), 0);
    const zasieg = Math.max(PROMIEN_ZAPASOWY_KM + 1, rozrzut * 1.5);
    const odrzucone: string[] = [];
    dzien.items = dzien.items.filter((it) => {
      if (it.source !== 'suggested' || it.kind === 'walk' || it.baza) return true;
      if (typeof it.lat !== 'number' || typeof it.lng !== 'number' || it.approx) return true;
      if (kmOd(srodek, it) <= zasieg) return true;
      odrzucone.push(it.name);
      return false;
    });
    if (odrzucone.length) {
      // Przejście prowadzące do wyciętej propozycji nie ma już dokąd prowadzić.
      const cele = odrzucone.map(kluczNazwy);
      dzien.items = dzien.items.filter((it) =>
        it.kind !== 'walk' || !cele.some((c) => c.length >= 4 && kluczNazwy(it.name).includes(c)));
      console.warn(`[planer] dzień ${numer}: poza zasięgiem ${zasieg.toFixed(1)} km wypadły propozycje: ${odrzucone.join(', ')}`);
    }
  }

  const punkty = dzien.items.filter((it) =>
    it.kind !== 'walk' && typeof it.lat === 'number' && typeof it.lng === 'number' && !it.approx);
  for (let i = 1; i < punkty.length; i++) {
    const a = punkty[i - 1];
    const b = punkty[i];
    if (!GODZINA.test(a.time) || !GODZINA.test(b.time)) continue;
    const km = kmOd({ lat: a.lat!, lng: a.lng! }, b) * 1.3;
    if (km < 1.5) continue;
    const naPrzejscie = Math.max(0, czasNaMinuty(b.time) - (czasNaMinuty(a.time) + (a.minutes || 0)));
    const pieszo = Math.round(km * 15);
    if (pieszo <= naPrzejscie + 15) continue;
    (dzien.warnings ??= []).push(
      `Z „${a.name}" do „${b.name}" jest ok. ${km.toFixed(1).replace('.', ',')} km — pieszo to ok. ${pieszo} min, `
      + `a plan zostawia na przejście ${naPrzejscie} min. Podjedź komunikacją albo przesuń godziny.`
    );
  }
}
