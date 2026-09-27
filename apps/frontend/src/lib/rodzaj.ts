import i18n from '@/i18n';

/**
 * Rodzaj miejsca po ludzku.
 *
 * Karty pokazywały surowy tag z OpenStreetMap — „attraction”, „place_of_worship”,
 * „yes” — po angielsku także w polskim interfejsie. Znane rodzaje mają etykietę
 * w każdym języku; nieznany albo pusty („poi”, „yes”) zwraca null i znaczek
 * znika: lepiej bez etykiety niż z kodem, którego nikt nie rozumie.
 */
export function etykietaRodzaju(kind?: string | null): string | null {
  if (!kind) return null;
  const klucz = `rodzaj.${kind}`;
  return i18n.exists(klucz) ? i18n.t(klucz) : null;
}
