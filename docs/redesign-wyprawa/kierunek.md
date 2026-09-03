# Handoff: kierunek „Wyprawa” — RouteMarket

Osiem ekranów w jednym kierunku wizualnym, plus zmiana warstwy kolorystycznej systemu.
Materiał zamyka etap piąty audytu (`Audyt routemarket.io.dc.html`), który był z niego
wyłączony jako wymagający decyzji, a nie listy poprawek.

## Co jest w paczce

| Plik | Co zawiera |
|---|---|
| `prototype/Routemarket - kierunek Wyprawa.dc.html` | wszystkie warianty, 1a–3j |
| `prototype/support.js` | runtime prototypu, nie kod produkcyjny |
| `tokens.css` | nadpisanie `:root` — jedyna zmiana, która dotyka systemu |

Plik prototypu otwiera się w przeglądarce bez budowania. Warianty leżą obok siebie
na płótnie; każdy ma widoczną etykietę (`3c`, `3d`, …) odpowiadającą `id` elementu,
więc `#3e` w adresie przewija do właściwego ekranu.

**Wiążące są tylko warianty 3c–3j.** Tury 1 i 2 zostają w pliku jako zapis
odrzuconych kierunków — nie implementować.

## Ekrany

| Wariant | Ekran | Trasa |
|---|---|---|
| `3c` | Landing (niezalogowany) | `/` na `www.routemarket.io` |
| `3d` | Twoje wyjazdy | `/plany` |
| `3e` | Tablica wyjazdu | `/plany/:id` |
| `3f` | Plan dni | `/plany/:id/plan` |
| `3g` | Inspiracje — galeria publicznych tablic | `/tablice` |
| `3h` | Odkrywaj | `/odkrywaj` |
| `3i` | Cudza tablica (tylko do odczytu) | `/tablica/:id` |
| `3j` | 404 | `*` |

`3a` i `3b` to wcześniejsza wersja tego samego kierunku. Różnice względem `3c`
opisuje sekcja „Co się zmieniło w 3c” — zostawione, bo tłumaczą, dlaczego reguły
kompozycji brzmią tak, a nie inaczej.

## Fidelity

**High-fidelity na układ, hierarchię i copy. Kolor przez tokeny.**

Prototyp jest napisany na wartościach hex, bo powstawał poza aplikacją. **Nie
przenosić hexów do kodu.** `tokens.css` mapuje każdą użytą wartość na token;
w implementacji obowiązuje zasada systemu: `bg-background`, `text-foreground`,
`bg-card`, `text-muted-foreground`, `bg-accent`, `border-border`.

**Jeden wyjątek: biblioteki, które nie przyjmują klas.** Leaflet i Three.js
dostają kolor jako wartość w JavaScripcie, nie jako klasę Tailwinda — nie da się
im podać `bg-primary`. Dotyczy to ikon pinezek, kolorów tras i materiałów 3D.
W tych miejscach wolno operować wartością koloru, ale **odczytaną z tokenu**:

```js
const token = (nazwa) => getComputedStyle(document.documentElement)
  .getPropertyValue(nazwa).trim();
color: `hsl(${token('--primary')})`
```

Czego wyjątek NIE obejmuje: wpisania własnego hexa „bo tak szybciej". Jeśli
w kodzie stoi `'#6366f1'`, to jest błąd do poprawienia, a nie zastosowanie tego
wyjątku. Zapisane, bo bez tego każdy kolejny przegląd zgłasza te same linie jako
naruszenie, a poprawianie ich na siłę kończy się mapą bez kolorów.

Mapowanie skrótowo:

| Hex w prototypie | Token |
|---|---|
| `#F3E7D8` | `--background` |
| `#F8F1E6` | `--surface` |
| `#FFFDF9` | `--card` |
| `#EDE0CF` | `--muted` |
| `#3A2A22` | `--foreground` |
| `#6B5A4E` | `--text-secondary` |
| `#8C7A6B` | `--muted-foreground` |
| `#B86F52` | `--accent` |
| `#3B6655` | `--primary` (bez zmian) |
| `#E4D5C1` | `--placeholder-photo` (nowy) |

Wyjątki od wierności:

- **Zdjęcia** — wszystkie kafelki obrazów to sloty z placeholderem. Docelowo
  fotografie miejsc z bazy. Proporcje i wysokości kafelków są istotne, treść nie.
