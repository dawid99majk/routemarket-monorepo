#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Dopisuje opisy i tłumaczenia dla pozycji katalogu, które ich nie mają.

    ./opisy.py [miasto ...]        opisy; bez argumentów: wszystkie miasta
    ./opisy.py --tlumacz           tłumaczenia dla tego, co ma już opis

Rozszerzenie katalogu z 414 do 889 pozycji zostawiło 492 miejsca z nazwą,
współrzędnymi i godzinami, ale bez ani jednego zdania. `/catalog/seed` celowo
nie woła modelu — pomiar pokazał, że generowanie opisów zjadało 70% czasu
zbierania (23,4 s z 33,1 s dla Gdańska) i przez ten czas nie było widać nic.

Jedno wywołanie opisuje do `limit` miejsc naraz, więc 492 opisy to kilkanaście
zapytań, nie 492. Idziemy miastami, aż w mieście nie zostanie nic bez opisu.
"""
import base64, hashlib, hmac, json, subprocess, sys, time, urllib.error, urllib.request

API = 'http://127.0.0.1:8081'
NA_RAZ = 40
JEZYKI = ['en', 'de', 'fr', 'es', 'it']


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
    admin = psql("select r.user_id::text as id from public.user_roles r where r.role = 'admin' limit 1")
    if not admin:
        print('Brak konta z rolą administratora.', file=sys.stderr)
        sys.exit(1)
    sekret = [l.split('=', 1)[1].strip().strip('"').strip("'")
              for l in open('/root/supabase-self-hosted/.env') if l.startswith('JWT_SECRET=')][0]
    b = lambda d: base64.urlsafe_b64encode(d).rstrip(b'=')
    n = int(time.time())
    h = b(json.dumps({'alg': 'HS256', 'typ': 'JWT'}, separators=(',', ':')).encode())
    p = b(json.dumps({'sub': admin[0]['id'], 'role': 'authenticated', 'aud': 'authenticated',
                      'iat': n, 'exp': n + 7200, 'iss': 'supabase'}, separators=(',', ':')).encode())
    s = b(hmac.new(sekret.encode(), h + b'.' + p, hashlib.sha256).digest())
    return (h + b'.' + p + b'.' + s).decode()


def wolaj(sciezka, dane, tok, timeout=600):
    zad = urllib.request.Request(API + sciezka, data=json.dumps(dane).encode(),
                                 headers={'Content-Type': 'application/json',
                                          'Authorization': 'Bearer ' + tok})
    try:
        with urllib.request.urlopen(zad, timeout=timeout) as r:
            return json.load(r), None
    except urllib.error.HTTPError as e:
        return None, '%s: %s' % (e.code, e.read().decode()[:160])
    except Exception as e:
        return None, str(e)


def bez_opisu(miasto=None):
    gdzie = ("and city = '%s'" % miasto.replace("'", "''")) if miasto else ''
    return int(psql("""select count(*) as ile from public.place_catalog
        where coalesce(nullif(trim(description), ''), description_i18n->>'pl') is null %s""" % gdzie)[0]['ile'])


def main():
    tok = token()

    if '--tlumacz' in sys.argv:
        # Można podać języki po fladze: ./opisy.py --tlumacz fr de
        # Przydaje się, gdy jeden język zostaje w tyle — francuski pominął
        # siedemnaście pozycji przy przebiegu na pięć języków naraz.
        wybrane = [a for a in sys.argv[1:] if not a.startswith('--')] or JEZYKI
        print('Tłumaczenia na: %s' % ', '.join(wybrane))
        odp, blad = wolaj('/catalog/translate-descriptions',
                          {'languages': wybrane, 'limit': 2000}, tok, timeout=3600)
        print('  BŁĄD %s' % blad if blad else '  %s' % json.dumps(odp, ensure_ascii=False)[:300])
        return

    miasta = [a for a in sys.argv[1:] if not a.startswith('--')] or [
        w['city'] for w in psql("""select distinct city from public.place_catalog
            where city is not null and coalesce(nullif(trim(description), ''), description_i18n->>'pl') is null
            order by city""")]
    if not miasta:
        print('Wszystko ma opis.')
        return
    print('Miast do opisania: %d, po %d miejsc na wywołanie\n' % (len(miasta), NA_RAZ))

    for miasto in miasta:
        runda = 0
        while True:
            zostalo = bez_opisu(miasto)
            if zostalo == 0:
                break
            t0 = time.time()
            odp, blad = wolaj('/catalog/enrich', {'city': miasto, 'limit': NA_RAZ}, tok)
            if blad:
                print('  %-12s BŁĄD %s' % (miasto, blad))
                break
            ile = odp.get('enriched', 0)
            print('  %-12s opisano %-3s (zostaje %-3s, w %.0f s)'
                  % (miasto, ile, max(0, zostalo - ile), time.time() - t0))
            # Zero opisanych przy niezerowej reszcie znaczy, że model nie oddał
            # tych nazw — kolejna runda dałaby to samo. Lepiej powiedzieć wprost.
            if ile == 0:
                print('  %-12s model nie opisał nic mimo %d bez opisu — pomijam'
                      % (miasto, zostalo))
                break
            runda += 1
            if runda > 20:
                print('  %-12s przerwane po 20 rundach' % miasto)
                break
            time.sleep(2)

    print('\nBez opisu w katalogu: %d' % bez_opisu())


if __name__ == '__main__':
    main()
