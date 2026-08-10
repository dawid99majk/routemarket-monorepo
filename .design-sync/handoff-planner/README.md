# Handoff: RouteMarket Planner — odkrywanie, tablica, plan dnia

## Overview

RouteMarket przestaje być marketplace'em tras, a staje się **planerem wyjazdów**. Użytkownik
przegląda atrakcje w feedzie, kwalifikuje je do jednego z trzech kubełków („na pewno" /
„być może" / „nie"), a agent AI układa z zapisanych miejsc plan na kolejne dni i eksportuje
go jako plik GPX do zegarka lub nawigacji.

Prototyp obejmuje cztery widoki desktopowe zbudowane na realnym przypadku użycia:
**Durrës (Albania), 3 dni, wyjazd z dziećmi, po 3–4 godziny popołudniami.**

Docelowo produkt ma być globalny, wielojęzyczny, a po webie ma powstać aplikacja iOS
i Android. Ten handoff dotyczy wyłącznie wersji desktop web.

## About the Design Files

Plik w `prototype/` to **referencja projektowa napisana w HTML** — pokazuje docelowy wygląd
i zachowanie, ale **nie jest kodem produkcyjnym do skopiowania**. Zadaniem dewelopera jest
odtworzyć te widoki w docelowym środowisku aplikacji (React + biblioteka `@routemarket/frontend`,
patrz niżej), korzystając z istniejących wzorców kodu, routingu i warstwy danych.

`Routemarket Planner.dc.html` otwiera się w przeglądarce bez budowania. Struktura pliku:
szablon HTML (markup + style inline) oraz klasa logiki JS w tagu `<script data-dc-script>`,
w której znajdują się **wszystkie dane przykładowe** (`PLACES`, `DAYS`, `FILTERS`) i cała
obsługa stanu. To najlepsze źródło do odczytania treści i zachowań.

## Fidelity

**High-fidelity co do układu, low-fidelity co do palety.**

- Układ, siatki, proporcje, hierarchia typograficzna, copy, dane i interakcje — finalne,
  odtwarzać wiernie.
- Kolory i konkretne wartości w stylach inline — **NIE odtwarzać dosłownie.** Prototyp
  powstał zanim do projektu podpięto design system RouteMarket. Kolor i typografia mają
  pochodzić wyłącznie z tokenów systemu (tabela mapowania w sekcji *Design Tokens*).
- Zdjęcia to szare/kolorowe placeholdery z siatką. Docelowo realne fotografie miejsc.

## Target environment

Biblioteka: **`@routemarket/frontend`** (React, Radix + Tailwind, 244 komponenty).

Zasady wiążące:

- Kolor **wyłącznie przez tokeny**: `bg-primary`, `text-muted-foreground`, `border-border`,
  `bg-muted`, `text-accent`, `bg-warning/15`. Żadnych surowych klas palety Tailwinda
  (`bg-emerald-600`, `text-slate-500` itd.).
- Typografia: `font-display` = Fraunces (nagłówki, tytuły kart), `font-sans` = Inter
  (tekst i UI), `font-narrow` = Archivo Narrow (nadtytuły wersalikami, `tracking-[0.32em]`),
  `font-mono` = JetBrains Mono z cyframi tabelarycznymi (godziny, dystanse, współrzędne).
- Zdania wielką literą tylko na początku — także w przyciskach i pozycjach menu.
- Wersaliki tylko w nadtytułach i etykietach, do 13 px, `tracking` min. `0.12em`.
- Bez emoji. Dozwolone znaki typograficzne: `—`, `·`, `↗`.
- `rounded-md` na kartach, `rounded-full` tylko na pigułkach. Cienie ciepłe
  (`shadow-token-xs` … `shadow-token-xl`), bez gradientów.
- Separator metadanych: `·` — np. `Durrës · 1 g 30 min · 09:00–17:00`.

Mapowanie prototypu na komponenty biblioteki:

