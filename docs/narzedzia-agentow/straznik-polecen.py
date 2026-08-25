#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Strażnik poleceń nieodwracalnych.

Uruchamiany przez środowisko Claude Code PRZED każdym wywołaniem Basha —
i to jest cała jego wartość. Instrukcja w prompcie może zostać pominięta przy
długiej sesji albo przykryta innym poleceniem; hook nie może, bo nie jest
adresowany do modelu.

Blokuje wyłącznie rzeczy, których nie da się cofnąć albo których cofnięcie
kosztuje przestój. Nie udaje, że rozumie polecenia — rozpoznaje wzorce i przy
trafieniu odmawia, zostawiając człowiekowi decyzję. Fałszywy alarm kosztuje
jedno zdanie wyjaśnienia; przeoczenie kosztuje bazę.

Zwraca kod 2, żeby zablokować, a wyjaśnienie pisze na stderr — model je zobaczy
i będzie wiedział, co zrobić zamiast.
"""
import json
import re
import sys

# Każdy wzorzec ma powód. Bez powodu nie ma wpisu — lista, której nikt nie
# rozumie, zostaje wyłączona przy pierwszym fałszywym alarmie.
WZORCE = [
    (r'\bDROP\s+(TABLE|DATABASE|SCHEMA)\b',
     'usunięcie tabeli, bazy albo schematu jest nieodwracalne'),
    (r'\bTRUNCATE\b',
     'TRUNCATE czyści tabelę bez możliwości cofnięcia i nie da się go objąć zwykłym ROLLBACK-iem po fakcie'),
    (r'\bDELETE\s+FROM\s+\w+\s*;',
     'DELETE bez WHERE kasuje całą tabelę — dopisz warunek albo użyj transakcji z podglądem'),
    (r'\bUPDATE\s+\w+\s+SET\b(?![\s\S]*\bWHERE\b)',
     'UPDATE bez WHERE zmienia wszystkie wiersze'),
    # Rekurencyjne usuwanie ŚCIEŻKĄ BEZWZGLĘDNĄ albo z katalogu domowego.
    # Ścieżki względne (./build, node_modules) przechodzą — to codzienne
    # sprzątanie. Katalogi tymczasowe też, bo po to są.
    (r'\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(?!/tmp|/private/tmp|/var/folders)(/|~|\$HOME)',
     'rekurencyjne usuwanie ścieżką bezwzględną albo z katalogu domowego'),
    (r'\bgit\s+push\b[^|;&]*--force(?!-with-lease)',
     'wymuszony push nadpisuje historię zdalną; --force-with-lease jest bezpieczniejszy'),
    (r'\bgit\s+reset\s+--hard\b[^|;&]*origin/',
     'twardy reset do zdalnej gałęzi kasuje niezacommitowaną pracę'),
    (r'\bDROP\s+POLICY\b(?![\s\S]*\bCREATE\s+POLICY\b)',
     'usunięcie polityki RLS bez utworzenia nowej w tej samej transakcji odsłania tabelę'),
    (r'\bALTER\s+TABLE\s+\w+\s+DISABLE\s+ROW\s+LEVEL\s+SECURITY\b',
     'wyłączenie RLS otwiera tabelę dla wszystkich ról'),
    (r'\bdocker\s+(rm|volume\s+rm)\b[^|;&]*supabase-db',
     'usunięcie kontenera albo wolumenu bazy kasuje dane'),
]

# Odczyty, które przypadkiem zawierają groźne słowo — np. `grep -r "DROP TABLE"`
# przy szukaniu migracji. Blokowanie ich byłoby wyłącznie uciążliwe.
NIESZKODLIWE = re.compile(
    r'^\s*(grep|rg|ag|find|cat|less|head|tail|echo|awk|sed\s+-n|git\s+log|git\s+show|git\s+diff)\b'
)


def main() -> int:
    try:
        dane = json.load(sys.stdin)
    except Exception:
        return 0  # nie rozumiem wejścia — nie blokuję, bo to nie mój błąd do rozstrzygania

    if dane.get('tool_name') != 'Bash':
        return 0

    polecenie = (dane.get('tool_input') or {}).get('command', '')
    if not polecenie or NIESZKODLIWE.match(polecenie):
        return 0

    for wzorzec, powod in WZORCE:
        if re.search(wzorzec, polecenie, re.IGNORECASE):
            print(
                'Zablokowane przez strażnika poleceń: %s.\n'
                'Jeśli to naprawdę potrzebne, poproś użytkownika, żeby wykonał to sam, '
                'albo zaproponuj wariant odwracalny (transakcja z podglądem, kopia przed zmianą, '
                '--force-with-lease zamiast --force).' % powod,
                file=sys.stderr,
            )
            return 2

    return 0


if __name__ == '__main__':
    sys.exit(main())
