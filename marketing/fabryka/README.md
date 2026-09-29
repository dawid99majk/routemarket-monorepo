# Fabryka materiałów RouteMarket

Generator gotowych materiałów do mediów społecznościowych z danych, które już są
publiczne na routemarket.io: katalogu miejsc i opublikowanych tablic.

Z jednego tematu (tablica albo miasto) powstaje:

| Plik | Format | Gdzie |
|---|---|---|
| `karuzela/*.png` | 1080×1350, 12 slajdów | Instagram, Facebook, LinkedIn |
| `rolka.mp4` | 1080×1920, ~24 s, cicha ścieżka | Instagram Reels, TikTok, YouTube Shorts |
| `story.png` | 1080×1920 | Instagram/Facebook Stories |
| `pin.png` | 1000×1500 | Pinterest |
| `podpisy.md` | teksty pod każdy kanał + lista kontrolna | wszędzie |
| `zrodla-zdjec.txt` | autor, licencja, źródło każdego zdjęcia | pierwszy komentarz / opis |
| `podglad.html` | wszystko na jednej stronie | do przejrzenia przed publikacją |

## Użycie

```bash
npm install
node fabryka.mjs tematy                      # co jest do wyboru
node fabryka.mjs miasto "Rzym"               # paczka z katalogu miasta
node fabryka.mjs tablica <id>                # paczka z publicznej tablicy
node fabryka.mjs tydzien --od 2026-10-05     # 3 tematy + kalendarz.csv na tydzień
node fabryka.mjs miasto "Praga" --formaty karuzela,pin
```

Wymaga Node 20+, ffmpeg i Chromium z Playwrighta (`npx playwright install chromium`).
Plik `.env` zawiera adres Supabase i **publiczny** klucz anon (ten sam, który strona
wysyła każdej przeglądarce) — wzór w `.env.przyklad`.

## Zasady wbudowane w generator

**Zdjęcia tylko z licencją, która na to pozwala.** Każde zdjęcie przechodzi przez
API Wikimedia Commons. Wchodzą: domena publiczna, CC0, CC BY, CC BY-SA. Odpadają:
NC (zakaz użycia komercyjnego — post promujący serwis jest komercyjny), ND (zakaz
przeróbek — napis na zdjęciu to przeróbka), fair use i licencje nierozpoznane.
Miejsce bez dozwolonego zdjęcia wypada z materiału; nie ma trybu „na siłę”.

**Podpis jest częścią slajdu, nie opcją.** Szablon ze zdjęciem bez autora i licencji
rzuca błąd. Podpis stoi na każdym zdjęciu, pełna lista (tytuł, autor, licencja
z adresem, strona pliku) jest na ostatnim slajdzie karuzeli, w podpisie posta
i w `zrodla-zdjec.txt`. Przy CC BY-SA grafika dostaje dopisek o udostępnieniu na
tej samej licencji.

**Liczby z bazy, nie z modelu.** Teksty składa kod: suma minut zwiedzania, liczba
miejsc, godziny otwarcia. Obserwacja agenta („Przy 6 godzinach dziennie wychodzą
3 dni”) jest policzona. Głos według skilla `routemarket-glos`: bez emoji,
wykrzykników i przymiotników zamiast liczb.

**Nic nie wychodzi samo.** Fabryka nie publikuje. Publikacja to w modelu
operacyjnym czynność „do zatwierdzenia” — człowiek przegląda `podglad.html`,
odhacza listę w `podpisy.md` i dopiero wtedy wrzuca albo planuje posty.

**Muzyka dopiero w aplikacji.** Rolka ma cichą ścieżkę. Utwór dodaje się przy
publikacji z biblioteki Instagrama/TikToka dozwolonej dla kont firmowych.

## Jak to jest zbudowane

- `lib/dane.mjs` — odczyt katalogu i publicznych tablic kluczem anon (RLS widzi
  tylko to, co gość)
- `lib/zdjecia.mjs` — licencje z Commons, pobieranie i cache w `.cache/`
- `lib/szablony.mjs` — slajdy HTML w kierunku „Pocztówka”
- `lib/render.mjs` — HTML → PNG przez Chromium, z kontrolą wczytania krojów
- `lib/wideo.mjs` — rolka w ffmpeg: najazd kamery na zdjęcie + nakładka tekstu
- `lib/teksty.mjs`, `lib/formaty.mjs` — podpisy, odmiana, godziny po polsku
- `wyniki/historia.json` — co już było; tryb `tydzien` wybiera najpierw tematy nieużyte

Link w podpisach Facebooka i Pinteresta ma parametry UTM
(`utm_source=facebook|pinterest`, `utm_medium=social`, `utm_campaign=<temat>`),
więc wejścia z postów są widoczne w GA4 osobno.
