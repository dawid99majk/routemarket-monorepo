import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles, MapPin, Compass, CheckCircle2, Search, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

// Mock components for Map - in real app this would be Leaflet/MapLibre
function UnifiedMap({ geometry, start, end, midpoint }: any) {
  return (
    <div className="w-full h-full bg-slate-900 rounded-lg relative overflow-hidden flex items-center justify-center border border-slate-800">
      <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]"></div>
      {geometry ? (
        <div className="relative w-full h-full p-8">
           {/* Simple SVG Path visualization for route */}
           <svg viewBox="0 0 100 100" className="w-full h-full preserve-3d">
             <path 
                d="M 20 80 Q 50 20 80 80" 
                fill="none" 
                stroke="url(#neonGradient)" 
                strokeWidth="2" 
                className="animate-pulse shadow-[0_0_15px_rgba(34,197,94,0.5)]"
             />
             <defs>
               <linearGradient id="neonGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                 <stop offset="0%" stopColor="#10b981" />
                 <stop offset="100%" stopColor="#3b82f6" />
               </linearGradient>
             </defs>
           </svg>
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-emerald-500 font-mono text-xs">
              LIVE GEOMETRY RENDERED
           </div>
        </div>
      ) : (
        <div className="text-slate-500 flex flex-col items-center gap-3">
          <Compass className="w-12 h-12 animate-spin-slow" />
          <p className="font-mono text-sm">Waiting for coordinates...</p>
        </div>
      )}
      
      {/* HUD Elements */}
      <div className="absolute bottom-4 left-4 flex gap-2">
        <Badge variant="outline" className="bg-slate-950/80 border-emerald-500/50 text-emerald-400">
          GIS Engine: Google Routes v2
        </Badge>
        <Badge variant="outline" className="bg-slate-950/80 border-blue-500/50 text-blue-400">
          Mode: Heavy Geometry
        </Badge>
      </div>
    </div>
  );
}

const ATLAS_API = 'http://localhost:8787'; // New Atlas Engine API

