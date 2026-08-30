#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Dociąga z OpenStreetMap tag `wikipedia` dla pozycji katalogu.

To powiązanie twarde: obiekt sam wskazuje swój artykuł, a artykuł ma zdjęcie
wiodące wybrane przez człowieka. Bez niego dobieranie zdjęć zostaje z nazwą
i okolicą, a to potrafi wziąć zdjęcie sąsiedniego budynku.

Pytamy paczkami po identyfikatorach, nie po obszarze — mniej danych i nie zależy
od tego, czy lustro ma zbudowany obszar miasta.
"""
import json
import subprocess
import sys
import time
import urllib.parse
import urllib.request

NAGLOWKI = {'User-Agent': 'RouteMarket/1.0 (+https://routemarket.io)'}
LUSTRA = [
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
]
NA_PACZKE = 180


def psql(q, json_out=True):
    if json_out:
        q = "select coalesce(json_agg(t),'[]'::json) from (%s) t;" % q.rstrip(';')
    w = subprocess.run(['docker', 'exec', '-i', 'supabase-db', 'psql', '-U', 'postgres',
                        '-X', '-t', '-A', '-c', q],
                       capture_output=True, text=True, stdin=subprocess.DEVNULL)
    if w.returncode != 0:
        print('Błąd bazy: %s' % w.stderr.strip(), file=sys.stderr)
        sys.exit(1)
    s = w.stdout.strip()
    return json.loads(s) if json_out and s else s


def overpass(zapytanie):
    ost = None
    for baza in LUSTRA:
        try:
            dane = urllib.parse.urlencode({'data': zapytanie}).encode()
            req = urllib.request.Request(baza, data=dane, headers=NAGLOWKI)
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            ost = e
            print('  %s nie odpowiedział: %s' % (baza.split('/')[2], e), file=sys.stderr)
            time.sleep(3)
    raise ost


def esc(s):
    return s.replace("'", "''")


def main():
    wiersze = psql("""select id, osm_id from public.place_catalog
                      where osm_id is not null and wikipedia is null""")
    print('Do sprawdzenia: %d pozycji' % len(wiersze))
    if not wiersze:
        return

    wg_typu = {'node': {}, 'way': {}, 'relation': {}}
    for r in wiersze:
        osm = str(r['osm_id'])
        if '/' not in osm:
            continue
        typ, num = osm.split('/', 1)
        if typ in wg_typu and num.isdigit():
            wg_typu[typ][int(num)] = r['id']

    znalezione = {}          # osm_id -> tag wikipedia
    for typ, mapa in wg_typu.items():
        ids = sorted(mapa)
        for i in range(0, len(ids), NA_PACZKE):
            paczka = ids[i:i + NA_PACZKE]
            q = '[out:json][timeout:120];%s(id:%s);out tags;' % (typ, ','.join(map(str, paczka)))
            try:
                wynik = overpass(q)
            except Exception as e:
                print('  paczka %s %d-%d pominięta: %s' % (typ, i, i + len(paczka), e),
                      file=sys.stderr)
                continue
            for el in wynik.get('elements', []):
                tag = (el.get('tags') or {}).get('wikipedia')
                if tag:
                    znalezione['%s/%s' % (el['type'], el['id'])] = tag
            print('  %-8s %5d/%-5d  tagów łącznie: %d'
                  % (typ, min(i + NA_PACZKE, len(ids)), len(ids), len(znalezione)))
            time.sleep(2)

    if not znalezione:
        print('Nie znaleziono ani jednego tagu.')
        return

    # zapis paczkami przez CASE — jedno zapytanie na kilkaset wierszy
    pozycje = list(znalezione.items())
    zapisane = 0
    for i in range(0, len(pozycje), 300):
        czesc = pozycje[i:i + 300]
        case = ' '.join("when osm_id = '%s' then '%s'" % (esc(o), esc(t)) for o, t in czesc)
        gdzie = ','.join("'%s'" % esc(o) for o, _ in czesc)
        psql("update public.place_catalog set wikipedia = case %s end "
             "where osm_id in (%s)" % (case, gdzie), json_out=False)
        zapisane += len(czesc)

    print('\nZapisano tag dla %d pozycji.' % zapisane)
    stan = psql("""select count(*) filter (where wikipedia is not null) as z_tagiem,
                          count(*) as razem from public.place_catalog""")[0]
    print('W katalogu: %s z %s ma tag wikipedia.' % (stan['z_tagiem'], stan['razem']))


if __name__ == '__main__':
    main()
