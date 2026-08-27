#!/usr/bin/env bash
# Nocny audyt routemarket.io
#
# Sprawdza rzeczy, które psują się po cichu — czyli takie, których nikt nie
# zauważy, dopóki nie zrobią szkody. Zestaw nie jest teoretyczny: każdy punkt
# odpowiada usterce, która naprawdę tu wystąpiła i przeleżała niezauważona.
#
# Zasada: milczy, gdy wszystko gra. Raport powstaje zawsze (do historii), ale
# powiadomienie idzie wyłącznie przy znaleziskach. Audytor, który codziennie
# pisze „wszystko w porządku", po tygodniu przestaje być czytany.
#
# Uruchamiany z crona na VPS. Nie zmienia niczego — tylko czyta.

set -uo pipefail

REPO=/root/routemarket-workspace
KATALOG_RAPORTOW=/root/audyt
STEMPEL=$(date +%Y%m%d)
RAPORT="$KATALOG_RAPORTOW/audyt-$STEMPEL.md"
mkdir -p "$KATALOG_RAPORTOW"

ZNALEZISKA=0
psql() { docker exec -i supabase-db psql -U postgres -X -t -A "$@"; }

zapisz() { echo "$1" >> "$RAPORT"; }

# problem <opis> [odcisk] [waga] [propozycja] [polecenie]
#
# Z odciskiem znalezisko trafia też do kolejki zatwierdzeń i czeka tam na
# decyzję. Bez odcisku ląduje wyłącznie w raporcie — dla rzeczy, które warto
# odnotować, ale nie ma o czym rozstrzygać.
BLEDY_KOLEJKI=/root/audyt/kolejka.log
# Ścieżka BEZWZGLĘDNA, bo audyt po drodze wchodzi do apps/frontend
# i apps/route-builder-api, żeby sprawdzić typy. Względne `./kolejka.py` działało
# więc tylko dla znalezisk zgłoszonych PRZED pierwszym `cd` — a wszystkie
# zgłoszenia są po nim. Kanał do kolejki milczał od początku i nie było tego jak
# zauważyć, bo błąd szedł do /dev/null.
KOLEJKA="$REPO/kolejka.py"

problem() {
  ZNALEZISKA=$((ZNALEZISKA+1))
  zapisz "- **$1**"
  [ -z "${2:-}" ] && return 0
  # Wynik wpisu do kolejki JEST WIDOCZNY, a nie wyciszony. Wcześniej stało tu
  # `>/dev/null 2>&1 || true` i przez to audyt raportował znaleziska wyłącznie
  # do pliku: kolejka zostawała pusta, a nikt nie miał jak tego zauważyć, bo
  # jedynym objawem był brak wpisu. Cichy `|| true` na kanale powiadomień znaczy
  # „powiadomienie może zniknąć i nikt się nie dowie".
  python3 - "$1" "$2" "${3:-wazne}" "${4:-}" "${5:-}" <<'PY' | "$KOLEJKA" dodaj >>"$BLEDY_KOLEJKI" 2>&1
import json, sys
print(json.dumps({
    'agent': 'audytor',
    'obszar': sys.argv[2].split(':')[0],
    'waga': sys.argv[3],
    'tytul': sys.argv[1][:180],
    'opis': sys.argv[1],
    'dowod': {'raport': 'audyt/ostatni.md'},
    'proponowane_dzialanie': sys.argv[4],
    'polecenie': sys.argv[5] or None,
    'odcisk': sys.argv[2],
}, ensure_ascii=False))
PY
}

{
  echo "# Audyt routemarket.io — $(date '+%Y-%m-%d %H:%M')"
  echo
} > "$RAPORT"

# ---------------------------------------------------------------- 1. typy ---
zapisz "## Typy"
cd "$REPO/apps/frontend" || exit 1
BLEDY_FRONT=$(./node_modules/.bin/tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c 'error TS')
cd "$REPO/apps/route-builder-api" || exit 1
BLEDY_API=$(./node_modules/.bin/tsc --noEmit 2>&1 | grep -c 'error TS')
if [ "$BLEDY_FRONT" -gt 0 ] || [ "$BLEDY_API" -gt 0 ]; then
  problem "Błędy typów: front $BLEDY_FRONT, API $BLEDY_API (powinno być 0)" "typy:bledy" "pilne" "Naprawić przed kolejnym wdrożeniem — build i tak się na nich wywali."
else
  zapisz "Front i API bez błędów."
fi
zapisz ""

