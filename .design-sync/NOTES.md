# Uwagi do synchronizacji — RouteMarket

- **Repozytorium żyje na VPS** (`leadminer-vps:/root/routemarket-workspace`), kopia lokalna
  powstaje przez `rsync` z pominięciem `node_modules`, `.git` i `dist`. Zmiany w kodzie
  wprowadzamy na VPS (tam jest git), a przed synchronizacją odświeżamy kopię lokalną.

- **Workspace nie linkuje sam siebie.** Konwerter szuka `<node-modules>/<pkg>/package.json`,
  a pnpm nie tworzy dowiązania do własnej paczki. Przed budową:
  `ln -sfn ../.. apps/frontend/node_modules/@routemarket/frontend`
  (cel to `../..`, nie `../../..` — łatwo się pomylić i dostać katalog główny repo).

- **Brak biblioteki, tryb syntezy wejścia.** `@routemarket/frontend` to aplikacja
  (`vite build`), bez `main`/`module`/`exports` i bez `dist` z komponentami. Konwerter
  syntezuje wejście z `src/`, dlatego uruchamiamy go bez `--entry`. Zakres zawężony przez
  `srcDir: "src/components/ui"` — bez tego wciągnęłoby komponenty aplikacji, które
  zależą od Supabase i routera i nie dają się zbundlować.

- **49 plików to 245 eksportów.** shadcn wystawia `Card`, `CardHeader`, `CardTitle`…
  jako osobne komponenty. To nie błąd zakresu.

- **Kolizja nazwy `Toaster`.** `ui/sonner.tsx` i `ui/toaster.tsx` eksportują tę samą nazwę,
  a wejście robi `export *` z obu — ES Modules wyklucza wtedy nazwę dwuznaczną i walidacja
  zgłasza `[BUNDLE_EXPORT]`. Wykluczone przez `componentSrcMap: {"Toaster": null}`.
  Sedno leży w aplikacji: zamontowane są dwa systemy powiadomień, ale realnie używany jest
  wyłącznie sonner (20 plików), a radixowy `use-toast` nie jest wołany nigdzie poza własnym
  hookiem. Usunięcie martwego radixowego toastera rozwiązałoby to u źródła — do decyzji
  właściciela, bo to zmiana w aplikacji, nie w synchronizacji.

- **Czcionki ładują się zdalnie** (Google Fonts `@import` w `src/index.css`): Inter,
  Fraunces, Archivo Narrow, JetBrains Mono. `[FONT_REMOTE]` jest informacyjny — rodziny
  wczytują się w czasie działania i nie trzeba ich pakować.

## Znane ostrzeżenia renderowania

- `[RENDER_BLANK]` / `[RENDER_THIN]` na częściach składowych, które samodzielnie nic nie
  malują: `TableCell`, `TableHead`, `BreadcrumbItem`, `BreadcrumbSeparator`,
  `SidebarMenuItem`, `SidebarMenuSubItem`, `SidebarGroupAction`, `SidebarMenuAction`,
  `PaginationItem`, `NavigationMenuItem`, `InputOTPSeparator`, `AspectRatio`.
  To poprawne zachowanie — te elementy mają sens wyłącznie w kontekście rodzica.

## Ryzyka przy kolejnej synchronizacji

- Dowiązanie `node_modules/@routemarket/frontend` jest w `.gitignore` i **znika przy
  świeżym klonie** — trzeba je odtworzyć przed budową.
- Zakres zależy od `srcDir`. Gdyby komponenty `ui/` przeniosły się w inne miejsce,
  synchronizacja po cichu zgarnie zły zestaw albo nic.
- Podglądy autorskie żyją w `.design-sync/previews/` i są w repozytorium — konwerter ich
  nie nadpisuje. Karty podstawowe (floor cards) to świadomy stan wyjściowy, nie awaria.

## Stan wysyłki (sesja z 9 sierpnia)

Wysłane do projektu `a2a8e391-1182-467d-881f-903f0f158524`: sentinel, README z
nagłówkiem konwencji, `styles.css`, `_ds_bundle.js`, `_ds_bundle.css`, `_vendor/`,
17 skompilowanych podglądów oraz komponenty grup `actions` i `feedback` — łącznie 89 plików.

**Kotwica `_ds_sync.json` NIE została zapisana i to jest celowe.** Kotwica poświadcza
kompletność; zapisana nad częściową wysyłką sprawiłaby, że kolejna synchronizacja nigdy
by tych braków nie naprawiła. Projekt jest w udokumentowanym stanie bezpiecznym: bez
kotwicy następny przebieg weryfikuje i wysyła wszystko od nowa.

Do dokończenia: grupy `forms`, `layout`, `navigation`, `overlays` (~910 plików).

Wznowienie — z katalogu głównego kopii lokalnej:

    ln -sfn ../.. apps/frontend/node_modules/@routemarket/frontend
    npx tailwindcss -c apps/frontend/tailwind.ds.config.cjs \
      -i apps/frontend/src/index.css -o apps/frontend/ds-styles.css --minify
    node .ds-sync/resync.mjs --config .design-sync/config.json \
      --node-modules apps/frontend/node_modules --out ./ds-bundle

Potem `finalize_plan` z tym samym zestawem zapisów i wysyłka `ds-bundle/` w paczkach
po 250 plików, na końcu `_ds_sync.json` jako ostatni zapis.

**Arkusz `ds-styles.css` jest artefaktem budowania** — powstaje z `tailwind.ds.config.cjs`,
którego zawartość obejmuje `src/components/ui/**` ORAZ `.design-sync/previews/**`. Bez tej
drugiej ścieżki klasy użyte w podglądach nie trafiają do arkusza i karty renderują się jako
gołe, systemowe kontrolki. To był najpoważniejszy błąd wykryty podczas tej synchronizacji.
