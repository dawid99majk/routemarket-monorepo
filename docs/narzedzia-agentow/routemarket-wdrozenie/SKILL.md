---
name: routemarket-wdrozenie
description: Wdrażanie zmian na routemarket.io — kolejność kroków, weryfikacja i pułapki, które już raz kosztowały czas. Użyj, gdy trzeba wdrożyć front, API, migrację bazy albo sprawdzić, czy wdrożenie faktycznie doszło.
---

# Wdrożenie routemarket.io

Kod żyje na VPS-ie (`ssh leadminer-vps`), w `/root/routemarket-workspace`.
Praca lokalna polega na wysyłaniu łatek przez `rsync` i uruchamianiu ich zdalnie.

## Pułapki, przez które to nie jest oczywiste

**`deploy-api.sh` wraca natychmiast.** Odpala własny build w tle i kończy się,
zanim cokolwiek się zbuduje. Łańcuch `./deploy-api.sh && ./deploy-frontend.sh`
wypisze więc tylko jedno „OK: wdrożono" — od frontu — a API może dalej chodzić
na starym obrazie.

Jedyny wiarygodny dowód przeładowania API:

```bash
docker inspect -f "{{.State.StartedAt}}" deploy-route-builder-api-1
```

`docker ps` pokazuje stan sprzed chwili i tuż po recreate potrafi skłamać
(„Up 22 hours" dla kontenera sprzed sekundy). Postęp builda API leci do
`/tmp/rb-build.log`, nie do logu wdrożenia.

**Dockerfile frontu tylko kopiuje `dist`.** Nie uruchamia Vite. Samo
`docker compose build` spakuje więc poprzednią wersję i wypisze mylące
„Image Built". Skrypt `deploy-frontend.sh` zamyka tę pułapkę — używaj go
zamiast ręcznego budowania obrazu.

**Heredoc w zsh psuje JSX.** `<Component` i `=>` bywają zjadane. Łatki pisz
lokalnie jako skrypty Pythona i wysyłaj `rsync`-iem, zamiast wklejać kod przez
SSH. Cudzysłowy w SQL przez `ssh '...'` też się rozpadają — SQL wysyłaj plikiem.

**Repo ma mieszane końcówki linii.** Skrypty Pythona czytające i zapisujące
plik zamienią CRLF na LF, co zamieni łatkę na 400 linii szumu w diffie.
Po większej łatce sprawdź `git diff --stat --ignore-all-space` i porównaj.

## Kolejność

1. **Łatka lokalnie** — skrypt Pythona z dokładnymi kotwicami, które sprawdzają
   liczbę wystąpień i przerywają przy niejednoznaczności.
2. **`rsync` na VPS**, uruchomienie, sprawdzenie wyniku podmian.
3. **Typy**: `npm run typecheck` w `apps/frontend` (wskazuje na
   `tsconfig.app.json` — główny `tsconfig.json` ma `"files": []` i nie sprawdza
   niczego) oraz `./node_modules/.bin/tsc --noEmit` w `apps/route-builder-api`.
4. **Wdrożenie** właściwym skryptem.
5. **Weryfikacja** — patrz niżej. Bez tego kroku nie wiadomo, czy się udało.

## Po migracji bazy

```bash
./gen-types.sh
```

Bez tego nowa kolumna nie istnieje dla frontendu, a zapytanie o nią wygląda
jak błąd typu. Migracje pisz z `BEGIN`/`COMMIT` i zapytaniem kontrolnym na
końcu — plik zostaje w repo jako `migracja-*.sql`.

## Weryfikacja, która coś dowodzi

```bash
# front: czy nowy kod jest w kontenerze, nie tylko w buildzie
docker exec frontend-frontend-1 sh -c "grep -rl 'UNIKALNY_TEKST' /usr/share/nginx/html/assets/*.js"

# API: czas startu kontenera musi być nowszy niż sprzed wdrożenia
docker inspect -f "{{.State.StartedAt}}" deploy-route-builder-api-1

# strona i API odpowiadają
curl -s -o /dev/null -w "%{http_code}\n" https://routemarket.io/
curl -s https://routemarket.io/route-builder-api/health
```

Szukanie tekstu w `index-*.js` bywa mylące: kod stron ładowanych leniwie siedzi
we własnych plikach (`TripPlans-*.js`, `Marketing-*.js`). Przeszukuj `*.js`,
nie sam `index`.

## Czego nie robić

- Nie wdrażaj bez uruchomienia typów — od niedawna build je sprawdza naprawdę
  i wywali się na błędach; to jest cel, nie usterka.
- Nie zmieniaj `/etc/nginx/sites-available/routemarket.io` bez skopiowania
  zmiany do `routemarket.io.nginx` w repo. Ta kopia raz już się rozjechała
  i brakowało w niej routingu wizytówek.
- Nie commituj `.env` — są ignorowane, ale łatki potrafią je wciągnąć przez
  `git add -A`.