- **Mapa** — w prototypie to statyczny kafelek z warstwicą i kółkami. Implementacja
  używa istniejącego `MapView.tsx` / `DiscoverMap.tsx`; z prototypu obowiązują
  kolory znaczników (patrz niżej) i to, że mapa jest **panelem po prawej**,
  a nie kolumną równorzędną z treścią.
- **Brak ikon.** Prototyp używa wyłącznie znaków typograficznych (`↓`, `×`, `▾`, `↗`).
  Jeżeli implementacja doda ikony, to z zestawu już używanego w bibliotece.

## Zmiana koloru — co to naprawdę oznacza

Obie decyzje są podjęte. Wpisane tutaj, żeby nie wracały jako pytanie.

**1. Papier robi się ciepły — wszędzie, za jednym razem.** `--background` przechodzi
z `158 8% 97%` (prawie biały, chłodny) na `33 53% 90%` (piaskowy). Zmiana wchodzi
na całą aplikację naraz, także na ekrany spoza tej paczki: kartę miejsca, profil,
ustawienia, kreator, stany puste i błędy. Bez flagi, bez podziału na etapy —
przejście między chłodnym a ciepłym papierem w obrębie jednej sesji wygląda jak błąd.

Praktyczny skutek: po podmianie `:root` trzeba przejść wszystkie ekrany i usunąć
surowe klasy Tailwinda, które wcześniej uchodziły bezkarnie, bo `bg-white` na prawie
białym tle było niewidoczne. Na piaskowym papierze każde `bg-white`, `bg-slate-50`
i `text-slate-500` rzuca się w oczy natychmiast. To jest właśnie ten moment, w którym
reszta czyszczenia z audytu przestaje być opcjonalna.

**2. Szałwia przestaje być kolorem wszystkiego.** Wartość `--primary` nie zmienia się
(`158 28% 32%`, `#3B6655`), zmienia się jej użycie. W prototypie szałwia występuje
**wyłącznie** przy stanie „na pewno”: aktywny przycisk decyzji, znacznik na mapie,
pasek postępu tablicy, kropka legendy. Akcje główne (`Zacznij planować`, `Ułóż plan
na 3 dni`, `Otwórz tablicę`) są orzechowe — `bg-foreground text-background`.

Dzięki temu jeden rzut oka na ekran mówi, ile jest już zdecydowane. Jeżeli szałwia
wróci na przyciski, ten sygnał znika — to jest sedno zmiany, nie ozdoba.

Trzeci kolor, terakota `--accent`, oznacza dokładnie dwie rzeczy: **„być może”**
oraz **głos agenta**. Nigdy nie oznacza akcji.

## Reguły kompozycji (to, co odróżnia 3c od 3a)

Landing i każdy ekran z pływającymi elementami trzyma się czterech zasad. Wypisane,
bo bez nich układ rozjeżdża się w równą rozsypkę, którą 3a właśnie był.

1. **Trzy plany głębi, nie jeden.** Karta bliska 260–280 px szerokości, cień
   `--shadow-lg`. Karta środkowa ~170 px, `--shadow-md`. Karta daleka ~130 px,
   `--shadow-sm`, bez tytułu — samo zdjęcie. Rozmiar i cień zmieniają się razem.
2. **Dwie do trzech kart wychodzi poza kadr.** Kontener ma `overflow: hidden`,
   karty mają ujemny offset. Bez przycięcia kompozycja czyta się jako „ułożona”.
3. **Maksymalnie jedna karta z pełnym zdaniem.** Reszta to zdjęcia i dane
   (godziny, dystanse, liczby). Dwie karty z tekstem konkurują z nagłówkiem.
4. **Dwa kolorowe wypełnienia w kadrze.** Orzech i terakota. Wszystko inne
   kremowe. Trzeci kolor wypełnienia rozbija kompozycję.

## Promienie

Prototyp używa **9–12 px** na kartach (`--radius-md` do `--radius-lg`) i `rounded-full`
na pigułkach. To zgodne z zapisem systemu „zaokrąglenia powściągliwe”. Wersje 3a i 3b
miały 14–16 px i wyglądały miękko jak iOS — nie powielać.

Lekkość w tym kierunku pochodzi z **cieni i różnicy skali**, nie z promieni.

## Nagłówek: dwa, nie jeden

Punkt 01 audytu. Prototyp rozdziela:

