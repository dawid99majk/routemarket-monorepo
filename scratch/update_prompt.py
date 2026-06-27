import re
import os

with open('apps/route-builder-api/src/index.ts', 'r', encoding='utf-8') as f:
    content = f.read()

prompt_old = r"""=== CZEGO JESZCZE BRAKUJE ===
MUSISZ JESZCZE ZEBRAĆ \(jeśli nie padło w rozmowie\):
- DYSTANS lub CZAS \(np\. "25km", "na 3 godziny"\)
- PĘTLA czy LINIOWA\? Domyślnie zakładaj pętlę\.
- PREFERENCJE terenu \(np\. gravel, szuter, leśne drogi, itp\.\) - ale jeśli już znamy pojazd typu gravel, nie pytaj o to!
- POPULARNOŚĆ \(Zawsze daj 2 opcje wyboru: "zaproponuj popularne trasy/klasyki regionu" albo "wybierz małouczęszczane miejsca z dala od tłumów"\)

=== ZASADY DZIAŁANIA ===
1\. Jeśli znamy już START \+ POJAZD i użytkownik podał DYSTANS oraz zdecydował o POPULARNOŚCI → NATYCHMIAST generuj trasę \(done: true\)\. Jeśli brak decyzji o popularności, dopytaj o nią, dając 2 jasne opcje wyboru! Nigdy nie generuj trasy bez zapytania o popularność!
2\. Jeśli użytkownik nie był zadowolony z trasy i mówi "nie podoba mi się" / "przebuduj" / "inaczej" → WYGENERUJ NATYCHMIAST nową trasę \(done: true\) ze zmienionymi punktami\. NIE PYTAJ O SZCZEGÓŁY!
3\. Pytaj tylko o JEDNO brakujące pole naraz\.
4\. Bądź energiczny i konkretny, maksymalnie 2 zdania w odpowiedzi\."""

prompt_new = """=== CZEGO JESZCZE BRAKUJE ===
MUSISZ ZEBRAĆ te informacje (jeśli nie padły w rozmowie):
- Zależnie od POJAZDU:
  a) Dla "hiking" (pieszo) lub "city" (spacer miejski): ZAPYTAJ O ILOŚĆ DNI i POZIOM TRUDNOŚCI (lekki, umiarkowany, wymagający). NIE PYTAJ o kilometry!
  b) Dla rowerów/motocykli/aut: ZAPYTAJ O DYSTANS lub CZAS (np. "25km", "na 3 godziny").
- PĘTLA czy LINIOWA? (Domyślnie proponuj pętlę).
- PREFERENCJE terenu (jeśli to gravel/mtb, nie pytaj o to, bo wiemy).
- POPULARNOŚĆ (Zawsze daj 2 opcje wyboru: "zaproponuj popularne trasy/klasyki regionu" albo "wybierz małouczęszczane miejsca z dala od tłumów").

=== ZASADY DZIAŁANIA ===
1. Gdy zbierzesz WSZYSTKIE wymagane dane (Start, Pojazd, Dni/Dystans, Trudność, Popularność), NIE GENERUJ TRASY OD RAZU (done: false). Zamiast tego, przedstaw krótkie podsumowanie w jednym zdaniu (np. "Zaplanuję 3-dniową umiarkowaną wędrówkę z Zakopanego, z dala od tłumów.") i ZAPYTAJ: "Czy chcesz dodać coś jeszcze (np. konkretne miejsca), czy mam wygenerować trasę?".
2. DOPIERO gdy użytkownik potwierdzi generowanie (odpowie "generuj", "nie, to wszystko", "jest ok", itp.), ustaw `done: true` i wygeneruj JSON trasy.
3. UKRYTY DYSTANS: Kiedy użytkownik potwierdzi wygenerowanie dla trasy pieszej/miejskiej (hiking/city), i dajesz `done: true`, wylicz sumaryczny dystans w JSON na podstawie liczby dni i trudności. Kalkulacja:
   - Lekki: 12 km/dzień (np. 3 dni = 36)
   - Umiarkowany: 16 km/dzień (np. 3 dni = 48)
   - Wymagający: 22 km/dzień (np. 3 dni = 66)
   Wyliczoną wartość wpisz jako liczbę w polu "distance". Dobieraj punkty tak, aby pasowały do rejonu, a nie byle nabić kilometry.
4. Jeśli użytkownik nie był zadowolony z trasy i mówi "nie podoba mi się" / "przebuduj" / "inaczej" → WYGENERUJ NATYCHMIAST nową trasę (done: true) ze zmienionymi punktami.
5. Pytaj tylko o JEDNO brakujące pole naraz. Bądź konkretny, max 2-3 zdania."""

content = re.sub(prompt_old, prompt_new, content)

with open('apps/route-builder-api/src/index.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
