# Handoff: landing page (routemarket.io) — RouteMarket

## Overview

Publiczna strona główna pod `www.routemarket.io` — pierwszy ekran dla użytkownika, który nie
ma konta, nie ma wyjazdu i nie wie, czym jest produkt.

**Dlaczego osobny ekran, a nie pulpit „Start":** pulpit zakłada aktywny wyjazd, zapisane
miejsca i historię. Zimny użytkownik nie ma żadnej z tych rzeczy — zobaczyłby pusty interfejs
i nie dowiedziałby się, po co zakładać konto.

Założenie redakcyjne całej strony: **produkt trzeba pokazać, nie opisać.** Zamiast listy
funkcji — realny plan (Durrës, 3 popołudnia z dzieckiem), realny fragment pliku GPX, realne
ostrzeżenia agenta o nierealnym planie.

Cel konwersji: **wpisanie destynacji w pole w hero.** Konto zakłada się dopiero przy zapisie
tablicy — to jest napisane wprost w copy pod końcowym CTA.

## About the Design Files

`prototype/Routemarket Landing.dc.html` to **referencja projektowa w HTML**, nie kod produkcyjny
do skopiowania. Otwiera się w przeglądarce bez budowania.

Struktura: szablon HTML (markup + style inline) oraz klasa `Component` w tagu
`<script data-dc-script>` na końcu pliku. **Cała treść tekstowa — kroki, dni przykładu,
punkty GPX, linie pliku GPX, tablice, FAQ — leży w `renderVals()`**, więc to najlepsze
miejsce do odczytania copy.

`tokens.css` to wyciąg `:root` z tokenami. Źródłem prawdy pozostaje `@routemarket/frontend`.

## Fidelity

**High-fidelity.** Układ, proporcje, hierarchia, copy i dane — odtwarzać wiernie. Kolory
i typografia stoją już wyłącznie na tokenach (`hsl(var(--token))`), w pliku nie ma żadnych
wartości hex.

Wyjątki:

- **Placeholdery zdjęć** — kafelki tablic to płaskie tinty tokenów
  (`hsl(var(--primary) / .16)`, `hsl(var(--dusty-blue) / .18)`, `hsl(var(--accent) / .22)`).
  Docelowo realne fotografie miejsc.
- **Brak ikon** — prototyp nie używa ikon. Jeśli implementacja je doda, wyłącznie z zestawu
  używanego w bibliotece.

## Target environment

Biblioteka: **`@routemarket/frontend`** (React, Radix + Tailwind).

Zasady wiążące:

- Kolor **wyłącznie przez tokeny** (`bg-primary`, `text-muted-foreground`, `border-border`,
  `bg-muted`, `bg-warning/15`). Żadnych surowych klas palety Tailwinda.
- Na ciemnym tle kolorem akcji jest **`primary-light`** — `primary` jest tam nieczytelny.
  Dotyczy sekcji „Nawigacja i GPX".
- Typografia: `font-display` = Fraunces (nagłówki, tytuły), `font-sans` = Inter (tekst i UI),
  `font-narrow` = Archivo Narrow (nadtytuły wersalikami), `font-mono` = JetBrains Mono
  z `tabular-nums` (godziny, dystanse, nazwy plików, kod GPX).
- Zdania wielką literą tylko na początku — także w przyciskach.
- Wersaliki tylko w nadtytułach i etykietach, do 13 px.
- Bez emoji. Dozwolone znaki: `—`, `·`, `↗`, `→`.
- `rounded-md` na kartach, `rounded-full` na pigułkach i awatarach.
- Separator metadanych: `·`.
- Cienie ciepłe (`shadow-token-*`), bez gradientów.

Mapowanie na komponenty:

| Element | Komponent |
|---|---|
| przyciski akcji | `Button` (`variant`: default / outline / ghost, `size`: default / sm) |
| pola destynacji (hero, CTA) | `Input` — w prototypie ręczne, bo wchodzą w złożoną grupę z przyciskiem |
| pigułki klimatu w hero | `ToggleGroup` + `ToggleGroupItem` (wybór pojedynczy) |
| karty (demo planu, dni, tablice) | `Card` + `CardHeader` / `CardContent` / `CardFooter` |
| ostrzeżenia agenta o realizmie | `Alert` z tokenem `warning` |
| awatary autorów tablic | `Avatar` + `AvatarFallback` |
| pigułki przystanków w dniach | `Badge variant="secondary"` |
| FAQ | `Accordion` — patrz uwaga w sekcji o FAQ |
| nawigacja w headerze | `NavigationMenu` lub proste `<a>` |

