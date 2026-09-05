/**
 * Liczba dziesiętna po polsku.
 *
 * `toFixed()` zawsze daje kropkę, więc ta sama tablica pokazywała „26,6 h"
 * w pasku agenta i „26.6 h" w ustawieniach wyjazdu — dwie różne konwencje
 * w odległości jednego kliknięcia. Formatowanie liczb to nie jest rzecz do
 * powtarzania w każdym miejscu z osobna.
 */
export function dziesietna(wartosc: number, miejsc = 1): string {
  if (!Number.isFinite(wartosc)) return '—';
  return wartosc.toFixed(miejsc).replace('.', ',');
}

/** Minuty jako godziny: 1596 -> „26,6". */
export const godziny = (minut: number): string => dziesietna(minut / 60);
