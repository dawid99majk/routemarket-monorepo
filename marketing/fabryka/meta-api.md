# Publikacja przez oficjalne API Mety

Fabryka nie publikuje sama. Pozycję kalendarza publikuje dopiero **publikator na VPS**, i tylko
gdy (1) zatwierdziłeś ją poleceniem na Macu, (2) jej czas już nadszedł, (3) nie minęło od niego
więcej niż 36 godzin. Instagram nie ma planowania w API, więc o czasie decyduje cron, a nie Meta.

```
Mac                                              VPS (/root/routemarket-promo)
─────────────────────────────                    ──────────────────────────────────────
fabryka.mjs tydzien   → paczki + kalendarz.csv
zatwierdz.mjs zatwierdz  → JPEG + teksty + zatwierdzone.json
zatwierdz.mjs wyslij  ───────── rsync ─────────► tydzien-RRRR-MM-DD/
                                                 publikuj.mjs (cron */10) ──► Graph API
                                                   IG: karuzela, rolka, relacja + komentarz ze źródłami
                                                   FB: zdjęcia, relacja
```

Pinterest, TikTok i YouTube Shorts nie są obsługiwane przez ten publikator (osobne API; Buffer
z planu darmowego ma API i będzie kolejnym krokiem).

## Jednorazowa konfiguracja (ok. 30 minut)

Potrzebne: konto Instagram profesjonalne powiązane ze stroną na Facebooku (jest, w Meta Business Suite).

1. **Aplikacja Mety:** developers.facebook.com → Moje aplikacje → Utwórz aplikację → przypadek
   użycia „Inne” → typ „Business” → nazwa np. „RouteMarket publikator”. Aplikacja zostaje w trybie
   **deweloperskim** — dla Twoich własnych kont nie wymaga App Review (przegląd jest potrzebny tylko
   do publikowania na cudzych kontach).
2. **Produkty:** dodaj „Instagram” (Instagram API z logowaniem przez Facebooka) i „Facebook Login”.
3. **Token:** Narzędzia → Graph API Explorer → wybierz aplikację → „Użytkownik” → dodaj uprawnienia:
   `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`,
   `instagram_content_publish`, `instagram_manage_comments` → „Generate Access Token” →
   zaznacz stronę routemarket.io i konto Instagram w oknie zgody.
4. **Zapisz token na VPS** (w terminalu, nie w czacie — token nie może trafić do rozmowy ani do repozytorium):
   ```bash
   ssh -t leadminer-vps 'cd /root/routemarket-workspace/marketing/fabryka && node meta-konfiguruj.mjs'
   ```
   Skrypt zapyta o ID aplikacji, klucz tajny aplikacji (Ustawienia → Podstawowe) i token z kroku 3
   (ukryte znaki), wymieni je na token strony, który nie wygasa, sprawdzi uprawnienia i zapisze
   **tylko token strony** do `/root/.routemarket-meta.env` (uprawnienia 600).
5. **Sprawdzenie:** `ssh leadminer-vps 'cd /root/routemarket-workspace/marketing/fabryka && node publikuj.mjs --stan'`

## Codzienna praca

```bash
cd ~/Documents/routemarket-fabryka
node fabryka.mjs tydzien --od 2026-10-12          # w piątek robi to launchd
open wyniki/tydzien-2026-10-12/tydzien.html       # przegląd
node zatwierdz.mjs stan wyniki/tydzien-2026-10-12
node zatwierdz.mjs zatwierdz wyniki/tydzien-2026-10-12 --temat 1,2   # albo --wszystko
node zatwierdz.mjs wyslij wyniki/tydzien-2026-10-12
node zatwierdz.mjs cofnij wyniki/tydzien-2026-10-12 --klucz "…"      # zdjąć zatwierdzenie; potem wyslij ponownie
```

Na VPS: `node publikuj.mjs --stan` (co czeka i co wyszło), `--sucho` (co poszłoby do Mety, bez żądań).
Log crona: `/root/audyt/publikator.log`. Wynik każdej pozycji (identyfikatory postów): `/root/routemarket-promo/stan/`.

## Ograniczenia, o których warto wiedzieć

- Limit Instagrama: 100 postów przez API na 24 h na konto; karuzela liczy się jako jeden.
- Rolka: 9:16, 5–90 s, H.264 — nasze ma ok. 24 s. Przetwarzanie trwa; publikator czeka na status FINISHED.
- Relacje przez API nie mają naklejki z linkiem: link do tablicy dodajesz ręcznie w aplikacji, jeśli chcesz.
- Zdjęcia muszą być pod publicznym adresem w momencie tworzenia kontenera. Publikator kopiuje je na
  chwilę do `/var/www/promo/` (nginx: `/promo/`) i usuwa po publikacji.
- Instagram przyjmuje w postach tylko JPEG — konwersja z PNG jest w `zatwierdz.mjs`.
- Zmiana uprawnień aplikacji albo wygaśnięcie zgody wywali publikację z czytelnym błędem; po trzech
  błędach pozycja nie jest ponawiana, żeby nie publikować w pętli.