## Sections

Kontener treści: `max-width: 1280px`, wyśrodkowany, padding `40px` po bokach.

### Header (sticky, 68 px)

Tło `background/.88` z `backdrop-filter: blur(8px)`, dolna linia `border-border`.
Logotyp „Routemarket" (Fraunces 20 px, waga 500), nawigacja kotwicowa (`Jak to działa`,
`Przykładowy plan`, `Nawigacja i GPX`, `Tablice`), po prawej `Button variant="ghost" size="sm"`
„Zaloguj się" i `Button size="sm"` „Zaplanuj wyjazd".

### 1. Hero (padding 88/40/72, dwie kolumny)

**Lewa kolumna:**

- Nadtytuł wersalikami „Planner wyjazdów" w kolorze `primary`.
- `h1`: **„Zbierz miejsca. Resztę ułoży agent."** — Fraunces, waga 300,
  `clamp(38px, 4.4vw, 62px)`, `line-height: 1.04`, `letter-spacing: -0.03em`, `text-wrap: balance`.
- Akapit 18 px, `max-width: 52ch`: „Wyszukujesz atrakcje i wrzucasz je na tablicę wyjazdu —
  »na pewno«, »być może«, »nie«. Agent układa z nich plan na każdy dzień, z realnymi godzinami
  i czasem dojazdu, i oddaje gotowy plik GPX do zegarka albo nawigacji."
- **Główne CTA**: karta `bg-card` z cieniem `shadow-sm`, padding 8 px, w środku pole
  „Dokąd jedziesz?" (16 px) i przycisk `primary` „Zacznij planować". `max-width: 560px`.
- **Pigułki klimatu**: etykieta „Jadę" + `z dziećmi`, `we dwoje`, `w delegację`, `ze znajomymi`,
  `sam`. Domyślnie „z dziećmi". Wybór pojedynczy, zawsze jedna aktywna.
- Pod spodem monospace 12 px: „Bez karty · plan gotowy w kilka minut · działa też offline
  w terenie".

**Prawa kolumna — podgląd wygenerowanego planu.** To jest cały pitch produktu w jednym
elemencie, nie dekoracja. Karta `bg-card`, `shadow-lg`, `max-width: 520px`, dosunięta do prawej:

- Nagłówek: nadtytuł „Plan wygenerowany", tytuł „Durrës · dzień 1", po prawej monospace
  „3 g 25 min".
- Cztery wiersze w siatce `62px 1fr`: godzina monospace, numerowany pin `primary` (22 px),
  nazwa (Fraunces 15 px), meta monospace. Dane: `14:20 Amfiteatr w Durrës · 1 g 30 min ·
  cień po 15:00`, `16:05 Forum bizantyjskie · 25 min · 7 min pieszo`, `16:45 Wieża Wenecka ·
  40 min · taras nad portem`, `17:35 Promenada Durrës · 30 min · powrót pod hotel`.
- Stopka na `bg-muted`: „3,8 km pieszo · +46 m" i owalna plakietka `durres-dzien-1.gpx`
  w kolorze `primary`.

### 2. Jak to działa (tło `bg-card`, padding 80 px)

Nagłówek: nadtytuł „Jak to działa" + `h2` „Cztery kroki od pomysłu do trasy w zegarku"
(Fraunces 300, `clamp(30px, 3.1vw, 40px)`).

Cztery kolumny rozdzielone pionowymi liniami `border-border`, linia również nad całym rzędem.
Każda: numer monospace (`01`–`04`) w kolorze `primary`, tytuł Fraunces 20 px, opis 14 px.

1. **Powiedz, dokąd i z kim** — „Miasto, termin i klimat wyjazdu. Agent od razu podsuwa
   pierwsze miejsca, także takie, których nie miałeś na liście."
2. **Zapisuj, co Cię interesuje** — „Feed atrakcji ze zdjęciem, czasem zwiedzania i godzinami
   otwarcia. Jedno kliknięcie odkłada miejsce na tablicę."
3. **Rozstrzygnij wątpliwości** — „Tablica ma trzy kubełki: na pewno, być może, nie. Odrzucone
   nie znikają — zawsze możesz je przywrócić."
4. **Odbierz gotową trasę** — „Plan na każdy dzień z godzinami, kolejnością i czasem dojazdu.
   Na końcu plik GPX do zegarka albo nawigacji."