| Element prototypu | Komponent |
|---|---|
| karta miejsca w feedzie | `Card` + `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter` |
| pigułki filtrów | `ToggleGroup` + `ToggleGroupItem` |
| przyciski kubełków | `ToggleGroup` (single, deselectable) lub trzy `Button` z `variant` |
| pole wyszukiwania | `Input` (rozważ `Command` przy podpowiedziach) |
| zakładki dni w planie | `Tabs` + `TabsList` + `TabsTrigger` + `TabsContent` |
| ostrzeżenie agenta o realizmie | `Alert` z tokenem `warning` |
| podpowiedź agenta w feedzie / na szczegółach | `Alert` (wariant informacyjny) lub `Card` na `bg-muted` |
| plakietki „dla dzieci", „cień", „widok" | `Badge variant="secondary"` |
| awatary współdzielenia tablicy | `Avatar` + `AvatarFallback` |
| nawigacja główna | `Tabs` lub `NavigationMenu` |

## Screens / Views

Aplikacja to jeden layout z górnym paskiem (sticky, wysokość 64 px, tło półprzezroczyste
z `backdrop-filter: blur(8px)`, dolna linia `border-border`) i czterema widokami przełączanymi
stanem `screen`. Pasek zawiera: logotyp „Routemarket" + plakietka „Planner", trzy zakładki
(Odkrywaj / Tablica / Plan), po prawej kontekst wyjazdu `Durrës · 3 dni · z dziećmi`
i awatar użytkownika.

Kontener treści: `max-width: 1280px`, wyśrodkowany, padding `40px` po bokach, `96px` na dole.

---

### 1. Odkrywaj (`screen: 'discover'`)

**Cel:** przeglądanie atrakcji i szybkie kwalifikowanie ich do kubełków bez wchodzenia
w szczegóły.

**Układ, od góry:**

1. **Nagłówek dwukolumnowy.** Lewa kolumna (max 560 px): nadtytuł wersalikami
   „Wyjazd · Durrës, Albania · 12–14 września", `h1` „Atrakcje na trzy popołudnia"
   (Fraunces, 40 px, waga 300, `line-height: 1.1`, `letter-spacing: -0.02em`), akapit
   wprowadzający 15 px. Prawa kolumna wyrównana do prawej: licznik monospace
   „9 zapisanych · 3 do rozważenia" oraz przycisk główny „Zbuduj plan z tablicy ↗".
2. **Pasek wyszukiwania.** Karta `rounded-md` na `bg-card`, w środku: ikona lupy, `input`
   z placeholderem „Szukaj: plaża, ruiny, deszczowy dzień…", pionowy separator, rząd
   pięciu pigułek filtrów: `Wszystko`, `Z dziećmi`, `Do 1 godziny`, `Pieszo od bazy`,
   `Na deszcz`. Aktywna pigułka: tło `primary`, tekst `primary-foreground`.
3. **Pasek agenta.** Poziomy `Alert` na `bg-muted`: plakietka „Agent" w owalu + tekst
   „Przy 3–4 godzinach dziennie zmieścicie realnie 9 z 12 zapisanych miejsc. Przylądek
   Rodonit wymaga osobnego dnia — zostawiłem go w »być może«."
4. **Feed mozaikowy.** `columns: 4; column-gap: 20px`, karty `break-inside: avoid`,
   odstęp pionowy 20 px. Karty mają różne wysokości zdjęć (160–260 px) — to celowe,
   daje rytm feedu w stylu Pinteresta. Przy węższych oknach: 3 i 2 kolumny.

**Karta miejsca** (`Card`, `rounded-md`, `border-border`, tło `card`):

- **Zdjęcie** — wysokość z danych miejsca, w prototypie placeholder z siatką 22 px.
  Nakładki: w lewym dolnym rogu kategoria wersalikami (`Zabytek`, `Plaża`, `Muzeum`,
  `Spacer`, `Wycieczka`, `Atrakcja`, `Jedzenie`), w prawym górnym pigułka na półprzezroczystym
  tle z jedną cechą (`Dla dzieci`, `Płytko`, `Widok`, `Klimatyzacja`, `Bezpłatne`,
  `Wózek OK`, `Cały dzień`, `Piasek`, `Kolacja`).
