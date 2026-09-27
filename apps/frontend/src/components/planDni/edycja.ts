/**
 * Poprawki gotowego planu bez modelu i bez tokenów.
 *
 * Planu nie dało się dotąd poprawić: jedynym ruchem było ułożenie go od nowa,
 * czyli nowa wersja, nowe propozycje agenta i kolejne 5 tokenów — za to, żeby
 * przenieść jedno muzeum na sobotę. Przeniesienie i usunięcie punktu to
 * arytmetyka godzin i odległości, którą liczymy tu, deterministycznie.
 *
 * Zasada: wolny czas zostaje wolnym czasem. Usunięcie punktu nie ściąga reszty
 * dnia w górę — plan celowo zostawia luz, a zwolnione minuty do niego dołączają.
 * Przeniesienie przesuwa kolejne punkty dnia docelowego tylko o tyle, o ile
 * nowy punkt na nie faktycznie nachodzi.
 */
import { czyBaza, czyPrzystanek, metryMiedzy, type BazaWyjazdu, minutPieszo } from '../tripProjects/helpers';

export interface Pozycja {
  time: string;
  name: string;
  kind?: string;
  minutes?: number;
  source?: string;
  lat?: number;
  lng?: number;
  approx?: boolean;
  baza?: boolean;
  [klucz: string]: unknown;
}

export interface Dzien {
  day: number;
  items: Pozycja[];
  warnings?: string[];
  track?: unknown;
  route_km?: number;
  route_h?: number;
  [klucz: string]: unknown;
}

export interface Plan {
  days: Dzien[];
  [klucz: string]: unknown;
}

const GODZINA = /^(\d{1,2}):(\d{2})$/;

