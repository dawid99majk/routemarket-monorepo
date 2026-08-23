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
  return buckets.filter((b) => b.length > 0);
}

interface InfoDnia { index: number; date: string; weekday: string; dateObj: Date }

export interface KontekstPlanu {
  zadanie: ZadaniePlanu;
  klucz: string;
  userId: string | null;
  dni: InfoDnia[];
  /** Miejsca przypisane do konkretnego dnia (indeks 0 = dzień 1). */
  grupy: MiejsceWejscie[][];
  minutNaDzien: number;
  fillPercent: number;
  prefLines: string;
  /** Surowe kandydaty, nie gotowy tekst: każdy dzień dostaje własny wycinek. */
  zabytki: PoiCandidate[];
  lokale: PoiCandidate[];
  /** Pula ze współrzędnymi do rozwiązywania pozycji planu. */
  pulaWspolrzednych: { name: string; lat: any; lng: any }[];
  center: { lat: number; lng: number } | null;
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
      const otwarte = isOpenDuring(p.opening_hours, dzien.dateObj, oknoOd, minuty);
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
  zadanie: ZadaniePlanu,
  userId: string | null
): Promise<KontekstPlanu> {
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

  return {
    zadanie,
    klucz: process.env.GEMINI_API_KEY || '',
    userId,
    dni,
    grupy,
    minutNaDzien,
    fillPercent: Math.min(100, Math.max(0, zadanie.fill_percent ?? 70)),
    prefLines: prefOpisy.map((o) => `- ${o}`).join('\n'),
    zabytki: fillerSights,
    lokale: fillerFood,
    pulaWspolrzednych,
    center,
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
 * Gdy dzień nie ma ani jednej kotwicy ze współrzędnymi, nie ma od czego mierzyć —
 * wtedy wracamy do pierwszych z listy, uporządkowanej już wcześniej po ważności.
 */
function wOkolicy(kandydaci: PoiCandidate[], kotwice: MiejsceWejscie[], ile: number): PoiCandidate[] {
  const zPunktem = kotwice.filter((p) => p.lat != null && p.lng != null);
  if (!zPunktem.length || !kandydaci.length) return kandydaci.slice(0, ile);
  const srodek = {
    lat: zPunktem.reduce((s, p) => s + (p.lat as number), 0) / zPunktem.length,
    lng: zPunktem.reduce((s, p) => s + (p.lng as number), 0) / zPunktem.length,
  };
  const km = (a: { lat: number; lng: number }) => {
    const dLat = (a.lat - srodek.lat) * 111;
    const dLng = (a.lng - srodek.lng) * 111 * Math.cos((srodek.lat * Math.PI) / 180);
    return Math.sqrt(dLat * dLat + dLng * dLng);
  };
  return [...kandydaci]
    .filter((c) => c.lat != null && c.lng != null)
    .sort((a, b) => km(a as any) - km(b as any))
    .slice(0, ile);
}

function promptDnia(k: KontekstPlanu, numer: number): string {
  const z = k.zadanie;
  const info = k.dni[numer - 1];
  const moje = k.grupy[numer - 1] ?? [];
  const cudze = k.grupy.flatMap((g, i) => (i === numer - 1 ? [] : g));

  const opisMiejsca = (pl: MiejsceWejscie) => {
    const minuty = pl.visit_minutes || 60;
    const mieciSie = isOpenDuring(pl.opening_hours, info.dateObj, czasNaMinuty(z.window.start), Math.min(minuty, k.minutNaDzien));
    const dostepnosc = describeAvailability(pl.opening_hours, info.dateObj);
    const werdykt = mieciSie === false ? ' — NIE MIEŚCI SIĘ W TWOIM OKNIE' : '';
    return `- "${pl.name}" [${pl.priority === 'must' ? 'KONIECZNIE' : 'jeśli wyjdzie'}, ${pl.category || 'attraction'}, ok. ${minuty} min] ${dostepnosc}${werdykt}`;
  };

  const opisPoi = (c: any) =>
    `- "${c.name}" (${c.kind}${c.openingHours ? `, godziny: ${c.openingHours}` : ''})`;
  const zabytkiDnia = wOkolicy(k.zabytki, moje, 14).map(opisPoi).join('\n');
  const lokaleDnia = wOkolicy(k.lokale, moje, 6).map(opisPoi).join('\n');

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

${cudze.length ? `MIEJSCA ZAPLANOWANE W INNYCH DNIACH — NIE UŻYWAJ ICH TUTAJ:
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
1. Miejsca oznaczone KONIECZNIE mają pierwszeństwo — wstaw je najpierw.
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

Odpowiedz WYŁĄCZNIE obiektem JSON opisującym ten jeden dzień.`;
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

  uzupelnijWspolrzedne(k, dzien);
  // Kolejność ma znaczenie: strażnik dokłada wpisy do not_scheduled, więc musi
  // zadziałać przed filtrem, który zostawia tam wyłącznie kotwice tego dnia.
  odsiejZamkniete(k, dzien, numer);

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

  for (const item of dzien.items) {
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
    // pinezka w innym kraju.
    if (!(typeof item.lat === 'number' && typeof item.lng === 'number' && kmOdSrodka(item.lat, item.lng) < 40)) {
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