- **Treść** (padding 14 px) — tytuł Fraunces 16 px waga 500, opis 13 px
  `text-muted-foreground` z `text-wrap: pretty`, poniżej rząd danych monospace 11 px:
  **czas zwiedzania** i **godziny otwarcia** (dokładnie te dwa pola, zgodnie z decyzją
  produktową; oceny i ceny świadomie pominięte).
- **Stopka** — trzy przyciski w równym podziale, oddzielone cienkimi liniami:
  „Na pewno" (aktywny: `primary`), „Może" (aktywny: `dusty-blue`), „Nie" (aktywny:
  wyciszony `muted`). Nieaktywne: przezroczyste tło, tekst `muted-foreground`.
  Ponowne kliknięcie aktywnego kubełka **usuwa** oznaczenie.
- **Hover karty:** `translateY(-1px)`, ciemniejsze obramowanie, ciepły cień
  (`shadow-token-md`), przejście 200 ms.
- Kliknięcie w kartę (poza przyciskami) otwiera szczegóły. Przyciski kubełków muszą
  wołać `stopPropagation`.

**Filtry — logika:**

- `Z dziećmi` — cecha miejsca ∈ {Dla dzieci, Płytko, Piasek, Wózek OK}
- `Do 1 godziny` — czas zwiedzania ≤ 1 g
- `Pieszo od bazy` — dojazd opisany jako „pieszo" lub „przy bazie"
- `Na deszcz` — kategoria ∈ {Muzeum, Atrakcja}

Wyszukiwarka filtruje po nazwie, kategorii i opisie (bez uwzględniania wielkości liter).
Filtr i wyszukiwarka działają łącznie (AND).

---

### 2. Szczegóły miejsca (`screen: 'detail'`)

**Cel:** decyzja o dodaniu miejsca — pełny opis, dane praktyczne, opinie innych rodziców.

**Układ:** `max-width: 1160px`, siatka `1fr 380px`, odstęp 40 px, kolumny wyrównane do góry.
Nad siatką przycisk tekstowy „← Wróć do odkrywania".

**Kolumna główna:**

- Zdjęcie wiodące 380 px wysokości, `rounded-md`; pod nim trzy miniatury w siatce 3×1,
  po 96 px wysokości, odstęp 12 px.
- Nadtytuł wersalikami: kategoria · miasto · dojazd (np. `ZABYTEK · DURRËS · 8 MIN PIESZO`).
- `h1` Fraunces 42 px waga 300, `letter-spacing: -0.02em`.
- Akapit opisu 17 px, `line-height: 1.6`, `max-width: 60ch`.
- **Pasek trzech danych** w siatce 3×1, ograniczony liniami góra/dół, kolumny rozdzielone
  cienkimi liniami: *Czas zwiedzania*, *Godziny otwarcia*, *Od bazy*. Etykiety wersalikami
  10 px, wartości monospace 19 px.