- **Nagłówek marketingowy** (`3c`) — logo z sygnaturą „zbieraj · układaj · jedź”,
  zakładki treściowe (Odkrywaj, Jak to działa, Inspiracje, GPX), `Zaloguj się`
  i `Zacznij planować`. Wysokość 74 px.
- **Nagłówek aplikacyjny** (`3d`–`3j`) — logo bez sygnatury, przełącznik wyjazdu
  (pigułka `--muted` z nazwą i `▾`), zakładki produktu, awatar. Wysokość 66 px.

Zakładki aplikacyjne zależą od kontekstu, zgodnie z punktem 20 audytu:

- **bez wybranego wyjazdu** → Odkrywaj · Twoje wyjazdy · Inspiracje (`3d`, `3g`)
- **z wybranym wyjazdem** → Odkrywaj · Tablica · Plan dni (`3e`, `3f`, `3h`),
  przełącznik wyjazdu widoczny po lewej

Stan aktywny to orzechowa pigułka, nie podkreślenie i nie czarne tło
(`bg-foreground text-background`, `rounded-full`).

## Uwagi per ekran

### 3d — Twoje wyjazdy (`/plany`)

Punkt 23 audytu: ten ekran nie może wyglądać jak galeria. Rozwiązanie: wyjazd
w trakcie stoi **osobno i większy** (zdjęcie 300 px + kolumna danych z liczbami
i paskiem postępu), pozostałe idą w spokojną siatkę trzech. Ostatnia komórka
siatki to kafelek z kreską — `Zacznij nowy wyjazd`.

Liczby na karcie głównej: zielona (`--primary`) na pewno, terakota być może,
wyszarzona odrzucone. Pasek postępu mówi o planie, nie o tablicy —
„Plan gotowy na dzień 1 z 3”.

### 3e — Tablica wyjazdu (`/plany/:id`)

Punkt 04: sześć kontenerów sterujących przed treścią. Prototyp zwija je w **jeden
pasek** pod nagłówkiem — start, termin, środek transportu, kontekst, plus link
`Zmień ustawienia` po prawej. Pasek jest monospace, 12 px, separator `·`.
Karty „Skąd zaczynacie?” i „Kiedy jedziecie?” przechodzą do modala.

Poniżej trzy kolumny: **Na pewno** (podkreślenie `--primary`), **Być może**
(`--accent`), **Odrzucone** (szare). Odrzucone to nie karty ze zdjęciem, tylko
wiersze z przekreśleniem i akcją `Przywróć` — nie zabierają uwagi.

Karta w kolumnie „na pewno” pokazuje przypisany dzień i godzinę, jeżeli plan
istnieje. Karta w „być może” pokazuje dwa przyciski przesunięcia decyzji.

Nagłówek ekranu to liczba, nie nazwa: „21 zebranych miejsc”. Jedna akcja główna:
`Ułóż plan na 3 dni`.

### 3f — Plan dni (`/plany/:id/plan`)

Oś czasu jest treścią główną, mapa panelem 400 px po prawej. Godzina stoi
w osobnej kolumnie 56 px, monospace, `tabular-nums` — kolumna musi się zgadzać.

**Przerwy między punktami mają własny wiersz**: pionowa kreska plus
„15 min pieszo · 870 m”. To jedyne miejsce, gdzie plan mówi, że coś zajmuje czas
poza zwiedzaniem, i dlatego nie wolno go skracać.

Panel po prawej: mapa dnia z numerowanymi znacznikami i przerywaną trasą,
podsumowanie w czterech liczbach, pobranie GPX, akcja `Udostępnij plan`.

Głos agenta wchodzi jako terakotowa karta **pod ostatnim punktem**, wcięta
do kolumny treści — komentuje cały dzień, nie pojedynczy punkt.

### 3g — Inspiracje (`/tablice`)

Punkty 21 i 23. Wejście w nawigacji jest obowiązkowe — ekran istnieje i jest
dopracowany, a nie ma jak do niego trafić.

Układ kolumnowy (`columns: 4`), kafelki różnej wysokości, autor z awatarem
**pod tytułem**, nie w rogu zdjęcia. Jeden kafelek w potoku jest orzechowy
i tekstowy — „tablica tygodnia”. To jedyna rzecz, która odróżnia ten ekran od
`3d` na pierwszy rzut oka, więc nie usuwać.

