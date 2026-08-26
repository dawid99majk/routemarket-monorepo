#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Rozszerza katalog o kategorie, które nie mieściły się w limicie 24 na miasto.

    ./rozszerz.py [miasto ...]      bez argumentów: wszystkie miasta z katalogu

Preset `city_walk` w warstwie POI jest szeroki — pyta Overpassa o punkty
widokowe, parki, ogrody, mosty, targowiska, fontanny i bramy miejskie. Mimo to
katalog miał 41 muzeów i 42 świątynie, a tylko jeden punkt widokowy, jeden most
i jedno targowisko. Nie brakowało zapytań, brakowało MIEJSCA: przy limicie 24 na
miasto kościoły i muzea zajmowały całą pulę, bo stoją wyżej w rankingu Overpassa.

Podnosimy limit do czterdziestu — tyle, ile dopuszcza `/catalog/seed`.

Noclegi lecą po każdym przebiegu. Seed pobiera je celowo, jako podpowiedzi bazy
wyjazdu, ale katalog ma trzymać rzeczy do zobaczenia i zjedzenia. Jeśli baza
wyjazdu ma wracać, lepszym miejscem jest osobne zapytanie przy wyborze hotelu
niż mieszanie noclegów z atrakcjami w jednej tabeli.

Limit `/catalog/seed` to sześć wywołań na dziesięć minut, więc idziemy paczkami.
"""
import base64, hashlib, hmac, json, subprocess, sys, time, urllib.error, urllib.request

ADMIN = '6f7e22c4-e159-4b68-8e29-9f41b36c0a2a'
API = 'http://127.0.0.1:8081'
LIMIT = 40
NA_PACZKE = 6
PRZERWA = 620          # limit to 6 na 10 minut; dokładamy 20 s marginesu


def psql(zapytanie, json_out=True):
    if json_out:
        zapytanie = "select coalesce(json_agg(t),'[]'::json) from (%s) t;" % zapytanie.rstrip(';')
    w = subprocess.run(['docker', 'exec', '-i', 'supabase-db', 'psql', '-U', 'postgres',
                        '-X', '-t', '-A', '-c', zapytanie],
                       capture_output=True, text=True, stdin=subprocess.DEVNULL)
    if w.returncode != 0:
        print('Błąd bazy: %s' % w.stderr.strip(), file=sys.stderr)
        sys.exit(1)
    s = w.stdout.strip()
    return json.loads(s) if json_out and s else s


def token():
    sekret = [l.split('=', 1)[1].strip().strip('"').strip("'")
              for l in open('/root/supabase-self-hosted/.env') if l.startswith('JWT_SECRET=')][0]
    b = lambda d: base64.urlsafe_b64encode(d).rstrip(b'=')
    n = int(time.time())
    h = b(json.dumps({'alg': 'HS256', 'typ': 'JWT'}, separators=(',', ':')).encode())
    p = b(json.dumps({'sub': ADMIN, 'email': 'dawid@routemarket.io', 'role': 'authenticated',
                      'aud': 'authenticated', 'iat': n, 'exp': n + 1800, 'iss': 'supabase'},
                     separators=(',', ':')).encode())
    s = b(hmac.new(sekret.encode(), h + b'.' + p, hashlib.sha256).digest())
    return (h + b'.' + p + b'.' + s).decode()


def seed(miasto, tok):
    zad = urllib.request.Request(
        API + '/catalog/seed',
        data=json.dumps({'city': miasto, 'limit': LIMIT}).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok})
    try:
        with urllib.request.urlopen(zad, timeout=300) as r:
            return json.load(r), None
    except urllib.error.HTTPError as e:
        return None, '%s: %s' % (e.code, e.read().decode()[:160])
    except Exception as e:
        return None, str(e)


def stan(miasta):
    warunek = "where city = any(array[%s])" % ','.join("'%s'" % m.replace("'", "''") for m in miasta)
    return {w['city']: int(w['ile']) for w in psql(
        "select city, count(*) as ile from public.place_catalog %s group by city" % warunek)}


def main():
    miasta = sys.argv[1:] or [w['city'] for w in psql(
        "select distinct city from public.place_catalog where city is not null order by city")]
    przed = stan(miasta)
    print('Miast do rozszerzenia: %d, limit %d na miasto\n' % (len(miasta), LIMIT))

    tok = token()
    for i, miasto in enumerate(miasta):
        if i and i % NA_PACZKE == 0:
            print('  ...limit zapytań, przerwa %d s\n' % PRZERWA)
            time.sleep(PRZERWA)
            tok = token()
        t0 = time.time()
        odp, blad = seed(miasto, tok)
        if blad:
            print('  %-12s BŁĄD %s' % (miasto, blad))
            continue
        print('  %-12s dodano %-3s (w %.0f s)' % (miasto, odp.get('added', '?'), time.time() - t0))

    # Noclegi: seed pobiera je celowo, ale katalog trzyma rzeczy do zobaczenia.
    # UWAGA: `delete` nie może iść przez json_agg — polecenie modyfikujące dane
    # nie może być zagnieżdżone w select. Liczymy przed i po, zamiast pytać
    # o `returning` w opakowaniu, które go nie przyjmie.
    ile_przed = int(psql("""select count(*) as ile from public.place_catalog
        where category = 'hotel'
           or kind in ('hotel','hostel','guest_house','motel','apartment')""")[0]['ile'])
    if ile_przed:
        psql("""delete from public.place_catalog
                where category = 'hotel'
                   or kind in ('hotel','hostel','guest_house','motel','apartment')""",
             json_out=False)
    print('\nUsunięto noclegi: %d' % ile_przed)

    po = stan(miasta)
    print('\n%-12s %6s %6s %s' % ('miasto', 'przed', 'po', 'zmiana'))
    for m in sorted(miasta):
        a, b = przed.get(m, 0), po.get(m, 0)
        print('  %-12s %5d %6d %+d' % (m, a, b, b - a))
    print('\nRazem: %d -> %d' % (sum(przed.values()), sum(po.values())))


if __name__ == '__main__':
    main()