- **„Co mówią rodzice"** — nagłówek Fraunces 22 px, pod nim lista opinii jako karty:
  awatar 28 px, imię z kontekstem (np. „Marta, z 6-latkiem"), data monospace,
  treść 14 px `line-height: 1.6`. Opinie mają być konkretne i praktyczne (godziny, płatność
  gotówką, dostępność wózka) — nie ogólne pochwały.

**Kolumna boczna** (sticky, `top: 88px`, trzy karty, odstęp 20 px):

1. **„Do tablicy · Durrës"** — trzy przyciski pełnej szerokości jeden pod drugim:
   „Na pewno", „Być może", „Nie tym razem". Ten sam model zaznaczania co w feedzie.
2. **„Agent radzi"** — karta na `bg-muted`, jedno zdanie doradcze specyficzne dla miejsca
   (np. „Zaplanuj tu drugą część popołudnia — po 15:00 trybuny są w cieniu, a kolejka
   znika."), pod spodem współrzędne monospace.
3. **„W okolicy · 10 min pieszo"** — trzy pozycje: miniatura 44 px, nazwa, meta monospace
   (czas zwiedzania · dojazd). Kliknięcie podmienia otwarte miejsce bez zmiany widoku.

---

### 3. Tablica (`screen: 'board'`)

**Cel:** przegląd i porządkowanie wszystkich decyzji przed wygenerowaniem planu.

**Model:** jedna tablica na wyjazd, trzy kubełki. Miejsca odrzucone **nie znikają** —
zostają w kolumnie „Nie", żeby dało się je przywrócić.

**Układ:**

- Nagłówek: nadtytuł „Tablica wyjazdu", `h1` Fraunces 38 px „Durrës z dziećmi".
  Po prawej stos awatarów (dwa, nachodzące na siebie o 8 px, z obwódką w kolorze tła)
  + podpis „Współdzielona z Anią" oraz przycisk główny „Ułóż plan na 3 dni ↗".
- Trzy kolumny w siatce `repeat(3, 1fr)`, odstęp 20 px, wyrównane do góry.
  Kolumna „Nie" ma tło o pół tonu ciemniejsze.
- Nagłówek kolumny: kropka statusu 8 px + etykieta wersalikami + licznik monospace,
  pod nim cienka linia. Kropki: „Na pewno" — `primary`, „Być może" — `dusty-blue`,
  „Nie" — neutralna szarość.
- Pozycja na tablicy: kafelek 52 px po lewej, nazwa 14 px waga 500, meta monospace
  (czas · godziny), pod spodem trzy mini-pigułki do przeniesienia między kubełkami.
- Pusta kolumna: wyśrodkowany tekst wyjaśniający, np. „Odrzucone zostają tu — bez usuwania."

**Docelowo (poza prototypem):** przeciąganie kart między kolumnami, notatki przy pozycji,
oznaczenie kto z współdzielących dodał dane miejsce.

---

### 4. Plan (`screen: 'plan'`)

**Cel:** zobaczyć gotowy plan dnia, ocenić jego realizm, wyeksportować GPX.

**Układ:**

- Nagłówek: nadtytuł „Plan wygenerowany · z 9 zapisanych miejsc", `h1` Fraunces 38 px
  „Trzy popołudnia w Durrës", podtytuł „Start po 14:00, po 3–4 godziny, przerwa na lody
  w środku każdego dnia." Po prawej dwa przyciski: „Przelicz plan" (wariant `outline`)
  i „Pobierz GPX ↓" (wariant główny).
- **Zakładki dni** — trzy równe karty w rzędzie, każda z datą wersalikami i tytułem dnia:
  `12 września / Stare miasto`, `13 września / Woda i piasek`,
  `14 września / Ostatnie popołudnie`. Aktywna: ciemne obramowanie, jasne tło.
- **Siatka `1fr 520px`**, odstęp 28 px.

**Kolumna lewa — oś czasu:**

- **Ostrzeżenie o realizmie** (`Alert`, token `warning`): plakietka „Realizm" + zdanie
  specyficzne dla dnia. Przykłady z prototypu:
  - Dzień 1: „Trzy punkty na 3,5 godziny. Zmieściłby się czwarty, ale amfiteatr i mury
    to dużo schodów jak na jedno popołudnie."
  - Dzień 2: „Dzień z dwoma przejazdami autem. Golem i park dzieli 6 minut, więc kolejność
    ma znaczenie."
  - Dzień 3: „Muzeum zamyka o 16:00 — to jedyny punkt dnia z twardym limitem. Reszta jest
    elastyczna."
- **Lista przystanków** — jedna karta z wierszami w siatce `84px 1fr`, rozdzielonymi
  liniami. Lewa kolumna: godzina monospace 14 px i długość pobytu 11 px. Prawa: numerowany
  znacznik 26 px w kolorze `primary`, nazwa Fraunces 17 px, uzasadnienie wyboru 14 px
  (dlaczego akurat tu i o tej porze), pigułki cech.
- **Stopka karty** na `bg-muted`: „Razem" + podsumowanie monospace
  (np. „3 g 25 min · powrót 18:05").

**Kolumna prawa** (sticky, `top: 88px`):

- **Mapa** 480 px wysokości, `rounded-md`. W prototypie schematyczna: siatka
  współrzędnych, plama morza, numerowane piny odpowiadające przystankom (pozycje jako
  procenty). W implementacji: prawdziwa mapa (np. MapLibre / Mapbox) z pinami i śladem
  pieszym. Nakładki: w lewym dolnym rogu panel „Trasa pieszo" z dystansem i przewyższeniem
  (np. „3,8 km · +46 m"), w prawym górnym współrzędne monospace. Panele mają półprzezroczyste
  tło z `backdrop-filter: blur(12px)`.
- **Karta eksportu** na ciemnym tle (`ink`): nadtytuł „Eksport", zdanie „Plik GPX z 4
  punktami i śladem pieszym. Wgraj na zegarek albo otwórz w nawigacji Routemarket.",
  dwa przyciski: „Pobierz GPX" (jasny, wypełniony) i „Otwórz nawigację" (obrys).
  **Na ciemnym tle kolor akcji to `primary-light`, nie `primary`.**

## Interactions & Behavior

- **Nawigacja:** trzy zakładki w pasku górnym. Widok szczegółów jest podstanem „Odkrywaj" —
  zakładka „Odkrywaj" pozostaje aktywna, a powrót wraca do feedu z zachowanym filtrem
  i zapytaniem.
- **Kubełkowanie:** kliknięcie oznacza, ponowne kliknięcie tego samego kubełka usuwa
  oznaczenie, kliknięcie innego przenosi. Zmiana jest natychmiast widoczna na tablicy
  i w licznikach w nagłówku feedu. Bez potwierdzeń, bez modali.
- **Wyszukiwanie:** filtrowanie na bieżąco przy wpisywaniu, bez przycisku „Szukaj".
- **Hover kart:** uniesienie o 1 px + ciepły cień, 200 ms.
- **Stany do zaprojektowania przed wdrożeniem** (brak w prototypie): ładowanie feedu
  (`Skeleton`), pusty wynik wyszukiwania, generowanie planu przez agenta (progres),
  błąd eksportu GPX, tablica bez żadnych zapisanych miejsc.
- **Responsywność:** prototyp zakłada ≥1280 px. Feed schodzi do 3 i 2 kolumn, kolumna
  boczna szczegółów i mapa planu chowają się pod treść główną. Wersja mobilna wymaga
  osobnego projektu (planowane aplikacje iOS i Android).

## State Management

Minimalny model stanu w prototypie:

| Stan | Typ | Rola |
|---|---|---|
| `screen` | `'discover' \| 'detail' \| 'board' \| 'plan'` | aktywny widok |
| `openId` | `string` | id miejsca otwartego w szczegółach |
| `query` | `string` | treść wyszukiwarki |
| `filter` | jedna z pięciu pigułek | aktywny filtr feedu |
| `day` | `0 \| 1 \| 2` | wybrany dzień w planie |
| `marks` | `Record<placeId, 'yes' \| 'maybe' \| 'no' \| null>` | przypisanie do kubełków |

Docelowe potrzeby danych po stronie serwera:

- lista miejsc dla destynacji (wyszukiwanie + filtry po stronie API przy globalnej skali),
- tablica wyjazdu jako zasób współdzielony (kilku użytkowników, aktualizacje na żywo),
- endpoint agenta: wejście = zapisane miejsca + długość wyjazdu + okno godzinowe + klimat
  (z dziećmi / romantycznie / delegacja / we dwoje); wyjście = dni z uporządkowanymi
  przystankami, godzinami, czasami dojazdu, uzasadnieniami i ostrzeżeniem o realizmie,
- generowanie GPX: punkty trasy + ślad pieszy, plik do pobrania.

## Design Tokens

**Prototyp NIE używa tokenów systemu.** Poniżej mapowanie kolorów użytych w pliku HTML
na docelowe tokeny — implementacja ma używać wyłącznie prawej kolumny.

| Hex w prototypie | Zastosowanie | Token docelowy |
|---|---|---|
| `#F4F1EA` | tło aplikacji | `bg-background` |
| `#FBF9F4` | tło kart | `bg-card` |
| `#F0EDE5` / `#F6F3EC` | tła zapadnięte, kolumna „Nie", stopki | `bg-muted` |
| `#E4DFD3` | obramowania i linie | `border-border` |
| `#2B2B28` | tekst podstawowy, ciemna karta eksportu | `text-foreground` / `bg-ink` |
| `#55554E` / `#6E6E66` / `#8C8C82` | tekst drugorzędny (trzy stopnie) | `text-muted-foreground` |
| `#7A8B6F` | akcje główne, kubełek „na pewno", piny | `primary` (szałwia `#3B6655`) |
| `#6B8A9A` | kubełek „być może" | `dusty-blue` |
| `#EEF1EA` / `#DCE3D6` | tło i obrys podpowiedzi agenta | `bg-muted` / `border-border` |
| `#F7EFE4` / `#E8DAC5` | ostrzeżenie o realizmie | `bg-warning/15` + `border-warning/30` |
| `#D4B896` | akcenty, awatary | `accent` (tan `#D4925A`) |

Skala odstępów: 4 / 6 / 8 / 10 / 12 / 14 / 16 / 20 / 24 / 28 / 32 / 40 / 96 px.

Typografia (prototyp → docelowo):

| Rola | W prototypie | Docelowo |
|---|---|---|
| nagłówki, tytuły kart | Archivo 300–500 | `font-display` (Fraunces) |
| tekst i UI | Inter Tight | `font-sans` (Inter) |
| nadtytuły, etykiety wersalikami | Archivo Narrow, `tracking .14em`, 10–11 px | `font-narrow`, `tracking-[0.32em]` |
| dane techniczne | JetBrains Mono, `tabular-nums` | `font-mono`, `tabular-nums` |

Skala rozmiarów: 10, 11, 12, 13, 14, 15, 16, 17, 19, 22, 38, 40, 42 px.

Zaokrąglenia: 3 px (przyciski), 4–6 px (karty i panele) → `rounded-md`; pigułki i awatary
→ `rounded-full`.

Cienie: tylko hover karty — ciepły, dwuwarstwowy
(`0 1px 2px rgba(60,52,38,.08), 0 8px 24px rgba(60,52,38,.07)`) → `shadow-token-md`.
Bez cieni niebieskawych, bez gradientów.

## Assets

Brak realnych zasobów graficznych. Wszystkie zdjęcia i miniatury to kolorowe placeholdery
z delikatną siatką. Przed wdrożeniem potrzebne są:

- fotografie miejsc (feed, szczegóły, miniatury) — źródło do ustalenia,
- kafelki mapy dla widoku planu,
- ikony z zestawu używanego w `@routemarket/frontend` (w prototypie znak `⌕` jako
  zastępnik lupy).

## Files

- `prototype/Routemarket Planner.dc.html` — kompletny prototyp czterech widoków.
  Dane przykładowe (12 miejsc, 3 dni planu) i cała logika stanu znajdują się w klasie
  `Component` w tagu `<script data-dc-script>` na końcu pliku.
- Design system: projekt `Routemarket Design System` (`@routemarket/frontend`) —
  źródło prawdy dla kolorów, typografii i komponentów.

## Zakres nieujęty w prototypie

Do zaprojektowania w kolejnych iteracjach: wersja mobilna i aplikacje iOS/Android,
czat z agentem („zmień dzień 2 na spokojniejszy"), ekran nawigacji w terenie,
wielojęzyczność, onboarding i profil z listą wyjazdów.
