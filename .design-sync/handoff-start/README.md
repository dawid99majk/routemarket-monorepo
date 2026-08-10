# Handoff: strona startowa (Start) — RouteMarket Planner

## Overview

Ekran **Start** to nowa strona domyślna aplikacji RouteMarket Planner. Zastępuje dotychczasowe
wejście prosto do feedu „Odkrywaj".

**Dlaczego nie feed:** odkrywanie atrakcji bez kontekstu wyjazdu (dokąd, kiedy, z kim) nie ma
się na czym oprzeć — feed nie wie, co pokazać. Start ustala kontekst i dopiero z niego prowadzi
do odkrywania.

Ekran odpowiada na jedno pytanie: **„co mam teraz zrobić?"**. Dla wracającego użytkownika jest
to wznowienie aktywnego wyjazdu, dla nowego — jeden panel „Dokąd tym razem?", który zastępuje
osobny kreator onboardingu.

Ten handoff obejmuje **wyłącznie ekran Start**. Pozostałe trzy widoki (Odkrywaj, Tablica, Plan)
są w tym samym pliku prototypu i zostały już przekazane osobno.

## About the Design Files

`prototype/Routemarket Planner.dc.html` to **referencja projektowa w HTML**, nie kod produkcyjny
do skopiowania. Otwiera się w przeglądarce bez budowania. Domyślnie startuje na ekranie Start.

Struktura pliku: szablon HTML (markup + style inline) oraz klasa `Component` w tagu
`<script data-dc-script>` na końcu, gdzie leżą wszystkie dane przykładowe i obsługa stanu.
Fragment ekranu Start w szablonie zaczyna się od `<sc-if value="{{ isHome }}"`, a jego dane
w logice od klucza `isHome:` w `renderVals()`.

`tokens.css` to wyciąg `:root` z `_ds_bundle.css` — pełna lista zmiennych CSS użytych w projekcie,
dla wygody podglądu. Źródłem prawdy pozostaje pakiet `@routemarket/frontend`.

## Fidelity

**High-fidelity.** Układ, proporcje, hierarchia, copy, dane i interakcje — odtwarzać wiernie.
Kolory i typografia są już przeniesione na tokeny design systemu, więc w prototypie nie ma
żadnych zahardkodowanych wartości hex — wszystko idzie przez `hsl(var(--token))`.

Wyjątek: **placeholdery zdjęć**. Kafelki i miniatury to płaskie tinty tokenów
(`hsl(var(--primary) / .16)`, `hsl(var(--dusty-blue) / .18)`, `hsl(var(--accent) / .22)`).
Docelowo w ich miejsce wchodzą realne fotografie miejsc i wyjazdów.

## Target environment

Biblioteka: **`@routemarket/frontend`** (React, Radix + Tailwind).

Zasady wiążące:

- Kolor **wyłącznie przez tokeny** (`bg-primary`, `text-muted-foreground`, `border-border`,
  `bg-muted`). Żadnych surowych klas palety Tailwinda (`bg-emerald-600`, `text-slate-500`).
- Na ciemnym tle kolorem akcji jest **`primary-light`**, nie `primary` — `primary` jest tam
  nieczytelny. Dotyczy panelu „Nowy wyjazd".
- Typografia: `font-display` = Fraunces (nagłówki, tytuły kart), `font-sans` = Inter (tekst i UI),
  `font-narrow` = Archivo Narrow (nadtytuły wersalikami, `tracking-[0.32em]`), `font-mono` =
  JetBrains Mono z `tabular-nums` (liczby, daty, godziny, dystanse).
- Zdania wielką literą tylko na początku — także w przyciskach.
- Wersaliki tylko w nadtytułach i etykietach, do 13 px.
- Bez emoji. Dozwolone znaki: `—`, `·`, `↗`, `→`.
- `rounded-md` na kartach, `rounded-full` tylko na pigułkach i awatarach.
- Separator metadanych: `·`.

Mapowanie na komponenty biblioteki:

| Element ekranu | Komponent |
|---|---|
| przyciski akcji | `Button` (`variant`: default / outline / ghost, `size`: default / sm) |
| plakietki statusu wyjazdu | `Badge` (`variant`: default dla aktywnego, outline dla reszty) |
| karty sekcji | `Card` + `CardHeader` / `CardTitle` / `CardContent` |
| pola nowego wyjazdu | `Input` (na ciemnym tle wymaga wariantu — patrz uwaga niżej) |
| komunikat agenta | `Alert` na `bg-muted` |
| awatary tablic współdzielonych | `Avatar` + `AvatarFallback` |
| pigułki klimatu | `ToggleGroup` + `ToggleGroupItem` (pojedynczy wybór) |

