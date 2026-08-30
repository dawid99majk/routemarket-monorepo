# Zadania wdrożeniowe — kierunek „Wyprawa”

Kolejność ma znaczenie. Z0 i Z1 idą w jednym wdrożeniu — między nimi aplikacja jest
w stanie widocznie niespójnym. Z2 wzwyż można rozdzielić na osobne commity.

Ścieżki są względem `apps/frontend/src/`.

---

## Z0 · Tokeny

**Pliki:** `index.css`

Wkleić blok z `docs/redesign-wyprawa/tokens.css` do `:root`, pod istniejące zmienne.
Wartości powtórzone nadpisują wcześniejsze — nie usuwać starych, żeby diff pokazywał,
co dokładnie się zmieniło.

Nie ruszać: `--primary`, `--sage`, `--forest`, `--forest-deep`, `--moss`,
`--dusty-blue`, `--radius*`, `--destructive`, `--success`, `--warning`, `--danger`.

**Odbiór:** cała aplikacja ma piaskowe tło, karty są kremowe, tekst orzechowy.
Nic się nie psuje funkcjonalnie.

---

## Z1 · Czyszczenie surowych klas Tailwinda

**Pliki:** całe `src/`, poza `components/ui/`

Na prawie białym tle `bg-white` i `bg-slate-50` były niewidoczne. Na piaskowym
papierze rzucają się w oczy natychmiast. To dopełnienie czyszczenia, które w projekcie
zostało już raz przeprowadzone (458 wystąpień) — te, które zostały, teraz widać.

```
grep -rnE "bg-(white|slate|gray|zinc|stone|neutral|emerald|amber|rose|orange)-?[0-9]*|text-(slate|gray|zinc|emerald|amber|rose)-[0-9]+|border-(slate|gray|zinc)-[0-9]+" src --include=*.tsx --include=*.ts
```

Mapowanie w `kierunek.md`, sekcja „Fidelity”. Najczęstsze:

| Znalezione | Podmiana |
|---|---|
| `bg-white` | `bg-card` |
| `bg-slate-50`, `bg-gray-50` | `bg-muted` |
| `text-slate-500`, `text-gray-500` | `text-muted-foreground` |
| `text-slate-800`, `text-gray-900` | `text-foreground` |
| `border-slate-200` | `border-border` |
| `bg-emerald-600` | `bg-primary` — **tylko jeśli to stan „na pewno”**, inaczej `bg-foreground` |
| `bg-amber-100` | `bg-warning/15` |
| `text-rose-500` | `text-accent` |

Uwaga przy `bg-emerald-*`: większość wystąpień to przyciski akcji, które mają się
stać orzechowe (`bg-foreground text-background`), a nie zielone. Sprawdzać każde
z osobna, nie zamieniać hurtem.

**Odbiór:** grep powyżej nie zwraca nic poza `components/ui/`. Żaden ekran nie ma
białej plamy na piaskowym tle.

---

## Z2 · Rozdzielenie nagłówków

**Pliki:** `components/PlannerHeader.tsx`, `pages/Index.tsx`, `App.tsx`
**Warianty:** `3c` (marketingowy), `3d`–`3j` (aplikacyjny)
**Audyt:** punkty 01, 03, 20

Dwa nagłówki zamiast jednego.

**Marketingowy** — tylko na `/` dla niezalogowanego. Wysokość 74 px, tło `bg-surface`.
Logo z sygnaturą „zbieraj · układaj · jedź” (`components/Logo.tsx`, wariant pełny).
Zakładki treściowe: Odkrywaj, Jak to działa, Inspiracje, GPX. Po prawej `Zaloguj się`
(obrys) i `Zacznij planować` (`bg-foreground`).

**Aplikacyjny** — wszędzie indziej. Wysokość 66 px. Logo bez sygnatury. Zakładki
zależne od kontekstu:

- bez wybranego wyjazdu → Odkrywaj · Twoje wyjazdy · Inspiracje
- z wybranym wyjazdem → przełącznik wyjazdu (pigułka `bg-muted` z nazwą i `▾`),
  potem Odkrywaj · Tablica · Plan dni