export default function RouteBuilderV2() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [intent, setIntent] = useState('');
  const [distance, setDistance] = useState([20]);
  const [category, setCategory] = useState('motorcycle');
  const [geometry, setGeometry] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [guide, setGuide] = useState<string | null>(null);

  // Simplified hardcoded points for the MVP "Live" demo
  const [coords, setCoords] = useState({
    start: { lat: 46.54, lng: 11.86 }, // Dolomites area
    end: { lat: 46.50, lng: 11.90 },
    midpoint: { lat: 46.52, lng: 11.88 }
  });

  const updateGeometry = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const res = await fetch(`${ATLAS_API}/projects/${slug}/geometry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: coords.start,
          end: coords.end,
          midpoint: coords.midpoint,
          targetDistanceKm: distance[0],
          category: category
        })
      });
      const data = await res.json();
      setGeometry(data.geometry);
    } catch (err) {
      toast.error("Geometry calculation failed");
    } finally {
      setLoading(false);
    }
  }, [slug, coords, distance, category]);

  // Create project if missing
  useEffect(() => {
    const initProject = async () => {
      const res = await fetch(`${ATLAS_API}/magic-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: "New Adventure " + Date.now(),
          region: "Dolomites, Italy",
          category: category,
          notes: intent
        })
      });
      const data = await res.json();
      setProjectId(data.projectId);
      setSlug(data.slug);
    };
    initProject();
  }, []);

  // Debounced geometry updates
  useEffect(() => {
    const timer = setTimeout(() => {
      if (slug) updateGeometry();
    }, 800);
    return () => clearTimeout(timer);
  }, [distance, category, coords]);

  const handleApproveAndResearch = async () => {
    if (!slug) return;
    setIsResearching(true);
    try {
      const res = await fetch(`${ATLAS_API}/projects/${slug}/approve-and-research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      setJobId(data.jobId);
      toast.success("Route approved. Deep Research started!");
    } catch (err) {
      toast.error("Research failed to start");
      setIsResearching(false);
    }
  };

  // Poll for research results
  useEffect(() => {
    let timer: any;
    if (jobId) {
      timer = setInterval(async () => {
        const res = await fetch(`${ATLAS_API}/jobs/${jobId}`);
        const data = await res.json();
        if (data.job?.status === 'ready' || data.job?.status === 'completed') {
          clearInterval(timer);
          setIsResearching(false);
          toast.success("Research Complete! Guide is ready.");
          // Fetch the generated guide
          const projectRes = await fetch(`${ATLAS_API}/projects/${slug}`);
          const projectData = await projectRes.json();
          // Assuming the project data now contains the guide or a way to fetch it
          setGuide("Guide generated successfully. Ready for preview.");
        }
      }, 3000);
    }
    return () => clearInterval(timer);
  }, [jobId, slug]);

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-slate-800 px-6 flex items-center justify-between bg-slate-900/50 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500 rounded-lg">
            <Compass className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">RouteBuilder <span className="text-emerald-500">V2</span></h1>
            <p className="text-xs text-slate-500 font-mono">Status: {loading ? 'Recalculating...' : 'Synced'}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <Badge variant="secondary" className="bg-slate-800 text-slate-400 border-none">
            Project: {slug || 'Initializing...'}
          </Badge>
          <Button 
            onClick={handleApproveAndResearch} 
            disabled={!geometry || isResearching}
            className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 shadow-lg shadow-emerald-900/20"
          >
            {isResearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Approve & Deep Research
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Controls */}
        <aside className="w-96 border-r border-slate-800 p-6 flex flex-col gap-8 bg-slate-900/30 overflow-y-auto">
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm uppercase tracking-wider">
              <MapPin className="w-4 h-4" />
              Route Parameters
            </div>
            
            <div className="space-y-6 pt-2">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-slate-400">Distance (km)</label>
                  <span className="text-emerald-500 font-mono font-bold">{distance}km</span>
                </div>
                <Slider 
                  value={distance} 
                  onValueChange={setDistance} 
                  max={200} 
                  step={5}
                  className="py-4"
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-400">Vehicle Category</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="bg-slate-950 border-slate-800">
                    <SelectValue placeholder="Select vehicle" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                    <SelectItem value="hiking">Hiking (Walk)</SelectItem>
                    <SelectItem value="bike">Cycling (Bicycle)</SelectItem>
                    <SelectItem value="motorcycle">Motorcycle (Adventure)</SelectItem>
                    <SelectItem value="car">Car (Drive)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-4 flex-1">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm uppercase tracking-wider">
              <Info className="w-4 h-4" />
              Creator Intent
            </div>
            <Textarea 
              placeholder="Describe the vibe of the route, must-see places, or technical difficulty..."
              className="flex-1 bg-slate-950 border-slate-800 focus:border-emerald-500 min-h-[200px] resize-none text-sm leading-relaxed"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
            />
            <p className="text-[10px] text-slate-500 font-mono">
              Research pipeline will ground findings in this text.
            </p>
          </section>

          {isResearching && (
            <Card className="bg-emerald-950/20 border-emerald-500/30 animate-pulse">
              <CardContent className="p-4 flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
                <div className="text-xs text-emerald-300 font-mono">
                  Grounded Search in progress... Finding POIs and local data.
                </div>
              </CardContent>
            </Card>
          )}

          {guide && (
            <Card className="bg-blue-950/20 border-blue-500/30">
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase">
                  <CheckCircle2 className="w-4 h-4" />
                  Guide Generated
                </div>
                <Button variant="link" className="text-blue-300 p-0 h-auto text-xs justify-start">
                  Download Guide (Markdown)
                </Button>
              </CardContent>
            </Card>
          )}
        </aside>

        {/* Right Area: Map */}
        <section className="flex-1 p-6 bg-slate-950 relative">
          <UnifiedMap geometry={geometry} coords={coords} />
          
          {loading && (
            <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] flex items-center justify-center z-20 pointer-events-none">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-3 shadow-2xl">
                <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
                <span className="text-xs font-mono text-emerald-500 uppercase tracking-widest">Calculating Geometry</span>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
