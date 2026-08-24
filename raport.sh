#!/usr/bin/env bash
# Tygodniowy raport routemarket.io
#
# Pracuje przez SET ROLE raport_ro, a nie kluczem service_role. Różnica jest
# istotna: gdyby zapytanie sięgnęło po dane osobowe, po prostu się nie wykona,
# zamiast po cichu je zwrócić. Ograniczenie jest po stronie bazy, nie po stronie
# dobrych intencji tego, kto pisze zapytanie.
#
# Raport ma mówić także to, czego NIE wiadomo. Ruchu jeszcze nie ma, więc
# pokazywanie zer w rubryce „konwersja" sugerowałoby wynik tam, gdzie jest brak
# pomiaru.

set -uo pipefail

KATALOG=/root/raporty
STEMPEL=$(date +%Y%m%d)
PLIK="$KATALOG/raport-$STEMPEL.md"
mkdir -p "$KATALOG"

# psql potwierdza przelaczenie roli linijka "SET" — w trybie -t -A trafia ona
# do wyniku i psuje tabele w raporcie. Odsiewamy ja tutaj, zamiast obchodzic
# problem rezygnacja z SET ROLE, bo to wlasnie SET ROLE daje ograniczenie.
pyt() {
  docker exec -i supabase-db psql -U postgres -X -t -A -F'|' -c "SET ROLE raport_ro; $1"     | grep -vx 'SET'
}

{
echo "# Raport tygodniowy — $(date '+%Y-%m-%d')"
echo
echo "Dane z roli \`raport_ro\` (tylko odczyt, bez danych osobowych)."
echo

echo "## Produkt"
echo
echo "| Miara | Teraz | Nowe w tym tygodniu |"
echo "|---|---|---|"
pyt "select 'Tablice', count(*), count(*) filter (where created_at > now() - interval '7 days') from trip_projects;" \
  | awk -F'|' '{printf "| %s | %s | %s |\n", $1, $2, $3}'
pyt "select 'Tablice publiczne', count(*) filter (where is_public), count(*) filter (where is_public and published_at > now() - interval '7 days') from trip_projects;" \
  | awk -F'|' '{printf "| %s | %s | %s |\n", $1, $2, $3}'
pyt "select 'Miejsca na tablicach', count(*), count(*) filter (where created_at > now() - interval '7 days') from trip_project_places;" \
  | awk -F'|' '{printf "| %s | %s | %s |\n", $1, $2, $3}'
pyt "select 'Wygenerowane plany', count(*), count(*) filter (where created_at > now() - interval '7 days') from trip_plans;" \
  | awk -F'|' '{printf "| %s | %s | %s |\n", $1, $2, $3}'
pyt "select 'Miejsca w katalogu', count(*), count(*) filter (where created_at > now() - interval '7 days') from place_catalog;" \
  | awk -F'|' '{printf "| %s | %s | %s |\n", $1, $2, $3}'
echo

echo "## Koszt modelu"
echo
KOSZT=$(pyt "select coalesce(round(sum(cost_micro_usd)/1000000.0, 2), 0) from ai_usage_log where created_at > now() - interval '7 days';")
WYWOLAN=$(pyt "select count(*) from ai_usage_log where created_at > now() - interval '7 days';")
echo "W tym tygodniu: **${KOSZT} USD** przy ${WYWOLAN} wywołaniach."
echo
echo "| Operacja | Wywołań | Śr. czas | Koszt USD |"
echo "|---|---|---|---|"
pyt "select operation, count(*), round(avg(duration_ms)/1000.0,1) || ' s',
            round(sum(cost_micro_usd)/1000000.0, 3)
     from ai_usage_log where created_at > now() - interval '7 days'
     group by operation order by sum(cost_micro_usd) desc nulls last limit 8;" \
  | awk -F'|' 'NF>1 {printf "| %s | %s | %s | %s |\n", $1, $2, $3, $4}'
echo

echo "## Ile kosztuje jeden plan"
KOSZT_PLANU=$(pyt "
  select case when count(distinct p.id) = 0 then 'brak planów w tym tygodniu'
              else round(sum(u.cost_micro_usd)/1000000.0 / count(distinct p.id), 4) || ' USD'
         end
  from trip_plans p
  cross join lateral (select cost_micro_usd from ai_usage_log
                      where operation in ('plan-trip','plan-dzien')
                        and created_at > now() - interval '7 days') u
  where p.created_at > now() - interval '7 days';")
echo
echo "$KOSZT_PLANU"
echo

echo "## Katalog"
echo
pyt "select city, count(*) from place_catalog group by city order by count(*) desc limit 8;" \
  | awk -F'|' 'BEGIN{print "| Miasto | Miejsc |"; print "|---|---|"} NF>1 {printf "| %s | %s |\n", $1, $2}'
echo

echo "## Czego jeszcze nie wiadomo"
echo
echo "- **Ruch z zewnątrz.** Analityka wpięta, ale ładuje się dopiero za zgodą na cookies,"
echo "  a odwiedzin praktycznie nie ma. Konwersji nie da się jeszcze zmierzyć — i lepiej,"
echo "  żeby raport to mówił, niż pokazywał zero wyglądające jak wynik."
echo "- **Które treści działają.** Do rozstrzygnięcia potrzeba ruchu z różnych źródeł."
echo
echo "---"
echo
echo "_Raport wygenerowany automatycznie. Liczby z bazy, nie z szacunku._"
} > "$PLIK"

ln -sf "$PLIK" "$KATALOG/ostatni.md"
find "$KATALOG" -name 'raport-*.md' -mtime +180 -delete 2>/dev/null
cat "$PLIK"
