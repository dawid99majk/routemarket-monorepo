#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Dociąga zdjęcia z Wikimedia Commons dla pozycji, które nie mają żadnego.

    ./zdjecia.py [miasto ...]

Woła `/catalog/refresh-photos` z `tylko_braki`, więc działające galerie zostają
nietknięte. Bez tego filtru jedyną drogą do zdjęć dla nowych pozycji byłoby
przepuszczenie całego miasta — a Commons przy każdym zapytaniu może zwrócić inny
zestaw, więc setki dobrych galerii zmieniłyby się bez powodu.

Model się tu nie odzywa: Commons to zwykłe API, więc to działa bez tokenów.
"""
import base64, hashlib, hmac, json, subprocess, sys, time, urllib.error, urllib.request

API = 'http://127.0.0.1:8081'


def psql(zapytanie):
    zapytanie = "select coalesce(json_agg(t),'[]'::json) from (%s) t;" % zapytanie.rstrip(';')
    w = subprocess.run(['docker', 'exec', '-i', 'supabase-db', 'psql', '-U', 'postgres',
                        '-X', '-t', '-A', '-c', zapytanie],
                       capture_output=True, text=True, stdin=subprocess.DEVNULL)
    if w.returncode != 0:
        print('Błąd bazy: %s' % w.stderr.strip(), file=sys.stderr)
        sys.exit(1)
    return json.loads(w.stdout.strip() or '[]')


def token():
    # Endpoint jest utrzymaniowy i zamknięty rolą, nie samym zalogowaniem —
    # bierzemy identyfikator konta, które tę rolę faktycznie ma.
    admin = psql("""select r.user_id::text as id from public.user_roles r
                    where r.role = 'admin' limit 1""")
    if not admin:
        print('Brak konta z rolą administratora.', file=sys.stderr)
        sys.exit(1)
    sekret = [l.split('=', 1)[1].strip().strip('"').strip("'")
              for l in open('/root/supabase-self-hosted/.env') if l.startswith('JWT_SECRET=')][0]
    b = lambda d: base64.urlsafe_b64encode(d).rstrip(b'=')
    n = int(time.time())
    h = b(json.dumps({'alg': 'HS256', 'typ': 'JWT'}, separators=(',', ':')).encode())
    p = b(json.dumps({'sub': admin[0]['id'], 'role': 'authenticated', 'aud': 'authenticated',
                      'iat': n, 'exp': n + 3600, 'iss': 'supabase'},
                     separators=(',', ':')).encode())
    s = b(hmac.new(sekret.encode(), h + b'.' + p, hashlib.sha256).digest())
    return (h + b'.' + p + b'.' + s).decode()


def main():
    miasta = sys.argv[1:] or [w['city'] for w in psql(
        """select distinct city from public.place_catalog
           where city is not null and jsonb_array_length(photos) = 0 order by city""")]
    if not miasta:
        print('Nie ma pozycji bez zdjęć.')
        return
    tok = token()
    print('Miast do uzupełnienia: %d\n' % len(miasta))
    razem = 0
    for miasto in miasta:
        zad = urllib.request.Request(
            API + '/catalog/refresh-photos',
            data=json.dumps({'city': miasto, 'limit': 1000, 'tylko_braki': True}).encode(),
            headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok})
        t0 = time.time()
        try:
            with urllib.request.urlopen(zad, timeout=900) as r:
                odp = json.load(r)
        except urllib.error.HTTPError as e:
            print('  %-12s BŁĄD %s: %s' % (miasto, e.code, e.read().decode()[:120]))
            continue
        except Exception as e:
            print('  %-12s BŁĄD %s' % (miasto, e))
            continue
        razem += odp.get('updated', 0)
        bledy = odp.get('failed', 0)
        print('  %-12s sprawdzono %-4s uzupełniono %-4s %s(w %.0f s)'
              % (miasto, odp.get('checked', '?'), odp.get('updated', '?'),
                 ('BŁĘDÓW %d ' % bledy) if bledy else '', time.time() - t0))
        # Wikimedia przycina ruch po kilkudziesięciu zapytaniach. Gdy zaczyna
        # odmawiać, dalsze miasta i tak wrócą puste — lepiej stanąć i powiedzieć
        # to wprost, niż przelecieć resztę listy z zerami i nazwać to wynikiem.
        if bledy and bledy >= odp.get('checked', 0):
            print('\n  Wikimedia odmawia — przerywam. Powtórz za kilkanaście minut;'
                  '\n  pozycje już uzupełnione zostaną pominięte.')
            break
        time.sleep(20)

    print('\nUzupełniono galerii: %d' % razem)
    stan = psql("""select count(*) filter (where jsonb_array_length(photos) = 0) as bez,
                          count(*) as wszystkich from public.place_catalog""")[0]
    print('Bez zdjęć: %s z %s' % (stan['bez'], stan['wszystkich']))


if __name__ == '__main__':
    main()
