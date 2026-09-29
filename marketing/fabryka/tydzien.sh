#!/bin/zsh
# Cotygodniowa paczka: w piątek po południu powstają materiały na następny tydzień.
# Uruchamiane przez launchd (io.routemarket.fabryka). Log: wyniki/tydzien.log
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin
cd "$(dirname "$0")"
if node fabryka.mjs tydzien >> wyniki/tydzien.log 2>&1; then
  osascript -e 'display notification "Przejrzyj tydzien.html przed publikacją." with title "RouteMarket: paczka na tydzień gotowa"'
else
  osascript -e 'display notification "Szczegóły w wyniki/tydzien.log" with title "RouteMarket: fabryka się wywróciła"'
fi
