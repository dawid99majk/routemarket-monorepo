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

const ATLAS_API = window.location.hostname === 'localhost' ? 'http://localhost:8787' : '/atlas-api';
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
  const [jobId, setJobId] = useState<string | null>(null);

  // Dynamic pins from map clicks
  const [waypoints, setWaypoints] = useState<{ start: {lat: number, lng: number} | null, end: {lat: number, lng: number} | null }>({
    start: null, 
    end: null
  });

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setWaypoints(prev => {
      if (!prev.start) return { ...prev, start: { lat, lng } };
      if (!prev.end) return { ...prev, end: { lat, lng } };
      // Reset if both exist
      return { start: { lat, lng }, end: null };
    });
  }, []);

  const updateGeometry = useCallback(async () => {
    if (!waypoints.start || !waypoints.end) return;
    setLoading(true);
    try {
      const res = await fetch(`${ATLAS_API}/api/routes/geometry`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-atlas-api-token': ATLAS_TOKEN
        },
        body: JSON.stringify({
          waypoints: [waypoints.start, waypoints.end],
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
    if (!slug || !gpxUrl) return;
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
      if (data.jobId?.id || data.jobId) {
        setJobId(data.jobId.id || data.jobId);
        toast.success("Research wystartował! Agent tworzy przewodnik...");
      }
    } catch (err) {
      toast.error("Błąd startu researchu");
      setIsResearching(false);
    }
  };

  useEffect(() => {
    let timer: any;
    if (jobId && slug) {
      timer = setInterval(async () => {
        try {
          const res = await fetch(`${ATLAS_API}/jobs/${jobId}`, {
            headers: { 'x-atlas-api-token': ATLAS_TOKEN }
          });
          const data = await res.json();
          if (data.job?.status === 'completed') {
            clearInterval(timer);
            setIsResearching(false);
            toast.success("Przewodnik gotowy!");
            setGuide("Przewodnik zapisano w bazie pomyślnie.");
          } else if (data.job?.status === 'failed') {
            clearInterval(timer);
            setIsResearching(false);
            toast.error("Błąd generowania przewodnika.");
          }
        } catch (e) {
          console.error(e);
        }
      }, 3000);
    }
    return () => clearInterval(timer);
  }, [jobId, slug]);

  return (
    <div className="relative w-full h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* 3D Active Map taking full screen */}
      <div className="absolute inset-0 z-0">
         <StudioMapEditor 
           track={track} 
           customPois={pois} 
           setCustomPois={setPois}
           category={category}
           onMapClick={handleMapClick}
           waypoints={waypoints}
         />
      </div>

      {/* Floating HUD Header */}
      <header className="absolute top-0 left-0 right-0 h-16 px-6 flex items-center justify-between bg-gradient-to-b from-slate-950/90 to-transparent pointer-events-none z-50">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-emerald-500 rounded-md shadow-lg shadow-emerald-500/20">
            <Compass className="w-5 h-5 text-slate-950" />
          </div>
          <h1 className="text-lg font-bold tracking-widest uppercase italic drop-shadow-md">
            Creator <span className="text-emerald-500 font-black not-italic">Studio 3D</span>
          </h1>
        </div>
      </header>

      {/* Floating UI Overlay for Controls */}
      <div className="absolute top-20 left-6 w-[360px] bg-slate-900/80 backdrop-blur-xl border border-slate-800/50 rounded-2xl p-6 shadow-2xl z-40 flex flex-col gap-6">
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-emerald-500 font-bold text-xs uppercase tracking-widest">
            <MapPin className="w-4 h-4" />
            Parametry Trasy
          </div>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Dystans (km)</label>
                <span className="text-emerald-500 font-mono font-black">{distance[0]}</span>
              </div>
              <Slider value={distance} onValueChange={setDistance} max={300} step={5} />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Liczba dni</label>
                <span className="text-emerald-500 font-mono font-black">{days[0]}</span>
              </div>
              <Slider value={days} onValueChange={setDays} max={14} step={1} />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Kategoria</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-slate-950/50 border-slate-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                  <SelectItem value="szosa">Szosa</SelectItem>
                  <SelectItem value="gravel">Gravel</SelectItem>
                  <SelectItem value="trekking">Trekking</SelectItem>
                  <SelectItem value="motorcycle">Motocykl</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 text-emerald-500 font-bold text-xs uppercase tracking-widest">
            <Info className="w-4 h-4" />
            Intencja wyjazdu
          </div>
          <Textarea 
            placeholder="Szukamy dobrej pizzy i fajnych widoków..."
            className="bg-slate-950/50 border-slate-800 focus:border-emerald-500/50 resize-none rounded-xl p-3 placeholder:text-slate-600"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
          />
        </section>

        <Button 
          onClick={handleStartResearch} 
          disabled={!track.length || isResearching}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 font-bold uppercase tracking-wider"
        >
          {isResearching ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Badam Trasę...</>
          ) : (
            <><Sparkles className="w-4 h-4 mr-2" /> Akceptuj i Wygeneruj</>
          )}
        </Button>

        {guide && (
          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center gap-2 text-blue-400 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4" /> Przewodnik zapisany (JSON/MD)!
          </div>
        )}
      </div>
      
      {/* Loading Indicator for Geometry overlay */}
      {loading && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-slate-900/80 backdrop-blur-xl border border-emerald-500/30 px-6 py-2 rounded-full flex items-center gap-3 shadow-2xl">
            <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Wyliczanie geometrii...</span>
          </div>
        </div>
      )}
      
      {/* Bottom Right Info HUD */}
      <div className="absolute bottom-10 right-8 z-40 flex flex-col gap-3 items-end pointer-events-none">
         <Badge className="bg-emerald-500 text-slate-950 text-[10px] font-black py-1 px-3 rounded-full uppercase tracking-tighter">
            Kliknij na mapie: Start & Meta
         </Badge>
         {slug && <Badge className="bg-slate-950/80 border-slate-800 text-slate-400 text-xs font-mono py-1 px-3">Projekt: {slug}</Badge>}
      </div>
    </div>
  );
}
