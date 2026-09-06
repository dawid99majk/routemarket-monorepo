---
name: "routemarket-design"
description: "system designu dla routemarket.io"
---

name: design-routemarket
description: Zasady projektowania interfejsu RouteMarket — kolor przez tokeny, typografia, kompozycja, copy po polsku. Użyj ZAWSZE, gdy zmieniasz cokolwiek widocznego w apps/frontend: nowy ekran, nowy komponent, poprawka układu, nowy tekst w UI, nowa klasa CSS. Także wtedy, gdy zadanie brzmi jak czysty frontend („dodaj przycisk”, „napraw siatkę”) — bo w tym repo wygląd jest regulowany, nie dowolny.
---

# Design RouteMarket

## Czym jest ten produkt

RouteMarket to **planer wyjazdów**. Użytkownik zbiera miejsca na tablicy, dzieli je
na trzy kubełki decyzji (na pewno / być może / odrzucone), a z „na pewno” powstaje
plan dni i przebieg trasy.

To **nie jest sklep ani marketplace**. Jeśli w kodzie natkniesz się na „kup trasę”,
panel zarobków twórcy, ceny albo `pages/LandingPage.tsx` — to pozostałość
poprzedniego konceptu. Nie rozbudowuj tego i nie powielaj tej retoryki w nowym UI.

Kierunek wizualny nazywa się **Horizon** (pełna nazwa: Nordic Horizon): chłodne
jasne tło, granatowa typografia, morski teal zarezerwowany dla decyzji. Rzeczowo
i cicho, jak katalog sprzętu outdoorowego, nie jak startup SaaS.

Jeśli w starszych materiałach natkniesz się na „Wyprawę" (ciepły papier, szałwia,
terakota) albo na przełącznik czterech motywów — to poprzedni etap. Od 6.09.2026
motyw jest jeden, zdefiniowany w `:root`, bez klas `.theme-*` i bez przełącznika.

## Reguła nadrzędna: kolor wyłącznie przez tokeny

**Nigdy nie wpisuj surowej klasy z palety Tailwinda ani wartości hex w JSX/CSS.**
Repozytorium zostało z nich wyczyszczone (458 wystąpień) i regresja jest widoczna
natychmiast, bo tło jest piaskowe, nie białe.

| Nie pisz | Pisz | Znaczenie |
|---|---|---|
| `bg-emerald-600`, `bg-teal-700` | `bg-primary` | teal — tylko stan „na pewno” |
| `hover:bg-emerald-500` | `hover:bg-primary/90` | |
| `text-slate-500` | `text-muted-foreground` | tekst drugorzędny |
| `text-slate-800`, `text-black` | `text-foreground` | tekst podstawowy (granat) |
| `border-slate-200` | `border-border` | linie |
| `bg-white` | `bg-card` | karta na papierze |
| `bg-slate-50` | `bg-muted` | tło zapadnięte |
| `bg-amber-100` | `bg-warning/15` | ostrzeżenie |
| `text-amber-500` | `text-accent` | bursztyn — „być może”, tło pod ciemnym napisem |

Kontrola przed commitem:

```bash
rg -n '(bg|text|border|ring|from|to|via)-(slate|gray|zinc|neutral|stone|emerald|green|amber|yellow|rose|red|blue|sky|indigo)-[0-9]' apps/frontend/src
rg -n '#[0-9a-fA-F]{6}' apps/frontend/src --glob '!index.css' --glob '!*.svg'
```

Oba muszą wyjść puste. Wyjątek: `index.css` (definicje `:root`) i pliki SVG.

Na ciemnym tle `primary` jest nieczytelny — tam `primary-light`.

## Znaczenie kolorów jest funkcjonalne, nie dekoracyjne

To najczęściej łamana zasada tego projektu, bo wygląda jak preferencja estetyczna,
a jest sygnałem informacyjnym.

- **Teal `--primary`** oznacza **wyłącznie „na pewno”**: aktywny przycisk decyzji,
  znacznik na mapie, wypełniony segment paska planu, kropka legendy. Nic więcej.