Punkt 20: dziś „Tablica” i „Plan” celują w ten sam adres i przy braku tablicy dają
identyczny wynik. Rozwiązanie: bez wybranego wyjazdu te zakładki w ogóle się nie
pokazują.

Stan aktywny zakładki: `bg-foreground text-background rounded-full`, nie podkreślenie
i nie czarne tło.

Punkt 03: nagłówek to `sticky top-0 h-16`. Dodać `backdrop-blur` i tło z alfą,
żeby treść nie przebijała ostro przy przewijaniu.

**Odbiór:** niezalogowany na `/` nie widzi zakładek produktu. Zalogowany bez wyjazdu
nie widzi „Tablica” ani „Plan dni”.

---

## Z3 · Tablica wyjazdu

**Pliki:** `components/TripProjects.tsx`, `components/PasekNarzedziTablicy.tsx`
**Wariant:** `3e`
**Audyt:** punkty 04, 05, 06, 07, 16

Największa zmiana w codziennym użyciu.

Dziś przed treścią stoi sześć kontenerów sterujących: wiersz czterech przycisków,
karta „Skąd zaczynacie?”, karta „Kiedy jedziecie?” i dalej. Zwinąć w **jeden pasek**
pod nagłówkiem:

```
Start: hotel Adriatik · 12–15 lipca · pieszo i taksówką · z dzieckiem    Zmień ustawienia
```

Pasek: `font-mono`, 12 px, `text-secondary`, separator `·` w `--hairline`, tło
`bg-surface`, linia dolna `border-border/8`. Link `Zmień ustawienia` po prawej
otwiera modal z tym, co dziś jest dwiema dużymi kartami.

Pod paskiem nagłówek ekranu jako **liczba, nie nazwa**: „21 zebranych miejsc”,
`font-display` 40 px. Jedna akcja główna po prawej: `Ułóż plan na 3 dni`.

Trzy kolumny decyzji, każda z podkreśleniem 2 px w swoim kolorze:

- **Na pewno** — `--primary`. Karta ze zdjęciem 72 px, tytuł, metadane, a jeśli plan
  istnieje — przypisany dzień i godzina w `text-primary`.
- **Być może** — `--accent`. Ta sama karta plus dwa przyciski przesunięcia decyzji.
- **Odrzucone** — szare. **Nie karty ze zdjęciem**, tylko wiersze z przekreśleniem
  i akcją `Przywróć`. Nie mogą zabierać uwagi.

Głos agenta wchodzi jako terakotowa karta w kolumnie „być może”, między pozycjami.

**Odbiór:** pierwsza rzecz pod nagłówkiem to liczba miejsc i kolumny, nie formularz.
Odrzucone zajmują mniej niż jedną trzecią wysokości kolumny obok.

---

## Z4 · Landing

**Pliki:** `pages/Index.tsx`
**Wariant:** `3c`
**Audyt:** punkty 08, 14, 17, 18

Kompozycja wyśrodkowana: pole wyszukiwania w środku, treść produktu pływa dookoła.

Przeczytać w `kierunek.md` sekcję **„Reguły kompozycji”** przed pisaniem kodu —
cztery zasady (trzy plany głębi, przycięcie krawędzią, jedna karta z tekstem, dwa
wypełnienia) są tym, co odróżnia ten układ od równej rozsypki.

Hero: `overflow: hidden`, wysokość 660 px, warstwica `assets/patterns/contour.svg`
w `opacity: .14`, wyśrodkowana, wychodząca poza górną krawędź.

Karty pływające pozycjonowane absolutnie, trzy z ujemnym offsetem (`left: -58px`,
`right: -62px`, `top: 606px`). Kolumna środkowa `position: relative` nad nimi.

Pod hero pas tablic: pięć kart nachodzących na siebie, malejących w prawo,
z rosnącym `margin-top` i malejącym cieniem. Ostatnia wychodzi poza krawędź.

Punkt 18: `pt-[88px] pb-[72px]` do wyrównania z resztą — hero ma stałą wysokość,
nie padding.

**Odbiór:** przy szerokości 1300 px trzy karty są przycięte krawędzią. Nagłówek
`h1` nie koliduje z żadną kartą (przy 1300 px prześwit ok. 29 px z każdej strony).

---

## Z5 · Twoje wyjazdy

