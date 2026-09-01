import { useEffect, useState } from 'react';
import { Crosshair, Loader2, MapPin, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiPost } from '@/lib/api';

interface PunktStartowyProps {
  /** Aktualna nazwa punktu startowego; puste znaczy „jeszcze nie ustawiony". */
  nazwa?: string | null;
  /** Bez współrzędnych punkt nie trafi na mapę — mówimy o tym wprost. */
  bezPolozenia?: boolean;
  /** Miasto wyjazdu; bez niego podpowiedzi nie mają się o co oprzeć. */
  destination?: string | null;
  // Zwracana wartość jest ignorowana — wywołujący często oddaje id toastu
  // albo wynik zapisu, a komponentowi wystarczy, że akcja się wykonała.
  onZapisz: (nazwa: string, lat: number | null, lng: number | null) => unknown;
  onUsun?: () => unknown;
  /** `zwiezly` mieści się w wąskiej kolumnie obok mapy. */
  wariant?: 'pelny' | 'zwiezly';
}

/**
 * Punkt startowy wyjazdu — hotel, parking, dworzec.
 *
 * Ta sama funkcja była napisana dwa razy: raz w ustawieniach tablicy, raz
 * w kolumnie obok mapy na Odkrywaj. Oba miejsca mają sens (tam się to ustawia,
 * tu się na to patrzy planując trasę), ale dwie kopie pola, podpowiedzi z API,
 * geolokalizacji i „użyj jako nazwy własnej" prędzej czy później rozjechałyby
 * się na dwa różne zachowania dla jednej wartości.
 *
 * Komponent trzyma własny stan wpisywania i sam pyta o podpowiedzi; na zewnątrz
 * oddaje tylko gotową decyzję.
 */
export default function PunktStartowy({
  nazwa, bezPolozenia, destination, onZapisz, onUsun, wariant = 'pelny',
}: PunktStartowyProps) {
  const [edytuje, setEdytuje] = useState(false);
  const [fraza, setFraza] = useState('');
  const [podpowiedzi, setPodpowiedzi] = useState<any[]>([]);
  const [lokalizuje, setLokalizuje] = useState(false);

  useEffect(() => {
    const q = fraza.trim();
    if (q.length < 2 || !destination) { setPodpowiedzi([]); return; }
    let aktualne = true;
    const t = setTimeout(async () => {
      try {
        const d = await apiPost<any>('/places/suggest',
          { query: q, city: destination, limit: 5 }, { timeoutMs: 12_000 });
        if (aktualne) setPodpowiedzi(d.suggestions ?? []);
      } catch { if (aktualne) setPodpowiedzi([]); }
    }, 300);
    return () => { aktualne = false; clearTimeout(t); };
  }, [fraza, destination]);

  const zapisz = async (n: string, lat: number | null, lng: number | null) => {
    await onZapisz(n, lat, lng);
    setEdytuje(false);
    setFraza('');
    setPodpowiedzi([]);
  };

  /** Położenie z urządzenia bywa jedyną odpowiedzią, gdy nocleg nie ma nazwy
   *  w OpenStreetMap — a przy planowaniu trasy liczy się punkt, nie etykieta. */
  const zUrzadzenia = () => {
    if (!navigator.geolocation) return toast.error('Przeglądarka nie udostępnia położenia.');
    setLokalizuje(true);
    navigator.geolocation.getCurrentPosition(
      (poz) => { setLokalizuje(false); zapisz('Moje położenie', poz.coords.latitude, poz.coords.longitude); },
      () => { setLokalizuje(false); toast.error('Nie udało się odczytać położenia.'); },
      { timeout: 10_000 },
    );
  };

  if (nazwa && !edytuje) {
    return (
      <div className="flex flex-wrap items-center gap-2.5">
        <MapPin className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm min-w-0 flex-1 truncate">
          {nazwa}
          {bezPolozenia && (
            <span className="text-[12px] text-muted-foreground"> · bez położenia, nie ma go na mapie</span>
          )}
        </span>
        <button onClick={() => { setEdytuje(true); setFraza(''); }}
          className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">
          zmień
        </button>
        {onUsun && (
          <button onClick={onUsun}
            className="text-[12px] text-muted-foreground hover:text-destructive transition-colors">
            usuń
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className={wariant === 'zwiezly' ? 'flex gap-2' : 'flex flex-wrap gap-2'}>
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input autoFocus={edytuje} value={fraza}
            onChange={(e) => setFraza(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setEdytuje(false); setFraza(''); } }}
            placeholder={destination ? `Hotel, parking albo dworzec w: ${destination}` : 'Twój hotel, parking, dworzec…'}
            className="pl-8 h-9 text-sm" />
        </div>
        <Button variant="outline" size="sm" onClick={zUrzadzenia} disabled={lokalizuje}
          className="shrink-0 h-9">
          {lokalizuje
            ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Szukam…</>
            : <><Crosshair className="w-4 h-4 mr-1.5" /> Moje położenie</>}
        </Button>
      </div>

      {podpowiedzi.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-[1100] rounded-md border border-border
                        bg-popover shadow-token-lg overflow-hidden max-h-[220px] overflow-y-auto">
          {podpowiedzi.map((sug, i) => (
            <button key={`${sug.name}-${i}`}
              onClick={() => zapisz(sug.name, sug.lat ?? null, sug.lng ?? null)}
              className="w-full text-left px-3 py-2 hover:bg-muted transition-colors
                         border-b border-border last:border-b-0">
              <div className="text-sm truncate">{sug.name}</div>
              <div className="font-mono text-[11px] text-muted-foreground truncate">
                {[sug.kind, [sug.city, sug.country].filter(Boolean).join(' / ')]
                  .filter(Boolean).join(' · ')}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Nie każdy nocleg jest w OpenStreetMap — nazwa własna wystarczy,
          planer i tak dostanie ją jako bazę wyjazdu. */}
      {fraza.trim().length >= 3 && (
        <button onClick={() => zapisz(fraza.trim(), null, null)}
          className="mt-2 text-[12px] text-accent hover:underline">
          Użyj „{fraza.trim()}" jako nazwy własnej
        </button>
      )}
    </div>
  );
}