- **Bursztyn `--accent`** oznacza dokładnie dwie rzeczy: **„być może”** oraz
  **głos agenta AI**. Nigdy nie oznacza akcji ani stanu aktywnego.
  **Nie używaj go jako koloru tekstu na jasnym tle** — jest za jasny i nie
  przechodzi kontrastu (zmierzone 2,13). Bursztyn to tło, na nim ciemny napis.
- **Granat `--foreground`** to akcje główne: `bg-foreground text-background`.
  `Zacznij planować`, `Ułóż plan na 3 dni`, `Otwórz tablicę` — wszystkie granatowe.
- Stan aktywny zakładki to **granatowa pigułka**, nie podkreślenie.

Jeżeli teal wróci na przyciski akcji, użytkownik traci możliwość odczytania
jednym rzutem oka, ile na ekranie jest już zdecydowane. Nie negocjuj tego.

## Typografia

| Klasa | Font | Do czego |
|---|---|---|
| `font-display` | Fraunces | nagłówki, tytuły kart, hasła |
| `font-sans` | Inter | tekst ciągły, interfejs |
| `font-narrow` | Archivo Narrow | nadtytuły i etykiety, wersalikami |
| `font-mono` | JetBrains Mono | dane techniczne: godziny, dystanse, liczby |

- `font-mono` **zawsze z `tabular-nums`**, jeśli liczby stoją w kolumnie.
- Wersaliki **tylko** w nadtytułach i etykietach: `font-narrow uppercase`,
  rozmiar ≤ 11 px. Nigdy całe zdanie, nigdy akapit.
- **Odstęp liter: `0.18em` przy 11 px, `0.24em` przy 9 px.** Liczy się odstęp
  optyczny (~2 px), nie sama wartość `em` — dlatego rośnie, gdy stopień maleje.
  Prototypy używają 9 px i stąd `0.24em`; aplikacja ustaliła się na 11 px,
  więc jej wartością jest `0.18em`. Sprawdzone 31.08.2026: w kodzie było
  36 wystąpień, wszystkie `≤ 0.22em` — to nie były pomyłki, tylko przeliczenie.
- **Zdania zaczynają się wielką literą, reszta małą** — także przyciski, zakładki
  i pozycje menu. `Ułóż plan dni`, nie `Ułóż Plan Dni`.

## Forma

- **Zaokrąglenia powściągliwe**: `rounded-md` (9–12 px) na kartach,
  `rounded-full` tylko na pigułkach. Ten system nie robi miękkich kart w stylu iOS —
  14–16 px zostało odrzucone jako zbyt miękkie.
- **Cienie ciepłe**: `shadow-token-xs` … `shadow-token-xl`. Nigdy niebieskawe,
  nigdy domyślne `shadow-lg` Tailwinda.
- **Bez gradientów**, poza ledwie wyczuwalnym przejściem papieru w cieplejszy papier.
  Wyjątek dozwolony: przyciemnienie pod tekstem leżącym na zdjęciu.
- **Lekkość pochodzi z cienia i różnicy skali**, nie z promieni.
- **Bez emoji w interfejsie.** Dozwolone znaki typograficzne: `—`, `·`, `↗`, `▾`, `×`.

## Kompozycja: układy z pływającymi kartami

Dotyczy landingu i każdego ekranu, gdzie karty otaczają treść centralną. Bez tych
reguł kompozycja rozjeżdża się w równą, płaską rozsypkę.

1. **Trzy plany głębi, nie jeden.** Karta bliska 260–280 px + `shadow-token-lg`;
   środkowa ~170 px + `-md`; daleka ~130 px + `-sm`, bez tytułu, samo zdjęcie.
   Rozmiar i cień zmieniają się **razem**.
2. **Dwie–trzy karty wychodzą poza kadr.** Kontener `overflow-hidden`, karty
   z ujemnym offsetem. Bez przycięcia kompozycja nie czyta się jako „ułożona”.
3. **Maksymalnie jedna karta z pełnym zdaniem.** Reszta to zdjęcia i dane.
4. **Dwa kolorowe wypełnienia w kadrze** — granat i bursztyn. Resztę chłodno-jasno.

