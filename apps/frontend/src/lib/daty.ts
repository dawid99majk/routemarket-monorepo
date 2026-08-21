const MIESIACE = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
];

/**
 * Zakres dat po ludzku.
 *
 * Wcześniej data wydarzenia powstawała przez `starts_on.slice(5)`, czyli obcięcie
 * roku z zapisu ISO. Na ekranie dawało to „08-23–09-19" — rebus, w którym nie
 * widać ani roku, ani tego, że to sierpień i wrzesień. Nazwa miesiąca kosztuje
 * kilka znaków więcej i zdejmuje całą zagadkę.
 *
 * Rok pokazujemy tylko wtedy, gdy niesie informację: przy wydarzeniu w tym samym
 * roku co dziś jest szumem, przy przełomie roku jest niezbędny.
 */
export function zakresDat(od: string | null | undefined, doDnia?: string | null): string {
  if (!od) return '';
  const a = new Date(od + 'T00:00:00');
  if (Number.isNaN(a.getTime())) return '';
  const b = doDnia && doDnia !== od ? new Date(doDnia + 'T00:00:00') : null;
  const rokTeraz = new Date().getFullYear();

  const dzien = (d: Date) => d.getDate();
  const miesiac = (d: Date) => MIESIACE[d.getMonth()];
  const rok = (d: Date) => d.getFullYear();

  if (!b || Number.isNaN(b.getTime())) {
    const r = rok(a) === rokTeraz ? '' : ` ${rok(a)}`;
    return `${dzien(a)} ${miesiac(a)}${r}`;
  }
  if (rok(a) !== rok(b)) {
    return `${dzien(a)} ${miesiac(a)} ${rok(a)} – ${dzien(b)} ${miesiac(b)} ${rok(b)}`;
  }
  const r = rok(a) === rokTeraz ? '' : ` ${rok(a)}`;
  if (a.getMonth() === b.getMonth()) {
    return `${dzien(a)}–${dzien(b)} ${miesiac(a)}${r}`;
  }
  return `${dzien(a)} ${miesiac(a)} – ${dzien(b)} ${miesiac(b)}${r}`;
}

/** Czy wydarzenie zahacza o podany przedział. Null w przedziale = brak terminu. */
export function wTerminie(
  od: string | null | undefined, doDnia: string | null | undefined,
  oknoOd: string | null, oknoDo: string | null,
): boolean {
  if (!od || !oknoOd) return false;
  const start = od;
  const koniec = doDnia || od;
  const kres = oknoDo || oknoOd;
  // Przedziały zachodzą na siebie, gdy żaden nie kończy się przed początkiem drugiego.
  return start <= kres && koniec >= oknoOd;
}