**Pliki:** `pages/TripPlans.tsx`
**Wariant:** `3d`
**Audyt:** punkty 22, 23, 26

Punkt 23: ten ekran nie może wyglądać jak galeria z `/tablice`.

Wyjazd w trakcie stoi **osobno i większy**: karta pozioma, zdjęcie 300×224,
obok kolumna z nadtytułem „W trakcie układania” (`--accent`), nazwą 30 px
`font-display`, terminem w `font-mono`, trzema liczbami i paskiem postępu.

Liczby: `--primary` na pewno, `--accent` być może, `--muted-foreground` odrzucone.
Pasek postępu mówi o **planie**, nie o tablicy: „Plan gotowy na dzień 1 z 3”.

Pozostałe wyjazdy w siatce trzech, karty pionowe, zdjęcie 132 px, cienki pasek
postępu na dole. Ostatnia komórka to kafelek z kreską (`border-dashed`) —
`Zacznij nowy wyjazd`.

Punkt 22: tytuł ekranu to „Twoje wyjazdy”, nie „Wszystkie tablice”.

**Odbiór:** wyjazd w trakcie zajmuje pełną szerokość i jest wyraźnie większy niż
pozostałe. Ekran nie da się pomylić z `/tablice`.

---

## Z6 · Plan dni

**Pliki:** `components/PlanDayMap.tsx` + widok planu (zlokalizować po użyciu `PlanDayMap`)
**Wariant:** `3f`

Układ dwukolumnowy: oś czasu jako treść główna, mapa jako **panel 400 px po prawej**
(`bg-muted`, linia po lewej), nie kolumna równorzędna.

Godzina w osobnej kolumnie 56 px, `font-mono`, `tabular-nums`. Kolumna musi się
zgadzać — to warunek czytelności całej osi.

**Przerwy między punktami mają własny wiersz**: pionowa kreska 22 px plus
„15 min pieszo · 870 m” w `font-mono` 11 px. To jedyne miejsce, gdzie plan mówi,
że coś zajmuje czas poza zwiedzaniem. Nie skracać, nie chować pod tooltip.

Karta punktu: zdjęcie 84 px, tytuł 16 px, metadane w `font-mono`, opcjonalnie
jedno zdanie kontekstu.

Panel: mapa dnia z numerowanymi znacznikami w `--primary` i przerywaną trasą,
podsumowanie w czterech liczbach (km, czas, przewyższenie, punkty), pobranie GPX,
akcja `Udostępnij plan` na dole.

Głos agenta jako terakotowa karta **pod ostatnim punktem**, wcięta do kolumny treści
(`margin-left: 72px`) — komentuje cały dzień, nie pojedynczy punkt.

**Odbiór:** wszystkie godziny są wyrównane do prawej w swojej kolumnie. Każda para
sąsiednich punktów ma między sobą wiersz z dystansem.

---

## Z7 · Odkrywaj

**Pliki:** `pages/Discover.tsx`, `components/FilterToolbar.tsx`, `components/DiscoverMap.tsx`
**Wariant:** `3h`
**Audyt:** punkty 10, 11, 12, 15

Karta miejsca ma **jedną akcję główną**, nie trzy równorzędne pigułki:

- niezdecydowane → `Na pewno` jako pigułka `bg-muted`, obok tekstowe `Może` i `×`
- wybrane „na pewno” → pigułka `bg-primary text-primary-foreground`, alternatywa
  staje się tekstem
- wybrane „może” → pigułka `bg-accent text-accent-foreground`, alternatywa tekstem

Punkt 10: czarny stan aktywny filtra (`bg-foreground text-background`) zostaje —
jest zgodny z nowym kierunkiem, bo `--foreground` to teraz orzech, nie czerń.
Sprawdzić tylko, czy nie jest wpisany jako `bg-black`.

Punkt 11: kolory znaczników na mapie do wyprowadzenia z tokenów zamiast wartości
wpisanych w komponencie. `--primary` na pewno, `--accent` być może,
`--foreground` grupa miejsc.

Panel mapy pokazuje **rozrzut**, nie trasę — bez linii między punktami, z legendą
pod mapą i licznikiem „18 z 21”.

