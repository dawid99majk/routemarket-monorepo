#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tablica przykładowa dla miasta z katalogu.

    ./przykladowa.py <miasto> <dni> "<nazwa tablicy>"
    ./przykladowa.py Porto 2 "Porto w dwa dni — pierwsza wizyta"

Tablica dostaje flagę `is_example`, więc w galerii i w karcie odnośnika pokaże
się jako przykład RouteMarket, a nie jako czyjś wyjazd. Bez tej flagi nie
powinna powstawać w ogóle.

Dobór miejsc nie jest losowy ani czysto popularnościowy. Katalog bywa
jednorodny — Kraków ma dwanaście kościołów na dwadzieścia cztery pozycje —
więc branie samej góry listy dałoby dzień, w którym turysta ogląda siedem
świątyń pod rząd. Stąd limit na rodzaj obiektu wśród kotwic: reszta trafia do
„być może", gdzie nie zaszkodzi, a może się przydać.
"""
import base64, hmac, hashlib, json, subprocess, sys, time, urllib.request, urllib.error

WLASCICIEL = '6f7e22c4-e159-4b68-8e29-9f41b36c0a2a'   # właściciel tablicy: konto administratora
PLACI = '9e2a4ed3-726d-4369-8057-3cda9fa5e10a'        # konto z tokenami na wywołanie planera

# Ile kotwic i propozycji na dzień. Cztery kotwice to około sześciu godzin
# zwiedzania — przy dziewięciogodzinnym oknie zostaje miejsce na przejścia,
# posiłek i to, co agent dołoży.
KOTWIC_NA_DZIEN = 4
MOZE_NA_DZIEN = 3
# Limit na powtarzanie rodzaju obiektu liczony z liczby kotwic, a nie sztywny.
# Sztywne „dwa" wykluczało w Porto dworzec São Bento (18 wersji językowych) na
# rzecz galerii, o której nie napisano nigdzie ani słowa — bo obie są rodzaju
# „attraction", a dworzec był trzeci w kolejce. Różnorodność ma zapobiegać dniu
# z siedmioma kościołami, a nie wypychać rzeczy, po które ludzie przyjeżdżają.
UDZIAL_JEDNEGO_RODZAJU = 0.5


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


def wybierz(katalog, ile_kotwic, ile_moze):
    """Kotwice: najlepiej opisane i najpopularniejsze, ale bez powtarzania rodzaju.

    Miejsce bez godzin otwarcia nie jest gorsze samo w sobie, ale planer nie ma
    czym go umieścić w dniu, więc jako kotwica jest ryzykowne — trafia niżej.
    """
    def ocena(m):
        # Ważność (liczba wersji językowych artykułu) jest tu sygnałem głównym,
        # bo jako jedyna mówi, czy miejsce w ogóle warto zobaczyć. Reszta to
        # dodatki: kompletność danych i to, czy pobyt jest na tyle długi, żeby
        # miał sens jako punkt dnia. Pierwsza wersja tego wzoru nie miała
        # ważności w ogóle i wybrała na zwiedzanie Porto kino i kapliczkę.
        return (
            min(m['waznosc'] or 0, 30) * 3
            + (1 if m['zdjecie'] else 0)
            + (1 if m['opis'] else 0)
            + min(m['pin_count'] or 0, 3)
            + (1 if (m['visit_minutes'] or 0) >= 45 else 0)
            + (1 if m['opening_hours'] else 0)
        )

    posortowane = sorted(katalog, key=lambda m: (-ocena(m), m['name']))
    # Kotwicą może być tylko atrakcja. Lokale gastronomiczne mają w katalogu
    # komplet godzin otwarcia, więc w rankingu wychodziły na wierzch — i pierwsza
    # wersja wybrała na zwiedzanie Porto kino, dwie kawiarnie i bar. Posiłki
    # planer dobiera sam z puli miasta, nie trzeba ich przypinać.
    do_kotwic = [m for m in posortowane if (m['category'] or 'attraction') == 'attraction']

    # Miejsce, o którym nie napisano artykułu w żadnym języku, nie jest tym,
    # po co ktoś jedzie do miasta pierwszy raz. Odsiewamy je z kotwic, ale tylko
    # gdy zostaje dość alternatyw — w małym mieście lepszych może po prostu
    # nie być, a pusta tablica nie pomoże nikomu.
    znane = [m for m in do_kotwic if (m['waznosc'] or 0) > 0]
    if len(znane) >= ile_kotwic:
        do_kotwic = znane

    limit = max(2, int(ile_kotwic * UDZIAL_JEDNEGO_RODZAJU))
    kotwice, licznik = [], {}
    for m in do_kotwic:
        if len(kotwice) >= ile_kotwic:
            break
        rodzaj = m['kind'] or m['category'] or 'inne'
        if licznik.get(rodzaj, 0) >= limit:
            continue
        licznik[rodzaj] = licznik.get(rodzaj, 0) + 1
        kotwice.append(m)

    if len(kotwice) < ile_kotwic:
        print('Uwaga: w katalogu jest tylko %d atrakcji, kotwic będzie %d zamiast %d.'
              % (len(do_kotwic), len(kotwice), ile_kotwic), file=sys.stderr)
    # „Być może" może już zawierać lokal — ktoś naprawdę przypina konkretną
    # kawiarnię, o której czytał.
    wybrane = {m['id'] for m in kotwice}
    moze = [m for m in posortowane if m['id'] not in wybrane][:ile_moze]
    return kotwice, moze


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    miasto, dni, nazwa = sys.argv[1], int(sys.argv[2]), sys.argv[3]

    katalog = psql("""
        select id, name, category, kind, lat, lng, opening_hours, visit_minutes, pin_count,
               waznosc, description_i18n->>'pl' as opis, photos->>0 as zdjecie
        from public.place_catalog
        where city = %s and lat is not null
    """ % ap(miasto))
    if len(katalog) < dni * (KOTWIC_NA_DZIEN + MOZE_NA_DZIEN):
        print('Za mało miejsc w katalogu dla %s: %d.' % (miasto, len(katalog)), file=sys.stderr)
        sys.exit(1)

    kotwice, moze = wybierz(katalog, dni * KOTWIC_NA_DZIEN, dni * MOZE_NA_DZIEN)
    print('%s: %d kotwic, %d być może (z %d w katalogu)' % (miasto, len(kotwice), len(moze), len(katalog)))
    for m in kotwice:
        print('   • %-44s %-12s ważność %s' % (m['name'][:44], m['kind'] or '', m['waznosc'] or 0))

    istnieje = psql("select id from public.trip_projects where name = %s" % ap(nazwa))
    if istnieje:
        print('Zastępuję istniejącą tablicę %s.' % istnieje[0]['id'])
        psql("delete from public.trip_projects where name = %s" % ap(nazwa), json_out=False)

    surowe = psql("""
        with w as (
          insert into public.trip_projects
            (user_id, name, destination, days, hours_per_day, fill_percent,
             is_public, is_example, published_at, notes)
          values (%s, %s, %s, %d, 9, 70, true, true, now(), '')
          returning id
        ) select coalesce(json_agg(w), '[]'::json) from w;
    """ % (ap(WLASCICIEL), ap(nazwa), ap(miasto), dni), json_out=False)
    tid = json.loads(surowe)[0]['id']

    wiersze = []
    for i, m in enumerate(kotwice + moze):
        wiersze.append("(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)" % (
            ap(tid), ap(m['name']), ap(m['category'] or 'attraction'),
            ap('must' if m in kotwice else 'nice'), m['lat'], m['lng'],
            ap(m['opening_hours']) if m['opening_hours'] else 'null',
            m['visit_minutes'] or 60, ap(m['opis'] or ''),
            ap(m['zdjecie']) if m['zdjecie'] else 'null', i, ap(m['id'])))
    psql("""
        insert into public.trip_project_places
          (project_id, name, category, priority, lat, lng, opening_hours,
           visit_minutes, description, image_url, sort_order, catalog_id)
        values %s
    """ % ',\n'.join(wiersze), json_out=False)

    # --- plan --------------------------------------------------------------
    sekret = [l.split('=', 1)[1].strip().strip('"').strip("'")
              for l in open('/root/supabase-self-hosted/.env') if l.startswith('JWT_SECRET=')][0]
    b = lambda d: base64.urlsafe_b64encode(d).rstrip(b'=')
    n = int(time.time())
    h = b(json.dumps({'alg': 'HS256', 'typ': 'JWT'}, separators=(',', ':')).encode())
    p = b(json.dumps({'sub': PLACI, 'email': 'dawid@routemarket.io', 'role': 'authenticated',
                      'aud': 'authenticated', 'iat': n, 'exp': n + 900, 'iss': 'supabase'},
                     separators=(',', ':')).encode())
    s = b(hmac.new(sekret.encode(), h + b'.' + p, hashlib.sha256).digest())
    tok = (h + b'.' + p + b'.' + s).decode()

    cialo = {'destination': miasto, 'days': dni,
             'window': {'start': '09:00', 'end': '18:00'}, 'fill_percent': 70,
             'places': [{'name': m['name'], 'category': m['category'],
                         'priority': 'must' if m in kotwice else 'nice',
                         'lat': m['lat'], 'lng': m['lng'],
                         'opening_hours': m['opening_hours'],
                         'visit_minutes': m['visit_minutes']} for m in kotwice + moze]}

    req = urllib.request.Request('http://127.0.0.1:8081/plan-trip/stream',
                                 data=json.dumps(cialo).encode(),
                                 headers={'Content-Type': 'application/json',
                                          'Accept-Language': 'pl',
                                          'Authorization': 'Bearer ' + tok}, method='POST')
    dni_planu, ostrzezenia, nie_zmiescilo = [], [], []
    try:
        for surowa in urllib.request.urlopen(req, timeout=400):
            l = surowa.decode('utf-8').strip()
            if not l.startswith('data:'):
                continue
            z = json.loads(l[5:].strip())
            if z.get('typ') == 'dzien':
                dni_planu.append(z['dzien'])
            elif z.get('typ') == 'koniec':
                ostrzezenia = z.get('warnings', [])
                nie_zmiescilo = z.get('not_scheduled', [])
    except urllib.error.HTTPError as e:
        print('HTTP %s: %s' % (e.code, e.read().decode()[:200]), file=sys.stderr)
        sys.exit(1)

    if not dni_planu:
        print('Plan nie powstał.', file=sys.stderr)
        sys.exit(1)

    plan = {'days': sorted(dni_planu, key=lambda d: d['day']),
            'warnings': ostrzezenia, 'not_scheduled': nie_zmiescilo}
    psql("""
        insert into public.trip_plans (project_id, name, window_start, window_end, plan)
        values (%s, %s, '09:00', '18:00', %s::jsonb)
    """ % (ap(tid), ap('09:00-18:00 · pierwsza wizyta'),
           ap(json.dumps(plan, ensure_ascii=False))), json_out=False)

    # --- kontrola jakości ---------------------------------------------------
    nazwy_w_planie = {i['name'].strip().lower() for d in plan['days'] for i in d['items']}
    zgubione = [m['name'] for m in kotwice if m['name'].strip().lower() not in nazwy_w_planie
                and m['name'] not in [x.get('name') for x in nie_zmiescilo]]

    print()
    print('https://routemarket.io/tablica/%s' % tid)
    print('  kotwic w planie: %d z %d' % (len(kotwice) - len(zgubione) - len(
        [m for m in kotwice if m['name'] in [x.get('name') for x in nie_zmiescilo]]), len(kotwice)))
    for d in plan['days']:
        print('  dzień %d: %d pozycji' % (d['day'], len(d['items'])))
    for x in nie_zmiescilo:
        print('  nie zmieściło się: %s — %s' % (x.get('name'), (x.get('reason') or '')[:70]))
    if zgubione:
        print('  UWAGA — kotwice zniknęły bez podania powodu: %s' % ', '.join(zgubione))


if __name__ == '__main__':
    main()