### 3. Prawdziwy przykład (padding 88 px, dwie kolumny)

**Lewa kolumna (sticky, `top: 100px`, `max-width: 460px`):** nadtytuł „Prawdziwy przykład",
`h2` „Trzy popołudnia w Durrës, z sześciolatkiem", dwa akapity 16 px i `Button`
„Zobacz cały plan ↗".

Copy akapitów jest istotne — mówi o ograniczeniu, nie o funkcji: „Dwanaście obejrzanych
miejsc, dziewięć zapisanych, trzy odrzucone. Agent dostał jedno ograniczenie: start po
czternastej, maksymalnie cztery godziny dziennie." oraz „Przylądek Rodonit sam wypadł z planu
— godzina drogi w jedną stronę nie mieści się w takim popołudniu. Agent to napisał wprost,
zamiast wcisnąć go na siłę."

**Prawa kolumna:** trzy karty dni. Każda: tytuł Fraunces 20 px + meta monospace, rząd pigułek
z przystankami, na dole **`Alert` z tokenem `warning`** (tło `warning/.14`, obrys `warning/.32`)
z plakietką „Realizm" i zdaniem agenta.

| Dzień | Meta | Przystanki | Ostrzeżenie |
|---|---|---|---|
| Dzień 1 — stare miasto | 3 g 25 min · 3,8 km pieszo | Amfiteatr, Forum bizantyjskie, Wieża Wenecka, Promenada | „Trzy punkty na 3,5 godziny. Zmieściłby się czwarty, ale amfiteatr i mury to dużo schodów jak na jedno popołudnie." |
| Dzień 2 — woda i piasek | 3 g 50 min · 2 przejazdy autem | Plaża Golem, Park zabaw Adriatik, Bazar rybny | „Dzień z dwoma przejazdami autem. Golem i park dzieli 6 minut, więc kolejność ma znaczenie." |
| Dzień 3 — ostatnie popołudnie | 3 g 10 min · 2,6 km pieszo | Muzeum Archeologiczne, Mury Kalaja, Plaża Currila | „Muzeum zamyka o 16:00 — to jedyny punkt dnia z twardym limitem. Reszta jest elastyczna." |

**Ostrzeżenia o realizmie są na landingu celowo.** To najmocniejsza różnica wobec generatorów
planów, które upychają dziesięć atrakcji w jedno popołudnie. Nie usuwać ich w imię
„pozytywnego przekazu".

### 4. Nawigacja i GPX (tło `ink`, padding 88 px, dwie kolumny)

**Lewa:** nadtytuł „Nawigacja i GPX" w `primary-light`, `h2` „Plan kończy się plikiem, nie
zakładką w przeglądarce" w kolorze `background`, akapit `primary-foreground/.74` (`max-width: 46ch`),
pod nim trzy pozycje rozdzielone liniami `primary-foreground/.14`:

1. **Zegarek i licznik** — „Garmin, Suunto, Coros, Wahoo — standardowy GPX z punktami trasy i śladem."
2. **Twoja aplikacja mapowa** — „Organic Maps, Komoot, Gaia, Locus. Plik otwiera się bez konwersji."
3. **Nawigacja Routemarket** — „Wbudowane prowadzenie od punktu do punktu, z godzinami z planu.
   Mapa pobiera się przed wyjazdem i działa bez zasięgu."

