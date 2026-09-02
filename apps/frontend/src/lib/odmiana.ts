/**
 * Odmiana rzeczownika przez liczebnik.
 *
 * Polski ma trzy formy, nie dwie: „1 miejsce", „2 miejsca", „5 miejsc".
 * Pasek agenta pokazywał „Masz 4 miejsc pewnych", bo rozróżniał tylko liczbę
 * pojedynczą i całą resztę.
 *
 * Wyjątek, który psuje naiwną regułę: nastki idą jak forma dopełniaczowa
 * (12, 13, 14 miejsc), mimo że kończą się na 2, 3, 4 — dlatego sprawdzamy też
 * resztę z dzielenia przez 100.
 *
 *   odmien(1, 'miejsce', 'miejsca', 'miejsc')  ->  'miejsce'
 *   odmien(4, ...)                             ->  'miejsca'
 *   odmien(14, ...)                            ->  'miejsc'
 *   odmien(22, ...)                            ->  'miejsca'
 */
export function odmien(ile: number, jeden: string, dwa: string, piec: string): string {
  const n = Math.abs(Math.trunc(ile));
  if (n === 1) return jeden;
  const reszta10 = n % 10;
  const reszta100 = n % 100;
  if (reszta10 >= 2 && reszta10 <= 4 && !(reszta100 >= 12 && reszta100 <= 14)) return dwa;
  return piec;
}