**Odbiór:** na karcie widać, która decyzja jest podjęta, bez czytania. Żaden kolor
znacznika nie jest wpisany na sztywno w `DiscoverMap.tsx`.

---

## Z8 · Inspiracje

**Pliki:** `pages/Tablice.tsx`, `App.tsx`, `components/PlannerHeader.tsx`
**Wariant:** `3g`
**Audyt:** punkty 21, 23

Punkt 21: `/tablice` to dopracowany ekran bez wejścia w nawigacji. Dodać „Inspiracje”
do zakładek — to część zadania Z2, ale odbiór jest tutaj.

Układ kolumnowy (`columns: 4`, `column-gap: 18px`, `break-inside: avoid`), kafelki
różnej wysokości: 144–230 px. Autor z awatarem **pod tytułem**, nie w rogu zdjęcia.
Etykieta kategorii w lewym górnym rogu zdjęcia, na półprzezroczystym kremie.

Jeden kafelek w potoku jest orzechowy i tekstowy — „tablica tygodnia”, bez zdjęcia,
z licznikiem skopiowań w `--accent`. To jedyna rzecz, która na pierwszy rzut oka
odróżnia ten ekran od `/plany`. Nie usuwać.

**Odbiór:** „Inspiracje” są klikalne z nagłówka. Kafelki mają różne wysokości.

---

## Z9 · Cudza tablica

**Pliki:** `pages/TablicaPubliczna.tsx`
**Wariant:** `3i`

Widok tylko do odczytu. **Bez przycisków decyzji przy kartach.**

Autor z awatarem i licznikiem skopiowań **przed tytułem**. Tytuł 34 px `font-display`,
pod nim jedno zdanie opisu. Dwie akcje: `Skopiuj do swojego wyjazdu` (`bg-foreground`)
i `Pobierz GPX` (obrys).

Karty mniejsze niż na własnej tablicy — zdjęcie 62 px, siatka dwukolumnowa,
przypisany dzień jeśli autor go ustawił. Pod siatką link `Pokaż pozostałe N miejsc`.

Nagłówek uproszczony: `← Inspiracje` po lewej, „publiczna tablica” po prawej.

**Odbiór:** nie ma na ekranie żadnego przycisku, który zmieniałby cudzą tablicę.

---

## Z10 · 404

**Pliki:** `pages/NotFound.tsx`
**Wariant:** `3j`

Trzy wyjścia z powrotem w produkt, nie jedno „wróć na stronę główną”:
`Twoje wyjazdy` (`bg-foreground`), `Odkrywaj` i `Inspiracje` (obrys).

Warstwica w tle w tej samej opacity co landing (`.16`). Kod błędu jako mały
`font-mono` w `--accent` nad nagłówkiem, nie jako wielka cyfra.

**Odbiór:** ekran ma trzy różne wyjścia i nie jest pusty.

---

## Z11 · Martwy plik

**Pliki:** `pages/LandingPage.tsx`

Landing poprzedniego konceptu: po angielsku, z językiem marketplace („kup trasę”,
panel zarobków twórcy). Nieużywany w routingu. Usunąć, żeby nie wrócił przez pomyłkę
przy pracy nad `Index.tsx`.

Sprawdzić przedtem: `grep -rn "LandingPage" src`.

**Odbiór:** plik nie istnieje, build przechodzi.

---

## Z12 · Przegląd końcowy

Po wszystkich zadaniach przejść aplikację i sprawdzić cztery rzeczy:

1. **Szałwia** — czy występuje wyłącznie przy stanie „na pewno”. Jeśli gdzieś jest
   na przycisku akcji, to regresja.
2. **Terakota** — czy oznacza tylko „być może” i głos agenta. Nigdy akcję.
3. **Promienie** — 9–12 px na kartach, `rounded-full` na pigułkach. Nic powyżej 12 px.
4. **Ekrany spoza zakresu** (profil, karta miejsca, ustawienia, kreator, legal) —
   czy dostały ciepły papier i nie mają białych plam.

Punkt 25 audytu („Moje trasy” — ekran z poprzedniego produktu, angielski adres
`/my-routes`) zostaje otwarty. Wymaga decyzji produktowej, czy ekran w ogóle zostaje,
a nie poprawki wizualnej.