**Prawa:** panel `primary-foreground/.05` z obrysem `/.14` i **fragmentem realnego pliku GPX**
w monospace 12 px (nagłówek `<gpx>`, `<metadata>` z nazwą i czasem, dwa `<wpt>` ze
współrzędnymi Durrës i opisami godzin, `<trk>` z nazwą „Trasa pieszo · 3,8 km").
Nagłówek panelu: `durres-dzien-1.gpx` w `primary-light`.

Kod GPX ma `white-space: pre-wrap` i `overflow-wrap: anywhere`, żeby nie rozpychał kolumny.

### 5. Tablice od podróżników (padding 88 px)

Nagłówek: nadtytuł, `h2` „Nie zaczynaj od pustej tablicy", akapit „Skopiuj tablicę kogoś, kto
był tam przed tobą, i wyrzuć z niej to, co do ciebie nie pasuje. Twoje tablice możesz
współdzielić z osobą, z którą jedziesz.", po prawej `Button variant="outline"` „Przeglądaj tablice".

Trzy karty. Góra karty: mozaika trzech kafelków w siatce `2fr 1fr` / dwa rzędy (duży kafelek
zajmuje oba rzędy), wysokość 168 px, gap 2 px. Pod nią: tytuł Fraunces 18 px, meta monospace,
awatar 28 px z inicjałami + nazwa autora.

Dane: „Durrës z 5-latkiem" (11 miejsc · 4 kopie, Anna K.), „Riwiera albańska w sześć dni"
(23 miejsca · 31 kopii, Piotr M.), „Tirana po godzinach" (9 miejsc · 12 kopii, Lena W.).

### 6. Częste pytania (tło `bg-card`, padding 80 px, dwie kolumny)

Lewa: nadtytuł „Częste pytania" + `h2` „Zanim zaczniesz". Prawa: cztery pozycje rozdzielone
górnymi liniami `border-border` — pytanie Fraunces 18 px, odpowiedź 15 px.

1. **Skąd biorą się miejsca?** — „Z otwartych baz danych o atrakcjach, opinii podróżników
   i tablic publikowanych przez użytkowników. Godziny otwarcia i czas zwiedzania są weryfikowane
   przed pokazaniem w feedzie."
2. **Czy agent nie wciśnie mi za dużo na jeden dzień?** — „Odwrotnie — kiedy plan przestaje być
   realny, pisze o tym wprost i proponuje, co przenieść. Możesz zadać własne ograniczenie, na
   przykład maksymalnie cztery godziny dziennie."
3. **Czy działa poza Europą?** — „Tak. Planer jest globalny, interfejs dostępny w kilku językach,
   a odległości i czasy liczone lokalnym transportem."
4. **Co z aplikacją na telefon?** — „Wersja przeglądarkowa działa na telefonie już teraz.
   Aplikacje iOS i Android, z pobieraniem map do trybu offline, są w przygotowaniu."

W prototypie odpowiedzi są rozwinięte, żeby dały się przeczytać na jednym ekranie. W implementacji
`Accordion` jest dopuszczalny, ale **domyślnie rozwinięty** — zwinięte FAQ na landingu obniża
czytanie odpowiedzi, a te są tu argumentem sprzedażowym.

### 7. Końcowe CTA (padding 96 px, wyśrodkowane)

`h2` „Dokąd jedziesz w tym roku?" (Fraunces 300, `clamp(34px, 3.6vw, 48px)`, `max-width: 18ch`,
`text-wrap: balance`), akapit „Wpisz miasto i zobacz pierwsze propozycje. Konto założysz dopiero,
kiedy będziesz chciał zapisać tablicę." i **to samo pole co w hero** (`max-width: 520px`).

### Footer

Linia górna, padding 44 px. Logotyp, nawigacja (`Jak to działa`, `GPX`, `Tablice`, `Prywatność`,
`Kontakt`), po prawej monospace „Aplikacje iOS i Android — wkrótce".

## Interactions & Behavior

- Nawigacja w headerze to **odnośniki kotwicowe** do `#jak-to-dziala`, `#przyklad`, `#gpx`,
  `#tablice`.
- Pigułki klimatu w hero: wybór pojedynczy, zawsze dokładnie jedna aktywna. Wybór ma zostać
  przekazany do kreatora wyjazdu razem z destynacją.
- Oba pola destynacji (hero i końcowe CTA) prowadzą do tego samego przepływu: utworzenie
  szkicu wyjazdu i przejście do feedu „Odkrywaj" z gotowym kontekstem. **Bez rejestracji na
  tym etapie** — konto pojawia się przy zapisie tablicy.
- Karty tablic prowadzą do widoku publicznej tablicy.
- Hover kart: ciepły cień, bez przesuwania.

