#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kolejka zatwierdzeń routemarket.io.

    ./kolejka.py                      co czeka, uszeregowane po wadze
    ./kolejka.py <id>                 jeden wpis z dowodem
    ./kolejka.py tak <id> [uwaga]     zatwierdź
    ./kolejka.py nie <id> [powód]     odrzuć
    ./kolejka.py wykonaj <id>         uruchom polecenie z zatwierdzonego wpisu
    ./kolejka.py dodaj                wpis z JSON-a na wejściu (dla agentów)
    ./kolejka.py historia [ile]       ostatnio rozstrzygnięte

Wykonanie jest osobnym krokiem, a nie skutkiem zatwierdzenia. Automat
uruchamiający zapisane polecenia byłby dokładnie tą furtką, przed którą ma
chronić cały ten model — więc zgoda i uruchomienie to dwie różne decyzje,
a przed uruchomieniem widać dokładnie, co się wykona.
"""
import json
import subprocess
import sys
import textwrap

WAGI = {'pilne': 0, 'wazne': 1, 'drobne': 2}
ZNAK = {'pilne': '!!', 'wazne': ' •', 'drobne': '  '}


def sql(zapytanie: str, jako_json: bool = True):
    """Zapytanie przez psql w kontenerze. JSON, żeby nie parsować tabelek."""
    if jako_json:
        zapytanie = "select coalesce(json_agg(t), '[]'::json) from (%s) t;" % zapytanie.rstrip(';')
    # stdin=DEVNULL jest tu konieczne, nie ozdobne: 'docker exec -i' dziedziczy
    # wejście skryptu i zjada je w całości. Bez tego potwierdzenie wpisane przez
    # człowieka przy 'wykonaj' znikało, zanim input() zdążyło je przeczytać —
    # i wyglądało to na zadziałanie zabezpieczenia, a było zwykłym błędem.
    wynik = subprocess.run(
        ['docker', 'exec', '-i', 'supabase-db', 'psql', '-U', 'postgres', '-X', '-t', '-A', '-c', zapytanie],
        capture_output=True, text=True, stdin=subprocess.DEVNULL)
    if wynik.returncode != 0:
        print('Błąd bazy: %s' % wynik.stderr.strip(), file=sys.stderr)
        sys.exit(1)
    tekst = wynik.stdout.strip()
    return json.loads(tekst) if jako_json and tekst else (tekst if not jako_json else [])


def apostrof(s):
    return "'" + str(s).replace("'", "''") + "'"


def lista():
    wpisy = sql("""
        select id, agent, obszar, waga, tytul, powtorzen,
               to_char(utworzono, 'DD.MM') as kiedy,
               (now() - utworzono > interval '7 days') as stare
        from public.kolejka_zatwierdzen where stan = 'czeka'
    """)
    if not wpisy:
        print('Kolejka pusta.')
        return
    wpisy.sort(key=lambda w: (WAGI.get(w['waga'], 9), w['id']))
    print()
    print('  %-4s %-3s %-11s %-46s %s' % ('ID', '', 'OBSZAR', 'CO', 'ZGŁOSIŁ'))
    print('  ' + '─' * 84)
    for w in wpisy:
        tytul = w['tytul'][:44] + ('…' if len(w['tytul']) > 45 else '')
        dopiski = []
        if w['powtorzen'] > 1:
            dopiski.append('×%d' % w['powtorzen'])
        if w['stare']:
            dopiski.append('od %s' % w['kiedy'])
        print('  %-4s %-3s %-11s %-46s %s%s' % (
            w['id'], ZNAK.get(w['waga'], ''), w['obszar'][:11], tytul, w['agent'],
            '  ' + ' '.join(dopiski) if dopiski else ''))
    print()
    pilne = sum(1 for w in wpisy if w['waga'] == 'pilne')
    print('  %d czeka%s. Szczegóły: ./kolejka.py <id>' % (
        len(wpisy), ', w tym %d pilnych' % pilne if pilne else ''))
    print()


def pokaz(wid):
    w = sql("select * from public.kolejka_zatwierdzen where id = %s" % int(wid))
    if not w:
        print('Nie ma wpisu %s.' % wid)
        sys.exit(1)
    w = w[0]
    print()
    print('  #%s  [%s]  %s · %s' % (w['id'], w['waga'], w['obszar'], w['agent']))
    print('  ' + '─' * 72)
    print('  %s' % w['tytul'])
    if w['opis']:
        print()
        for linia in textwrap.wrap(w['opis'], 70):
            print('  %s' % linia)
    if w['dowod'] and w['dowod'] != {}:
        print()
        print('  DOWÓD')
        for k, v in (w['dowod'] if isinstance(w['dowod'], dict) else {}).items():
            print('    %-18s %s' % (k + ':', str(v)[:52]))
    if w['proponowane_dzialanie']:
        print()
        print('  PROPOZYCJA')
        for linia in textwrap.wrap(w['proponowane_dzialanie'], 70):
            print('    %s' % linia)
    if w['polecenie']:
        print()
        print('  POLECENIE (uruchomi się dopiero po ./kolejka.py wykonaj %s)' % w['id'])
        for linia in w['polecenie'].split('\n'):
            print('    %s' % linia)
    print()
    print('  stan: %s%s' % (w['stan'], ('  ·  ' + w['uwaga']) if w['uwaga'] else ''))
    if w['stan'] == 'czeka':
        print('  ./kolejka.py tak %s   albo   ./kolejka.py nie %s "powód"' % (w['id'], w['id']))
    print()


def rozstrzygnij(wid, stan, uwaga):
    w = sql("select stan, tytul from public.kolejka_zatwierdzen where id = %s" % int(wid))
    if not w:
        print('Nie ma wpisu %s.' % wid)
        sys.exit(1)
    if w[0]['stan'] != 'czeka':
        print('Wpis %s jest już %s — nie zmieniam.' % (wid, w[0]['stan']))
        sys.exit(1)
    sql("update public.kolejka_zatwierdzen set stan = %s, rozstrzygnieto = now(), uwaga = %s where id = %s"
        % (apostrof(stan), apostrof(uwaga) if uwaga else 'null', int(wid)), jako_json=False)
    print('#%s → %s%s' % (wid, stan, ('  (%s)' % uwaga) if uwaga else ''))
    if stan == 'zatwierdzone':
        polecenie = sql("select polecenie from public.kolejka_zatwierdzen where id = %s" % int(wid))[0]['polecenie']
        if polecenie:
            print('Do uruchomienia: ./kolejka.py wykonaj %s' % wid)


def wykonaj(wid):
    w = sql("select * from public.kolejka_zatwierdzen where id = %s" % int(wid))
    if not w:
        print('Nie ma wpisu %s.' % wid)
        sys.exit(1)
    w = w[0]
    if w['stan'] != 'zatwierdzone':
        print('Wpis %s ma stan „%s" — uruchamiam tylko zatwierdzone.' % (wid, w['stan']))
        sys.exit(1)
    if not w['polecenie']:
        print('Wpis %s nie ma polecenia — to działanie wymaga rąk.' % wid)
        sys.exit(1)

    print()
    print('Uruchomię:')
    for linia in w['polecenie'].split('\n'):
        print('    %s' % linia)
    print()
    try:
        if input('Na pewno? [tak/nie] ').strip().lower() not in ('tak', 't', 'yes', 'y'):
            print('Przerwane.')
            return
    except EOFError:
        print('Brak potwierdzenia (wejście nieinteraktywne) — przerwane.')
        return

    wynik = subprocess.run(['bash', '-c', w['polecenie']], capture_output=True, text=True)
    wyjscie = (wynik.stdout + wynik.stderr).strip()[-1800:]
    stan = 'wykonane' if wynik.returncode == 0 else 'zatwierdzone'
    sql("update public.kolejka_zatwierdzen set stan = %s, wynik = %s where id = %s"
        % (apostrof(stan), apostrof('kod %d\n%s' % (wynik.returncode, wyjscie)), int(wid)), jako_json=False)
    print(wyjscie)
    print()
    print('kod wyjścia: %d → %s' % (wynik.returncode, stan))


def dodaj():
    """Wpis od agenta, JSON na wejściu. Powtórka podbija licznik zamiast zasypywać."""
    try:
        d = json.load(sys.stdin)
    except Exception as e:
        print('Nieczytelny JSON: %s' % e, file=sys.stderr)
        sys.exit(1)
    for pole in ('agent', 'obszar', 'tytul', 'odcisk'):
        if not d.get(pole):
            print('Brak pola „%s".' % pole, file=sys.stderr)
            sys.exit(1)
    # INSERT w CTE, bo pomocnik `sql` opakowuje zapytanie w SELECT — a tego
    # nie da się zrobić z wstawianiem inaczej niż przez wspólne wyrażenie.
    zapytanie = """
        with wstawione as (
          insert into public.kolejka_zatwierdzen
            (agent, obszar, waga, tytul, opis, dowod, proponowane_dzialanie, polecenie, odcisk)
          values (%s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s)
          on conflict (odcisk) where stan = 'czeka'
          do update set powtorzen = kolejka_zatwierdzen.powtorzen + 1,
                        ostatnio_widziane = now()
          returning id, powtorzen
        )
        select coalesce(json_agg(wstawione), '[]'::json) from wstawione;
    """ % (apostrof(d['agent']), apostrof(d['obszar']), apostrof(d.get('waga', 'wazne')),
           apostrof(d['tytul']), apostrof(d.get('opis', '')),
           apostrof(json.dumps(d.get('dowod', {}), ensure_ascii=False)),
           apostrof(d.get('proponowane_dzialanie', '')),
           apostrof(d['polecenie']) if d.get('polecenie') else 'null',
           apostrof(d['odcisk']))
    surowe = sql(zapytanie, jako_json=False)
    wynik = json.loads(surowe) if surowe else []
    if wynik:
        w = wynik[0]
        print('#%s%s' % (w['id'], ' (powtórzenie ×%s)' % w['powtorzen'] if w['powtorzen'] > 1 else ''))
    else:
        print('Wpis już czeka w kolejce — nie dubluję.')


def historia(ile=15):
    wpisy = sql("""
        select id, obszar, waga, tytul, stan, uwaga,
               to_char(rozstrzygnieto, 'DD.MM HH24:MI') as kiedy
        from public.kolejka_zatwierdzen
        where stan <> 'czeka' order by rozstrzygnieto desc limit %d
    """ % int(ile))
    if not wpisy:
        print('Nic jeszcze nie rozstrzygnięto.')
        return
    print()
    for w in wpisy:
        print('  %-4s %-12s %-11s %-40s %s' % (
            w['id'], w['kiedy'] or '', w['stan'], w['tytul'][:38],
            ('· ' + w['uwaga'][:24]) if w['uwaga'] else ''))
    print()


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a:
        lista()
    elif a[0] == 'dodaj':
        dodaj()
    elif a[0] == 'historia':
        historia(a[1] if len(a) > 1 else 15)
    elif a[0] in ('tak', 'zatwierdz'):
        rozstrzygnij(a[1], 'zatwierdzone', ' '.join(a[2:]) or None)
    elif a[0] in ('nie', 'odrzuc'):
        rozstrzygnij(a[1], 'odrzucone', ' '.join(a[2:]) or None)
    elif a[0] == 'wykonaj':
        wykonaj(a[1])
    elif a[0].isdigit():
        pokaz(a[0])
    else:
        print(__doc__)