## Kafelki i karty z treścią

Karta nie może nieść samej nazwy — wtedy wygląda płasko i tandetnie, niezależnie
od tego, jak dobre są tokeny. Reguła: **każda karta niesie stan albo liczbę.**

- **Obraz dochodzi do krawędzi karty.** Zdjęcie w białej ramce z marginesem to
  antywzorzec tego projektu.
- **Mozaika zdjęć: 1 duże + 2 małe**, `gap: 2px`, bez zaokrągleń wewnętrznych,
  siatka `minmax(0,2fr) minmax(0,1fr)` (bez `minmax(0, …)` obraz rozjeżdża siatkę).
  Przy ≥3 zdjęciach licznik `+N` w prawym dolnym. Przy 1–2 zdjęciach jeden pełny
  kadr, **bez placeholderów w pustych polach**. Trzy małe miniatury są za dużo —
  przy karcie ~300 px schodzą do ~95×54 px i karta zaczyna szumieć.
- **Stan na zdjęciu**, nie pod nim: `font-narrow` 9–10 px wersalikami na gradiencie
  przyciemnienia u dołu pola obrazu.
- **Paski postępu muszą coś znaczyć.** Pasek planu ma tyle segmentów, ile dni
  wyjazdu; `--primary` dla ułożonych, `--muted` dla resztki. Wyjazd bez żadnego
  ułożonego dnia **nie dostaje paska** — w jego miejsce link do następnego kroku.
  Pełny zielony pasek na każdej karcie to informacja zerowa.
- **Nie powtarzaj w metadanych tego, co jest w tytule.** Jeśli tytuł to
  „Stambuł w dwa dni”, meta brzmi `2 dni · 12 miejsc`, nie `Stambuł · 2 dni`.

## Copy po polsku

- Separator `·` w metadanych, ze spacjami: `Wrocław · 4,1 km · 5 h`.
- Czas po polsku: `1 g 30 min`, nie `1h 30m`. Przecinek dziesiętny: `3,8 km`.
- **Głos agenta jest obserwacją, nie poradą.** „Czwarty punkt by się zmieścił, ale
  to dużo schodów jak na jedno popołudnie”. Nigdy „Zalecamy…”, nigdy „Wskazówka:”.
- Nazwy ekranów: `Twoje wyjazdy` (nie „Wszystkie tablice”), `Tablica`, `Plan dni`,
  `Inspiracje`, `Odkrywaj`.
- Nowy tekst w UI idzie przez `i18n/pl.json`, nie na sztywno w JSX.

## Komponenty: składaj, nie odtwarzaj

UI pochodzi z `@routemarket/frontend` (`apps/frontend/src/components/ui`, Radix +
Tailwind). **Nie stylizuj surowego `<div>` tak, by wyglądał jak `Card` albo
`Button`** i nie dopisuj drugiego wariantu przycisku obok istniejącego.

Zanim napiszesz nowy komponent:

1. `ls apps/frontend/src/components/ui` — sprawdź, czy już jest.
2. Jeśli jest podobny, rozszerz go wariantem, nie kopiuj.
3. Komponenty składowe (`Label`, `SelectItem`, `TabsTrigger`, `SidebarMenuItem`,
   `RadioGroupItem`) działają **tylko** wewnątrz swojego rodzica.
4. Żadnego providera nie trzeba — style pochodzą z klas i `:root`.

Ikony: tylko z zestawu już używanego w repo. Nie dodawaj drugiej biblioteki ikon.

## Zakres jednej zmiany

- Zmiana koloru w `:root` wchodzi **na całą aplikację naraz**, bez flagi i bez
  etapów. Zmiana tła w obrębie jednej sesji wygląda jak błąd.
- Poprawka jednego ekranu nie przebudowuje sąsiednich. Jeśli widzisz problem obok,
  zgłoś go w opisie, nie napraw po cichu.
- Wszystkie ekrany w tym kierunku są **desktopowe, 1300 px**. Wersja mobilna nie
  jest jeszcze zaprojektowana — nie improwizuj breakpointów bez pytania.

