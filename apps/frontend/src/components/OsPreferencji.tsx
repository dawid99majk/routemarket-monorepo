import * as SliderPrimitive from '@radix-ui/react-slider';

interface OsPreferencjiProps {
  tytul: string;
  lewo: string;
  prawo: string;
  podpowiedz?: string;
  /** 0–100, gdzie 50 to brak przechyłu. */
  wartosc: number;
  /** Czy wartość pochodzi z tego wyjazdu, czy jest odziedziczona. */
  wlasna?: boolean;
  onChange: (v: number) => void;
}

/**
 * Oś preferencji: nazwa na środku, kropka przesuwana w lewo albo w prawo.
 *
 * Poprzednio był tu zwykły suwak wypełniany od lewej krawędzi, co czyta się jak
 * natężenie — „ile czegoś chcę". A to jest wybór między dwiema stronami: wolę
 * klasyki albo wolę miejsca niszowe, i środek znaczy „nie mam zdania", a nie
 * „chcę połowę". Wypełnienie idzie więc od środka do kropki, a nie od krawędzi.
 */
export default function OsPreferencji({
  tytul, lewo, prawo, podpowiedz, wartosc, wlasna = true, onChange,
}: OsPreferencjiProps) {
  const odchylenie = wartosc - 50;
  const wLewo = odchylenie < 0;
  // Segment od środka do kropki. Szerokość w procentach całej osi.
  const szerokosc = `${Math.abs(odchylenie)}%`;
  const start = wLewo ? `${wartosc}%` : '50%';

  const stan = Math.abs(odchylenie) < 5
    ? 'bez preferencji'
    : `${Math.abs(odchylenie) >= 30 ? 'zdecydowanie' : 'raczej'}: ${wLewo ? lewo.toLowerCase() : prawo.toLowerCase()}`;

  return (
    <div>
      <div className="text-center">
        <span className="text-sm font-medium">{tytul}</span>
      </div>

      <div className="relative mt-3">
        {/* Znacznik środka — bez niego nie widać, gdzie kończy się „nie mam zdania". */}
        <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-px h-2 bg-border" aria-hidden />

        <SliderPrimitive.Root
          value={[wartosc]}
          min={0}
          max={100}
          step={5}
          onValueChange={([v]) => onChange(v)}
          className="relative flex w-full touch-none select-none items-center"
        >
          <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted">
            {/* Domyślne wypełnienie Radixa idzie od lewej krawędzi, więc je chowamy
                i rysujemy własne, wychodzące ze środka. */}
            <SliderPrimitive.Range className="absolute h-full bg-transparent" />
            <div
              className={`absolute h-full rounded-full transition-colors ${
                wlasna ? 'bg-primary' : 'bg-muted-foreground/40'
              }`}
              style={{ left: start, width: szerokosc }}
              aria-hidden
            />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            aria-label={tytul}
            className={`block h-4 w-4 rounded-full border-2 bg-background transition-colors
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              wlasna ? 'border-primary' : 'border-muted-foreground/50'
            }`}
          />
        </SliderPrimitive.Root>
      </div>

      <div className="flex justify-between gap-4 mt-2">
        <span className={`text-[11px] ${wLewo && wlasna ? 'text-foreground' : 'text-muted-foreground'}`}>
          {lewo}
        </span>
        <span className={`text-[11px] text-right ${!wLewo && wlasna && odchylenie !== 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
          {prawo}
        </span>
      </div>

      <p className="text-[11px] text-center mt-2">
        <span className="text-muted-foreground">{wlasna ? stan : 'wg profilu'}</span>
      </p>

      {podpowiedz && (
        <p className="text-[11px] text-muted-foreground/80 mt-1 text-center text-pretty">{podpowiedz}</p>
      )}
    </div>
  );
}
