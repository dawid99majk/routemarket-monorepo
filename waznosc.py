#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Uzupełnia ważność miejsc liczbą wersji językowych artykułu na Wikipedii.

    ./waznosc.py [miasto]        uzupełnia miejsca bez wartości
    ./waznosc.py --od-nowa       kasuje wszystko i liczy jeszcze raz

Katalog nie miał ŻADNEJ miary rozpoznawalności. `pin_count` jest zerem przy
pięciu kontach, zdjęć każde miejsce ma po trzy (limit przy pobieraniu), opisy
mają podobną długość, a `visit_minutes` dawał kinu 120 minut i katedrze 45.
Automatyczny dobór na tablicę przykładową brał więc kino i przydrożną kapliczkę
zamiast katedry — nie z wady doboru, tylko z braku wymiaru w danych.

Sygnałem jest liczba wersji językowych: katedra ma kilkadziesiąt, kapliczka
żadnej. Cała trudność leży w tym, ŻEBY TRAFIĆ WE WŁAŚCIWY ARTYKUŁ.

ŹRÓDŁO GŁÓWNE — tag `wikidata` z OpenStreetMap. Katalog trzyma osm_id dla 412
z 414 miejsc, a mapowicze wpisują na obiektach identyfikator Wikidanych. To
powiązanie twarde: obiekt wskazuje swój artykuł sam, bez dopasowywania nazw.
Liczymy sitelinki Wikidanych, pomijając projekty siostrzane (Commons, Wikicytaty
i resztę), bo to nie są wersje językowe Wikipedii.

ŹRÓDŁO ZAPASOWE — wyszukiwanie po nazwie, dla miejsc bez tagu. Tu potrzebni są
strażnicy, bo wyszukiwarka zawsze coś zwróci, a przypisanie kapliczce ważności
katedry wypycha prawdziwe atrakcje z pierwszych miejsc:

  1. wspólne znaczące słowo — odsiewa trafienia zupełnie od czapy;
  2. artykuł musi mieć punkt na mapie i leżeć w promieniu 350 m. Punkt bierzemy
     z Wikidanych, nie z samej Wikipedii, bo małe edycje nie wstawiają szablonu
     współrzędnych — amfiteatr w Durrës (31 wersji językowych) dostawał zero
     tylko dlatego, że albańska Wikipedia go nie geokoduje.

Skąd akurat 350 m: zmierzyłem odległość między punktem z katalogu a punktem
artykułu dla trafień, o których wiedziałem, że są dobre i że są złe. Dobre
mieszczą się w 9-146 m, złe zaczynają się od 553 m („Théâtre de la Tour Eiffel"
brał 175 języków wieży, „Il Genio di Palermo" 151 języków miasta, „Musée de la
Banque nationale" 30 języków banku — wszystkie trzy leżą obok swojego
sławniejszego imiennika). Próg leży pośrodku tej przerwy.

Odrzuciłem po drodze regułę „pierwsze słowo nazwy musi być w tytule". Wyglądała
sensownie i przechodziła testy, ale sprawdzenie na całym katalogu pokazało, że
siedem z dziewięciu odrzuceń było poprawnymi trafieniami: Wikipedia nazywa te
obiekty inaczej niż OSM — „La Monnaie" zamiast „Théatre Royal de la Monnaie",
„Bazylika" zamiast „Kościół", „Chiesa della Martorana" zamiast „Santa Maria
dell'Ammiraglio". Geometria rozdziela to, czego nazwa nie rozdziela.

