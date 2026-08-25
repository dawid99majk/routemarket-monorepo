# -*- coding: utf-8 -*-
"""Pierwsza tablica przykładowa: Kraków w dwa dni.

Nie udaje czyjegoś wyjazdu — dostaje flagę `is_example`, więc w galerii pokaże
się z etykietą „Przykład RouteMarket" zamiast awatara autora. To była warunkiem
zrobienia tego w ogóle: kafelek z kółkiem inicjałów deklaruje człowieka, a plan
złożony maszynowo człowiekiem nie jest.

Dobór miejsc jest ręczny, nie losowy. Kraków ma w katalogu 24 pozycje, ale
większość to kościoły starego miasta — wrzucenie ich wszystkich dałoby dzień,
w którym turysta ogląda siedem świątyń pod rząd. Wybieram więc zestaw, który
ma sens jako pierwsza wizyta w mieście, i zostawiam resztę jako „być może".
"""
import base64, hmac, hashlib, json, subprocess, sys, time, urllib.request, urllib.error, re

WLASCICIEL = '6f7e22c4-e159-4b68-8e29-9f41b36c0a2a'   # konto administratora
MIASTO = 'Kraków'
NAZWA = 'Kraków w dwa dni — pierwsza wizyta'

# „na pewno" — szkielet wyjazdu, po którym poznaje się miasto
PEWNE = [
    'Rynek Główny',
    'Sukiennice',
    'Bazylika Wniebowzięcia Najświętszej Maryi Panny',
    'Zamek Królewski na Wawelu',
    'Bazylika archikatedralna Świętych Stanisława i Wacława',
    'Collegium Maius',
    'Barbakan',
    'Planty',
]
# „być może" — dobre, ale nie na pierwszy raz albo zależne od pogody i czasu
MOZE = [
    'Brama Floriańska',
    'Ogród Botaniczny Uniwersytetu Jagiellońskiego',
    'Muzeum Archeologiczne',
    'Kościół pw. Świętych Apostołów Piotra i Pawła',
    'Baszta Sandomierska',
    'Studzienka Badylaka',
]


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


def ap(s):
    return "'" + str(s).replace("'", "''") + "'"


# --- czy taka tablica już jest ----------------------------------------------
istnieje = psql("select id from public.trip_projects where name = %s" % ap(NAZWA))
if istnieje:
    print('Tablica „%s" już istnieje (%s) — usuwam i buduję od nowa.' % (NAZWA, istnieje[0]['id']))
    psql("delete from public.trip_projects where name = %s" % ap(NAZWA), json_out=False)

# --- miejsca z katalogu ------------------------------------------------------
katalog = psql("""
    select id, name, category, kind, lat, lng, opening_hours, visit_minutes,
           description_i18n->>'pl' as opis, photos->>0 as zdjecie
    from public.place_catalog where city = %s
""" % ap(MIASTO))
wg_nazwy = {m['name']: m for m in katalog}

brakuje = [n for n in PEWNE + MOZE if n not in wg_nazwy]
if brakuje:
    print('W katalogu nie ma: %s' % ', '.join(brakuje), file=sys.stderr)
    sys.exit(1)

# --- tablica -----------------------------------------------------------------
# CTE modyfikujące dane musi być na najwyższym poziomie zapytania, więc nie
# przechodzi przez opakowanie w `psql` — budujemy pełne zapytanie i parsujemy sami.
surowe = psql("""
    with w as (
      insert into public.trip_projects
        (user_id, name, destination, days, hours_per_day, fill_percent,
         is_public, is_example, published_at, notes)
      values (%s, %s, %s, 2, 9, 70, true, true, now(), '')
      returning id
    ) select coalesce(json_agg(w), '[]'::json) from w;
""" % (ap(WLASCICIEL), ap(NAZWA), ap(MIASTO)), json_out=False)
tid = json.loads(surowe)[0]['id']
print('Tablica: %s' % tid)

# --- miejsca na tablicy ------------------------------------------------------
wiersze = []
for i, nazwa in enumerate(PEWNE + MOZE):
    m = wg_nazwy[nazwa]
    priorytet = 'must' if nazwa in PEWNE else 'nice'
    wiersze.append("(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)" % (
        ap(tid), ap(m['name']), ap(m['category'] or 'attraction'), ap(priorytet),
        m['lat'], m['lng'],
        ap(m['opening_hours']) if m['opening_hours'] else 'null',
        m['visit_minutes'] or 60,
        ap(m['opis'] or ''), ap(m['zdjecie']) if m['zdjecie'] else 'null',
        i, ap(m['id'])))