**Uwaga o wariantach na ciemnym tle.** W prototypie cztery elementy nie są komponentami DS,
tylko ręcznymi elementami stylowanymi tokenami: CTA „Zacznij planować →", dwa pola tekstowe
w panelu „Nowy wyjazd" oraz przyciski karty eksportu w widoku Plan. Powód: `Button` i `Input`
nie mają w bibliotece wariantu na ciemne tło, a nadpisywanie klas w prototypie nie działa.
**W implementacji lepiej dodać do biblioteki wariant „on-dark" niż powielać ręczne style.**

## Screen / View

Layout: górny pasek (sticky, 64 px, tło `background/.88` z `backdrop-filter: blur(8px)`,
dolna linia `border-border`), pod nim kontener `max-width: 1280px`, padding `40px` po bokach,
`96px` na dole. Pasek zawiera logotyp „Routemarket" + plakietkę „Planner", cztery zakładki
(**Start** / Odkrywaj / Tablica / Plan), kontekst wyjazdu `Durrës · 3 dni · z dziećmi`
i awatar użytkownika.

### Nagłówek ekranu

Rząd z wyrównaniem do linii bazowej: `h1` „Dzień dobry, Marcin" (Fraunces, 34 px, waga 300,
`letter-spacing: -0.02em`) po lewej, po prawej odliczanie monospace 12 px w kolorze
`muted-foreground`: „Do wyjazdu do Durrës · 33 dni".

### 1. Aktywny wyjazd (lewa kolumna, siatka `1fr 400px`, gap 20 px)

Karta `bg-card`, `border-border`, `rounded-md`, padding 28 px, `display: flex; flex-direction: column`.

Od góry:

1. **Status** — kropka 7 px w kolorze `primary` + nadtytuł wersalikami „Trwa planowanie".
2. **Tytuł** — „Durrës z dziećmi" (Fraunces, 30 px, waga 400).
3. **Meta** monospace 12 px: „Albania · 12–14 września · 3 popołudnia · współdzielone z Anią".
4. **Trzy liczniki** w siatce `repeat(3, 1fr)`, ograniczone liniami góra/dół, kolumny rozdzielone
   pionową linią: *Na pewno* `9`, *Być może* `3`, *Dni ułożone* `3 z 3`. Etykiety wersalikami
   10 px, wartości monospace 22 px. Pierwsze dwie liczby są **wyliczane z kubełków**, nie stałe.
5. **Pasek miniatur** — do 6 zapisanych miejsc, `flex: 1` każda, wysokość 56 px, `rounded-sm`.
6. **Komunikat agenta** — `Alert` na `bg-muted`: owalna plakietka „Agent" + tekst „Plan na trzy
   popołudnia jest gotowy. Dzień 2 ma dwa przejazdy autem — jeśli chcecie spokojniej, zamienię
   park Adriatik na promenadę."
7. **Akcje** (dosunięte do dołu przez `margin-top: auto`): „Otwórz plan ↗" (default),
   „Dodaj więcej miejsc" (outline), „Tablica" (ghost).

Ta karta obsługuje większość powrotów do aplikacji — ma być największym elementem ekranu.

### 2. Nowy wyjazd (prawa kolumna)

Karta na ciemnym tle `ink`, `rounded-md`, padding 28 px, kolumna flex.

- Nadtytuł wersalikami „Nowy wyjazd" w kolorze `primary-light`.
- `h2` „Dokąd tym razem?" (Fraunces, 26 px, waga 300, kolor `background`).
- Dwa pola: „Miasto lub region" i „Termin — np. 12–14 września". Tło
  `primary-foreground/.07`, obramowanie `primary-foreground/.2`, tekst `background`.
- Etykieta „Klimat wyjazdu" (wersaliki, `primary-foreground/.62`).
- **Pigułki klimatu**, wybór pojedynczy: `Z dziećmi`, `We dwoje`, `Delegacja`, `Ze znajomymi`,
  `Solo`. Domyślnie zaznaczone „Z dziećmi". Aktywna: tło `primary-light`, tekst `ink`.
  Nieaktywna: obrys `primary-foreground/.2`, tekst `primary-foreground/.78`.