W `waznosc_zrodlo` zostaje ślad, skąd wzięta jest liczba — żeby dało się
odróżnić powiązanie twarde od zgadywanego.
"""
import json
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

JEZYK_KRAJU = {
    'PL': 'pl', 'PT': 'pt', 'IT': 'it', 'FR': 'fr', 'ES': 'es', 'DE': 'de',
    'AT': 'de', 'BE': 'fr', 'NL': 'nl', 'LV': 'lv', 'EE': 'et', 'RO': 'ro',
    'AL': 'sq', 'US': 'en', 'GB': 'en',
}
NAGLOWKI = {'User-Agent': 'RouteMarket/1.0 (+https://routemarket.io)'}
ILE_KANDYDATOW = 6
# Surowość progu idzie za tym, ile ufamy źródłu. Trafienie z wyszukiwania to
# domysł — musi stać dokładnie tam, gdzie miejsce. Identyfikator wpisany przez
# mapowicza to stwierdzenie — wystarczy sprawdzić, że artykuł opisuje w ogóle
# COŚ, CO STOI (wydarzenia i pojęcia nie mają punktu) i że nie jest to inne
# miasto. Próg 350 m na powiązaniach kosztował Planty w Krakowie i Eesti
# Ajaloomuuseum w Tallinnie: park i muzeum w kilku budynkach mają punkt dalej
# niż węzeł z OSM, więc wypadały na zero mimo szesnastu wersji językowych.
PROMIEN_M = 350
PROMIEN_POWIAZANIA_M = 5000
# Projekty siostrzane — nie są wersjami językowymi Wikipedii.
NIE_WIKIPEDIA = {'commonswiki', 'specieswiki', 'metawiki', 'wikidatawiki', 'sourceswiki',
                 'incubatorwiki', 'mediawikiwiki', 'foundationwiki', 'outreachwiki'}


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


def pobierz(url, dane=None):
    zad = urllib.request.Request(url, data=dane, headers=NAGLOWKI)
    with urllib.request.urlopen(zad, timeout=90) as r:
        return json.load(r)


# --- źródło główne: tag wikidata z OSM --------------------------------------

def tagi_z_osm(osm_idy):
    """osm_id -> {'wikidata': Q..., 'wikipedia': 'pl:Tytuł'} dla paczki obiektów."""
    grupy = {'node': [], 'way': [], 'relation': []}
    for o in osm_idy:
        if '/' not in o:
            continue
        typ, ident = o.split('/', 1)
        if typ in grupy and ident.isdigit():
            grupy[typ].append(ident)
    czesci = ''.join('%s(id:%s);' % (t, ','.join(v)) for t, v in grupy.items() if v)
    if not czesci:
        return {}
    q = '[out:json][timeout:90];(%s);out tags;' % czesci
    # Świadomie WYJĄTEK, nie puste zapytanie. Gdy Overpass milczał, skrypt zjeżdżał
    # po cichu na wyszukiwanie po nazwie i przepisywał cały katalog danymi gorszej
    # próby — wynik wyglądał wiarygodnie i tylko kolumna ze źródłem to zdradziła.
    # Lepiej stanąć i powtórzyć później, niż podmienić powiązania na domysły.
    ostatni = None
    for proba in range(3):
        try:
            return {'%s/%s' % (e['type'], e['id']): {
                        'wikidata': (e.get('tags') or {}).get('wikidata'),
                        'wikipedia': (e.get('tags') or {}).get('wikipedia')}
                    for e in pobierz('https://overpass-api.de/api/interpreter',
                                     urllib.parse.urlencode({'data': q}).encode()
                                     ).get('elements', [])
                    if (e.get('tags') or {}).get('wikidata') or (e.get('tags') or {}).get('wikipedia')}
        except Exception as e:
            ostatni = e
            print('  Overpass nie odpowiedział (próba %d z 3): %s' % (proba + 1, e), file=sys.stderr)
            time.sleep(15 * (proba + 1))
    raise RuntimeError('Overpass nie odpowiedział po trzech próbach: %s' % ostatni)



def sitelinki(qidy):
    """Q-id -> (liczba wersji Wikipedii, etykiety we wszystkich językach).

    Etykiety są potrzebne, żeby sprawdzić, czy wskazany obiekt mówi w ogóle
    o tym samym co nazwa z OSM — patrz `mowi_o_tym_samym`. Wszystkie języki,
    bo nazwa w katalogu jest miejscowa, a etykieta angielska bywa zupełnie inna:
    „Rahvusooper Estonia" trafia w niemieckie „Nationaloper Estonia", nie
    w angielskie „Estonian National Opera".
    """
    wynik = {}
    for i in range(0, len(qidy), 50):
        paczka = qidy[i:i + 50]
        u = 'https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode({
            'action': 'wbgetentities', 'ids': '|'.join(paczka),
            'props': 'sitelinks|labels', 'format': 'json'})
        try:
            d = pobierz(u)
        except Exception as e:
            print('  Wikidane nie odpowiedziały: %s' % e, file=sys.stderr)
            continue
        for q, e in (d.get('entities') or {}).items():
            if 'missing' in e:
                continue
            ile = sum(1 for k in (e.get('sitelinks') or {})
                      if re.match(r'^[a-z][a-z0-9_-]*wiki$', k) and k not in NIE_WIKIPEDIA)
            etykiety = [(v or {}).get('value', '') for v in (e.get('labels') or {}).values()]
            wynik[q] = (ile, etykiety)
        time.sleep(0.2)
    return wynik


def mowi_o_tym_samym(nazwa, etykiety):
    """Czy któraś etykieta dzieli znaczące słowo z nazwą z katalogu."""
    sn = set(slowa(glowna_nazwa(nazwa)))
    if not sn:
        return True
    return any(sn & set(slowa(e)) for e in etykiety)


def z_tagu_wikipedia(tag, nazwa, lat, lng):
    """Tag „pl:Kościół św. Marka" — liczymy langlinki, ale tym samym progiem."""
    if not tag or ':' not in tag:
        return None
    jezyk, tytul = tag.split(':', 1)
    if not mowi_o_tym_samym(nazwa, [tytul]):
        return None
    try:
        return ile_jezykow_dla(tytul, jezyk, lat, lng, PROMIEN_POWIAZANIA_M,
                               wymagaj_punktu=False)
    except Exception:
        return None


