# Zestaw startowy kont RouteMarket

Wszystko, co trzeba mieć pod ręką, zakładając konta w mediach. Głos według skilla
`routemarket-glos`: liczby zamiast przymiotników, bez emoji i wykrzykników, ograniczenia
mówione wprost. Grafiki: `node marka.mjs` → `wyniki/marka/`.

## Nazwa i adresy

- Nazwa wszędzie: **routemarket** (małymi literami, jak znak słowny w aplikacji). Jeśli
  jest zajęta: `routemarket.io`, potem `route.market`. Nie dopisywać cyfr ani „official”.
- Adres w bio: `https://routemarket.io/?utm_source=<platforma>&utm_medium=social&utm_campaign=bio`
  (platforma: instagram, tiktok, pinterest, facebook, youtube). Bio jest jedynym miejscem,
  gdzie link klika się bezpośrednio, więc tu jest jego znacznik kampanii.
- Adres e-mail konta: kontakt@ — ten sam co w `/contact`. Nie używać prywatnego.

## Grafiki

| Gdzie | Plik | Wymiar |
|---|---|---|
| Zdjęcie profilowe (wszędzie) | `awatar.png` | 1080×1080, kadrowane do koła — znak mieści się w kole |
| Okładka Facebooka | `okladka-facebook.png` | 1640×624, treść w środkowych 1000 px |
| Baner YouTube | `baner-youtube.png` | 2560×1440, treść w bezpiecznej strefie 1546×423 |
| Podgląd linku | `og-image.png` | 1200×630, już na stronie |

## Bio

Długości policzone; limity: Instagram 150, TikTok 80, Facebook „intro” 101.

**Instagram** (88 znaków z 150)
```
Zbierz miejsca. Resztę ułoży agent.
Plan dni z godzinami otwarcia i plik GPX. Bez karty.
```

**TikTok** (48 znaków z 80)
```
Ile dni naprawdę na miasto. Plan dni i plik GPX.
```

**Facebook, intro** (58 znaków z 101)
```
Planer wyjazdów: plan dni z godzinami otwarcia i plik GPX.
```

**Pinterest, o nas** (do 500 znaków)
```
Zbierasz miejsca, które chcesz zobaczyć. Agent RouteMarket układa z nich plan na każdy dzień: z godzinami otwarcia, kolejnością i czasem dojścia. Na końcu dostajesz plik GPX do zegarka albo nawigacji. Tablice z miastami, czasem zwiedzania każdego miejsca i uczciwą odpowiedzią na pytanie, ile to dni.
```

**YouTube, opis kanału**
```
RouteMarket to planer wyjazdów. Pokazujemy, ile czasu zajmuje zwiedzanie każdego miejsca w mieście i ile to naprawdę dni. Krótkie filmy z danych katalogu: OpenStreetMap i Wikipedia. Plan dni z godzinami otwarcia i plik GPX: routemarket.io
```

## Instagram: odświeżenie istniejącego konta (`routemarket.io`)

Konto powstało w czasach marketplace (10 obserwujących, ~56 obserwowanych, bio „Marketplace for GPX + PDF guide”,
posty z okładkami tras). Użytkownik zostaje przy nazwie `routemarket.io`; zmienia się treść.
Kolejność ma znaczenie: najpierw ukryć stare, dopiero potem zmienić bio, żeby nikt nie trafił
na nowe bio nad starą siatką.

1. **Zarchiwizuj stare posty, nie usuwaj.** Archiwum jest odwracalne, usunięcie nie. Profil → post → ⋯ →
   „Archiwizuj”. Zrobić dla każdego posta z okładką trasy, o marketplace, GPX i PDF-ach. Zostawić tylko to,
   co pasuje do planera (jeśli nic — profil będzie pusty do pierwszej publikacji, i to jest w porządku).
2. **Zmień na konto firmowe/twórcy**, jeśli jeszcze nie jest (Ustawienia → Rodzaj konta), z kategorią
   „Strona internetowa” albo „Aplikacja”. Powiąż ze stroną na Facebooku (Ustawienia → Centrum kont);
   bez tego Meta Business Suite nie zaplanuje postów.
