# Konfiguracja serwera

Kopie plików, które żyją na VPS poza obrazami kontenerów. Nie są stąd wdrażane —
leżą tu po to, żeby dało się je przejrzeć w przeglądzie zmian i odtworzyć po
odbudowie maszyny. Zmiana na serwerze bez odbicia jej tutaj zniknie razem
z maszyną.

| Plik | Miejsce na serwerze |
|---|---|
| `nginx/nginx.conf` | `/etc/nginx/nginx.conf` |
| `nginx/routemarket.io.conf` | `/etc/nginx/sites-enabled/routemarket.io` |
| `docker-cache.cron` | `/etc/cron.d/docker-cache` |

## Co tu jest ustawione i dlaczego

**Kompresja API.** Blok `supabase.routemarket.io` kompresuje odpowiedzi: zapytanie
o sto pozycji katalogu z opisami w sześciu językach waży 105 kB, po gzipie 37,7 kB.
Zasoby statyczne frontu kompresuje nginx w swoim kontenerze (`apps/frontend/nginx.conf`),
więc host ich nie dotyka. `gzip_proxied any` jest konieczne — bez niego nginx
pomija odpowiedzi przychodzące z proxy, czyli tutaj wszystkie.

**Ograniczenie tempa.** `limit_req` na tym samym bloku, 20 zapytań na sekundę
z serią do 50. Katalog jest głównym aktywem produktu, a jedno zapytanie zwraca do
tysiąca pozycji. Zmierzone po wdrożeniu: dwadzieścia zapytań po kolei przechodzi
w komplecie, sto dwadzieścia równolegle dostaje trzydzieści pięć odmów.

Ruch wewnętrzny tego nie dotyka — API serwera chodzi po `http://kong:8000`
w sieci dockerowej, z pominięciem nginx.

**Czyszczenie cache Dockera.** Cache budowania urósł do 92 GB i zajął 63% dysku.
Nocne `docker builder prune --keep-storage 10GB` trzyma to w ryzach: kolejne
wdrożenie tego samego dnia jest szybkie, a tydzień wdrożeń nie zjada dysku.

## Czego tu nie ma

Dziennik systemowy ograniczono do 500 MB przez `SystemMaxUse` w
`/etc/systemd/journald.conf` — plik należy do systemu, nie do projektu.

Limitu rozmiaru logów Dockera nie ustawiono: wymaga restartu demona, czyli
przerwy w działaniu wszystkich kontenerów.
