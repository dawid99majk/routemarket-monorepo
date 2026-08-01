/**
 * Parser godzin otwarcia w formacie OpenStreetMap. Obsługuje wzorce spotykane
 * w praktyce przy muzeach i gastronomii:
 *   "Tu-Su 10:00-20:00", "Mo-Fr 09:00-17:00; Sa 10:00-14:00",
 *   "Apr-Sep 11:00-19:00; Oct-Mar 10:00-18:00; Mo,Tu closed", "24/7"
 * Celowo nie celuje w pełną specyfikację — chodzi o wiarygodną odpowiedź na
 * pytanie "czy w ten dzień o tej godzinie będzie otwarte", a przy wzorcu, którego
 * nie rozumiemy, uczciwie zwracamy null zamiast zgadywać.
 */

const DAYS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export interface OpenInterval {
  from: number; // minuty od północy
  to: number;
}

function parseDayToken(token: string): number[] {
  const t = token.trim().toLowerCase();
  const range = t.match(/^([a-z]{2})-([a-z]{2})$/);
  if (range) {
    const start = DAYS.indexOf(range[1]);
    const end = DAYS.indexOf(range[2]);
    if (start < 0 || end < 0) return [];
    const out: number[] = [];
    for (let i = start; ; i = (i + 1) % 7) {
      out.push(i);
      if (i === end) break;
      if (out.length > 7) break;
    }
    return out;
  }
  const single = DAYS.indexOf(t);
  return single >= 0 ? [single] : [];
}

function parseMonthRange(token: string): [number, number] | null {
  const m = token.trim().toLowerCase().match(/^([a-z]{3})-([a-z]{3})$/);
  if (!m) return null;
  const from = MONTHS.indexOf(m[1]);
  const to = MONTHS.indexOf(m[2]);
  return from >= 0 && to >= 0 ? [from, to] : null;
}

function monthInRange(month: number, [from, to]: [number, number]): boolean {
  return from <= to ? month >= from && month <= to : month >= from || month <= to;
}

function toMinutes(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Zwraca przedziały otwarcia danego dnia albo null, gdy zapisu nie da się
 * zinterpretować (wtedy nie wolno zakładać, że jest otwarte ani że zamknięte).
 */
export function openIntervalsOn(spec: string | null | undefined, date: Date): OpenInterval[] | null {
  if (!spec) return null;
  const value = spec.trim();
  if (!value) return null;
  if (/^24\/7$/i.test(value)) return [{ from: 0, to: 24 * 60 }];

  const weekday = date.getDay();
  const month = date.getMonth();
  let intervals: OpenInterval[] | null = null;
  let understoodAnything = false;

  for (const rawRule of value.split(';')) {
    const rule = rawRule.trim();
    if (!rule) continue;

    // Zakres miesięcy na początku reguły zawęża jej obowiązywanie
    const parts = rule.split(/\s+/);
    let idx = 0;
    const monthRange = parseMonthRange(parts[0] || '');
    if (monthRange) {
      if (!monthInRange(month, monthRange)) {
        understoodAnything = true;
        continue;
      }
      idx = 1;
    }

    const dayToken = parts[idx] || '';
    const days = dayToken.split(',').flatMap(parseDayToken);
    const rest = parts.slice(days.length > 0 ? idx + 1 : idx).join(' ').trim();
    const appliesToday = days.length === 0 || days.includes(weekday);

    if (/^(closed|off)$/i.test(rest) || /^(closed|off)$/i.test(dayToken)) {
      understoodAnything = true;
      if (appliesToday) return [];
      continue;
    }

    const timeMatches = [...rest.matchAll(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g)];
    if (timeMatches.length === 0) continue;
    understoodAnything = true;
    if (!appliesToday) continue;

    for (const tm of timeMatches) {
      const from = toMinutes(tm[1]);
      const to = toMinutes(tm[2]);
      if (from == null || to == null) continue;
      if (!intervals) intervals = [];
      intervals.push({ from, to: to <= from ? 24 * 60 : to });
    }
  }

  if (!understoodAnything) return null;
  return intervals ?? [];
}

/** Czy obiekt jest otwarty przez cały zadany przedział wizyty. */
export function isOpenDuring(
  spec: string | null | undefined,
  date: Date,
  startMinutes: number,
  durationMinutes: number
): boolean | null {
  const intervals = openIntervalsOn(spec, date);
  if (intervals === null) return null;
  const end = startMinutes + durationMinutes;
  return intervals.some((i) => startMinutes >= i.from && end <= i.to);
}

/** Czytelny opis dostępności danego dnia — trafia do promptu i do ostrzeżeń. */
export function describeAvailability(spec: string | null | undefined, date: Date): string {
  const intervals = openIntervalsOn(spec, date);
  if (intervals === null) return spec ? `godziny: ${spec} (nie udało się zinterpretować)` : 'godziny nieznane';
  if (intervals.length === 0) return 'ZAMKNIĘTE tego dnia';
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return `otwarte ${intervals.map((i) => `${fmt(i.from)}-${fmt(i.to)}`).join(', ')}`;
}