def wspolrzedne_hurtem(qidy):
    """Punkt P625 dla wielu obiektów naraz — jedno zapytanie zamiast setek.

    Pełne twierdzenia Wikidanych ważą ~60 kB na obiekt, czyli 24 MB dla całego
    katalogu. SPARQL oddaje same współrzędne w kilkudziesięciu kilobajtach.
    """
    wynik = {}
    naglowki = dict(NAGLOWKI, **{'Accept': 'application/sparql-results+json'})
    for i in range(0, len(qidy), 200):
        paczka = qidy[i:i + 200]
        zapytanie = 'SELECT ?item ?coord WHERE { VALUES ?item { %s } ?item wdt:P625 ?coord }' % (
            ' '.join('wd:%s' % q for q in paczka))
        u = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': zapytanie})
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers=naglowki), timeout=90) as r:
                d = json.load(r)
        except Exception as e:
            print('  Wikidane (SPARQL) nie odpowiedziały: %s' % e, file=sys.stderr)
            continue
        for w in d.get('results', {}).get('bindings', []):
            q = w['item']['value'].rsplit('/', 1)[-1]
            m = re.match(r'Point\(([-\d.]+) ([-\d.]+)\)', w['coord']['value'])
            if m:
                wynik[q] = (float(m.group(2)), float(m.group(1)))
        time.sleep(1.0)
    return wynik


# --- źródło zapasowe: wyszukiwanie po nazwie --------------------------------

def slowa(tekst):
    return [s for s in re.split(r"[^\w']+", (tekst or '').lower()) if len(s) > 3]


def glowna_nazwa(nazwa):
    """OSM zapisuje nazwy dwujęzyczne jako „Grand-Place - Grote Markt"."""
    return (nazwa or '').split(' - ')[0].strip() or (nazwa or '')


def kandydaci(nazwa, jezyk):
    u = ('https://%s.wikipedia.org/w/api.php?' % jezyk) + urllib.parse.urlencode({
        'action': 'query', 'list': 'search', 'srsearch': nazwa,
        'srlimit': str(ILE_KANDYDATOW), 'format': 'json'})
    return [h['title'] for h in pobierz(u).get('query', {}).get('search', [])]


def ma_wspolne_slowo(nazwa, tytul):
    sn, st = slowa(nazwa), slowa(tytul)
    return bool(st) if not sn else bool(set(sn) & set(st))


def wspolrzedne_z_wikidanych(qid):
    if not qid:
        return None
    u = 'https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'wbgetclaims', 'entity': qid, 'property': 'P625', 'format': 'json'})
    try:
        d = pobierz(u)
    except Exception:
        return None
    for c in d.get('claims', {}).get('P625', []):
        v = ((c.get('mainsnak') or {}).get('datavalue') or {}).get('value') or {}
        if v.get('latitude') is not None:
            return v['latitude'], v['longitude']
    return None


def metry(lat1, lng1, lat2, lng2):
    import math
    return math.hypot((lat2 - lat1) * 111320.0,
                      (lng2 - lng1) * 111320.0 * math.cos(math.radians(lat1)))


