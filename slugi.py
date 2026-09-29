#!/usr/bin/env python3
"""Poprawia adresy stron miejsc zepsute przez brak transliteracji („ł” znikało).

Przelicza bazę adresu starą i nową regułą (jak placeSlug w katalog-helpers.ts).
Zmienia tylko wiersze, których obecny adres to dokładnie stara reguła dla tej
nazwy — ręcznie zmienionych nie rusza. Stary adres trafia do slugi_poprzednie,
a /miejsce/<stary> przekierowuje 301 na nowy.
"""
import json, re, subprocess, sys, unicodedata

BEZ_ROZKLADU = {'ł': 'l', 'Ł': 'l', 'ø': 'o', 'Ø': 'o', 'ß': 'ss', 'æ': 'ae', 'Æ': 'ae', 'œ': 'oe', 'Œ': 'oe',
                'đ': 'd', 'Đ': 'd', 'ð': 'd', 'Ð': 'd', 'þ': 'th', 'Þ': 'th', 'ı': 'i', 'ħ': 'h', 'Ħ': 'h',
                'ŋ': 'n', 'Ŋ': 'n'}

def baza(nazwa, miasto, nowa):
    s = ' '.join(x for x in [nazwa, miasto] if x)
    if nowa:
        s = ''.join(BEZ_ROZKLADU.get(z, z) for z in s)
    s = unicodedata.normalize('NFD', s)
    s = re.sub('[̀-ͯ]', '', s).lower()
    s = re.sub('[^a-z0-9]+', '-', s).strip('-')[:60]
    return s or 'miejsce'

def psql(q):
    return subprocess.run(['docker', 'exec', '-i', 'supabase-db', 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'],
                          input=q, capture_output=True, text=True, check=True).stdout

wiersze = json.loads(psql("select coalesce(json_agg(json_build_object('id', id, 'slug', slug, 'name', coalesce(nazwa_lokalna, name), 'city', city)), '[]') from place_catalog;"))
zajete = {w['slug'] for w in wiersze}
zmiany = []
for w in wiersze:
    sufiks = w['slug'].rsplit('-', 1)[-1]
    stara, nowa = baza(w['name'], w['city'], False), baza(w['name'], w['city'], True)
    if stara == nowa or w['slug'] != f'{stara}-{sufiks}':
        continue
    nowy = f'{nowa}-{sufiks}'
    if nowy in zajete:
        print('ZAJĘTY', nowy, file=sys.stderr); continue
    zajete.add(nowy)
    zmiany.append((w['id'], w['slug'], nowy))

print(f'do zmiany: {len(zmiany)}')
for _, a, b in zmiany[:8]:
    print(f'  {a}  →  {b}')
if '--zapisz' in sys.argv and zmiany:
    sql = 'begin;\n' + ''.join(
        f"update place_catalog set slugi_poprzednie = array_append(slugi_poprzednie, '{a}'), slug = '{b}' where id = '{i}';\n"
        for i, a, b in zmiany) + 'commit;\n'
    psql(sql)
    print('zapisano')