3. **Zdjęcie profilowe:** `wyniki/marka/awatar.png` (stare to globus z czasów marketplace).
4. **Nazwa (pole wyszukiwane, do 64 znaków):** `routemarket — planer wyjazdów`
5. **Bio:** tekst z sekcji „Bio → Instagram” wyżej (88 znaków).
6. **Link w bio:** `https://routemarket.io/?utm_source=instagram&utm_medium=social&utm_campaign=bio`
7. **Wyróżnione stories:** usuń stare (jeśli są), dodaj „Jak to działa”, „Miasta”, „GPX”, „Pytania”.
8. **Nie publikuj**, dopóki nie ma przejrzanej paczki na cały tydzień.

Uwaga: 56 obserwowanych przy 10 obserwujących wygląda jak konto, które obserwuje na hurt. Przed
publikacją warto przejrzeć listę i odobserwować konta niezwiązane z podróżami; nie robić tego masowo
(limity Instagrama mogą zablokować akcję).

## Facebook: strona

Profil `profile.php?id=61576693332835` jest wpisany do danych strukturalnych strony. Sprawdź, że to
**strona** (Page), a nie profil prywatny: strona ma przycisk „Lubię to” i osobne ustawienia w Meta
Business Suite. Jeśli to profil prywatny, załóż stronę i przekaż nowy adres.

## Pinterest: tablice do założenia

Nazwa tablicy to fraza, którą ludzie wpisują. Opis 1–2 zdania z liczbą.
Na start osiem, po jednej na miasto z pierwszej paczki:

| Tablica | Opis |
|---|---|
| Co zobaczyć w Rzymie | Dwanaście najważniejszych miejsc Rzymu z czasem zwiedzania każdego i odpowiedzią, ile to dni. |
| Co zobaczyć w Paryżu | Najważniejsze miejsca Paryża z czasem zwiedzania. Plan dni z godzinami otwarcia. |
| Co zobaczyć w Pradze | Najważniejsze miejsca Pragi z czasem zwiedzania. Plan dni z godzinami otwarcia. |
| Co zobaczyć w Lizbonie | Najważniejsze miejsca Lizbony z czasem zwiedzania. Plan dni z godzinami otwarcia. |
| Co zobaczyć w Barcelonie | Najważniejsze miejsca Barcelony z czasem zwiedzania. Plan dni z godzinami otwarcia. |
| Co zobaczyć w Krakowie | Najważniejsze miejsca Krakowa z czasem zwiedzania. Plan dni z godzinami otwarcia. |
| Co zobaczyć we Wrocławiu | Najważniejsze miejsca Wrocławia z czasem zwiedzania. Plan dni z godzinami otwarcia. |
| Ile dni na miasto | Ile naprawdę dni zajmuje zwiedzanie: suma czasu miejsc z listy „co zobaczyć”. |

Pin zapisuje się na tablicę odpowiadającą miastu; pin ogólny („Ile dni”) na ostatnią.
Odmianę „w Rzymie”, „we Wrocławiu” dla dowolnego miasta z katalogu daje `lib/formaty.mjs`.

## Instagram: wyróżnione stories (highlights)

| Nazwa | Zawartość |
|---|---|
| Jak to działa | cztery kroki ze strony głównej: miasto, miejsca, trzy kubełki, plan i GPX |
| Miasta | story z okładką każdej paczki miasta, po jednym na miasto |
| GPX | jak otworzyć plik w Garminie, Suunto, Organic Maps, Komoocie |
| Pytania | odpowiedzi z sekcji niżej |

## Pierwszy tydzień publikacji

Pierwszy post to nie „jesteśmy!”, tylko konkret. Kolejność:

