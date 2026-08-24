/**
 * Zawężanie wartości przychodzących z bazy.
 *
 * Kolumny jsonb wracają jako unia Json, a kolumny tekstowe jako `string` —
 * nawet gdy w praktyce trzymają zamknięty zbiór wartości. Rzutowanie wyciszyłoby
 * TypeScript, ale nie zmieniłoby tego, że runtime może przynieść co innego niż
 * zakładamy. Te funkcje sprawdzają kształt i podstawiają sensowną wartość, więc
 * jeden dziwny wiersz nie wywraca całego ekranu.
 */

/** Tablica adresów zdjęć z kolumny jsonb. Wpisy inne niż tekst odpadają. */
export function jakoZdjecia(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Obiekt z kolumny jsonb. Tablica i wartość prosta to nie obiekt. */
export function jakoObiekt<T extends object>(v: unknown): T | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : null;
}