export function czasNaMinuty(t: string): number | null {
  const m = GODZINA.exec(String(t ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function minutyNaCzas(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Przejście: pozycja, która nie jest ani przystankiem, ani noclegiem. */
export function czyPrzejscie(it: Pozycja, baza: BazaWyjazdu | null): boolean {
  return !czyBaza(it, baza) && !czyPrzystanek(it);
}

/** Punkt pozycji na mapie — nocleg z ustawień wyjazdu, reszta z planu. */
function punkt(it: Pozycja | undefined, baza: BazaWyjazdu | null): { lat: number; lng: number } | null {
  if (!it) return null;
  if (czyBaza(it, baza) && baza?.lat != null && baza?.lng != null) return { lat: baza.lat, lng: baza.lng };
  if (czyPrzejscie(it, baza) || it.lat == null || it.lng == null || it.approx) return null;
  return { lat: it.lat, lng: it.lng };
}

/** Minuty pieszo między punktami — ta sama miara co wiersz „N min pieszo" na osi dnia. */
function pieszo(a: { lat: number; lng: number } | null, b: { lat: number; lng: number } | null): number {
  if (!a || !b) return 0;
  const m = metryMiedzy(a, b);
  return m ? minutPieszo(m) : 0;
}

/** Zmiana dnia unieważnia zmierzony przebieg — dotyczył innej listy punktów. */
function bezPrzebiegu(d: Dzien): Dzien {
  const { track: _t, route_km: _k, route_h: _h, ...reszta } = d;
  return reszta as Dzien;
}

const kopia = (p: Plan): Plan => ({ ...p, days: p.days.map((d) => ({ ...d, items: d.items.map((it) => ({ ...it })) })) });

/**
 * Wyjmuje pozycję z dnia razem z przejściem, które do niej prowadziło.
 * „Spacer do Mauritshuis" bez Mauritshuis nie ma dokąd prowadzić.
 */
function wyjmij(d: Dzien, pozycja: number, baza: BazaWyjazdu | null): { dzien: Dzien; wyjeta: Pozycja; zwolnione: number } {
  const items = [...d.items];
  const wyjeta = items[pozycja];
  let zwolnione = wyjeta.minutes || 0;
  const od = pozycja > 0 && czyPrzejscie(items[pozycja - 1], baza) ? pozycja - 1 : pozycja;
  if (od < pozycja) zwolnione += items[od].minutes || 0;
  items.splice(od, pozycja - od + 1);
  const nazwa = wyjeta.name.trim();
  // Uwagi o tym punkcie („Z „A" do „B" jest 8 km…") przestają dotyczyć tego dnia.
  const warnings = (d.warnings || []).filter((w) => !w.includes(nazwa));
  return { dzien: bezPrzebiegu({ ...d, items, warnings }), wyjeta, zwolnione };
}

export function usunPozycje(plan: Plan, dzienIdx: number, pozycja: number, baza: BazaWyjazdu | null):
  { plan: Plan; nazwa: string; zwolnione: number; mialPrzebieg: boolean } {
  const nowy = kopia(plan);
  const zrodlo = nowy.days[dzienIdx];
  const mialPrzebieg = !!zrodlo.track;
  const { dzien, wyjeta, zwolnione } = wyjmij(zrodlo, pozycja, baza);
  nowy.days[dzienIdx] = dzien;
  return { plan: nowy, nazwa: wyjeta.name, zwolnione, mialPrzebieg };
}

/**
 * Najtańsze wstawienie: miejsce w dniu docelowym, w którym nowy punkt dokłada
 * najmniej drogi. Nie przed porannym wyjściem z noclegu, nie po wieczornym
 * powrocie i nie między przejściem a punktem, do którego ono prowadzi.
 */
function gdzieWstawic(items: Pozycja[], nowy: { lat: number; lng: number } | null, baza: BazaWyjazdu | null): number {
  const pierwszy = items.length && czyBaza(items[0], baza) ? 1 : 0;
  const ostatni = items.length && items.length > pierwszy && czyBaza(items[items.length - 1], baza)
    ? items.length - 1 : items.length;
  if (!nowy) return ostatni;

  const poprzedniPunkt = (i: number) => {
    for (let j = i - 1; j >= 0; j--) { const p = punkt(items[j], baza); if (p) return p; }
    return baza?.lat != null && baza?.lng != null ? { lat: baza.lat, lng: baza.lng } : null;
  };
  const nastepnyPunkt = (i: number) => {
    for (let j = i; j < items.length; j++) { const p = punkt(items[j], baza); if (p) return p; }
    return null;
  };

  let najlepsze = ostatni;
  let najmniej = Infinity;
  for (let i = pierwszy; i <= ostatni; i++) {
    if (i > 0 && czyPrzejscie(items[i - 1], baza)) continue;
    const a = poprzedniPunkt(i);
    const b = nastepnyPunkt(i);
    const koszt = pieszo(a, nowy) + pieszo(nowy, b) - pieszo(a, b);
    if (koszt < najmniej) { najmniej = koszt; najlepsze = i; }
  }
  return najlepsze;
}

export function przeniesPozycje(
  plan: Plan, zDnia: number, pozycja: number, doDnia: number, baza: BazaWyjazdu | null, domyslnyStart = '09:00',
): { plan: Plan; nazwa: string; godzina: string; przesuniecie: number; mialPrzebieg: boolean } {
  const nowy = kopia(plan);
  const mialPrzebieg = !!nowy.days[zDnia].track || !!nowy.days[doDnia].track;
  const { dzien: zrodlo, wyjeta } = wyjmij(nowy.days[zDnia], pozycja, baza);
  nowy.days[zDnia] = zrodlo;

  const cel = nowy.days[doDnia];
  const items = [...cel.items];
  const tu = punkt(wyjeta, baza);
  const i = gdzieWstawic(items, tu, baza);

  const poprzedni = i > 0 ? items[i - 1] : undefined;
  let punktPrzed: { lat: number; lng: number } | null = null;
  for (let j = i - 1; j >= 0 && !punktPrzed; j--) punktPrzed = punkt(items[j], baza);
  const koniecPoprzedniego = poprzedni
    ? (czasNaMinuty(poprzedni.time) ?? czasNaMinuty(domyslnyStart)!) + (poprzedni.minutes || 0)
    : (czasNaMinuty(items[0]?.time ?? '') ?? czasNaMinuty(domyslnyStart)!);
  const start = koniecPoprzedniego + pieszo(punktPrzed, tu);
  const koniec = start + (wyjeta.minutes || 0);

  let przesuniecie = 0;
  const nastepny = items[i];
  if (nastepny) {
    let punktPo: { lat: number; lng: number } | null = null;
    for (let j = i; j < items.length && !punktPo; j++) punktPo = punkt(items[j], baza);
    const potrzeba = koniec + (czyPrzejscie(nastepny, baza) ? 0 : pieszo(tu, punktPo));
    const teraz = czasNaMinuty(nastepny.time);
    if (teraz != null && potrzeba > teraz) {
      przesuniecie = potrzeba - teraz;
      for (let j = i; j < items.length; j++) {
        const t = czasNaMinuty(items[j].time);
        if (t != null) items[j] = { ...items[j], time: minutyNaCzas(t + przesuniecie) };
      }
    }
  }

  const godzina = minutyNaCzas(start);
  items.splice(i, 0, { ...wyjeta, time: godzina });
  nowy.days[doDnia] = bezPrzebiegu({ ...cel, items });
  return { plan: nowy, nazwa: wyjeta.name, godzina, przesuniecie, mialPrzebieg };
}

/** Kiedy dzień naprawdę się kończy — ostatnia pozycja plus jej czas trwania. */
export function koniecDnia(d: Dzien): number | null {
  let max: number | null = null;
  for (const it of d.items) {
    const t = czasNaMinuty(it.time);
    if (t == null) continue;
    const k = t + (it.minutes || 0);
    if (max == null || k > max) max = k;
  }
  return max;
}
