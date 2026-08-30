#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Przelicza zdjęcia dla miejsc, które mają tag `wikipedia` z OSM.

    ./przelicz_zdjecia.py <miasto> [...]

W odróżnieniu od `zdjecia.py` NIE ogranicza się do pustych galerii — chodzi
właśnie o podmianę tych, które są, ale trafiły w sąsiedni budynek. Rusza
wyłącznie pozycje z tagiem, bo tylko tam pierwsze zdjęcie bierze się z artykułu
wskazanego przez sam obiekt, a nie z domysłu po nazwie i okolicy.

Przed i po wypisuje nazwę pliku, żeby dało się zobaczyć, co się zmieniło."""
import base64, hashlib, hmac, json, re, subprocess, sys, time, urllib.error, urllib.request

API = 'http://127.0.0.1:8081'


def psql(q):
    q = "select coalesce(json_agg(t),'[]'::json) from (%s) t;" % q.rstrip(';')
    w = subprocess.run(['docker', 'exec', '-i', 'supabase-db', 'psql', '-U', 'postgres',
                        '-X', '-t', '-A', '-c', q],
                       capture_output=True, text=True, stdin=subprocess.DEVNULL)
    if w.returncode != 0:
        print('Błąd bazy: %s' % w.stderr.strip(), file=sys.stderr); sys.exit(1)
    return json.loads(w.stdout.strip() or '[]')


def token():
    admin = psql("select r.user_id::text as id from public.user_roles r where r.role='admin' limit 1")
    if not admin:
        print('Brak konta administratora.', file=sys.stderr); sys.exit(1)
    sekret = [l.split('=', 1)[1].strip().strip('"').strip("'")
              for l in open('/root/supabase-self-hosted/.env') if l.startswith('JWT_SECRET=')][0]
    b = lambda d: base64.urlsafe_b64encode(d).rstrip(b'=')
    n = int(time.time())
    h = b(json.dumps({'alg': 'HS256', 'typ': 'JWT'}, separators=(',', ':')).encode())
    p = b(json.dumps({'sub': admin[0]['id'], 'role': 'authenticated', 'aud': 'authenticated',
                      'iat': n, 'exp': n + 7200, 'iss': 'supabase'}, separators=(',', ':')).encode())
    s = b(hmac.new(sekret.encode(), h + b'.' + p, hashlib.sha256).digest())
    return (h + b'.' + p + b'.' + s).decode()


def plik(u):
    return re.sub(r'\?.*$', '', u or '').split('/')[-1][:56]


def stan(miasto):
    return {w['id']: w for w in psql(
        """select id, name, photos->>0 as pierwsze from public.place_catalog
           where city = '%s' and wikipedia is not null""" % miasto.replace("'", "''"))}


def main():
    miasta = sys.argv[1:]
    if not miasta:
        print('Podaj miasto.', file=sys.stderr); sys.exit(1)
    tok = token()
    for miasto in miasta:
        przed = stan(miasto)
        print('\n=== %s === pozycji z tagiem: %d' % (miasto, len(przed)))
        if not przed:
            continue
        zad = urllib.request.Request(
            API + '/catalog/refresh-photos',
            data=json.dumps({'city': miasto, 'limit': 1000, 'tylko_z_tagiem': True}).encode(),
            headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok})
        t0 = time.time()
        try:
            with urllib.request.urlopen(zad, timeout=1800) as r:
                odp = json.load(r)
        except urllib.error.HTTPError as e:
            print('  BŁĄD %s: %s' % (e.code, e.read().decode()[:160])); continue
        except Exception as e:
            print('  BŁĄD %s' % e); continue

        print('  sprawdzono %s, podmieniono %s, błędów %s (w %.0f s)'
              % (odp.get('checked'), odp.get('updated'), odp.get('failed'), time.time() - t0))

        po = stan(miasto)
        zmiany = [(przed[i]['name'], przed[i]['pierwsze'], po[i]['pierwsze'])
                  for i in po if i in przed and przed[i]['pierwsze'] != po[i]['pierwsze']]
        for nazwa, a, b_ in zmiany[:25]:
            print('  %-34s' % nazwa[:34])
            print('      bylo: %s' % plik(a))
            print('      jest: %s' % plik(b_))
        if len(zmiany) > 25:
            print('  … i %d dalszych' % (len(zmiany) - 25))
        time.sleep(15)


if __name__ == '__main__':
    main()
