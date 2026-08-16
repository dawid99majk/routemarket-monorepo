#!/bin/bash
# Wdrożenie frontendu z weryfikacją. Dockerfile robi tylko COPY dist — bez
# npm run build spakowałby stary kod i wypisał mylące "Built". Ten skrypt
# usuwa tę pułapkę: buduje Vite, buduje obraz i SPRAWDZA, że kontener
# naprawdę serwuje świeży bundle.
set -e
cd /root/routemarket-workspace/apps/frontend

echo "[1/4] npm run build (tsc + vite)…"
npm run build

STAMP="deploy-$(date +%s)"
echo "$STAMP" > dist/deploy-stamp.txt

echo "[2/4] docker build…"
docker compose build frontend

echo "[3/4] docker up…"
docker compose up -d frontend
sleep 3

echo "[4/4] weryfikacja…"
SERVED=$(docker exec frontend-frontend-1 cat /usr/share/nginx/html/deploy-stamp.txt 2>/dev/null || echo BRAK)
if [ "$SERVED" != "$STAMP" ]; then
    echo "BŁĄD: kontener serwuje stary build (stempel: $SERVED, oczekiwany: $STAMP)"
    exit 1
fi
curl -sf -o /dev/null https://routemarket.io || { echo "BŁĄD: strona nie odpowiada"; exit 1; }
echo "OK: wdrożono $STAMP, strona odpowiada"
