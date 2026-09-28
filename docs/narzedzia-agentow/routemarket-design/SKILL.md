---
name: routemarket-design
description: System designu RouteMarket — kierunek „Pocztówka” (od 28.09.2026). Tokeny kolorów, kroje, kształty, komponenty i zasady. Użyj ZAWSZE, gdy zmieniasz cokolwiek widocznego w apps/frontend.
---

# Design RouteMarket — Pocztówka

Obowiązuje od 28.09.2026 i zastępuje kierunek Horizon (turkus, Fraunces,
Archivo Narrow). Wzorzec wizualny: płótno „RouteMarket — nowy kierunek”,
artboardy „C · Pocztówka”, „C · Tablica wyjazdu”, „C · Okno miejsca”.

Charakter: ciepłe jasne tło, atrament zamiast czerni, miękkie białe karty
z cieniem, pigułki. Przyjazny jak aplikacja konsumencka, ale rzeczowy w danych —
godziny, dystanse i czasy są zawsze liczbami, nie przymiotnikami.

## Kolor — trzy kolory, trzy znaczenia

Kolor wyłącznie przez tokeny (`index.css`, `:root`). Żadnego hexa w JSX i żadnej
surowej palety Tailwinda. Wyjątek: Leaflet i PDF czytają tokeny przez
`getComputedStyle`.

| Token | Wartość | Znaczy | Użycie |
|---|---|---|---|
| `--background` | #F5F1EC | tło strony | `bg-background` |
| `--card` | #FFFFFF | karty, panele, okna | `bg-card` |
| `--secondary` | #F5F1EC | tło kafelków i torów na białym | `bg-secondary` |
| `--muted` | #EDE6DD | kolumny tablicy, tła zapadnięte | `bg-muted` |
| `--foreground` | #25243A | atrament: tekst i akcje główne | `text-foreground`, `bg-foreground text-background` |
| `--muted-foreground` | #5F5E72 | tekst drugorzędny (5,6:1 na tle) | `text-muted-foreground` |
| `--border` | #E6E0D8 | linie, obrysy pól | `border-border` |
| `--primary` | #2E6B50 butelkowa zieleń | **wyłącznie „na pewno”** | pigułka, licznik, kropka, pinezka |
| `--accent` | #F6CFAE brzoskwinia | **wyłącznie „być może”**, zawsze jako tło | z `text-accent-foreground` (#4A2A10) |
| `--accent-strong` | #F0B084 | kropki i pinezki „być może” | `bg-accent-strong` |
| `--agent` | #ECE7FB lawenda | **wyłącznie głos agenta** — tło dymku | z `text-agent-foreground` (#2B2360) |
| `--agent-strong` | #3A2E7C | awatar „A” | `bg-agent-strong text-white` |
| `--agent-dot` | #8A7BD6 | propozycje agenta na osi dnia i mapie | kropki, obwódki |
| `--clay` | #B9B3AA | „odrzucone” | tło pod atramentem |
| `--warning` | #F59E0B | ostrzeżenia planu | `bg-warning/10` + ikona |

Zasady:
- Zieleń nigdy nie jest akcją ani ozdobą. Akcja główna = atrament.
- Brzoskwinia i lawenda są jasne — nigdy jako kolor tekstu, zawsze jako tło pod
  ciemnym napisem.
- „Na pewno” i „być może” różnią się jasnością, nie tylko barwą, i zawsze mają
  napis albo `aria-pressed` — tablicę da się odczytać bez rozróżniania kolorów.
- Serce „zapisane” jest atramentowe (`fill-foreground`), nie w kolorze decyzji.

## Kroje

| Klasa | Krój | Do czego |
|---|---|---|
| `font-display` (i `h1–h4`) | Bricolage Grotesque 700, `-0.02em` | tytuły, nazwy miejsc, nagłówki kolumn |
| `font-sans` (domyślny) | Figtree 400–700 | tekst, przyciski, etykiety |
| `font-mono` | Figtree z cyframi tabelarycznymi | godziny, dystanse, liczniki |
| `font-narrow` | Figtree | stare etykiety; nowych nie pisz wersalikami |

- Etykiety sekcji: zdanie małymi literami, `text-[12px] font-bold text-muted-foreground`
  („Atrakcje · 4”, „Wyróżnik”, „Kroje”). Wersaliki z rozstrzałem to styl poprzedni.
- Liczby w kolumnie zawsze `tabular-nums`.
- Skala (px): 11 · 12 · 13 · 14 · 15 · 17 · 19 · 22 · 28 · 44 · 52. Nie dopisuj nowych stopni.

