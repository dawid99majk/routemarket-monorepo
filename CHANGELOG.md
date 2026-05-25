# RouteMarket & Atlas Engine - Rejestr Zmian (Changelog)

Niniejszy plik stanowi oficjalną, szczegółową historię zmian wdrożonych na serwerze VPS (`meeting-vps`) oraz w architekturze projektu Routemarket / Atlas. Służy do zapobiegania dublowaniu rozwiązań i zachowania spójności wiedzy o systemie.

---

## 📅 Ostatnia aktualizacja: 25 Maja 2026

### 🚀 Najnowsze wdrożenia & Poprawki krytyczne

#### 11. Naprawa crashu mapy GPX (Maximum call stack size exceeded) [FRONTEND]
* **Problem**: Wgrywanie śladów GPX o wysokiej rozdzielczości (np. trasy Dolomity mającej ponad 10 000 punktów współrzędnych) powodowało całkowity zawias przeglądarki i błąd "Maximum call stack size exceeded".
* **Przyczyna**: Trójwymiarowe i dwuwymiarowe komponenty map (`RouteExplorerGlobe.tsx`, `RouteGlobe3D.tsx`, `RouteTerrain3D.tsx` oraz strona edycji `EditRoute.tsx`) używały operatora rozwijania spread (`...`) do wyznaczania minimów i maksimów współrzędnych trasy (np. `Math.min(...lats)`). Przekazywanie tak olbrzymiej liczby argumentów do funkcji przekraczało dopuszczalną wielkość stosu wywołań V8.
* **Rozwiązanie**: Zastąpiono operator spread we wszystkich czterech komponentach bezpiecznymi, wydajnymi pętlami redukcyjnymi (`.reduce()`), co całkowicie eliminuje ryzyko przepełnienia stosu.
* **Pliki**:
  * [RouteExplorerGlobe.tsx](file:///root/routemarket-workspace/apps/frontend/src/components/RouteExplorerGlobe.tsx)
  * [RouteGlobe3D.tsx](file:///root/routemarket-workspace/apps/frontend/src/components/RouteGlobe3D.tsx)
  * [RouteTerrain3D.tsx](file:///root/routemarket-workspace/apps/frontend/src/components/RouteTerrain3D.tsx)
  * [EditRoute.tsx](file:///root/routemarket-workspace/apps/frontend/src/pages/EditRoute.tsx)

#### 12. Prezentacja pełnej Koncepcji Trasy (Master Blueprint) zamiast staba [FRONTEND]
* **Problem**: W kroku „Koncepcja Trasy” (zakładka 3. Konspekt) zamiast szczegółowego planu wygenerowanego przez AI wyświetlał się uproszczony, 5-punktowy szablon konspektu (Outline for dolomity, Introduction, Key Highlights, itp.).
* **Przyczyna**: Generowanie koncepcji przez AI tworzyło bogaty plik `route_concept.md` (mający ponad 13 KB), ale frontend w ogóle go nie pobierał. Zamiast tego ładował plik `guide_outline.md` będący uproszczonym konspektem, a hook `useAtlasProjectWorkspace.ts` nie rozróżniał tych plików.
* **Rozwiązanie**: 
  1. Dodano osobny stan `concept` w hooku roboczym kreatora oraz logikę pobierającą `route_concept.md` z API.
  2. Zaktualizowano komponent `ConceptStep.tsx` w `CreatorAiStudio.tsx`, aby przyjmował rzeczywistą koncepcję jako priorytetowy parametr (`concept={artifacts.concept || artifacts.outline}`), zachowując konspekt jako bezpieczny fallback.
* **Pliki**:
  * [useAtlasProjectWorkspace.ts](file:///root/routemarket-workspace/apps/frontend/src/features/creator/hooks/useAtlasProjectWorkspace.ts)
  * [CreatorAiStudio.tsx](file:///root/routemarket-workspace/apps/frontend/src/pages/CreatorAiStudio.tsx)

#### 1. Naprawa błędu 500 w Wywiadzie AI (Duże pliki opisu trasy) [FUNKCJA BRZEGOWA]
* **Problem**: Podczas klikania odpowiedzi w wywiadzie frontend wyrzucał błąd `Błąd wywiadu AI: Edge Function returned a non-2xx status code` (HTTP 500).
* **Przyczyna**: Funkcja brzegowa `atlas-interview` posiadała twardy limit bezpieczeństwa na długość notatek (`context.notes.length > 20000`). Po wgraniu przez użytkownika dużego opisu trasy (np. pliku `Planowanie-Trekingu-Dolomity_-Trasa-Alternatywna.txt` mającego **54 595** znaków), funkcja przy każdym zapytaniu wyrzucała błąd `Notes too long.`, zrywając wywiad.
* **Rozwiązanie**: Usunięto warunek wyrzucający błąd 500. Wdrożono bezpieczne przycinanie (slicing) tekstu do maksymalnie `30000` znaków (`.slice(0, 30000)`) przed przesłaniem promptu do Gemini.
* **Plik**: [supabase/functions/atlas-interview/index.ts](file:///root/routemarket-workspace/supabase/functions/atlas-interview/index.ts)

#### 2. Przekierowanie ruchu Supabase Edge Functions na VPS [ARCHITEKTURA]
* **Problem**: Kreator tras "mielił się" w nieskończoność przy ładowaniu konspektu i generowaniu śladu, a dane projektów znikały po restarcie kontenerów.
* **Przyczyna**: Funkcje brzegowe Supabase (`atlas-admin` oraz `atlas-interview`) były skonfigurowane tak, aby przekazywać wszystkie żądania API do bezstanowej instancji Google Cloud Run. Z powodu braku trwałego wolumenu dyskowego na Cloud Run oraz usypiania instancji (scale to zero), pliki projektów oraz stany in-memory zadań były permanentnie tracone.
* **Rozwiązanie**: Przekierowano zmienną środowiskową `ATLAS_API_BASE_URL` w pliku `.env` lokalnego stosu Supabase z adresu Cloud Run na wewnętrzny alias sieciowy Dockera lokalnego backendu VPS. Wszystkie pliki i dane są teraz w 100% trwałe na dysku VPS.
* **Konfiguracja**: Plik `/root/supabase-self-hosted/.env` -> `ATLAS_API_BASE_URL=http://atlas-api:8787`

#### 3. Naprawa statusu zdrowia kontenera API (wget na Node healthcheck.js) [SYSTEM]
* **Problem**: Kontener backendowy `deploy-atlas-api-1` był ciągle oznaczony w Dockerze jako `unhealthy`, co blokowało stabilne kierowanie ruchu sieciowego.
* **Przyczyna**: Domyślny test zdrowia (healthcheck) w compose wywoływał polecenie `wget`, którego nie ma w bazowym obrazie `node:24-slim`.
* **Rozwiązanie**: 
  1. Zastąpiono test `wget` wywołaniem skryptu Node: `test: ["CMD", "node", "healthcheck.js"]`.
  2. Naprawiono błąd `ReferenceError: require is not defined` w skrypcie `healthcheck.js` (projekt używa typu ES Modules, więc CommonJS `require` powodował crash). Skrypt został przepisany w całości na składnię ESM (`import http from 'node:http'`).
  3. Kontener API raportuje teraz pełny status **healthy** (`Up (healthy)`).
* **Pliki**: 
  * [docker-compose.vps.yml](file:///root/routemarket-workspace/apps/atlas-engine/deploy/docker-compose.vps.yml)
  * [healthcheck.js](file:///root/routemarket-workspace/healthcheck.js)

---

### 🛠️ Poprzednio zrealizowane poprawki w projekcie

#### 4. Usunięcie błędu infinite loop (Krok 1/2 w Kreatorze) [FRONTEND]
* **Problem**: Frontend blokował się w pętli na krokach 1/2 podczas tworzenia projektu.
* **Rozwiązanie**: Frontend czyta teraz bezpośredni, rzeczywisty `workflow_state` z API Atlasa i automatycznie odzyskuje statusy aktywnych jobów zamiast wymuszać cofanie się do pierwszego kroku.

#### 5. Dedykowany endpoint dla wiszących zadań [BACKEND]
* **Rozwiązanie**: Wdrożono nowy endpoint `GET /projects/:slug/jobs`, dzięki któremu UI potrafi zlokalizować wiszące/uruchomione zadanie w tle i wznowić jego wyświetlanie zamiast blokować interfejs użytkownika.

#### 6. Naprawa błędu renderowania kroku GPX [GpxStep.tsx]
* **Problem**: Krok zatwierdzania śladu GPX (`gpx_summary_approval`) zawieszał stronę i uniemożliwiał kliknięcie czegokolwiek.
* **Przyczyna**: Błąd typowania i dopasowania właściwości (prop mismatch) w `GpxStep.tsx`. Komponent mapy 3D `RouteTerrain3D` oczekiwał sparsowanej tablicy współrzędnych `track` (`[number, number][]`), a otrzymywał surowy ciąg XML jako `gpxData`. Brak tablicy wywoływał runtime crash Reacta.
* **Rozwiązanie**: Zintegrowano parser XML `parseGpx`, który wyciąga współrzędne, dystans oraz przewyższenia. Dodano mechanizm obronny (try/catch z ikoną ostrzeżenia w przypadku uszkodzonego pliku XML) oraz podpięto realne statystyki dystansu i wzniosów zamiast twardo wpisanych kreskówek `-- km`.

#### 7. Dodanie interaktywnej strefy wgrywania śladu (No-GPX Fallback) [FRONTEND]
* **Problem**: Projekty tworzone wyłącznie na notatkach tekstowych/YouTube nie generowały śladu GPX, co skutkowało nieskończonym kręceniem się ikonki ładowania `"Przygotowywanie śladu..."`.
* **Rozwiązanie**: Gdy projekt nie posiada pliku GPX, nieskończony loader jest zastępowany luksusową strefą informacyjną **"Brak śladu GPX w projekcie"** z dedykowanym przyciskiem **"Wgraj plik GPX"**, który automatycznie wgrywa plik, aktualizuje bazę i odświeża interfejs (3D map).

#### 8. Rozwiązanie problemów z uprawnieniami zapisu (EACCES) [BACKEND]
* **Problem**: Backend API crashował przy próbie zapisu stanu zadań w pliku `jobs_persistence.json` z powodu błędu uprawnień.
* **Rozwiązanie**: Poprawiono uprawnienia w kontenerze API – katalogi `/app/data` oraz `/app/routes` (zmapowane jako wolumeny Docker na VPS) zostały zrekursywnowane prawami własności dla użytkownika `nodejs:nodejs`.

#### 9. Naprawa symbolic-link w Dockerfile (Błąd Module Not Found) [DOCKER]
* **Problem**: Kontener API nie mógł wystartować z powodu braku modułów wewnętrznych (np. `@routemarket/atlas-workflow`).
* **Rozwiązanie**: Workspace pnpm tworzył dowiązania symboliczne do wirtualnego magazynu `.pnpm`. Podczas budowania obrazu dowiązania te były uszkadzane. Dodano pętlę w `Dockerfile` (runner stage), która fizycznie kopiuje skompilowane pliki `.js` do katalogów pnpm wewnątrz kontenera.

#### 10. Naprawa importu z YouTube [AI & IMPORT]
* **Problem**: Import tras z wideo YouTube był sztucznie symulowany (mocki z trasami w Bieszczadach).
* **Rozwiązanie**: Zaimplementowano rzeczywiste geokodowanie i analizę Gemini. System generuje realne współrzędne, zapisuje pliki `route.gpx` oraz `poi.geojson` bezpośrednio w folderze projektu, a w przypadku braku danych w wideo – uczciwie komunikuje brak szczegółów trasowych zamiast generować losowe punkty.
