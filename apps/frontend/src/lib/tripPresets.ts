/**
 * Charakter wyjazdu. Ten sam człowiek na delegacji potrzebuje czego innego niż
 * na urlopie z dziećmi, więc preferencje z profilu są tylko wartością domyślną —
 * wybór charakteru nadpisuje osie na czas tego jednego wyjazdu.
 * Wartości 0-100 w tej samej skali co profil użytkownika; null = dziedzicz.
 */
export interface AxisValues {
  pace: number | null;
  popularity: number | null;
  wandering: number | null;
  dining: number | null;
  effort: number | null;
  crowds: number | null;
}

export const EMPTY_AXES: AxisValues = {
  pace: null, popularity: null, wandering: null, dining: null, effort: null, crowds: null
};

export interface TripPreset {
  id: string;
  label: string;
  hint: string;
  axes: AxisValues;
}

export const TRIP_PRESETS: TripPreset[] = [
  {
    id: 'business',
    label: 'Delegacja',
    hint: 'Krótkie okna między obowiązkami — najważniejsze rzeczy, bez nadkładania drogi',
    axes: { pace: 30, popularity: 25, wandering: 20, dining: 40, effort: 30, crowds: 40 }
  },
  {
    id: 'family',
    label: 'Z dziećmi',
    hint: 'Spokojnie, bez długich podejść, z zapasem czasu i miejscami na przerwę',
    axes: { pace: 80, popularity: 30, wandering: 25, dining: 70, effort: 15, crowds: 70 }
  },
  {
    id: 'couple',
    label: 'We dwoje',
    hint: 'Bez pośpiechu, klimatyczne miejsca, dobre kolacje',
    axes: { pace: 70, popularity: 45, wandering: 60, dining: 30, effort: 40, crowds: 70 }
  },
  {
    id: 'friends',
    label: 'Ze znajomymi',
    hint: 'Lokalny klimat, jedzenie z ulicy, wieczory',
    axes: { pace: 40, popularity: 40, wandering: 60, dining: 75, effort: 50, crowds: 35 }
  },
  {
    id: 'solo',
    label: 'Solo / fotografia',
    hint: 'Nieoczywiste kadry, pusto, własne tempo',
    axes: { pace: 60, popularity: 75, wandering: 80, dining: 60, effort: 60, crowds: 80 }
  },
  {
    id: 'active',
    label: 'Aktywnie',
    hint: 'Dużo ruchu, podejścia i punkty widokowe mile widziane',
    axes: { pace: 30, popularity: 40, wandering: 50, dining: 60, effort: 85, crowds: 60 }
  }
];

/** Profil wyjazdu wygrywa tam, gdzie coś ustawiono; reszta z profilu użytkownika. */
export function mergePreferences(
  base: Record<string, number> | null | undefined,
  trip: Partial<AxisValues> | null | undefined
): Record<string, number> {
  const keys: (keyof AxisValues)[] = ['pace', 'popularity', 'wandering', 'dining', 'effort', 'crowds'];
  const out: Record<string, number> = {};
  for (const key of keys) {
    const tripValue = trip?.[key];
    if (tripValue != null) out[key] = tripValue;
    else if (base?.[key] != null) out[key] = base[key];
  }
  return out;
}