1. Karuzela z pierwszej paczki tygodnia (`wyniki/tydzien-<data>/1-…/karuzela`), podpis z `podpisy.md`.
2. Rolka z tego samego tematu następnego dnia.
3. Pin do odpowiedniej tablicy Pinteresta tego samego dnia.
4. Story z odesłaniem do karuzeli.

Reszta wg `kalendarz.csv`. Konto z trzema postami wygląda na prowadzone; z jednym na porzucone,
więc **nie zaczynać publikowania, dopóki paczka na cały tydzień nie jest przejrzana**.

## Odpowiedzi na komentarze (szkice)

Zawsze przejrzeć przed wysłaniem; wysyła człowiek. Stan produktu sprawdzać, zanim się zacytuje
— poniższe zdania są prawdziwe na 29.09.2026.

**Czy to jest darmowe?**
> Zbieranie miejsc i tablice są darmowe. Za ułożenie planu płaci się tokenami — na start jest pula powitalna, bez karty. Kupić tokeny jeszcze nie można.

**Jest aplikacja na telefon?**
> Wersja przeglądarkowa działa na telefonie już teraz. Aplikacje iOS i Android są w przygotowaniu.

**Czy działa dla [miasto]?**
> Katalog ma dziś 34 miasta (lista na routemarket.io/tablice). Innego miasta możesz wpisać na stronie głównej — agent zbierze pierwsze miejsca z OpenStreetMap.

**Skąd godziny otwarcia?**
> Z OpenStreetMap. Planer sprawdza na nich, czy zdążysz wejść przed zamknięciem. Nie każde miejsce ma godziny wpisane — takie warto sprawdzić przed wyjazdem.

**Dlaczego 6 godzin dziennie?**
> To założenie do policzenia, ile dni potrzeba na samo zwiedzanie: bez dojść i jedzenia. W planie możesz ustawić własny limit, np. cztery godziny dziennie.

**Skąd zdjęcia?**
> Z Wikimedia Commons. Autor i licencja są pod zdjęciem na stronie, a w postach na ostatnim slajdzie i w pierwszym komentarzu.

**Krytyka albo błąd w danych**
> Dziękuję, sprawdzę. Napisz na kontakt@routemarket.io, do którego miejsca i co się nie zgadza — poprawię w katalogu.

Nie odpowiadać: na zaczepki, na pytania o rzeczy, których nie ma (biletach, rezerwacjach,
opiniach użytkowników). Przy pytaniu o coś, czego produkt nie robi, jedno zdanie: „Tego jeszcze nie ma.”

## Grupy na Facebooku

Praca ręczna i ostrożna — to najłatwiejszy sposób na zbanowanie domeny.

- Nie wklejać linku w poście założycielskim. Najpierw odpowiadać na cudze pytania o plan
  („ile dni na Rzym?”) konkretem z katalogu: liczbą godzin i kilkoma miejscami.
- Link dopiero, gdy ktoś o niego prosi albo gdy tablica dokładnie odpowiada na pytanie,
  i wtedy z informacją, że to projekt autora. Nie ukrywać powiązania.
- Przeczytać regulamin grupy; wiele zakazuje linków własnych. Jeden wątek dziennie w jednej
  grupie to maksimum.

## Konfiguracja narzędzi

1. **Meta Business Suite** (business.facebook.com): połączyć stronę Facebook i konto Instagram
   (konto Instagram firmowe/twórcy, powiązane ze stroną). Planowanie postów, karuzel, rolek i stories.
2. **Buffer, plan darmowy**: podłączyć TikTok, Pinterest i YouTube (3 kanały; kolejka 10 postów
   na kanał). `kalendarz.csv` podaje godziny; pliki bierzesz z folderu paczki.
3. **Pinterest**: przełączyć na konto firmowe (bezpłatne), potwierdzić domenę `routemarket.io`.
   Wybierz metodę „znacznik HTML” i przekaż mi kod — dopiszę go do `index.html` i wdrożę.
4. **Google Search Console / GA4**: już podłączone. W GA4 oznaczyć zdarzenia kluczowe
   (`sign_up`, `tablica_utworzona`, `plan_ulozony`).