def ile_jezykow_dla(tytul, jezyk, lat, lng, promien=None, wymagaj_punktu=True):
    u = ('https://%s.wikipedia.org/w/api.php?' % jezyk) + urllib.parse.urlencode({
        'action': 'query', 'titles': tytul, 'prop': 'langlinks|coordinates|pageprops',
        'lllimit': '500', 'format': 'json', 'redirects': '1'})
    for _, s in pobierz(u).get('query', {}).get('pages', {}).items():
        if 'missing' in s:
            continue
        w = (s.get('coordinates') or [{}])[0]
        punkt = (w['lat'], w['lon']) if w.get('lat') is not None else None
        if punkt is None:
            punkt = wspolrzedne_z_wikidanych((s.get('pageprops') or {}).get('wikibase_item'))
        if punkt is None and wymagaj_punktu:
            return None       # domysł bez punktu na mapie odrzucamy
        if punkt is None:
            return len(s.get('langlinks', [])) + 1
        if lat is not None and metry(lat, lng, punkt[0], punkt[1]) > (promien or PROMIEN_M):
            return None       # artykuł opisuje coś innego, co stoi obok
        return len(s.get('langlinks', [])) + 1
    return None


def ile_jezykow(nazwa, jezyk, lat=None, lng=None):
    glowna = glowna_nazwa(nazwa)
    try:
        lista = kandydaci(glowna, jezyk)
    except Exception:
        return None
    for tytul in lista:
        if not ma_wspolne_slowo(glowna, tytul):
            continue
        try:
            ile = ile_jezykow_dla(tytul, jezyk, lat, lng)
        except Exception:
            continue
        if ile is not None:
            return ile
    return None


# --- przebieg ---------------------------------------------------------------

def zapisz(ident, wartosc, zrodlo):
    psql("update public.place_catalog set waznosc = %d, waznosc_zrodlo = %s where id = %s"
         % (wartosc, ap(zrodlo), ap(ident)), json_out=False)


