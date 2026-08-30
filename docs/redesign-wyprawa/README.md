# Redesign „Wyprawa” — pakiet wdrożeniowy

Ten katalog jest kompletny i samowystarczalny. Wszystko, czego potrzeba do wdrożenia
nowego kierunku wizualnego, leży tutaj — nie trzeba wracać do narzędzia projektowego
ani pytać projektanta o brakujące wartości.

## Kolejność czytania

1. **`zadania.md`** — lista zadań w kolejności wykonania. Każde ma ścieżki plików,
   kryterium odbioru i numer wariantu z prototypu. Zacznij tutaj i idź po kolei.
2. **`kierunek.md`** — dlaczego tak wygląda. Reguły kompozycji, rola kolorów,
   zasady copy, uwagi per ekran. Czytaj przed zadaniem, którego dotyczy.
3. **`tokens.css`** — gotowy do wklejenia blok `:root` z komentarzem przy każdej
   wartości. To jedyny plik, który wkleja się dosłownie.
4. **`prototyp/kierunek-wyprawa.dc.html`** — referencja wizualna. Otwórz w przeglądarce,
   nic nie trzeba budować. Warianty leżą obok siebie, każdy ma widoczną etykietę
   (`3c`, `3d`, …), a `#3e` w adresie przewija do właściwego ekranu.

## Zakres

Osiem ekranów plus zmiana warstwy kolorystycznej całej aplikacji.

| Wariant | Ekran | Trasa | Główny plik |
|---|---|---|---|
| `3c` | Landing | `/` | `pages/Index.tsx` |
| `3d` | Twoje wyjazdy | `/plany` | `pages/TripPlans.tsx` |
| `3e` | Tablica wyjazdu | `/plany/:id` | `components/TripProjects.tsx` |
| `3f` | Plan dni | `/plany/:id/plan` | `components/PlanDayMap.tsx` + widok planu |
| `3g` | Inspiracje | `/tablice` | `pages/Tablice.tsx` |
| `3h` | Odkrywaj | `/odkrywaj` | `pages/Discover.tsx` |
| `3i` | Cudza tablica | `/tablica/:id` | `pages/TablicaPubliczna.tsx` |
| `3j` | 404 | `*` | `pages/NotFound.tsx` |

Warianty `1a`–`2b` w prototypie to odrzucone kierunki. `3a` i `3b` to wcześniejsza
wersja obecnego — zostawione, bo `kierunek.md` tłumaczy na nich, skąd wzięły się
reguły kompozycji. **Implementować wyłącznie `3c`–`3j`.**

## Zasady wiążące

Trzy rzeczy, których nie wolno obejść. Reszta jest opisana w `kierunek.md`.

**Kolor tylko przez tokeny.** Prototyp jest napisany na wartościach hex, bo powstawał
poza aplikacją. Żaden hex nie trafia do kodu. `kierunek.md` ma tabelę mapowania
hex → token; jeżeli jakiejś wartości w niej nie ma, znaczy że nie powinna się pojawić.

**Szałwia `--primary` wyłącznie przy stanie „na pewno”.** Nie na przyciskach akcji.
Akcje główne są orzechowe: `bg-foreground text-background`. To nie jest preferencja
estetyczna — od tego zależy, czy jeden rzut oka na ekran mówi, ile jest zdecydowane.

**Terakota `--accent` oznacza dwie rzeczy: „być może” i głos agenta.** Nigdy akcję.

## Czego tu nie ma

Wersji mobilnej, karty pojedynczego miejsca, profilu, ustawień, kreatora v2, panelu
admina i stron legal. Te ekrany dostają nowy papier automatycznie razem z tokenami
(zadanie Z0), ale nie mają przeprojektowanych układów.

Brakuje też stanów pośrednich: ładowania, błędu sieci, pustej tablicy, pustego wyniku
filtrów. Do zbudowania na podstawie reguł z `kierunek.md`, nie z prototypu.
