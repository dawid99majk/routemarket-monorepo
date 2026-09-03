#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pasek agenta mówi, CO Z TYM ZROBIĆ, a nie tylko ile tego jest.

Dotąd zdanie brzmiało: „Masz 12 miejsc pewnych i 6 do rozważenia (ok. 22,7 h)"
plus stała zachęta. To licznik, nie doradca — ta sama treść pojawiała się przy
tablicy skupionej w centrum i przy takiej, gdzie jeden punkt leży 200 km dalej.

Teraz licznik zostaje (bo to fakt, który człowiek chce widzieć), a po nim idzie
JEDNA uwaga wybrana z bilansu: przeładowanie, rozrzut, brak posiłku, za mało
kotwic albo gotowość. Wybór robi `bilansTablicy` — czysta arytmetyka, zero
wywołań modelu, 15 testów jednostkowych.

DLACZEGO JEDNA, A NIE LISTA. Lista uwag pod kartami to szum, który przestaje się
czytać po trzecim wejściu na tablicę. Uwagi są uszeregowane i wygrywa pierwsza,
która ma pokrycie w danych — od tej, która najbardziej boli."""
import sys

PATH = 'src/components/TripProjects.tsx'

with open(PATH, encoding='utf-8') as f:
    src = f.read()

zmiany = []

zmiany.append((
    "import { odmien } from '@/lib/odmiana';",
    "import { odmien } from '@/lib/odmiana';\n"
    "import { bilansTablicy } from '@/lib/bilansTablicy';",
    'import bilansu'))

# Liczymy bilans obok pozostalych wielkosci pochodnych.
zmiany.append((
    """  const outliers = (() => {""",
    """  /* Jedna uwaga agenta o tym, co zebrane. Liczona z tych samych danych, które
     i tak mamy — bez wołania modelu, żeby tablica nie czekała i nie kosztowała
     przy każdym kliknięciu. Logika i przypadki brzegowe siedzą w `bilansTablicy`
     i mają testy. */
  const uwagaAgenta = bilansTablicy({
    aktywne,
    pewnych: mustCount,
    doRozwazenia: niceCount,
    dni: active?.days ?? null,
    zajeteMinut: budget?.used ?? null,
    planowaneMinut: budget?.planned ?? null,
  });

  const outliers = (() => {""",
    'wyliczenie uwagi'))

# Zdanie w pasku: licznik + uwaga z bilansu.
zmiany.append((
    """                    Masz <strong>{mustCount}</strong> {odmien(mustCount, 'miejsce pewne', 'miejsca pewne', 'miejsc pewnych')} i <strong>{niceCount}</strong> do rozważenia
                    {budget ? ` (ok. ${(budget.used / 60).toFixed(1)} h zwiedzania)` : ''}.
                    {' '}
                    {mustCount + niceCount >= (active.days ? active.days * 2 : 3)
                      ? 'To zbalansowana baza kotwic — kliknij „Ułóż plan”, a ułożę je w realną trasę z dojściami i posiłkami.'
                      : 'Dobierz jeszcze kilka interesujących punktów, a ułożę z nich optymalny plan dnia.'}""",
    """                    Masz <strong>{mustCount}</strong> {odmien(mustCount, 'miejsce pewne', 'miejsca pewne', 'miejsc pewnych')} i <strong>{niceCount}</strong> do rozważenia
                    {budget ? ` (ok. ${(budget.used / 60).toFixed(1)} h zwiedzania)` : ''}.
                    {' '}
                    {uwagaAgenta?.tekst}""",
    'zdanie z bilansu'))

for old, new, opis in zmiany:
    n = src.count(old)
    if n != 1:
        print('BŁĄD: %d wystąpień zamiast 1 dla: %s' % (n, opis), file=sys.stderr)
        sys.exit(1)
    src = src.replace(old, new)
    print('  OK: %s' % opis)

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
