# Wytyczne Deweloperskie & Logika Biznesowa (Maj 2026)

Poniższe notatki zawierają kluczowe informacje o architekturze i logice wprowadzonej podczas ostatnich sesji. Są niezbędne do zachowania spójności przy dalszym rozwoju projektów **RouteMarket** i **Atlas**.

## 🚀 Wdrażanie na VPS — kolejność kroków

### Frontend: Docker NIE buduje aplikacji!
`apps/frontend/Dockerfile` zawiera wyłącznie `COPY apps/frontend/dist /usr/share/nginx/html`. Uruchomienie samego `docker compose build frontend` **nie przebuduje aplikacji** — spakuje stary katalog `dist`, warstwa COPY pokaże `CACHED`, a compose i tak wypisze „Image Built". Zmiany w kodzie po cichu nie trafią na produkcję.

Poprawna kolejność:
```bash
cd /root/routemarket-workspace/apps/frontend
npm run build                       # Vite -> regeneruje dist/
docker compose build frontend
docker compose up -d frontend
```
Weryfikacja (nie ufaj komunikatowi „Built"):
```bash
docker images routemarket-frontend:latest --format "{{.CreatedSince}}"   # ma być "seconds ago"
docker exec frontend-frontend-1 grep -l "<unikalny tekst ze zmiany>" /usr/share/nginx/html/assets/*.js
```

### Backend (route-builder-api / atlas-api): buduje się w Dockerze
```bash
cd /root/routemarket-workspace/apps/atlas-engine/deploy
docker compose -f docker-compose.vps.yml build route-builder-api
docker compose -f docker-compose.vps.yml up -d route-builder-api
```
Build kompiluje TypeScript, więc błędy typów zatrzymają wdrożenie — warto filtrować log po `error TS`.
Uwaga: budowanie trwa kilka minut; przy uruchamianiu przez SSH w tle użyj `nohup`, inaczej zerwana sesja zabije build (exit 255).

---

## 🧠 Silnik AI & Agent Atlas (Wywiad)

### 1. Priorytet Notatek (Zasada Naczelna)
Agent wywiadu (`atlas-interview`) ma surowo zabronione zadawanie pytań o dane, które użytkownik podał już w notatkach tekstowych lub dokumentach PDF.
*   **Logika**: Przed zadaniem pytania AI analizuje `mergedContext.notes`. Jeśli notatka zawiera frazę "20 km" lub "noclegi w schroniskach", agent musi te fakty uznać za "ustalone" i pominąć pytania o dystans/nocleg.
*   **Kluczowy Plik**: `supabase/functions/atlas-interview/index.ts` (sekcja `prompt`).

### 2. Wymuszanie Punktu Startowego
Główną przyczyną generowania "opisów tras bez trasy" był brak precyzyjnego punktu startowego. 
*   **Zalecenie**: Jeśli w notatkach brakuje konkretnej miejscowości/punktu startu, agent **musi** o to zapytać w pierwszej kolejności. Bez tego silnik GPX nie jest w stanie wyznaczyć realnego śladu drogowego.

### 3. Workflow "Zero redundantnych kliknięć"
Po zakończeniu wywiadu, odpowiedzi są zapisywane w `interview_answers.md`. System powinien dążyć do automatycznego zatwierdzania etapu `claims_approval`, jeśli fakty w nim zawarte pokrywają się z odpowiedziami z wywiadu.

## 🗺️ System Map (2D/3D)

### 1. Wyświetlanie 2D (Leaflet)
*   **Problemy z budowaniem**: Leaflet w Vite/React często gubi ścieżki do ikon markerów. Zawsze używaj jawnego mapowania ikon do CDN (np. unpkg lub jsdelivr) w komponencie mapy.
*   **InvalidateSize**: Mapy Leaflet wewnątrz zakładek (Tabs) lub dynamicznych kontenerów wymagają wywołania `map.invalidateSize()` po krótkim opóźnieniu (~250ms) od zamontowania, inaczej renderują się jako szare pole.
*   **Kontrast**: Stosuj "poświatę" (biała polilinia pod główną linią trasy), aby trasa była widoczna na zdjęciach satelitarnych.

### 2. Wyświetlanie 3D (Three.js / Terrain)
*   **Styl Neonowy**: Aby trasa była czytelna na ciemnym terenie, używamy materiałów emisyjnych (`MeshStandardMaterial` z `emissive` i `emissiveIntensity > 2`).
*   **Warstwa Halo**: Dodatkowa rura (`TubeGeometry`) o większym promieniu i niskiej oporności (`opacity: 0.2`) wokół trasy tworzy efekt poświaty, który maskuje niedoskonałości terenu.

## 💻 Interfejs Użytkownika (Panel AI)

*   **Brak auto-resume**: Panel AI nie powinien automatycznie wczytywać ostatniego projektu. Użytkownik musi mieć możliwość wyboru z listy (`activeSlug = null` przy starcie).
*   **Full Width**: Unikaj bocznych paneli z logami technicznie nieprzydatnymi dla twórcy. Mapy i formularze powinny zajmować 100% dostępnej szerokości kontenera `xl:col-span-4`.

---
*Notatki sporządzone po sesji naprawczej 25 maja 2026.*
