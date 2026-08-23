import i18n from '@/i18n';

/**
 * Opis miejsca w języku użytkownika.
 *
 * Opisy w katalogu są współdzielone, więc trzymamy je per język w
 * `description_i18n`. Stara kolumna `description` zostaje jako zapas: jest
 * czytana w kilkunastu miejscach i wywalenie jej zamieniłoby migrację danych
 * w przepisywanie połowy aplikacji.
 *
 * Kolejność zapasów ma znaczenie. Gdy brakuje wersji w języku użytkownika,
 * angielska jest lepszym wyborem niż polska — Francuz prędzej przeczyta
 * angielski opis niż polski. Polska wchodzi dopiero na końcu, bo to jedyna,
 * o której wiemy na pewno, że istnieje dla starych wpisów.
 */
export function opisMiejsca(miejsce: any): string {
  if (!miejsce) return '';
  const jezyk = i18n.language?.split('-')[0] || 'pl';
  const wersje = miejsce.description_i18n as Record<string, string> | undefined;
  return (
    wersje?.[jezyk] ||
    wersje?.en ||
    wersje?.pl ||
    miejsce.description ||
    miejsce.wiki_extract ||
    ''
  );
}