## Stany pośrednie

Projekt ma dopracowane stany docelowe i zaniedbane stany przejściowe. Każdy ekran,
którego dotykasz, musi obsłużyć wszystkie cztery — brak stanu to też decyzja
projektowa, tylko podjęta przypadkiem.

**Ładowanie.** `Skeleton` w kształcie treści, która się pojawi: prostokąt zdjęcia
w tej samej wysokości, dwie linie tekstu w tej samej szerokości. Nigdy spinner na
środku pustego ekranu i nigdy przeskok układu po dojściu danych. Bez animacji
pulsowania mocniejszej niż `animate-pulse` z biblioteki.

**Pusto — bo jeszcze nic nie ma.** To najważniejszy stan w tym produkcie, bo każdy
nowy użytkownik go widzi. Jedno zdanie mówiące, co tu będzie, i **jedna** akcja
prowadząca do następnego kroku. Nie trzy równorzędne przyciski, nie ilustracja,
nie lista wskazówek. Przykład dla pustej tablicy: „Tablica jest pusta. Zacznij od
odkrywania miejsc w tym mieście” + granatowy `Odkrywaj`.

**Pusto — bo filtry nic nie znalazły.** Inny stan niż powyższy i inne copy: mówi,
co odfiltrowało wynik, i daje wyjście. „Żadne miejsce nie pasuje do trzech filtrów”
+ tekstowe `Wyczyść filtry`. Nigdy tego samego komunikatu co przy pustej tablicy.

**Błąd.** Mówi, co nie wyszło i co zrobić, nigdy kodu błędu ani „coś poszło nie tak”.
Ponowienie jako akcja, nie jako sugestia. `bg-danger/10 text-danger`, w karcie na
miejscu treści — nie jako toast, jeśli treści w ogóle nie ma.

Dane zebrane przez użytkownika (miejsca na tablicy, decyzje) **nigdy nie znikają
z widoku przy błędzie zapisu** — zostają z informacją, że zapis się nie udał.

## Mobile

Wszystkie zaprojektowane ekrany są desktopowe, 1300 px. Wersja mobilna **nie jest
zaprojektowana** — jeśli zadanie jej wymaga, zapytaj przed improwizowaniem. Gdy
musisz zejść niżej, obowiązują trzy rzeczy, które w tym produkcie nie są opcjonalne.

**Mapa nie jest kolumną, jest warstwą.** Na desktopie mapa to panel 400 px po
prawej. Poniżej `lg` nie ściska się do 40% szerokości — schodzi do przełącznika
`Lista / Mapa` albo `Sheet` wysuwanego od dołu. Mapa węższa niż ~320 px jest
bezużyteczna.

**Trzy kolumny decyzji zwijają się w zakładki, nie w stos.** Na pewno / być może /
odrzucone jako `Tabs` z licznikiem w etykiecie. Stos trzech kolumn jedna pod drugą
kasuje sens porównywania kubełków.

**Cel dotknięcia minimum 44 px.** Pigułki decyzji i `×` przy karcie są na desktopie
mniejsze — na dotyku muszą urosnąć, nawet jeśli rozsadzi to zagęszczenie karty.

Kompozycja z pływającymi kartami (trzy plany głębi, karty poza kadrem) **nie ma
wersji mobilnej** — poniżej `md` zostaje jedna kolumna: nagłówek, pole wyszukiwania,
dwie karty w rzędzie. Nie próbuj skalować rozsypki.

## Dostępność

- Kontrast: `text-muted-foreground` na `bg-muted` **nie przechodzi** AA dla tekstu
  poniżej 14 px — na zapadniętym tle używaj `text-foreground/70` albo większego
  stopnia. Sprawdzaj, nie zakładaj.
- Stan decyzji **nie może być kodowany samym kolorem.** Teal i bursztyn niosą
  znaczenie, więc każdy taki element ma też etykietę tekstową albo `aria-label`
  (`Na pewno`, `Być może`) — daltonista musi odczytać tablicę.
- Focus widoczny zawsze: `focus-visible:ring-2 ring-ring`. Nie usuwaj obrysu, żeby
  „było czysto”.
