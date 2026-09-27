import i18n from '@/i18n';

const DNI_OSM = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MIESIACE_OSM = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Skrót dnia i miesiąca w języku interfejsu — z Intl, bez własnych tabel. */
const skrotDnia = (i: number, jezyk: string) =>
  new Intl.DateTimeFormat(jezyk, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + i)));
const skrotMiesiaca = (i: number, jezyk: string) =>
  new Intl.DateTimeFormat(jezyk, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, i, 15)));

/**
 * Godziny otwarcia z OpenStreetMap w wersji do czytania.
 *
 * Karta w Odkrywaj pokazywała zapis surowy („May-Sep Tu-Su 10:00-18:00”), a okno
 * miejsca tłumaczyło same dni tygodnia — miesiące, „closed” i przecinek jako
 * separator reguł zostawały po angielsku. Przecinek przed dniem albo miesiącem
 * czytamy jak średnik, tak samo jak parser w API (services/opening-hours.ts).
 */
export function formatujGodziny(raw?: string | null): string | null {
  if (!raw) return null;
  const jezyk = i18n.language || 'pl';
  const zrodlo = raw.trim();
  if (/^24\/7$/.test(zrodlo)) return i18n.t('godziny.calodobowo');
  const reguly = zrodlo.replace(
    /(\d{1,2}:\d{2}|closed|off)\s*,\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b)/gi,
    '$1; ',
  );
  // Reguły świąteczne i pojedyncze daty zaśmiecają widok, a nie mówią nic o zwykłym dniu.
  const czesci = reguly.split(';')
    .map((s) => s.trim())
    .filter((s) => s && !/^(PH|SH|Dec\s*\d+|Jan\s*\d+|Nov\s*\d+|Easter)/i.test(s));
  if (czesci.length === 0) return zrodlo;
  const h = czesci.join(' · ')
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (d) => skrotDnia(DNI_OSM.indexOf(d), jezyk))
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (m) => skrotMiesiaca(MIESIACE_OSM.indexOf(m), jezyk))
    .replace(/\b(off|closed)\b/gi, i18n.t('godziny.nieczynne'))
    .replace(/-/g, '–');
  return h.length > 60 ? h.slice(0, 58) + '…' : h;
}
