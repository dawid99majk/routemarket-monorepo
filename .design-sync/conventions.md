# RouteMarket — jak budować z tym systemem

RouteMarket to **planer wyjazdów**: użytkownik zbiera miejsca na tablicy, a z nich powstaje
plan dni i przebieg trasy. Nie jest to sklep ani katalog do sprzedaży — jeśli w starszych
materiałach natkniesz się na „marketplace", „kup trasę" czy panel zarobków twórcy, to
pozostałość po poprzednim koncepcie i nie należy jej powielać.

Kierunek wizualny: **Soft-Tech Outdoor** — cisza japońskiego minimalizmu spotyka rzeczowość
katalogu sprzętu outdoorowego. Spokojnie, technicznie, bez krzyku.

## Wrapper i uruchomienie

Komponenty **nie potrzebują żadnego providera** — to biblioteka oparta na Radix i Tailwindzie,
gdzie style pochodzą z klas narzędziowych, a tokeny ze zmiennych CSS w `:root`. Wystarczy, że
arkusz `styles.css` jest wczytany; bez niego kontrolki wyrenderują się jako systemowe
prostokąty bez koloru i zaokrągleń.

Wyjątki, które wymagają kontekstu rodzica: `Label`, `RadioGroupItem`, `SelectItem`,
`TabsTrigger`, `AccordionTrigger`, `SidebarMenuItem` i pozostałe części składowe — używaj ich
wyłącznie wewnątrz odpowiedniego rodzica (`RadioGroup`, `Select`, `Tabs`, `Accordion`,
`SidebarProvider`).

## Kolor: zawsze przez tokeny, nigdy przez paletę Tailwinda

To najważniejsza zasada tego systemu. **Nie używaj `bg-emerald-600`, `text-slate-500`,
`bg-amber-100` ani żadnej innej surowej klasy z palety Tailwinda.** Cała aplikacja została z
nich oczyszczona (458 wystąpień) właśnie po to, żeby kolor pochodził z jednego miejsca.

| Zamiast | Użyj | Znaczenie |
|---|---|---|
| `bg-emerald-600` | `bg-primary` | szałwia `#3B6655` — kolor wiodący, akcje główne |
| `hover:bg-emerald-500` | `hover:bg-primary/90` | najechanie na akcję główną |
| `text-emerald-700` | `text-primary` | odnośniki i wyróżnienia |
| `text-slate-500` | `text-muted-foreground` | tekst drugorzędny |
| `text-slate-800` | `text-foreground` | tekst podstawowy |
| `border-slate-200` | `border-border` | obramowania i linie |
| `bg-slate-50` | `bg-muted` | tła zapadnięte |
| `bg-amber-100` | `bg-warning/15` | ostrzeżenia |
| `text-rose-500` | `text-accent` | tan `#D4925A` — odkładanie na później, ulubione |

Pełny słownik: `primary`, `secondary`, `accent`, `muted`, `card`, `popover`, `border`, `input`,
`ring`, `destructive`, `success`, `warning`, `danger`, `neutral`, każdy z parą `-foreground`.
Aliasy markowe: `sage`, `tan`, `dusty-blue`, `moss`, `forest`, `forest-deep`, `ink`.
Na ciemnym tle używaj `primary-light` — `primary` jest tam nieczytelny.

## Typografia

- `font-display` → **Fraunces** (szeryfowa) — nagłówki, tytuły kart, hasła.
- `font-sans` → **Inter** — tekst ciągły i interfejs.
- `font-narrow` → **Archivo Narrow** — nadtytuły i etykiety, wersalikami z `tracking-[0.32em]`.
- `font-mono` → **JetBrains Mono** — dane techniczne: godziny, dystanse, współrzędne.
  Zawsze z cyframi tabelarycznymi, żeby kolumny się zgadzały.

## Zasady, które łatwo złamać

- **Zdania zaczynają się wielką literą, reszta małą.** Nagłówki, przyciski i pozycje menu —
  wszystko. Kapitalizacja Każdego Słowa wygląda jak stary web.
- **Wersaliki tylko w nadtytułach i etykietach**, przy `tracking` co najmniej `0.12em`
  i rozmiarze do 13 px. Całe akapity wersalikami nigdy.
- **Bez emoji w interfejsie.** Spokój tej marki się o nie rozbija. Dozwolone są znaki
  z typografii: `—`, `·`, `↗`.
- **Separator `·`** w metadanych: `Wrocław · 4,1 km · 5 h`.
- **Zaokrąglenia powściągliwe** — `rounded-md` na kartach, `rounded-full` tylko na pigułkach.
  Ten system nie robi miękkich kart w stylu iOS.
- **Cienie ciepłe, nigdy niebieskawe** — `shadow-token-xs` … `shadow-token-xl`.
- **Bez gradientów.** Poza ledwie wyczuwalnym przejściem papieru w cieplejszy papier.

## Gdzie leży prawda

- `_ds/<folder>/styles.css` i jego `@import` — pełna lista tokenów i klas narzędziowych.
- `components/<grupa>/<Nazwa>/<Nazwa>.prompt.md` — API konkretnego komponentu.
- `components/<grupa>/<Nazwa>/<Nazwa>.d.ts` — kontrakt właściwości.

Grupy: `actions`, `forms`, `navigation`, `overlays`, `feedback`, `layout`.

## Przykład idiomatyczny

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge } from '@routemarket/frontend';

export function MiejsceNaTablicy() {
  return (
    <Card className="max-w-sm">
      <CardHeader className="gap-2">
        <div className="flex gap-1.5">
          <Badge variant="secondary">historyczne</Badge>
          <Badge variant="secondary">widokowe</Badge>
        </div>
        <CardTitle>Hala Targowa</CardTitle>
        <CardDescription>Wrocław · ok. 45 min</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Modernistyczna hala z 1908 roku o żelbetowej konstrukcji łukowej.
      </CardContent>
      <CardContent className="pt-0">
        <Button size="sm">Dodaj do tablicy</Button>
      </CardContent>
    </Card>
  );
}
```
