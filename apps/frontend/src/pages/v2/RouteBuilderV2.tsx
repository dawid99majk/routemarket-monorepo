import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles, MapPin, Compass, CheckCircle2 } from 'lucide-react';
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
    if (geometry && geometry.coordinates && geometry.coordinates.length > 0) {
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
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        
        {geometry && geometry.coordinates && (
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
          GIS Engine: Google Routes v4
        </Badge>
        <Badge variant="outline" className="bg-slate-950/80 border-blue-500/50 text-blue-400 backdrop-blur-md">
          Mode: Heavy Geometry
        </Badge>
      </div>
    </div>
  );
}

export default function RouteBuilderV2() {
  const [step, setStep] = useState(1);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [intent, setIntent] = useState('');
  const [category, setCategory] = useState('motorcycle');
  const [distance, setDistance] = useState([50]);
  const [startPoint, setStartPoint] = useState('');
  
  const [geometry, setGeometry] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [guideUrl, setGuideUrl] = useState<string | null>(null);

  // 1. Inicjalizacja projektu
  const handleCreateProject = async () => {
    setLoading(true);
    try {
      const res = await fetch('/route-builder-api/route-projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token') || ''}`
        },
        body: JSON.stringify({
          start_point: startPoint || 'Unknown',
          region: 'Global',
          route_type: category,
          distance_target_km: distance[0],
          difficulty: 'medium',
          input_notes: intent
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setProjectId(data.id);
      setStep(2);
    } catch (err: any) {
      toast.error('Błąd: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Generowanie geometrii (Takt 1) - proxy przez API
  const handleGenerateGeometry = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch('/route-builder-api/route-projects/atlas/geometry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token') || ''}`
        },
        body: JSON.stringify({
          category,
          targetDistance: distance[0],
          waypoints: [
            { lat: 49.299, lng: 19.949 }, // Przykład dla testów, w prod tu idą punkty z mapy
            { lat: 49.3, lng: 20.0 }
          ]
        })
      });
      if (!res.ok) throw new Error('Geometry failed');
      const data = await res.json();
      setGeometry(data.geometry);
      
      // Teraz odpalamy Research (Takt 2)
      setStep(3);
      await handleRunResearch(data.url);
    } catch (err: any) {
      toast.error(err.message);
      setLoading(false);
    }
  };

  // 3. Deep Research (Takt 2)
  const handleRunResearch = async (gpxUrl: string) => {
    try {
      const res = await fetch('/route-builder-api/route-projects/atlas/research', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token') || ''}`
        },
        body: JSON.stringify({
          gpxUrl,
          userIntent: intent
        })
      });
      if (!res.ok) throw new Error('Research failed');
      const data = await res.json();
      setProjectId(data.projectId);
      setStep(4);
      setGuideUrl(`/route-projects/${data.projectId}`);
      toast.success('Przewodnik wygenerowany!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-slate-200 p-8 pt-24 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-black bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent tracking-tight">
              Route Builder V2
            </h1>
            <p className="text-slate-400 mt-2 text-lg">Kreator tras oparty na Atlas GIS i Deep Research</p>
          </div>
          
          <div className="flex gap-2">
            {[1, 2, 3, 4].map(s => (
              <div key={s} className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${step === s ? 'bg-emerald-500 text-black' : step > s ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}>
                {s}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Panel roboczy */}
          <Card className="lg:col-span-1 bg-slate-900 border-slate-800 shadow-2xl">
            <CardContent className="p-6 space-y-6">
              
              {step === 1 && (
                <div className="space-y-4 animate-in fade-in">
                  <h2 className="text-xl font-bold flex items-center gap-2 text-white mb-6">
                    <Compass className="text-blue-400" /> Krok 1: Wymagania
                  </h2>
                  <div>
                    <label className="text-sm text-slate-400 font-medium">Punkt startowy</label>
                    <input 
                      type="text" 
                      value={startPoint} 
                      onChange={e => setStartPoint(e.target.value)} 
                      placeholder="np. Zakopane"
                      className="w-full bg-slate-950 border border-slate-800 rounded-md p-3 text-white mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-400 font-medium">Kategoria pojazdu</label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="w-full bg-slate-950 border-slate-800 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="motorcycle">Motocykl</SelectItem>
                        <SelectItem value="bicycle">Rower szosowy</SelectItem>
                        <SelectItem value="mtb">MTB</SelectItem>
                        <SelectItem value="car">Samochód</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="pt-2">
                    <label className="text-sm text-slate-400 font-medium flex justify-between">
                      Dystans docelowy <span className="font-bold text-emerald-400">{distance[0]} km</span>
                    </label>
                    <Slider 
                      value={distance} 
                      onValueChange={setDistance} 
                      min={10} max={500} step={10} 
                      className="mt-4"
                    />
                  </div>
                  <div className="pt-2">
                    <label className="text-sm text-slate-400 font-medium">Intencja (Notatki dla AI)</label>
                    <Textarea 
                      value={intent}
                      onChange={e => setIntent(e.target.value)}
                      placeholder="Opisz czego szukasz: dużo zakrętów, widoki na jeziora..."
                      className="bg-slate-950 border-slate-800 mt-1 h-32"
                    />
                  </div>
                  <Button 
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-12 mt-4"
                    onClick={handleCreateProject}
                    disabled={loading || !startPoint}
                  >
                    {loading ? <Loader2 className="animate-spin mr-2" /> : 'Zainicjuj Projekt'}
                  </Button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4 animate-in fade-in">
                  <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                    <MapPin className="text-emerald-400" /> Krok 2: Geometria
                  </h2>
                  <p className="text-slate-400 text-sm mb-4">
                    Projekt zainicjowany. Silnik zbuduje teraz geometrię używając modulu atlas-gis (Zero LLM).
                  </p>
                  <Button 
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-12"
                    onClick={handleGenerateGeometry}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="animate-spin mr-2" /> : 'Generuj matematyczny GPX'}
                  </Button>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4 animate-in fade-in">
                  <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                    <Sparkles className="text-purple-400" /> Krok 3: Badanie
                  </h2>
                  <div className="bg-slate-950 border border-purple-500/30 rounded-lg p-6 flex flex-col items-center justify-center text-center space-y-4 mt-8">
                    <Loader2 className="animate-spin w-12 h-12 text-purple-400" />
                    <p className="text-purple-300 font-medium">Deep Research w toku...</p>
                    <p className="text-slate-500 text-sm">Gemini analizuje GPX i pobiera informacje krajoznawcze z Grounded Search.</p>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4 animate-in fade-in">
                  <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                    <CheckCircle2 className="text-emerald-400" /> Krok 4: Gotowe
                  </h2>
                  <p className="text-slate-400 text-sm mb-4">
                    Projekt zakończony. GPX został wygenerowany, a AI napisało kompletny przewodnik turystyczny do tej trasy.
                  </p>
                  <Button 
                    variant="outline" 
                    className="w-full border-slate-700 text-slate-300 h-12"
                    onClick={() => window.location.href = guideUrl || '#'}
                  >
                    Otwórz podgląd przewodnika
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Podgląd Mapy 3D */}
          <Card className="lg:col-span-3 bg-slate-900 border-slate-800 shadow-2xl h-[700px] p-2 relative overflow-hidden">
            {!geometry && step < 4 && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm text-center p-8">
                <MapPin className="w-16 h-16 text-slate-700 mb-4" />
                <h3 className="text-2xl font-bold text-slate-300">Mapa oczekuje na koordynaty</h3>
                <p className="text-slate-500 mt-2">Przejdź przez proces po lewej, aby wygenerować i wyświetlić trasę.</p>
              </div>
            )}
            <UnifiedMap geometry={geometry} start={null} end={null} midpoint={null} />
          </Card>

        </div>
      </div>
    </div>
  );
}