- Znaki typograficzne użyte jako przyciski (`×`, `▾`, `↗`) potrzebują `aria-label` —
  czytnik ekranu przeczyta „razy”.
- Ikonowy przycisk bez tekstu zawsze z `aria-label` i `title`.

## Wydajność w widokach z wieloma zdjęciami

Inspiracje, Odkrywaj i Twoje wyjazdy to ekrany zdjęciowe — tam wygląd psuje się
nie przez złe kolory, a przez skaczący układ.

- Każdy slot obrazu ma **z góry znaną wysokość** (`aspect-ratio` albo stała px),
  żeby siatka nie przeskakiwała po doczytaniu.
- `loading="lazy"` na wszystkim poniżej pierwszego ekranu, `decoding="async"`.
- Tło slotu `--placeholder-photo` (`#E4D5C1`), nie białe i nie szare — biały
  prostokąt na chłodnym tle mruga przy każdym doczytaniu.
- Miniatury w mozaice pobieraj w rozmiarze miniatury, nie skaluj pełnego zdjęcia.

## Czego nie robić bez pytania

- Nie dodawaj nowej biblioteki ikon, fontu ani zależności UI.
- Nie zmieniaj wartości w `:root` przy okazji poprawki ekranu.
- Nie wprowadzaj animacji dłuższych niż 200 ms i niczego, co się porusza samo
  (autoplay karuzeli, pulsujące CTA, parallax). Ten kierunek jest cichy.
- Nie dorzucaj sekcji, pustych stanów „na przyszłość” ani przykładowych danych do
  wypełnienia miejsca. Puste wrażenie sekcji to problem układu, nie brak treści.
- Nie usuwaj `pages/LandingPage.tsx` ani `pages/MyRoutes.tsx` samodzielnie —
  są zgłoszone jako martwe, ale to decyzja produktowa.

## Gdzie leży prawda

| Plik | Co zawiera |
|---|---|
| `apps/frontend/src/index.css` | tokeny `:root` — jedyne miejsce z wartościami hex |
| `apps/frontend/src/components/ui/` | biblioteka komponentów |
| ~~`docs/redesign-wyprawa/`~~ | poprzedni kierunek, materiał historyczny — nie stosuj |
| `docs/redesign-wyprawa/zadania.md` | zadania Z0–Z12 ze ścieżkami i kryteriami odbioru |
| `docs/redesign-wyprawa/tokens.css` | ciepła paleta do podmiany w `:root` |
| `docs/redesign-wyprawa/prototype/` | prototypy HTML — referencja wizualna, nie kod |

Prototypy używają hexów, bo powstawały poza aplikacją. **Nie przenoś z nich hexów
do kodu** — mapowanie hex → token jest w `kierunek.md`.

## Lista kontrolna przed oddaniem zmiany

- [ ] `rg` na surowe klasy palety i hexy wychodzi puste
- [ ] teal występuje wyłącznie przy „na pewno”, akcje główne granatowe
- [ ] żadna karta nie niesie samej nazwy — jest stan albo liczba
- [ ] pasek postępu odzwierciedla rzeczywistość, nie jest pełny domyślnie
- [ ] wersaliki tylko w nadtytułach, ≤ 11 px, `tracking` `0.18em` (9 px → `0.24em`)
- [ ] zdania wielką literą tylko na początku, także w przyciskach
- [ ] brak emoji, brak gradientów, `rounded-md` na kartach
- [ ] nowy tekst w `i18n/pl.json`
- [ ] nie powstał nowy komponent duplikujący istniejący z `components/ui`
- [ ] ekran obsługuje ładowanie, pusto, pusto po filtrach i błąd
- [ ] stan decyzji da się odczytać bez rozpoznawania koloru
- [ ] focus widoczny, znaki-przyciski mają `aria-label`
- [ ] zmierzony kontrast: `muted-foreground` na `background`, `muted` i `card`
      oraz napis na `primary` i `accent` — każda para ≥ 4,5
- [ ] sloty zdjęć mają z góry znaną wysokość — siatka nie przeskakuje
