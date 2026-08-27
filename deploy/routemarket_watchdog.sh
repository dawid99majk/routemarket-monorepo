#!/bin/bash
# Watchdog RouteMarket: co 5 min sprawdza usługi, przy padzie restartuje kontener.
#
# ZMIANA WOBEC POPRZEDNIEJ WERSJI — dwie rzeczy, obie z audytu:
#
# 1. Awaria trafia do KOLEJKI ZATWIERDZEŃ, nie tylko do pliku. Wcześniej jedynym
#    śladem był /root/monitoring/watchdog.log, którego nikt nie otwiera — więc
#    ostrzeżenie nie miało jak dotrzeć. Kolejka odsiewa powtórki po odcisku
#    i podbija licznik, więc awaria trwająca godzinę to jeden wpis, nie dwanaście.
#
# 2. Watchdog zostawia PULS. Wcześniej milczał tak samo, gdy wszystko działało,
#    jak wtedy, gdy sam przestał chodzić — a to dwie zupełnie różne sytuacje.
#    Świeżość pulsu sprawdza nocny audyt: wolniejsze zadanie pilnuje szybszego,
#    bo samo siebie sprawdzić nie może.
#
# Próg dysku obniżony z 85% na 75%. Przy 232 GB osiemdziesiąt pięć procent
# zostawia trzydzieści pięć gigabajtów — a cache Dockera potrafił urosnąć
# o siedemdziesiąt w trzy dni, więc ostrzeżenie przychodziło za późno.
LOG=/root/monitoring/watchdog.log
STATE=/root/monitoring/stan
PULS=/root/monitoring/puls
PROG_DYSKU=75
mkdir -p "$STATE"
TS=$(date "+%F %T")
ANON=$(grep -E "^ANON_KEY=" /root/supabase-self-hosted/.env | cut -d= -f2-)

# Wpis do kolejki. Cicho, gdy się nie uda — watchdog ma pilnować usług,
# a nie przewracać się, bo baza akurat nie odpowiada.
zglos() { # obszar waga tytul opis odcisk
    local obszar=$1 waga=$2 tytul=$3 opis=$4 odcisk=$5
    python3 - "$obszar" "$waga" "$tytul" "$opis" "$odcisk" <<'PY' 2>/dev/null | \
        /root/routemarket-workspace/kolejka.py dodaj >/dev/null 2>&1
import json, sys
o, w, t, op, od = sys.argv[1:6]
print(json.dumps({'agent': 'watchdog', 'obszar': o, 'waga': w, 'tytul': t,
                  'opis': op, 'odcisk': od,
                  'dowod': {'zrodlo': 'routemarket_watchdog.sh'}},
                 ensure_ascii=False))
PY
}

check() { # nazwa url kontener_do_restartu [naglowek]
    local nazwa=$1 url=$2 kontener=$3 naglowek=$4
    if curl -sf -m 15 -o /dev/null ${naglowek:+-H "$naglowek"} "$url"; then
        if [ -f "$STATE/$nazwa" ]; then
            echo "$TS OK: $nazwa wrócił" >> "$LOG"
            rm -f "$STATE/$nazwa"
        fi
    else
        echo "$TS AWARIA: $nazwa ($url) nie odpowiada" >> "$LOG"
        if [ ! -f "$STATE/$nazwa" ] && [ -n "$kontener" ]; then
            echo "$TS RESTART: $kontener" >> "$LOG"
            docker restart "$kontener" >> "$LOG" 2>&1
            zglos "infrastruktura" "pilne" "$nazwa nie odpowiadał — kontener zrestartowany" \
                  "Adres $url nie odpowiedział przez 15 s. Zrestartowano $kontener. Jeśli wpis się powtarza, restart nie rozwiązuje przyczyny." \
                  "watchdog-restart-$nazwa"
        fi
        touch "$STATE/$nazwa"
    fi
}

check strona            "https://routemarket.io"                         "frontend-frontend-1"
check route-builder-api "http://127.0.0.1:8081/health"                   "deploy-route-builder-api-1"
check atlas-api         "http://127.0.0.1:8787/health"                   "deploy-atlas-api-1"
check supabase-auth     "https://supabase.routemarket.io/auth/v1/health" ""  "apikey: $ANON"

UZYCIE=$(df / --output=pcent | tail -1 | tr -dc 0-9)
if [ "$UZYCIE" -gt "$PROG_DYSKU" ]; then
    WOLNE=$(df -h / --output=avail | tail -1 | tr -d ' ')
    echo "$TS UWAGA: dysk $UZYCIE%" >> "$LOG"
    zglos "infrastruktura" "pilne" "Dysk zajęty w $UZYCIE%" \
          "Zostało $WOLNE. Cache budowania Dockera potrafi urosnąć o kilkadziesiąt gigabajtów w kilka dni: docker system df pokaże, ile da się odzyskać." \
          "watchdog-dysk"
fi

docker ps --filter health=unhealthy --format "{{.Names}}" | while read -r k; do
    echo "$TS UNHEALTHY: $k" >> "$LOG"
    zglos "infrastruktura" "wazne" "Kontener $k zgłasza się jako niesprawny" \
          "Docker oznaczył $k jako unhealthy. docker logs $k pokaże powód." \
          "watchdog-unhealthy-$k"
done

# Puls na końcu: znaczy „przebieg doszedł do końca", a nie „skrypt wystartował".
date "+%s" > "$PULS"
