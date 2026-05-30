import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles, MapPin, Compass, CheckCircle2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

// Real Leaflet Components
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet icon issue
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function MapResizer({ geometry }: { geometry: any }) {
  const map = useMap();
  useEffect(() => {
    if (geometry && geometry.coordinates.length > 0) {
      const bounds = L.geoJSON(geometry).getBounds();
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [geometry, map]);
  return null;
}

function UnifiedMap({ geometry, start, end, midpoint }: any) {
  const center: [number, number] = start ? [start.lat, start.lng] : [46.54, 11.86];

  return (
    <div className="w-full h-full rounded-lg overflow-hidden border border-slate-800 bg-slate-900 relative">
      <MapContainer 
        center={center} 
        zoom={12} 
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        {geometry && (
          <Polyline 
            positions={geometry.coordinates.map((c: any) => [c[1], c[0]])} 
            pathOptions={{ 
              color: '#10b981', 
              weight: 4, 
              opacity: 0.8,
              dashArray: '10, 10',
              lineCap: 'round'
            }} 
          />
        )}

        {start && <Marker position={[start.lat, start.lng]} />}
        {end && <Marker position={[end.lat, end.lng]} />}
        {midpoint && <Marker position={[midpoint.lat, midpoint.lng]} />}
        
        <MapResizer geometry={geometry} />
      </MapContainer>

      {/* HUD Elements */}
      <div className="absolute bottom-4 left-4 flex gap-2 z-[1000]">
        <Badge variant="outline" className="bg-slate-950/80 border-emerald-500/50 text-emerald-400 backdrop-blur-md">
          GIS Engine: Google Routes v2
        </Badge>
        <Badge variant="outline" className="bg-slate-950/80 border-blue-500/50 text-blue-400 backdrop-blur-md">
          Mode: Heavy Geometry
        </Badge>
      </div>
    </div>
  );
}

const ATLAS_API = window.location.hostname === 'localhost' 
  ? 'http://localhost:8787' 
  : '/atlas-api';
const ATLAS_TOKEN = '178913a9cdd9271d077cd37dfded2afb76eaef72b220ec6c911b8509e1dece132712338c88769372979cc45f0ec6c241';

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

  const [coords, setCoords] = useState({
    start: { lat: 46.54, lng: 11.86 }, 
    end: { lat: 46.50, lng: 11.90 },
    midpoint: { lat: 46.52, lng: 11.88 }
  });

  const updateGeometry = useCallback(async (currentSlug: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${ATLAS_API}/projects/${currentSlug}/geometry`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-atlas-api-token': ATLAS_TOKEN
        },
        body: JSON.stringify({
          start: coords.start,
          end: coords.end,
          midpoint: coords.midpoint,
          targetDistanceKm: distance[0],
          category: category
        })
      });
      const data = await res.json();
      if (data.geometry) {
        setGeometry(data.geometry);
      } else if (data.error) {
        toast.error(`Engine Error: ${data.error}`);
      }
    } catch (err) {
      toast.error("Geometry calculation failed");
    } finally {
      setLoading(false);
    }
  }, [coords, distance, category]);

  useEffect(() => {
    const initProject = async () => {
      try {
        const res = await fetch(`${ATLAS_API}/projects`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-atlas-api-token': ATLAS_TOKEN
          },
          body: JSON.stringify({
            topic: "Live Adventure " + new Date().toLocaleTimeString(),
            region: "Dolomites, Italy",
            category: category
          })
        });
        const data = await res.json();
        if (data.slug) {
          setProjectId(data.id);
          setSlug(data.slug);
          // Trigger first geometry calculation
          updateGeometry(data.slug);
        }
      } catch (err) {
        toast.error("Failed to initialize project");
      }
    };
    initProject();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (slug) updateGeometry(slug);
    }, 1000);
    return () => clearTimeout(timer);
  }, [distance, category, coords, slug]);

  const handleApproveAndResearch = async () => {
    if (!slug) return;
    setIsResearching(true);
    try {
      const res = await fetch(`${ATLAS_API}/projects/${slug}/approve-and-research`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-atlas-api-token': ATLAS_TOKEN
        }
      });
      const data = await res.json();
      if (data.jobId?.id) {
        setJobId(data.jobId.id);
        toast.success("Route approved. Deep Research started!");
      }
    } catch (err) {
      toast.error("Research failed to start");
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
            toast.success("Research Complete! Guide is ready.");
            setGuide("Guide generated successfully.");
          } else if (data.job?.status === 'failed') {
            clearInterval(timer);
            setIsResearching(false);
            toast.error("Research pipeline failed.");
          }
        } catch (e) {
          console.error("Job polling error", e);
        }
      }, 3000);
    }
    return () => clearInterval(timer);
  }, [jobId, slug]);

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <header className="h-16 border-b border-slate-800 px-6 flex items-center justify-between bg-slate-900/50 backdrop-blur-md z-50">
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

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-96 border-r border-slate-800 p-6 flex flex-col gap-8 bg-slate-900/30 overflow-y-auto z-40">
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm uppercase tracking-wider">
              <MapPin className="w-4 h-4" />
              Route Parameters
            </div>
            
            <div className="space-y-6 pt-2">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-slate-400">Distance (km)</label>
                  <span className="text-emerald-500 font-mono font-bold">{distance[0]}km</span>
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
              placeholder="Describe the vibe of the route..."
              className="flex-1 bg-slate-950 border-slate-800 focus:border-emerald-500 min-h-[200px] resize-none text-sm leading-relaxed"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
            />
          </section>

          {isResearching && (
            <Card className="bg-emerald-950/20 border-emerald-500/30 animate-pulse">
              <CardContent className="p-4 flex items-center gap-3 text-xs text-emerald-300 font-mono">
                <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
                Grounded Search in progress...
              </CardContent>
            </Card>
          )}

          {guide && (
            <Card className="bg-blue-950/20 border-blue-500/30">
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="text-blue-400 font-bold text-xs uppercase flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Guide Ready
                </div>
                <Button variant="link" className="text-blue-300 p-0 h-auto text-xs justify-start">
                  Download Guide
                </Button>
              </CardContent>
            </Card>
          )}
        </aside>

        <section className="flex-1 p-6 bg-slate-950 relative z-0">
          <UnifiedMap geometry={geometry} start={coords.start} end={coords.end} midpoint={coords.midpoint} />
          
          {loading && (
            <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] flex items-center justify-center z-50 pointer-events-none">
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