# ------------------------------------------------------- 2. tłumaczenia ---
zapisz "## Tłumaczenia"
cd "$REPO/apps/frontend" || exit 1
WYNIK_I18N=$(python3 - <<'PY'
import json, os, re, glob
def splasz(o, p=''):
    out = {}
    for k, v in o.items():
        kl = p + k
        out.update(splasz(v, kl + '.')) if isinstance(v, dict) else out.setdefault(kl, v)
    return out
pliki = sorted(glob.glob('src/i18n/*.json'))
zestawy = {os.path.basename(p)[:-5]: splasz(json.load(open(p, encoding='utf-8'))) for p in pliki}
wzorzec = zestawy.get('pl', {})
braki = {j: sorted(set(wzorzec) - set(k)) for j, k in zestawy.items() if j != 'pl'}
nadmiar = {j: sorted(set(k) - set(wzorzec)) for j, k in zestawy.items() if j != 'pl'}

kod = []
for root, _, nazwy in os.walk('src'):
    if 'node_modules' in root or root.endswith('i18n'):
        continue
    kod += [open(os.path.join(root, n), encoding='utf-8', errors='replace').read()
            for n in nazwy if n.endswith(('.ts', '.tsx'))]
uzyte = set(re.compile(r'(?:^|[^A-Za-z0-9_])t\(\s*[\'"]([^\'"]+)[\'"]').findall('\n'.join(kod)))
dynamiczne = bool(re.search(r'(?:^|[^A-Za-z0-9_])t\(\s*`', '\n'.join(kod)))
martwe = [] if dynamiczne else sorted(set(wzorzec) - uzyte)

for j, b in braki.items():
    if b: print('BRAK|%s|%d|%s' % (j, len(b), ', '.join(b[:3])))
for j, n in nadmiar.items():
    if n: print('NADMIAR|%s|%d|%s' % (j, len(n), ', '.join(n[:3])))
if martwe: print('MARTWE||%d|%s' % (len(martwe), ', '.join(martwe[:3])))
PY
)
if [ -n "$WYNIK_I18N" ]; then
  while IFS='|' read -r rodzaj jezyk ile przyklad; do
    case "$rodzaj" in
      BRAK)    problem "Język $jezyk: brakuje $ile kluczy ($przyklad…)" ;;
      NADMIAR) problem "Język $jezyk: $ile kluczy, których nie ma w pl ($przyklad…)" ;;
      MARTWE)  problem "$ile kluczy nieużywanych w kodzie ($przyklad…)" ;;
    esac
  done <<< "$WYNIK_I18N"
else
  zapisz "Parytet zachowany, brak martwych kluczy."
fi
zapisz ""

# --------------------------------------------- 3. kod kontra schemat bazy ---
zapisz "## Kod kontra baza"
TABELE=$(psql -c "select table_name from information_schema.tables where table_schema='public';" | tr '\n' ' ')
BRAKUJACE=""
for T in $(grep -rhoE "from\('[a-z_]+'\)" "$REPO/apps/frontend/src" "$REPO/apps/route-builder-api/src" 2>/dev/null \
           | sed "s/from('//;s/')//" | sort -u); do
  case " $TABELE " in
    *" $T "*) ;;
    *) BRAKUJACE="$BRAKUJACE $T" ;;
  esac
done
if [ -n "$BRAKUJACE" ]; then
  problem "Kod pyta o tabele, których nie ma w bazie:$BRAKUJACE" "baza:brakujace-tabele" "pilne" "Usunąć martwy kod albo dodać brakującą tabelę."
else
  zapisz "Każda odpytywana tabela istnieje."
fi
zapisz ""