## Kształt i głębia

| Token | Wartość | Gdzie |
|---|---|---|
| `rounded-sm` | 10 px | miniatury w galerii, drobne pola |
| `rounded-md` | 16 px | karty w kolumnach, kafelki faktów, pola formularzy |
| `rounded-lg` / `rounded-2xl` | 22 px | karty w Odkrywaj, kolumny tablicy, panele |
| `rounded-xl` / `rounded-3xl` | 28 px | okna dialogowe |
| `rounded-full` | pigułki | przyciski, zakładki, znaczniki, przełączniki |

Cienie tylko z tokenów: `shadow-token-xs` (karta w kolumnie), `-sm` (pasek
zakładek, pola), `-md` (karty i panele), `-lg` (karta pod kursorem), `-xl` (okno).
Karty nie mają obrysu — głębię daje cień. Bez gradientów (wyjątek: przyciemnienie
pod napisem na zdjęciu). Animacje do 200 ms, bez podskakujących kart.

## Komponenty — składaj, nie odtwarzaj

- **`Button`** — pigułka. Domyślny atramentowy; `outline` biały z obrysem
  i cieniem; `ghost` bez tła. Rozmiary: `sm` 36, `default` 44, `lg` 48 px.
- **`PrzelacznikDecyzji`** (`components/PrzelacznikDecyzji.tsx`) — jedyna pigułka
  decyzji: „Na pewno · Być może · ×” w stałej kolejności, tor `bg-secondary`.
  Używana w Odkrywaj, na tablicy i w oknie miejsca. Nie pisz własnych przycisków
  decyzji.
- **`AgentDymek`** (`components/AgentDymek.tsx`) — jedyny kształt głosu agenta:
  awatar „A” + lawendowy dymek. Agent mówi w pierwszej osobie, obserwacją.
- **`Card`** — biała, `rounded-lg`, `shadow-token-md`, bez obrysu.
- **`DialogContent`** — białe tło, 28 px, bez wewnętrznego marginesu (okno dodaje
  `p-6 gap-4` albo robi własny układ z `p-0`).
- Nawigacja: zakładki jako pigułki w białym pojemniku (`bg-card p-1 shadow-token-sm`),
  aktywna atramentowa.

## Wzorce ekranów

- **Karta w Odkrywaj:** zdjęcie do krawędzi karty, na zdjęciu numer pinezki i stan
  decyzji; pod spodem tytuł `font-display` 19 px, jedna linia faktów, opis, na dole
  `PrzelacznikDecyzji`.
- **Tablica:** kolumny `bg-muted rounded-lg`; nagłówek = kropka + tytuł + licznik
  w kolorze kubełka. Karta w kolumnie jest zwarta (miniatura 56 px, nazwa, jedna
  linia faktów). **Przełącznik decyzji pokazuje się pod kursorem i przy fokusie
  klawiatury**; na ekranie dotykowym (`@media (hover: none)`) jest zawsze widoczny.
- **Okno miejsca:** białe, galeria u góry, fakty jako kafelki `bg-secondary
  rounded-md`, wskazówka jako `AgentDymek`, decyzja `PrzelacznikDecyzji` `lg`.
- **Plan dnia:** miejsca z tablicy zielone, propozycje agenta lawendowe
  (`bg-agent` + obwódka `agent-dot`), nocleg atramentowy domek.

## Copy

Separator `·` w metadanych, czas po polsku (`1 g 30 min`), przecinek dziesiętny
(`1,6 km`). Głos marki: skill `routemarket-glos`.

## Stany pośrednie

Każdy ekran obsługuje: ładowanie (szkielet w kształcie treści, zaślepka zdjęcia
`bg-placeholder-photo` #E7DCCF), pusto (jedno zdanie + jedna akcja), pusto po
filtrach (co odfiltrowało + „Wyczyść filtry”), błąd (co nie wyszło + ponowienie).

## Mobile

Ekrany są projektowane na desktop 1280–1440 px. Wersja mobilna nie jest jeszcze
zaprojektowana — nie improwizuj breakpointów bez pytania. Cele dotyku ≥ 44 px.

## Dostępność

Kontrast tekstu ≥ 4,5:1 (wszystkie pary tokenów wyżej są sprawdzone). Focus zawsze
widoczny (`focus-visible:ring-2 ring-ring`, pierścień atramentowy). Przyciski
z samym znakiem (`×`, ikona) mają `aria-label`.
