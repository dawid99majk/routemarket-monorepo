#!/usr/bin/env python3
"""Polskie nazwy kart za granicą: „Colosseo” → „Koloseum”, „Stephansdom” → „Katedra św. Szczepana”.

Ta sama reguła co nazwaPolska() w routes/catalog.ts: najpierw `name:pl` z OSM,
potem polska etykieta Wikidanych (tylko atrakcje, bez „w Wiedniu” na końcu).
Oryginał zostaje w nazwa_lokalna. Adresów stron nie zmienia.

    ./nazwy_pl.py            pokazuje zmiany
    ./nazwy_pl.py --zapisz   zapisuje
"""
import json, re, subprocess, sys, time, unicodedata, urllib.parse, urllib.request

UA = {'User-Agent': 'RouteMarket/1.0 (https://routemarket.io)'}

def psql(q):
    return subprocess.run(['docker', 'exec', '-i', 'supabase-db', 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'],
                          input=q, capture_output=True, text=True, check=True).stdout

def pobierz(url, dane=None):
    req = urllib.request.Request(url, data=dane, headers=UA)
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode())

def bez_ogonkow(s):
    return re.sub('[̀-ͯ]', '', unicodedata.normalize('NFD', s)).lower()

def bez_miasta(etykieta, miasto):
    # Odmiana zmienia spółgłoskę: Ryga → w Rydze, Haga → w Hadze. Krótkie nazwy: 2 litery.
    rdzen = bez_ogonkow(miasto)[:2 if len(miasto) <= 4 else 3]
    # Jedno słowo po obcięciu („Katedra”) nic nie mówi — wtedy miasto zostaje.
    m = re.match(r'^(.+?)\s+we?\s+([A-ZĄĆĘŁŃÓŚŹŻ].*)$', etykieta)
    if m and bez_ogonkow(m.group(2)).startswith(rdzen) and ' ' in m.group(1):
        return m.group(1)
    m = re.match(r'^(.+?)\s+\(([^)]+)\)$', etykieta)
    if m and bez_ogonkow(m.group(2)).startswith(rdzen) and ' ' in m.group(1):
        return m.group(1)
    return etykieta

# „Matki Bożej Śnieżnej” to dopełniacz wyjęty z „Kościół Matki Bożej…”, nie nazwa.
DOPELNIACZ = re.compile(r'^(Matki|Świętego|Świętej|Najświętszej|Najświętszego|Panny|Pana)\b')

wiersze = json.loads(psql("""select coalesce(json_agg(json_build_object('id', id, 'name', name, 'city', city,
  'category', category, 'osm_id', osm_id)), '[]') from place_catalog
  where coalesce(country, '') <> 'PL' and nazwa_lokalna is null and osm_id like '%/%';"""))
print(f'miejsc za granicą: {len(wiersze)}', file=sys.stderr)

# Tagi z OSM hurtem: name:pl i wikidata
tagi = {}
for i in range(0, len(wiersze), 150):
    paczka = wiersze[i:i + 150]
    grupy = {'node': [], 'way': [], 'relation': []}
    for w in paczka:
        typ, ident = w['osm_id'].split('/')
        if typ in grupy:
            grupy[typ].append(ident)
    q = '[out:json][timeout:60];(' + ''.join(f'{t}(id:{",".join(ids)});' for t, ids in grupy.items() if ids) + ');out tags;'
    ok = False
    for proba in range(4):
        for mirror in ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']:
            try:
                d = pobierz(mirror, urllib.parse.urlencode({'data': q}).encode())
                for e in d.get('elements', []):
                    tagi[f"{e['type']}/{e['id']}"] = e.get('tags', {})
                ok = True
                break
            except Exception as ex:
                print(f'  Overpass {mirror}: {ex}', file=sys.stderr)
        if ok:
            break
        time.sleep(20 * (proba + 1))
    if not ok:
        print(f'  PACZKA {i} bez tagów — te miejsca zostają na następny przebieg', file=sys.stderr)
    time.sleep(2)

# Polskie etykiety Wikidanych dla atrakcji bez name:pl
qidy = sorted({tagi.get(w['osm_id'], {}).get('wikidata') for w in wiersze
               if w['category'] == 'attraction' and not tagi.get(w['osm_id'], {}).get('name:pl')} - {None})
etykiety = {}
for i in range(0, len(qidy), 50):
    u = 'https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'wbgetentities', 'ids': '|'.join(qidy[i:i + 50]), 'props': 'labels', 'languages': 'pl', 'format': 'json'})
    try:
        for q, e in (pobierz(u).get('entities') or {}).items():
            v = ((e.get('labels') or {}).get('pl') or {}).get('value')
            if v:
                etykiety[q] = v
    except Exception as ex:
        print(f'  Wikidane: {ex}', file=sys.stderr)
    time.sleep(0.3)

def slowa(s):
    return set(re.findall(r'[a-z0-9]+', bez_ogonkow(s)))

def ten_sam_jezyk(a, b):
    # „Casa di Colombo” z „Casa di Cristoforo Colombo”, „Royal National Theatre”
    # z „National Theatre”: skrót albo rozwinięcie tej samej nazwy, nie przekład.
    sa, sb = slowa(a), slowa(b)
    return bool(sa) and bool(sb) and (sa <= sb or sb <= sa)

zmiany = []
for w in wiersze:
    t = tagi.get(w['osm_id'], {})
    n = bez_miasta((t.get('name:pl') or '').strip(), w['city'])
    if not n and w['category'] == 'attraction' and t.get('wikidata') in etykiety:
        e = etykiety[t['wikidata']].strip()
        if len(e) <= 60:
            n = bez_miasta(e, w['city'])
            if ten_sam_jezyk(n, w['name']):
                n = ''
    if n and DOPELNIACZ.match(n):
        n = ''
    if n and n != w['name'] and n.lower() != w['name'].lower():
        zmiany.append((w['id'], w['name'], n))

print(f'do zmiany: {len(zmiany)}')
for _, a, b in zmiany[:40]:
    print(f'  {a}  →  {b}')
if '--zapisz' in sys.argv and zmiany:
    esc = lambda s: s.replace("'", "''")
    psql('begin;\n' + ''.join(
        f"update place_catalog set nazwa_lokalna = '{esc(a)}', name = '{esc(b)}' where id = '{i}';\n"
        for i, a, b in zmiany) + 'commit;\n')
    print('zapisano')
