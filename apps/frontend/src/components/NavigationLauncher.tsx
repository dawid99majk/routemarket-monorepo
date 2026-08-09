import { useEffect, useState } from 'react';
import { Loader2, Navigation, X } from 'lucide-react';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { parseGpx } from '@/lib/gpx-parser';
import NavigationMode from './NavigationMode';
import type { Polyline } from '@/lib/geo-utils';

interface NavigableRoute {
  id: string;
  title: string;
  track: Polyline;
}

/**
 * Pływający przycisk nawigacji. Wcześniej prowadził po trasach kupionych w
 * marketplace; teraz źródłem są własne trasy z kreatora, bo tylko one w nowym
 * modelu istnieją.
 */
export default function NavigationLauncher() {
  const isMobile = useIsMobile();
  const [narrowScreen, setNarrowScreen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 1023px)');
    const handler = () => setNarrowScreen(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Nawigacja ma sens tylko na urządzeniu, które nosisz ze sobą
  const visible = isMobile || narrowScreen;

  const { user, loading: authLoading } = useAuth();
  const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState<NavigableRoute[]>([]);
  const [active, setActive] = useState<NavigableRoute | null>(null);

  const openPicker = async () => {
    setPicking(true);
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('route_builder_projects')
        .select('id, requirements')
        .order('updated_at', { ascending: false, nullsFirst: false })
        .limit(30);
      if (error) throw error;

      const usable: NavigableRoute[] = [];
      for (const project of data || []) {
        const gpx = project.requirements?.gpxData;
        if (!gpx) continue;
        try {
          const parsed = parseGpx(gpx);
          const track = (parsed?.trackPoints || []) as Polyline;
          if (track.length >= 2) {
            usable.push({ id: project.id, title: project.requirements?.title || 'Trasa bez nazwy', track });
          }
        } catch {
          // Uszkodzony ślad pomijamy — nie ma powodu wywracać całej listy
        }
      }
      setRoutes(usable);
      if (usable.length === 0) {
        toast.info('Nie masz jeszcze trasy z wygenerowanym plikiem GPX');
      }
    } catch (err: any) {
      toast.error(err.message || 'Nie udało się wczytać tras');
    } finally {
      setLoading(false);
    }
  };

  if (!visible || authLoading || !user) return null;

  if (active) {
    return <NavigationMode track={active.track} routeTitle={active.title} onClose={() => setActive(null)} />;
  }

  return (
    <>
      <button
        onClick={openPicker}
        aria-label="Nawigacja"
        className="fixed bottom-5 right-5 z-[1400] w-14 h-14 rounded-full bg-primary hover:bg-primary/90 text-white shadow-token-lg flex items-center justify-center transition-colors"
      >
        <Navigation className="w-6 h-6" />
      </button>

      {picking && (
        <div className="fixed inset-0 z-[1500] bg-ink/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-background rounded-md w-full max-w-md max-h-[70vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <span className="font-semibold">Którą trasą nawigujemy?</span>
              <button onClick={() => setPicking(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-3 space-y-2">
              {loading && (
                <div className="flex items-center gap-2 justify-center py-8 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" /> Wczytuję trasy…
                </div>
              )}
              {!loading && routes.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8 px-4">
                  Żadna z Twoich tras nie ma jeszcze pliku GPX. Wygeneruj trasę w kreatorze, a pojawi się tutaj.
                </p>
              )}
              {routes.map((route) => (
                <button
                  key={route.id}
                  onClick={() => {
                    setActive(route);
                    setPicking(false);
                  }}
                  className="w-full text-left rounded-md border p-3 hover:border-primary hover:bg-muted/50 transition-colors"
                >
                  <div className="font-medium text-sm">{route.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{route.track.length} punktów śladu</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