# ------------------------------------------------------- 4. mapa strony ---
zapisz "## Mapa strony"
MAPA=$(curl -s --max-time 20 https://routemarket.io/sitemap.xml)
ILE_URL=$(echo "$MAPA" | grep -c '<url>')
if [ "$ILE_URL" -lt 5 ]; then
  problem "Mapa strony ma tylko $ILE_URL adresów — sprawdź, czy się generuje" "seo:mapa-pusta" "pilne" "Sprawdzić endpoint /sitemap.xml w API."
else
  # Próbka, nie całość: 420 zapytań co noc to niepotrzebne obciążenie własnego
  # serwera. Pięć losowych wystarczy, żeby wychwycić awarię całej kategorii.
  ZLE=0
  for U in $(echo "$MAPA" | grep -oE 'https://routemarket.io/(miejsce|tablica)/[^<]+' | shuf -n 5); do
    KOD=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$U")
    [ "$KOD" != "200" ] && { problem "Adres z mapy odpowiada $KOD: $U"; ZLE=1; }
  done
  [ "$ZLE" = 0 ] && zapisz "$ILE_URL adresów, próbka pięciu odpowiada 200."
fi
zapisz ""

# ------------------------------------------------------------ 5. dostęp ---
zapisz "## Dostęp i polityki"
# Polityka, której nazwa obiecuje więcej, niż daje warunek — ten błąd wystąpił
# tu naprawdę ("Anyone reads catalog" wpuszczało tylko zalogowanych).
# Trzy warunki naraz, bo kazdy z osobna daje falszywe alarmy:
#   * rola {public} w Postgresie znaczy WSZYSTKIE role, wiec obejmuje anon,
#   * "publiczne" bywa przymiotnikiem przedmiotu ("kolekcje publiczne"),
#     a nie obietnica dla odbiorcy,
#   * nazwa, ktora sama mowi, kto czyta ("czyta zalogowany"), nie klamie.
MYLACE=$(psql -c "
  select tablename || ' → ' || policyname
  from pg_policies
  where schemaname='public'
    and (policyname ilike '%anyone%' or policyname ilike '%everyone%' or policyname ilike '%kazdy%' or policyname ilike '%każdy%')
    and roles::text not like '%anon%'
    and roles::text <> '{public}'
    and policyname !~* '(zalogowan|authenticated|admin|wlascic|owner)';")
# Sama nazwa nie wystarcza do orzeczenia, że dostępu NIE MA — o tym decyduje
# komplet polityk na tabeli, a nie ta jedna. „Anyone reads catalog" faktycznie
# obejmuje tylko `authenticated`, ale anonim czyta katalog przez osobną politykę
# dodaną później. Zgłaszanie tego jako braku dostępu było fałszywym alarmem
# powtarzanym co noc.
#
# Sprawdzamy więc SKUTEK: czy rola `anon` naprawdę wyjmie wiersz. Dopiero gdy
# nie wyjmie, nazwa obiecuje coś, czego nie ma.
if [ -n "$MYLACE" ]; then
  while read -r L; do
    [ -z "$L" ] && continue
    TABELA=${L%% *}
    # SET LOCAL działa WYŁĄCZNIE w transakcji — poza nią Postgres tylko ostrzega
    # i zapytanie leci jako superużytkownik, czyli test zawsze mówi „widzę".
    # Pierwsza wersja tego sprawdzenia miała dokładnie ten błąd i orzekała
    # o dostępie anonima, nie pytając go wcale.
    #
    # 'tak' i 'pusto' znaczą to samo dla dostępu: polityka przepuściła zapytanie.
    # Odmowa daje błąd, więc wynik jest wtedy pusty.
    CZYTA=$(psql -c "
      begin;
      set local role anon;
      select case when exists (select 1 from public.\"$TABELA\" limit 1) then 'tak' else 'pusto' end;
      rollback;" 2>/dev/null | grep -E '^(tak|pusto)$' | head -1)
    if [ "$CZYTA" = "tak" ] || [ "$CZYTA" = "pusto" ]; then
      zapisz "- Nazwa polityki myli (dostęp mimo to działa): $L"
    else
      problem "Nazwa polityki obiecuje dostęp publiczny, a anonim nic nie odczyta: $L" \
        "bezpieczenstwo:polityka-mylaca-$TABELA" "wazne" \
        "Sprawdzić komplet polityk na tabeli $TABELA — albo dodać dostęp dla anon, albo poprawić nazwę."
    fi
  done <<< "$MYLACE"
else
  zapisz "Nazwy polityk zgodne z zakresem."
fi

BEZ_RLS=$(psql -c "
  select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;")
[ "$BEZ_RLS" != "0" ] && problem "Tabel bez włączonego RLS: $BEZ_RLS" "bezpieczenstwo:brak-rls" "pilne" "Włączyć RLS i dodać polityki — tabela bez RLS jest otwarta dla wszystkich ról."
zapisz ""

# ----------------------------------------------------------- 6. katalog ---
zapisz "## Katalog miejsc"
STAN=$(psql -F'|' -c "
  select count(*),
         count(*) filter (where not (description_i18n ? 'pl')),
         count(*) filter (where jsonb_array_length(photos)=0),
         count(*) filter (where lat is null or lng is null)
  from public.place_catalog;")
IFS='|' read -r WSZ BEZ_OPISU BEZ_FOTO BEZ_XY <<< "$STAN"
zapisz "Miejsc: $WSZ · bez opisu: $BEZ_OPISU · bez zdjęcia: $BEZ_FOTO · bez współrzędnych: $BEZ_XY"
[ "${BEZ_OPISU:-0}" -gt 20 ] && problem "$BEZ_OPISU miejsc bez opisu — strony w mapie bez treści" "katalog:bez-opisu" "wazne" "Dogenerować opisy przez /catalog/enrich, potem przetłumaczyć."
[ "${BEZ_XY:-0}" -gt 0 ] && problem "$BEZ_XY miejsc bez współrzędnych — nie da się ich zaplanować" "katalog:bez-wspolrzednych" "wazne" "Uzupełnić przez geokodowanie albo usunąć z katalogu."
zapisz ""

# ------------------------------------------------------ 7. kopia zapasowa ---
zapisz "## Kopia zapasowa"
OSTATNIA=$(ls -t /root/backups/routemarket/db-*.sql.gz 2>/dev/null | head -1)
if [ -z "$OSTATNIA" ]; then
  problem "Brak jakiejkolwiek kopii bazy" "infra:brak-kopii" "pilne" "Sprawdzić cron i skrypt /root/routemarket_backup.sh."
else
  WIEK_H=$(( ( $(date +%s) - $(stat -c %Y "$OSTATNIA") ) / 3600 ))
  ROZMIAR=$(stat -c %s "$OSTATNIA")
  zapisz "Ostatnia: $(basename "$OSTATNIA"), sprzed ${WIEK_H} h, $(( ROZMIAR / 1024 / 1024 )) MB"
  [ "$WIEK_H" -gt 30 ] && problem "Kopia bazy sprzed ${WIEK_H} h — cron mógł przestać działać" "infra:kopia-stara" "pilne" "Sprawdzić log: /root/backups/routemarket/backup.log"
  [ "$ROZMIAR" -lt 1000000 ] && problem "Kopia bazy ma tylko $ROZMIAR B — podejrzanie mało" "infra:kopia-mala" "pilne" "Sprawdzić, czy pg_dump nie kończy się po cichu błędem."
fi
zapisz ""

# ------------------------------------------------------------ 8. watchdog ---
# Kto pilnuje pilnującego. Watchdog chodzi co pięć minut i sam siebie sprawdzić
# nie może — milczał tak samo, gdy wszystko działało, jak wtedy, gdy przestał
# chodzić. Zostawia więc puls, a to wolniejsze zadanie sprawdza jego świeżość.
#
# Piętnaście minut to trzy przebiegi: jeden pominięty przy chwilowym obciążeniu
# nie jest jeszcze awarią, trzy z rzędu już tak.
zapisz "## Watchdog"
PULS=/root/monitoring/puls
if [ ! -f "$PULS" ]; then
  problem "Watchdog nie zostawił pulsu — prawdopodobnie nie działa" "infra:watchdog-brak-pulsu" "pilne" \
    "Sprawdzić wpis w cronie i uruchomić ręcznie: /root/routemarket_watchdog.sh"
else
  WIEK_MIN=$(( ( $(date +%s) - $(cat "$PULS" 2>/dev/null || echo 0) ) / 60 ))
  zapisz "Ostatni przebieg: sprzed ${WIEK_MIN} min"
  [ "$WIEK_MIN" -gt 15 ] && problem "Watchdog milczy od ${WIEK_MIN} min — usługi nie są pilnowane" \
    "infra:watchdog-milczy" "pilne" \
    "Sprawdzić cron (*/5 * * * * /root/routemarket_watchdog.sh) i uruchomić skrypt ręcznie."
fi
zapisz ""

# ------------------------------------------------------------- podsumowanie ---
{
  echo "---"
  echo
  if [ "$ZNALEZISKA" -eq 0 ]; then
    echo "**Bez znalezisk.**"
  else
    echo "**Znalezisk: $ZNALEZISKA.**"
  fi
} >> "$RAPORT"

# Raport zostaje zawsze — historia pozwala odpowiedzieć na pytanie „od kiedy".
# Na wyjście idzie tylko wtedy, gdy jest o czym mówić: cichy audytor to taki,
# którego się czyta.
ln -sf "$RAPORT" "$KATALOG_RAPORTOW/ostatni.md"
find "$KATALOG_RAPORTOW" -name 'audyt-*.md' -mtime +60 -delete 2>/dev/null

if [ "$ZNALEZISKA" -gt 0 ]; then
  cat "$RAPORT"
  exit 1
fi
exit 0