- **CTA** pełnej szerokości: „Zacznij planować →" na `primary-light` z tekstem `ink`.
- Pod spodem 12 px, kolor `primary-foreground/.74`: „Agent zaproponuje pierwsze miejsca na
  podstawie klimatu i długości pobytu."

To jedyna droga do feedu dla nowego użytkownika — dzięki temu „Odkrywaj" nigdy nie startuje
bez kontekstu.

### 3. Wymaga decyzji (pełna szerokość)

Karta `bg-card` z nagłówkiem i siatką `repeat(3, 1fr)`.

- **Nagłówek**: „Wymaga decyzji" (Fraunces 18 px) + podtytuł „Miejsca w »być może« blokują
  agentowi ułożenie ostatecznej trasy.", po prawej przycisk tekstowy „Cała tablica ↗".
- **Komórka** (padding 20/24 px, pionowa linia rozdzielająca): kafelek 52 px, nazwa (Fraunces
  16 px), meta monospace `czas · dojazd`, pod spodem **zdanie agenta specyficzne dla miejsca**
  (np. „Za długie na popołudnie po 3–4 godziny. Zostawiam w »być może« na wypadek zmiany
  planów."), na końcu dwa przyciski: „Na pewno" i „Nie tym razem".
- **Stan pusty**: jedna komórka na całą szerokość, tekst wyśrodkowany — „Wszystko rozstrzygnięte.
  Agent ma komplet danych do ułożenia planu."

To najważniejszy widget produktowy tego ekranu: zamienia pasywny pulpit w listę zadań i realnie
odblokowuje agentowi ułożenie trasy. Pokazywane są maksymalnie **3** pozycje z kubełka „być może".

### 4. Twoje wyjazdy / Tablice od podróżników (dwie kolumny `1fr 1fr`, gap 20 px)

**Twoje wyjazdy** — nagłówek 18 px + licznik monospace. Wiersze: kafelek 48 px, nazwa (Fraunces
16 px), meta monospace, po prawej `Badge` ze statusem. Aktywny wyjazd ma obramowanie
`primary/.34` i `Badge variant="default"`; pozostałe `outline`.

Dane w prototypie:

| Wyjazd | Meta | Status |
|---|---|---|
| Durrës z dziećmi | 12–14 września 2026 · 9 miejsc · plan gotowy | Aktywny |
| Kotor w cztery dni | maj 2026 · 14 miejsc · GPX pobrany | Zakończony |
| Praga | bez terminu · 3 miejsca | Szkic |

**Tablice od podróżników** — nagłówek 18 px + kontekst „Albania". Wiersze: awatar 40 px
z inicjałami, tytuł, meta `autor · liczba miejsc · liczba kopii`, po prawej `Button variant="outline"
size="sm"` „Skopiuj".

Dane w prototypie: „Durrës z 5-latkiem" (Anna K. · 11 miejsc · 4 kopie), „Riwiera albańska
w sześć dni" (Piotr M. · 23 miejsca · 31 kopii), „Tirana po godzinach" (Lena W. · 9 miejsc ·
12 kopii).

Obie sekcje są świadomie na dole — to kontekst i inspiracja, nie główne zadanie.

## Interactions & Behavior

- **Start jest ekranem domyślnym** po zalogowaniu (`screen: 'home'`).
- Kliknięcie zakładki w pasku przełącza widok; stan pozostałych ekranów (filtr, zapytanie,
  wybrany dzień) jest zachowywany.
- „Otwórz plan ↗" → Plan. „Dodaj więcej miejsc" i „Zacznij planować →" → Odkrywaj.
  „Tablica" i „Cała tablica ↗" → Tablica.
- Nazwa miejsca w „Wymaga decyzji" otwiera szczegóły miejsca.
- Przyciski „Na pewno" / „Nie tym razem" zmieniają kubełek **natychmiast**, bez potwierdzenia.
  Pozycja znika z sekcji, a liczniki w karcie aktywnego wyjazdu aktualizują się w tym samym
  renderze.
- Pigułki klimatu: wybór pojedynczy, zawsze dokładnie jedna aktywna.

**Stany do zaprojektowania przed wdrożeniem** (brak w prototypie):

- **Nowy użytkownik, zero wyjazdów** — karta aktywnego wyjazdu i obie dolne sekcje znikają,
  panel „Dokąd tym razem?" rozciąga się na pełną szerokość. To cały onboarding.
- Ładowanie (`Skeleton` w miejscach kart), błąd pobrania danych.
- Wyjazd bez planu („Dni ułożone: 0 z 3" + CTA „Ułóż plan" zamiast „Otwórz plan").
- Więcej niż 3 pozycje w „Wymaga decyzji" — potrzebne „Pokaż wszystkie".

**Responsywność:** prototyp zakłada ≥1280 px. Poniżej: siatka `1fr 400px` schodzi do jednej
kolumny (panel „Nowy wyjazd" pod kartą aktywnego wyjazdu), „Wymaga decyzji" do 2 i 1 kolumny,
dolne sekcje jedna pod drugą. Wersja mobilna wymaga osobnego projektu — planowane są aplikacje
iOS i Android.

## State Management

Stan potrzebny dla tego ekranu:

| Stan | Typ | Rola |
|---|---|---|
| `screen` | `'home' \| 'discover' \| 'detail' \| 'board' \| 'plan'` | aktywny widok, domyślnie `'home'` |
| `climate` | jedna z pięciu pigułek | klimat nowego wyjazdu, domyślnie `'Z dziećmi'` |
| `marks` | `Record<placeId, 'yes' \| 'maybe' \| 'no' \| null>` | źródło liczników i sekcji „Wymaga decyzji" |

Wartości wyliczane (nie trzymać w stanie): liczba „na pewno", liczba „być może", miniatury
zapisanych miejsc, lista nierozstrzygniętych.

Potrzeby po stronie serwera:

- lista wyjazdów użytkownika ze statusem i podsumowaniem (liczba miejsc, czy plan gotowy),
- aktywny wyjazd z kubełkami i bieżącym komunikatem agenta,
- utworzenie wyjazdu: destynacja + termin + klimat → zwraca id i pierwsze propozycje miejsc,
- publiczne tablice dla destynacji + akcja skopiowania tablicy do własnych wyjazdów.

## Design Tokens

Prototyp używa już wyłącznie tokenów — poniżej te, na których stoi ten ekran.

| Token | Wartość | Użycie na ekranie Start |
|---|---|---|
| `--background` | `158 8% 97%` | tło strony, tekst na ciemnym panelu |
| `--card` | `0 0% 100%` | karty |
| `--muted` | `60 8% 94%` | tło komunikatu agenta |
| `--border` | `60 6% 88%` | obramowania; linie wewnętrzne przy `/.55` |
| `--foreground` / `--ink` | `60 6% 14%` | tekst podstawowy, tło panelu „Nowy wyjazd" |
| `--text-secondary` | `48 5% 28%` | akapity |
| `--muted-foreground` | `40 5% 43%` | meta, etykiety, tekst drugorzędny |
| `--primary` | `158 28% 32%` | akcje główne, kropka statusu, obrys aktywnego wyjazdu (`/.34`) |
| `--primary-light` | `96 24% 65%` | **akcje na ciemnym tle** — CTA i pigułki klimatu |
| `--primary-foreground` | `60 12% 97%` | tekst na `primary`; na ciemnym tle przy `/.74`, `/.62`, `/.2`, `/.07` |
| `--dusty-blue` | `200 30% 48%` | kubełek „być może" |
| `--accent` | `22 60% 58%` | akcenty, awatary (przy `/.55`) |
| `--radius-sm` | `0.1875rem` | przyciski i pola |
| `--radius-md` | `0.375rem` | karty |
| `--shadow-md` | — | hover kart |

Skala odstępów: 3 / 4 / 6 / 10 / 14 / 16 / 20 / 22 / 24 / 28 / 40 / 96 px.
Skala rozmiarów tekstu: 10, 11, 12, 13, 14, 16, 18, 22, 26, 30, 34 px.

## Assets

Brak realnych zasobów. Wszystkie kafelki i miniatury to tinty tokenów. Przed wdrożeniem potrzebne:

- zdjęcia miejsc (miniatury w karcie aktywnego wyjazdu, kafelki w „Wymaga decyzji"),
- zdjęcia lub obrazy wiodące wyjazdów (lista „Twoje wyjazdy"),
- awatary użytkowników — w prototypie kolorowe koła z inicjałami, `AvatarFallback` jest
  poprawnym rozwiązaniem docelowym,
- ikony z zestawu używanego w `@routemarket/frontend`.

## Files

- `prototype/Routemarket Planner.dc.html` — prototyp; ekran Start w szablonie pod
  `<sc-if value="{{ isHome }}">`, dane i logika w klasie `Component`.
- `tokens.css` — wyciąg `:root` z tokenami design systemu.
- Design system: `@routemarket/frontend` — źródło prawdy dla kolorów, typografii i komponentów.