### 3h — Odkrywaj (`/odkrywaj`)

Karta miejsca ma **jedną akcję główną**, nie trzy równorzędne pigułki. Stan
niezdecydowany: `Na pewno` jako pigułka `--muted`, obok tekstowe `Może` i `×`.
Stan wybrany: pigułka wypełniona `--primary` (na pewno) albo `--accent` (może),
a alternatywa staje się tekstem.

Punkt 10 audytu: czarny stan aktywny filtra zastąpiony orzechowym.

Panel mapy po prawej pokazuje **rozrzut**, nie trasę — kolory znaczników:
`--primary` na pewno, `--accent` być może, `--foreground` grupa miejsc.

### 3i — Cudza tablica (`/tablica/:id`)

Widok tylko do odczytu. Bez przycisków decyzji przy kartach — jedna akcja
główna `Skopiuj do swojego wyjazdu`, obok `Pobierz GPX`. Autor i licznik
skopiowań na górze, przed tytułem. Karty są mniejsze niż na własnej tablicy
(zdjęcie 62 px) i pokazują przypisany dzień, jeśli autor go ustawił.

### 3j — 404

Trzy wyjścia z powrotem w produkt, nie jedno „wróć na stronę główną”. Warstwica
w tle w tej samej opacity co landing (0.16).

## Copy

Cała treść tekstowa jest w prototypie i **nie należy jej przepisywać**. Kilka
zasad, które w niej obowiązują i które łatwo zgubić przy tłumaczeniu na `t()`:

- Zdania zaczynają się wielką literą, reszta małą — także przyciski i zakładki.
- Wersaliki tylko w nadtytułach, `Archivo Narrow`, ≤ 11 px.
- Odstęp liter — zapis zgodny z tym, co JEST w kodzie (policzone 03.09.2026),
  a nie z prototypem: `0.18em` przy 10 px (28 wystąpień), `0.32em` przy 11 px
  (18 wystąpień). Wartości z prototypu (`0.24em`, stopień 9 px) nie weszły do
  implementacji ani razu. Liczy się odstęp optyczny ~2 px, nie sama wartość `em`
  — rośnie, gdy stopień maleje.
  **Znany dług:** cztery miejsca używają `0.18em` przy 11 px, czyli tam, gdzie
  osiemnaście innych używa `0.32em`. Do ujednolicenia przy najbliższej okazji
  dotykającej tych komponentów — nie warto robić z tego osobnego przebiegu.
- Separator `·` w metadanych, ze spacjami: `1 g 30 min · rzymski · cień po 15:00`.
- Czas po polsku: `1 g 30 min`, nie `1h 30m`. Przecinek dziesiętny: `3,8 km`.
- Głos agenta jest **obserwacją, nie poradą**: „Czwarty punkt by się zmieścił,
  ale to dużo schodów jak na jedno popołudnie”. Nie „Zalecamy…”, nie „Wskazówka:”.
- Bez emoji.

## Czego tu nie ma

- Wersja mobilna. Wszystkie ekrany są desktopowe, 1300 px.
- Karta pojedynczego miejsca, profil, ustawienia, kreator v2, admin, legal.
- Stany pośrednie: ładowanie, błąd sieci, pusta tablica, pusty wynik filtrów.
- Punkt 25 audytu („Moje trasy” z poprzedniego produktu) — wymaga decyzji
  produktowej, czy ekran zostaje.

## Kolejność

1. `tokens.css` — podmiana `:root` na całą aplikację. Bez tego reszta nie ma sensu,
   a z tym wszystko od razu robi się ciepłe i spójne.
2. Przejście po ekranach spoza tej paczki i usunięcie surowych klas Tailwinda,
   które na piaskowym tle stają się widoczne (`bg-white`, `bg-slate-*`,
   `text-slate-*`, `border-slate-*`). Krok mechaniczny, ale konieczny w tym samym
   wdrożeniu co punkt 1.
3. Rozdzielenie nagłówków (punkt 01) i zakładki zależne od kontekstu (punkt 20).
4. `3e` Tablica — zwinięcie sześciu kontenerów w pasek (punkt 04). Największa
   różnica w codziennym użyciu.
5. `3c` Landing.
6. `3d`, `3f`, `3h` — układy istniejących ekranów.
7. `3g` z wejściem w nawigacji (punkt 21), `3i`, `3j`.