def main():
    argumenty = sys.argv[1:]
    od_nowa = '--od-nowa' in argumenty
    miasta = [a for a in argumenty if not a.startswith('--')]
    miasto = miasta[0] if miasta else None

    # Przy --od-nowa bierzemy wszystkie miejsca i nadpisujemy je w miejscu.
    # Wcześniej kolumna szła na null już na starcie — a że dane z OSM pobieramy
    # dopiero potem, przerwany przebieg zostawiłby katalog bez ani jednej wartości.
    warunek = ('and city = %s' % ap(miasto)) if miasto else ''
    miejsca = psql("""
        select id, name, city, country, lat, lng, osm_id from public.place_catalog
        where %s %s order by city, name
    """ % ('true' if od_nowa else 'waznosc is null', warunek))
    if not miejsca:
        print('Nie ma czego uzupełniać.')
        return
    print('Do sprawdzenia: %d miejsc' % len(miejsca))

    # 1. Tagi z OSM — paczkami, żeby nie męczyć Overpassa.
    z_osm = {}
    idy = [m['osm_id'] for m in miejsca if m.get('osm_id')]
    try:
        for i in range(0, len(idy), 150):
            z_osm.update(tagi_z_osm(idy[i:i + 150]))
            time.sleep(2.0)
    except RuntimeError as e:
        print('\nPRZERWANE: %s' % e, file=sys.stderr)
        print('Nic nie zapisano. Powtórz za kilka minut.', file=sys.stderr)
        sys.exit(1)
    print('OSM wskazuje artykuł dla %d z %d miejsc.' % (len(z_osm), len(miejsca)))

    # 2. Sitelinki dla wszystkich Q-idów naraz.
    qidy = sorted({v['wikidata'] for v in z_osm.values() if v.get('wikidata')})
    liczby = sitelinki(qidy)
    punkty = wspolrzedne_hurtem(qidy)
    print('Wikidane odpowiedziały dla %d z %d identyfikatorów (%d ma punkt na mapie).'
          % (len(liczby), len(qidy), len(punkty)))

    # 3. Zapis; czego OSM nie wskazał, szukamy po nazwie.
    z_powiazania = z_nazwy = bez = 0
    for i, m in enumerate(miejsca, 1):
        tag = z_osm.get(m.get('osm_id') or '')
        ile, zrodlo = None, None
        if tag:
            # Powiązanie z OSM też bywa mylne: obiekt pomnika ofiar 11 września
            # wskazuje „zamachy z 11 września" — wydarzenie, nie miejsce — i brał
            # przez to 149 wersji językowych, wyprzedzając Empire State Building.
            #
            # Próbowałem odróżniać to brakiem punktu na mapie: wydarzenie punktu
            # nie ma, budynek ma. Reguła jest fałszywa. Instytucje też go nie mają,
            # bo punkt należy do budynku, a nie do organizacji — wypadły przez to
            # Muzeum Historii Estonii (16 wersji), Muzeum Morskie (24) i opera
            # narodowa (18), czyli pół Tallinna. Rozstrzyga za to etykieta: żadna
            # z nazw wydarzenia w setce języków nie dzieli słowa z „9/11 Memorial
            # & Museum", a każda nazwa muzeum dzieli.
            q = tag.get('wikidata')
            dane = liczby.get(q) if q else None
            if dane:
                n, etykiety = dane
                p = punkty.get(q)
                poza = p is not None and metry(m['lat'], m['lng'], p[0], p[1]) > PROMIEN_POWIAZANIA_M
                if n and mowi_o_tym_samym(m['name'], etykiety) and not poza:
                    ile, zrodlo = n, 'osm-wikidata'
            # Obiekt niesie zwykle oba tagi i bywa, że wskazują różne artykuły.
            # Kościół Clérigos ma w Wikidanych wpis bez ani jednego artykułu,
            # a w tagu `wikipedia` artykuł o całym zespole z szesnastoma wersjami —
            # dlatego drugi tag może przebić pierwszy, a nie tylko go zastąpić.
            #
            # ZNANE OGRANICZENIE: gdy oba tagi wskazują to samo, nic tu nie pomoże.
            # Giełda nowojorska ma w Wikidanych osobny wpis dla instytucji
            # (87 wersji) i dla budynku (7); obiekt w OSM wskazuje budynek w obu
            # tagach, więc zostaje 7 i giełda ląduje nisko. Nie naprawiam tego
            # zgadywaniem po nazwie — cena byłaby wyższa niż strata.
            z_art = z_tagu_wikipedia(tag.get('wikipedia'), m['name'], m['lat'], m['lng'])
            if z_art is not None and z_art > (ile or 0):
                ile, zrodlo = z_art, 'osm-wikipedia'
        # Zero z powiązania nie znaczy „miejsce nieznane", tylko „o tym wpisie
        # w Wikidanych nikt nie pisał". Kościół Clérigos wskazuje własny obiekt
        # bez ani jednego artykułu, choć artykuł o całym zespole ma szesnaście
        # wersji. Wtedy szukamy dalej — strażnik 350 m i tak nie przepuści
        # niczego, co nie stoi w tym samym miejscu.
        if ile is None:
            jezyk = JEZYK_KRAJU.get((m['country'] or '').upper(), 'en')
            ile = ile_jezykow(m['name'], jezyk, m['lat'], m['lng'])
            if ile is None and jezyk != 'en':
                ile = ile_jezykow(m['name'], 'en', m['lat'], m['lng'])
            zrodlo = 'szukanie' if ile is not None else 'brak'
            time.sleep(0.15)
        if zrodlo in ('osm-wikidata', 'osm-wikipedia'):
            z_powiazania += 1
        elif zrodlo == 'szukanie':
            z_nazwy += 1
        else:
            bez += 1
        zapisz(m['id'], ile if ile is not None else 0, zrodlo or 'brak')
        if i % 50 == 0:
            print('  %d / %d' % (i, len(miejsca)))

    print()
    print('Z powiązania OSM: %d' % z_powiazania)
    print('Z wyszukiwania:   %d' % z_nazwy)
    print('Bez artykułu:     %d' % bez)
    print()
    for w in psql("""
        select city, count(*) filter (where waznosc > 0) as znane, count(*) as wszystkich,
               max(waznosc) as najwyzsza
        from public.place_catalog %s group by city order by city
    """ % (('where city = %s' % ap(miasto)) if miasto else '')):
        print('  %-14s %s z %s ma artykuł, najwyżej %s języków'
              % (w['city'], w['znane'], w['wszystkich'], w['najwyzsza']))


if __name__ == '__main__':
    main()