**Stany do zaprojektowania przed wdrożeniem** (brak w prototypie): walidacja pustego pola
destynacji, podpowiedzi miast przy wpisywaniu (`Command` z biblioteki), stan ładowania po
kliknięciu CTA, wersja strony dla zalogowanego użytkownika (header powinien wtedy pokazywać
wejście do pulpitu, nie „Zaloguj się").

## Responsywność

Prototyp nie używa media queries — wszystkie sekcje wielokolumnowe stoją na
`repeat(auto-fit, minmax(min(100%, Npx), 1fr))` i zwijają się same:

| Sekcja | Próg minmax |
|---|---|
| hero | 430 px |
| jak to działa | 230 px |
| przykład | 380 px |
| GPX | 380 px |
| tablice | 290 px |
| FAQ | 360 px |

Nagłówki skalują się przez `clamp()`. Nawigacja headera i stopka mają `flex-wrap`.
Podgląd planu w hero: `max-width: 520px`, `justify-self: end`.

To wystarcza dla przeglądarki na telefonie. **Dedykowany layout mobilny (mniejsze paddingi,
CTA przyklejone do dołu) wymaga osobnego projektu** — tak samo jak aplikacje iOS i Android.

## State Management

Landing jest w zasadzie bezstanowy. Jedyny stan lokalny:

| Stan | Typ | Rola |
|---|---|---|
| `climate` | jedna z pięciu pigułek | klimat wyjazdu, domyślnie `'z dziećmi'` |

Reszta to treść statyczna. Do rozważenia po stronie serwera: lista publicznych tablic
(sekcja „Tablice od podróżników" — w prototypie dane stałe, docelowo najpopularniejsze
dla wykrytej lub wybranej destynacji) oraz podpowiedzi miast dla pola w hero.

## Design Tokens

| Token | Wartość | Użycie na landingu |
|---|---|---|
| `--background` | `158 8% 97%` | tło strony; tekst na sekcji GPX |
| `--card` | `0 0% 100%` | karty, sekcje „Jak to działa" i FAQ |
| `--muted` | `60 8% 94%` | stopka karty demo, pigułki przystanków |
| `--border` | `60 6% 88%` | obramowania; linie wewnętrzne przy `/.55` |
| `--foreground` / `--ink` | `60 6% 14%` | tekst podstawowy; tło sekcji GPX |
| `--text-secondary` | `48 5% 28%` | akapity |
| `--muted-foreground` | `40 5% 43%` | meta, monospace, nawigacja |
| `--primary` | `158 28% 32%` | nadtytuły, CTA, piny, aktywna pigułka |
| `--primary-light` | `96 24% 65%` | **akcenty na ciemnym tle** (sekcja GPX) |
| `--primary-foreground` | `60 12% 97%` | tekst na `primary`; na ciemnym tle `/.74`, `/.62`, `/.14`, `/.05` |
| `--dusty-blue` | `200 30% 48%` | tinty kafelków (`/.18`) |
| `--accent` | `22 60% 58%` | tinty kafelków (`/.22`), awatar (`/.55`) |
| `--warning` | — | ostrzeżenia o realizmie: tło `/.14`, obrys `/.32`, plakietka `/.45` |
| `--radius-sm` / `--radius-md` | `0.1875rem` / `0.375rem` | przyciski i pola / karty |
| `--shadow-sm` / `--shadow-lg` | — | karta CTA / podgląd planu w hero |

Skala odstępów: 2 / 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 22 / 24 / 26 / 28 / 32 / 34 /
40 / 44 / 62 / 64 / 72 / 80 / 88 / 96 px.

## Assets

Brak realnych zasobów. Przed wdrożeniem potrzebne:

- **fotografie miejsc** do kafelków tablic (obecnie tinty tokenów) — trzy zdjęcia na kartę,
- zdjęcie lub grafika wiodąca do hero, jeśli podgląd planu ma być czymś uzupełniony
  (prototyp świadomie obywa się bez zdjęcia w hero — plan jest mocniejszym argumentem),
- awatary autorów tablic — `AvatarFallback` z inicjałami jest poprawnym rozwiązaniem docelowym,
- ikony z zestawu używanego w `@routemarket/frontend`, jeśli implementacja je wprowadzi.

## Świadomie pominięte

Nie ma na landingu i było to decyzją, nie przeoczeniem:

- **cennik** — model rozliczeń nie został ustalony,
- **logotypy „zaufali nam"** i liczby typu „50 000 podróżników" — bez realnych danych to szum,
- **sekcja o zespole / historii firmy** — nie pomaga w konwersji na tym etapie,
- **wideo w hero** — podgląd planu jest szybszy do zrozumienia niż odtwarzacz,
- **ślady dawnego marketplace'u** (kup trasę, panel zarobków twórcy) — produkt jest po pełnym
  pivocie na planer, tych elementów nie przywracać.

## Files

- `prototype/Routemarket Landing.dc.html` — prototyp landingu; cała treść w klasie `Component`.
- `tokens.css` — wyciąg `:root` z tokenami design systemu.
- Design system: `@routemarket/frontend` — źródło prawdy dla kolorów, typografii i komponentów.