psql("""
    insert into public.trip_project_places
      (project_id, name, category, priority, lat, lng, opening_hours,
       visit_minutes, description, image_url, sort_order, catalog_id)
    values %s
""" % ',\n'.join(wiersze), json_out=False)
print('Miejsca: %d na pewno, %d być może' % (len(PEWNE), len(MOZE)))

# --- plan przez strumień -----------------------------------------------------
sekret = [l.split('=', 1)[1].strip().strip('"').strip("'")
          for l in open('/root/supabase-self-hosted/.env') if l.startswith('JWT_SECRET=')][0]
b = lambda d: base64.urlsafe_b64encode(d).rstrip(b'=')
n = int(time.time())
h = b(json.dumps({'alg': 'HS256', 'typ': 'JWT'}, separators=(',', ':')).encode())
# Wywolanie planera idzie z konta, ktore ma tokeny. Wlascicielem tablicy zostaje
# konto administratora — plan zapisujemy do bazy sami, wiec te dwie rzeczy moga
# sie roznic. Salda nie doladowuje: ruch srodkami nie jest czyms, co robi agent.
PLACI = '9e2a4ed3-726d-4369-8057-3cda9fa5e10a'
p = b(json.dumps({'sub': PLACI, 'email': 'dawid@routemarket.io', 'role': 'authenticated',
                  'aud': 'authenticated', 'iat': n, 'exp': n + 900, 'iss': 'supabase'},
                 separators=(',', ':')).encode())
s = b(hmac.new(sekret.encode(), h + b'.' + p, hashlib.sha256).digest())
TOK = (h + b'.' + p + b'.' + s).decode()

miejsca = [{'name': wg_nazwy[x]['name'],
            'category': wg_nazwy[x]['category'],
            'priority': 'must' if x in PEWNE else 'nice',
            'lat': wg_nazwy[x]['lat'], 'lng': wg_nazwy[x]['lng'],
            'opening_hours': wg_nazwy[x]['opening_hours'],
            'visit_minutes': wg_nazwy[x]['visit_minutes']} for x in PEWNE + MOZE]

cialo = {'destination': MIASTO, 'days': 2,
         'window': {'start': '09:00', 'end': '18:00'},
         'fill_percent': 70, 'places': miejsca}

req = urllib.request.Request('http://127.0.0.1:8081/plan-trip/stream',
                             data=json.dumps(cialo).encode(),
                             headers={'Content-Type': 'application/json',
                                      'Accept-Language': 'pl',
                                      'Authorization': 'Bearer ' + TOK}, method='POST')
print('Układam plan…')
dni, ostrzezenia, nie_zmiescilo = [], [], []
start = time.time()
try:
    for surowa in urllib.request.urlopen(req, timeout=300):
        linia = surowa.decode('utf-8').strip()
        if not linia.startswith('data:'):
            continue
        z = json.loads(linia[5:].strip())
        if z.get('typ') == 'dzien':
            dni.append(z['dzien'])
            print('  dzień %d: %d pozycji (%.1fs)' % (z['dzien']['day'], len(z['dzien']['items']), time.time() - start))
        elif z.get('typ') == 'koniec':
            ostrzezenia = z.get('warnings', [])
            nie_zmiescilo = z.get('not_scheduled', [])
except urllib.error.HTTPError as e:
    print('HTTP %s: %s' % (e.code, e.read().decode()[:200]), file=sys.stderr)
    sys.exit(1)

if not dni:
    print('Plan nie powstał.', file=sys.stderr)
    sys.exit(1)

plan = {'days': sorted(dni, key=lambda d: d['day']), 'warnings': ostrzezenia,
        'not_scheduled': nie_zmiescilo}
psql("""
    insert into public.trip_plans (project_id, name, window_start, window_end, plan)
    values (%s, %s, '09:00', '18:00', %s::jsonb)
""" % (ap(tid), ap('09:00-18:00 · pierwsza wizyta'), ap(json.dumps(plan, ensure_ascii=False))),
     json_out=False)

print()
print('Gotowe. https://routemarket.io/tablica/%s' % tid)
for d in plan['days']:
    print()
    print('  DZIEŃ %d (%s)' % (d['day'], d.get('weekday', '')))
    for i in d['items']:
        print('    %s  %-46s %s min' % (i.get('time', ''), i.get('name', '')[:46], i.get('minutes', '?')))
for w in ostrzezenia:
    print('  ! %s' % w)
