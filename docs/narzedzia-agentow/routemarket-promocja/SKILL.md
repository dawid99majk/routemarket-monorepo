---
name: routemarket-promocja
description: Promocja routemarket.io w mediach — fabryka gotowych karuzel, rolek, pinów i stories z katalogu i publicznych tablic, tygodniowy kalendarz publikacji, licencje zdjęć i próg zatwierdzania. Użyj, gdy trzeba przygotować posty, rolki, paczkę na tydzień, sprawdzić materiał przed publikacją albo dołożyć nowy format.
---

# Promocja RouteMarket

Materiały robi fabryka: `~/Documents/routemarket-fabryka` na Macu (kod w repo:
`marketing/fabryka`, README tamże). Plan promocji z audytem, kanałami i narzędziami:
https://claude.ai/code/artifact — „Plan promocji RouteMarket” (lista artefaktów).

## Polecenia

```bash
cd ~/Documents/routemarket-fabryka
node fabryka.mjs tematy                   # tablice i miasta do wyboru
node fabryka.mjs miasto "Rzym"            # paczka z katalogu miasta
node fabryka.mjs tablica <id>             # paczka z publicznej tablicy
node fabryka.mjs tydzien --od RRRR-MM-DD  # 3 tematy + kalendarz.csv (12 publikacji)
node og.mjs && node marka.mjs             # obrazek podglądu linku, logo, awatar, favicon
```

Paczka tygodniowa powstaje sama w piątek o 16:00 (launchd `io.routemarket.fabryka`,
log `wyniki/tydzien.log`). Wynik: `wyniki/tydzien-<data>/tydzien.html` + podglad.html per temat.

## Próg zatwierdzania — nie do negocjacji

Publikacja na zewnątrz jest w modelu operacyjnym czynnością „do zatwierdzenia”.
Claude generuje, przegląda i pisze szkice; **nie publikuje, nie planuje postów
w narzędziach i nie odpowiada ludziom w imieniu RouteMarketu**. Dawid przegląda
podgląd i sam wrzuca/planuje (Meta Business Suite dla IG+FB, Buffer dla TikToka,
Pinteresta i Shorts). Przyszła integracja z API Buffera może wkładać do kolejki
wyłącznie paczki oznaczone jako zatwierdzone — osobnym krokiem.

## Zdjęcia: licencja albo nic

- Dozwolone: domena publiczna, CC0, CC BY, CC BY-SA. Odrzucane: NC, ND, fair use,
  licencje nierozpoznane, pliki z wiki językowych. Logika: `lib/zdjecia.mjs`.
- Podpis „Fot. autor · licencja · Wikimedia Commons” stoi na KAŻDYM zdjęciu;
  szablon bez podpisu rzuca błąd. Pełna lista (tytuł, autor, licencja z adresem,
  strona pliku) — ostatni slajd karuzeli, podpis posta, `zrodla-zdjec.txt`
  (na Instagramie: pierwszy komentarz).
- Nigdy nie obchodzić filtra „bo to ładniejsze zdjęcie”. Miejsce bez dozwolonego
  zdjęcia wypada z materiału.
- Muzyki nie wtapiamy w plik — dobiera się ją w aplikacji z biblioteki dla kont firmowych.

## Tekst

Głos: skill `routemarket-glos`. W skrócie: liczba zamiast przymiotnika, bez emoji
i wykrzykników, ograniczenie mówione wprost, nazwy własne bez tłumaczenia.
Liczby w materiałach składa kod z bazy (`lib/teksty.mjs`) — nie przepisywać ich
modelem. Przypadki nazw miast: `PRZYPADKI` w `lib/formaty.mjs` („we Wrocławiu”);
nowe miasto w katalogu = nowy wpis, inaczej zdania z dwukropkiem.

## Przegląd paczki przed oddaniem Dawidowi

1. Liczby na okładce i w dymku agenta zgadzają się z tablicą (otwórz adres z podpisy.md).
2. Na każdym zdjęciu widać podpis; autor nie jest śmieciem z pola Artist
   („Own work”, „(talk)”, zdanie zamiast nazwiska) — poprawka w `czyscAutora`.
3. Okładka nie powtarza zdjęcia pierwszego slajdu.
4. Pierwsza klatka rolki ma czytelny tytuł (z niej powstaje miniatura).
5. Nic nie obiecuje funkcji, których nie ma (offline, nawigacja, aplikacje mobilne).

## Pułapki

- Chromium z Playwrighta musi pasować do wersji pakietu (`playwright@1.57.0` ↔ `chromium-1200`).
- Kroje idą z Google Fonts; `lib/render.mjs` przerywa, gdy Bricolage się nie wczyta —
  bez sieci fabryka nie działa, i dobrze, bo inaczej wyszłyby slajdy systemowym krojem.
- Znak marki to romb „RM” z `apps/frontend/src/components/Logo.tsx` (`znak()` w szablonach);
  nie wymyślać innego.
- Strona: nowa trasa w App.tsx wymaga wpisu w mapie `rm_znana_sciezka` w
  `routemarket.io.nginx`, inaczej dostanie 404.
- Treść dla robotów: `<!--tresc-->…<!--/tresc-->` w index.html to strona główna;
  wizytówki w API (`services/wizytowki.ts`) podmieniają ten blok na podstronach.
