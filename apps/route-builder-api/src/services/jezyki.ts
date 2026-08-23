/**
 * Język odpowiedzi modelu.
 *
 * Interfejs dawało się przetłumaczyć samymi plikami tłumaczeń, ale treść nie:
 * plan dnia, opisy miejsc i wydarzenia powstają u modelu, a ten pisał zawsze po
 * polsku, bo taki był prompt. Niemiec dostawał niemieckie menu i polski
 * harmonogram — to nie jest produkt w niemieckim, tylko polski z przetłumaczonym
 * paskiem.
 *
 * Język przyjeżdża nagłówkiem `Accept-Language`, ustawianym raz w kliencie API,
 * a nie polem w ciele każdego zapytania. Dzięki temu obejmuje wszystkie
 * endpointy — także te, które powstaną później — i nie zmienia kształtu żadnego
 * payloadu.
 *
 * Domyślny polski, a nie angielski: gdyby nagłówek gdzieś nie doszedł, wynik ma
 * wyglądać tak jak dotąd, zamiast po cichu zmienić język całemu serwisowi.
 */
import type { Context } from 'hono';

export const JEZYKI_UI = ['pl', 'en', 'de', 'fr', 'es', 'it'] as const;
export type KodJezyka = typeof JEZYKI_UI[number];

const DOMYSLNY: KodJezyka = 'pl';

/** Nazwa w miejscowniku — wpada wprost w zdanie "napisz po ...". */
const W_JEZYKU: Record<KodJezyka, string> = {
  pl: 'polsku',
  en: 'angielsku',
  de: 'niemiecku',
  fr: 'francusku',
  es: 'hiszpańsku',
  it: 'włosku',
};

/** Nazwa własna języka — przydaje się, gdy prompt ma być jednoznaczny. */
const NAZWA: Record<KodJezyka, string> = {
  pl: 'polski',
  en: 'English',
  de: 'Deutsch',
  fr: 'français',
  es: 'español',
  it: 'italiano',
};

/**
 * Kod języka z nagłówka. Przyjmujemy też postać regionalną ("de-AT", "en-GB"),
 * bo przeglądarka i tak ją wyśle, a nas interesuje sam język.
 */
export function jezykZadania(c: Context): KodJezyka {
  const naglowek = c.req.header('Accept-Language') || '';
  const pierwszy = naglowek.split(',')[0]?.trim().toLowerCase() || '';
  const kod = pierwszy.split('-')[0];
  return (JEZYKI_UI as readonly string[]).includes(kod) ? (kod as KodJezyka) : DOMYSLNY;
}

/**
 * Zdanie doklejane do promptu. Przy polskim zwraca pusty napis — prompty są
 * napisane po polsku, więc dokładanie "napisz po polsku" byłoby szumem, a każdy
 * zbędny wiersz w prompcie kosztuje przy każdym wywołaniu.
 */
export function instrukcjaJezyka(kod: KodJezyka): string {
  if (kod === 'pl') return '';
  return `
JĘZYK ODPOWIEDZI: ${NAZWA[kod]}. Wszystkie teksty widoczne dla użytkownika — nazwy
własne pozycji, notatki, podsumowania, ostrzeżenia, powody — napisz po ${W_JEZYKU[kod]}.
Nazw własnych miejsc NIE tłumacz: "Hala Stulecia" ma zostać "Halą Stulecia", bo pod
taką nazwą użytkownik znajdzie ją na mapie i na tabliczce przy wejściu. Tłumaczysz to,
co sam piszesz, nie to, co jest cudzą nazwą.`;
}
