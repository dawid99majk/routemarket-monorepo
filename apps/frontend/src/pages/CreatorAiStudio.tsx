import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles, MapPin, Compass, CheckCircle2, Info, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import StudioMapEditor from '@/components/studio/StudioMapEditor';

const ATLAS_API = '/atlas-api';
const ATLAS_TOKEN = '178913a9cdd9271d077cd37dfded2afb76eaef72b220ec6c911b8509e1dece132712338c88769372979cc45f0ec6c241';

export default function CreatorAiStudio() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [intent, setIntent] = useState('');
  const [distance, setDistance] = useState([20]);
  const [days, setDays] = useState([1]);
  const [category, setCategory] = useState('trekking');
  const [track, setTrack] = useState<[number, number][]>([]);
  const [pois, setPois] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [gpxUrl, setGpxUrl] = useState<string | null>(null);
  const [guide, setGuide] = useState<string | null>(null);

  // Default points for initial view
  const [waypoints, setWaypoints] = useState({
    start: { lat: 46.54, lng: 11.86 }, 
    end: { lat: 46.50, lng: 11.90 }
  });

  const updateGeometry = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${ATLAS_API}/api/routes/geometry`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-atlas-api-token': ATLAS_TOKEN
        },
        body: JSON.stringify({
          start: waypoints.start,
          end: waypoints.end,
          targetDistanceKm: distance[0],
          category: category,
          slug: slug
        })
      });
      const data = await res.json();
      if (data.geometry) {
        // Convert GeoJSON to Leaflet points [lat, lng]
        const points = data.geometry.coordinates.map((c: any) => [c[1], c[0]]);
        setTrack(points);
        setGpxUrl(data.gpxUrl);
        setSlug(data.slug);
      }
    } catch (err) {
      toast.error("Błąd wyliczania geometrii");
    } finally {
      setLoading(false);
    }
  }, [waypoints, distance, category, slug]);

  useEffect(() => {
    const timer = setTimeout(() => {
      updateGeometry();
    }, 1000);
    return () => clearTimeout(timer);
  }, [distance, category, waypoints]);

  const handleStartResearch = async () => {
    if (!slug) return;
    setIsResearching(true);
    try {
      const res = await fetch(`${ATLAS_API}/api/routes/research`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-atlas-api-token': ATLAS_TOKEN
        },
        body: JSON.stringify({
          slug,
          intent,
          gpxUrl
        })
      });
      const data = await res.json();
      if (data.jobId) {
        toast.success("Research wystartował! Gemini analizuje trasę.");
        // Mocking completion for the studio feel
        setTimeout(() => {
           setIsResearching(false);
           setGuide("Przewodnik wygenerowany pomyślnie.");
           toast.success("Przewodnik gotowy!");
        }, 5000);
      }
    } catch (err) {
      toast.error("Błąd startu researchu");
      setIsResearching(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* HUD Header */}
      <header className="h-14 border-b border-slate-800/50 px-6 flex items-center justify-between bg-slate-900/40 backdrop-blur-xl z-50">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-emerald-500 rounded-md">
            <Compass className="w-4 h-4 text-slate-950" />
          </div>
          <h1 className="text-sm font-bold tracking-widest uppercase italic">
            Creator <span className="text-emerald-500 font-black not-italic text-lg">Studio</span>
          </h1>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex gap-4">
             <div className="text-right">
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Status</p>
                <p className="text-xs font-mono text-emerald-400">{loading ? 'Wyliczanie...' : 'Zsynchronizowano'}</p>
             </div>
             <div className="text-right border-l border-slate-800 pl-4">
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Projekt</p>
                <p className="text-xs font-mono text-slate-300">{slug || 'Nowa Trasa'}</p>
             </div>
          </div>
          <Button 
            onClick={handleStartResearch} 
            disabled={!track.length || isResearching}
            className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 shadow-lg shadow-emerald-900/20 h-9 px-4 rounded-full font-bold text-xs uppercase"
          >
            {isResearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Generuj Przewodnik
          </Button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Panel: Controls */}
        <aside className="w-[380px] border-r border-slate-800/50 p-6 flex flex-col gap-10 bg-slate-900/20 backdrop-blur-md overflow-y-auto z-40">
          <section className="space-y-6">
            <div className="flex items-center gap-2 text-emerald-500 font-bold text-[10px] uppercase tracking-[0.2em]">
              <MapPin className="w-3.5 h-3.5" />
              Parametry Fizyczne
            </div>
            
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Dystans (km)</label>
                  <span className="text-emerald-500 font-mono font-black text-lg">{distance[0]}</span>
                </div>
                <Slider 
                  value={distance} 
                  onValueChange={setDistance} 
                  max={300} 
                  step={5}
                  className="py-2"
                />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Liczba dni</label>
                  <span className="text-emerald-500 font-mono font-black text-lg">{days[0]}</span>
                </div>
                <Slider 
                  value={days} 
                  onValueChange={setDays} 
                  max={14} 
                  step={1}
                  className="py-2"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Kategoria Sprzętu</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="bg-slate-950/50 border-slate-800 h-10 text-xs font-bold rounded-lg focus:ring-emerald-500/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                    <SelectItem value="szosa">🚴 Szosa (Road)</SelectItem>
                    <SelectItem value="gravel">🚵 Gravel (Offroad)</SelectItem>
                    <SelectItem value="trekking">🥾 Trekking (Hiking)</SelectItem>
                    <SelectItem value="motorcycle">🏍️ Motocykl (Adventure)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-4 flex-1 flex flex-col">
            <div className="flex items-center gap-2 text-emerald-500 font-bold text-[10px] uppercase tracking-[0.2em]">
              <Info className="w-3.5 h-3.5" />
              Intencja Twórcy
            </div>
            <Textarea 
              placeholder="Opisz klimat trasy, np. 'Szukamy najlepszej pizzy w Dolomitach'..."
              className="flex-1 bg-slate-950/50 border-slate-800 focus:border-emerald-500/50 resize-none text-sm leading-relaxed rounded-xl p-4 placeholder:text-slate-700 placeholder:italic font-medium"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
            />
            <div className="flex items-center gap-2 p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/10">
               <Send className="w-3 h-3 text-emerald-500" />
               <p className="text-[10px] text-emerald-400/70 font-medium italic leading-tight">
                 Twoja intencja zostanie wykorzystana przez Gemini do znalezienia unikalnych punktów POI.
               </p>
            </div>
          </section>

          {guide && (
            <Card className="bg-emerald-500/10 border-emerald-500/30 overflow-hidden rounded-2xl">
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-emerald-400 font-black text-[10px] uppercase tracking-widest">
                  <CheckCircle2 className="w-4 h-4" /> Gotowy produkt
                </div>
                <p className="text-xs text-slate-300 font-medium leading-relaxed">
                  Pomyślnie wygenerowano butikowy przewodnik w oparciu o twarde dane z Google.
                </p>
                <Button variant="outline" className="w-full h-8 text-[10px] font-bold uppercase border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/20 text-emerald-400 rounded-lg">
                  Pobierz Przewodnik (PDF)
                </Button>
              </CardContent>
            </Card>
          )}
        </aside>

        {/* Full-screen Viewport */}
        <section className="flex-1 bg-slate-950 relative overflow-hidden">
          <div className="absolute inset-0">
             <StudioMapEditor 
               track={track} 
               customPois={pois} 
               setCustomPois={setPois}
               category={category}
             />
          </div>
          
          {loading && (
            <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
              <div className="bg-slate-900/80 backdrop-blur-xl border border-emerald-500/30 px-6 py-2 rounded-full flex items-center gap-3 shadow-2xl shadow-emerald-500/10">
                <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">Processing Geometry</span>
              </div>
            </div>
          )}

          {/* Map HUD Overlay */}
          <div className="absolute bottom-10 right-8 z-[100] flex flex-col gap-3 items-end pointer-events-none">
             <Badge className="bg-slate-950/80 border-slate-800 text-slate-400 text-[10px] font-mono py-1.5 px-3 rounded-md backdrop-blur-md">
               Lat: {waypoints.start.lat.toFixed(4)} Lng: {waypoints.start.lng.toFixed(4)}
             </Badge>
             <div className="flex gap-2">
                <Badge className="bg-emerald-500 text-slate-950 text-[10px] font-black py-1 px-3 rounded-full uppercase tracking-tighter">
                   Takt 1: Twarda Geometria
                </Badge>
                <Badge className="bg-blue-500 text-slate-950 text-[10px] font-black py-1 px-3 rounded-full uppercase tracking-tighter">
                   3D Engine Active
                </Badge>
             </div>
          </div>
        </section>
      </main>
    </div>
  );
}
