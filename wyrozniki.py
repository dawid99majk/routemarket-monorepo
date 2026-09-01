#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Uzupełnia wyróżniki dla podanych miast.

    ./wyrozniki.py <miasto> [...]

Rusza wyłącznie pozycje, które mają już opis, a nie mają wyróżnika. Endpoint
bierze po `limit` naraz i zwraca `pozostalo`, więc pętla chodzi aż do zera."""
import base64, hashlib, hmac, json, subprocess, sys, time
import urllib.error, urllib.request

API = 'http://127.0.0.1:8081'
NA_RAZ = 20


def psql(q):
    q = "select coalesce(json_agg(t),'[]'::json) from (%s) t;" % q.rstrip(';')
    w = subprocess.run(['docker', 'exec', '-i', 'supabase-db', 'psql', '-U', 'postgres',
                        '-X', '-t', '-A', '-c', q], capture_output=True, text=True,
                       stdin=subprocess.DEVNULL)
    if w.returncode != 0:
        print('Błąd bazy: %s' % w.stderr.strip(), file=sys.stderr); sys.exit(1)
    return json.loads(w.stdout.strip() or '[]')


def token():
    admin = psql("select r.user_id::text as id from public.user_roles r where r.role='admin' limit 1")
    sekret = [l.split('=', 1)[1].strip().strip('"').strip("'")
              for l in open('/root/supabase-self-hosted/.env') if l.startswith('JWT_SECRET=')][0]
    b = lambda d: base64.urlsafe_b64encode(d).rstrip(b'=')
    n = int(time.time())
    h = b(json.dumps({'alg': 'HS256', 'typ': 'JWT'}, separators=(',', ':')).encode())
    p = b(json.dumps({'sub': admin[0]['id'], 'role': 'authenticated', 'aud': 'authenticated',
                      'iat': n, 'exp': n + 14400, 'iss': 'supabase'}, separators=(',', ':')).encode())
    s = b(hmac.new(sekret.encode(), h + b'.' + p, hashlib.sha256).digest())
    return (h + b'.' + p + b'.' + s).decode()


def main():
    miasta = sys.argv[1:]
    if not miasta:
        miasta = [w['city'] for w in psql(
            "select distinct city from public.place_catalog where city is not null order by 1")]
    tok = token()
    for miasto in miasta:
        print('\n=== %s ===' % miasto, flush=True)
        puste = 0
        for tura in range(40):
            zad = urllib.request.Request(
                API + '/catalog/wyrozniki',
                data=json.dumps({'city': miasto, 'limit': NA_RAZ}).encode(),
                headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok})
            try:
                with urllib.request.urlopen(zad, timeout=300) as r:
                    o = json.load(r)
            except urllib.error.HTTPError as e:
                print('  BŁĄD %s: %s' % (e.code, e.read().decode()[:200])); break
            except Exception as e:
                print('  BŁĄD: %s' % e); break
            print('  +%s (odrzucono %s), zostaje %s'
                  % (o.get('opisane'), o.get('odrzucone', 0), o.get('pozostalo')), flush=True)
            if not o.get('pozostalo'):
                break
            # Partia bez zapisu nie kończy przebiegu: jedna urwana odpowiedź modelu
            # zatrzymywała całe miasto na dziesięciu miejscach. Dopiero dwie puste
            # z rzędu znaczą, że dla reszty naprawdę nie ma czego zapisać.
            puste = puste + 1 if not o.get('opisane') else 0
            if puste >= 2:
                print('  (dwie partie bez zapisu — kończę to miasto)', flush=True)
                break
            time.sleep(2)


if __name__ == '__main__':
    main()
