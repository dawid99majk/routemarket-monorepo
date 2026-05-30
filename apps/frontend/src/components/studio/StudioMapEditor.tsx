import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { Loader2, Play } from 'lucide-react';
import { env } from '@/env';

interface Waypoint {
  lat: number;
  lng: number;
}

export default function StudioMapEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.FeatureGroup | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);

  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [track, setTrack] = useState<[number, number][]>([]);
  
  const [userIntent, setUserIntent] = useState('');
  const [targetDistance, setTargetDistance] = useState(50);
  const [category, setCategory] = useState('gravel');
  
  const [isGeneratingGeometry, setIsGeneratingGeometry] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [gpxUrl, setGpxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
    }).setView([49.524, 20.124], 10);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map);

    const markersGroup = L.featureGroup().addTo(map);
    markersGroupRef.current = markersGroup;
    mapRef.current = map;

    map.on('click', (e: L.LeafletMouseEvent) => {
      const newWpt = { lat: e.latlng.lat, lng: e.latlng.lng };
      setWaypoints(prev => [...prev, newWpt]);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const group = markersGroupRef.current;
    if (!group) return;
    group.clearLayers();

    waypoints.forEach((wpt) => {
      L.marker([wpt.lat, wpt.lng], {
        icon: L.divIcon({
          className: 'custom-pin',
          html: `<div style="background: #00f2ff; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px #00f2ff;"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        })
      }).addTo(group);
    });
  }, [waypoints]);

  useEffect(() => {
    if (waypoints.length < 2) return;
    
    const fetchGeometry = async () => {
      setIsGeneratingGeometry(true);
      try {
        const res = await fetch(`${env.VITE_API_URL}/api/routes/geometry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ waypoints, targetDistance, category })
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setGpxUrl(data.url);
        
        const xmlRes = await fetch(data.url);
        const xmlText = await xmlRes.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, 'text/xml');
        const trkpts = Array.from(doc.querySelectorAll('trkpt'));
        const newTrack = trkpts.map(pt => [
          parseFloat(pt.getAttribute('lat') || '0'), 
          parseFloat(pt.getAttribute('lon') || '0')
        ] as [number, number]);
        
        setTrack(newTrack);
        toast.success("Geometria wyznaczona pomyślnie.");
      } catch (err: any) {
        toast.error("Błąd twardej geometrii: " + err.message);
      } finally {
        setIsGeneratingGeometry(false);
      }
    };
    
    const to = setTimeout(fetchGeometry, 1000);
    return () => clearTimeout(to);
  }, [waypoints, targetDistance, category]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || track.length < 2) return;

    if (polylineRef.current) map.removeLayer(polylineRef.current);

    polylineRef.current = L.polyline(track, {
      color: '#00f2ff',
      weight: 4,
      opacity: 0.8,
      className: 'neon-line'
    }).addTo(map);

    map.fitBounds(polylineRef.current.getBounds(), { padding: [50, 50] });
  }, [track]);

  const handleAccept = async () => {
    if (!gpxUrl) return toast.error("Brak śladu GPX. Postaw przynajmniej 2 punkty na mapie.");
    if (!userIntent.trim()) return toast.error("Wpisz intencję wyjazdu.");
    
    setIsResearching(true);
    const tId = toast.loading("AI Gemini analizuje trasę i wyszukuje atrakcje...");
    try {
      const res = await fetch(`${env.VITE_API_URL}/api/routes/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gpxUrl, userIntent })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      toast.success("Przewodnik Premium został zapisany!", { id: tId });
      
      window.location.href = `/route/${data.projectId}`;
    } catch (err: any) {
      toast.error("Błąd Deep Research: " + err.message, { id: tId });
      setIsResearching(false);
    }
  };

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden border border-border/20 shadow-2xl bg-black">
      <div ref={containerRef} className="absolute inset-0 z-0" />
      
      <div className="absolute top-6 left-6 z-10 w-96 space-y-4">
        <div className="bg-black/60 backdrop-blur-xl p-5 rounded-2xl border border-white/10 text-white space-y-5 shadow-2xl">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
              Atlas Twarda Geometria
            </h2>
            <p className="text-xs text-slate-400">Klikaj na mapie aby tworzyć węzły. Geometria jest przeliczana w locie.</p>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Intencja Wyjazdu</label>
            <Input 
              value={userIntent}
              onChange={e => setUserIntent(e.target.value)}
              placeholder="np. Szukam spokojnych szutrów z dobrym jedzeniem" 
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 h-11"
            />
          </div>

          <div className="space-y-4">
            <div className="flex justify-between text-xs">
              <span className="font-bold text-cyan-400 uppercase tracking-widest">Dystans</span>
              <span className="font-mono">{targetDistance} km</span>
            </div>
            <Slider 
              value={[targetDistance]} 
              onValueChange={v => setTargetDistance(v[0])} 
              max={300} min={10} step={5}
              className="py-2"
            />
          </div>
          
          <div className="space-y-3">
            <label className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Nawierzchnia</label>
            <select 
              className="w-full bg-white/5 border border-white/10 rounded-lg h-10 px-3 text-sm focus:outline-none"
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              <option value="gravel">Szuter / Gravel</option>
              <option value="road">Szosa / Asfalt</option>
              <option value="mtb">MTB / Teren</option>
            </select>
          </div>

          <Button 
            onClick={handleAccept} 
            disabled={isGeneratingGeometry || isResearching || waypoints.length < 2}
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold h-12 text-sm shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all"
          >
            {isResearching ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Deep Research trwa...</>
            ) : (
              <><Play className="w-5 h-5 mr-2" /> Akceptuj trasę i generuj</>
            )}
          </Button>
        </div>
      </div>
      
      {isGeneratingGeometry && (
        <div className="absolute top-6 right-6 z-10 bg-black/80 backdrop-blur-md px-4 py-2 rounded-full border border-cyan-500/50 flex items-center gap-3 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
          <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
          <span className="text-xs font-mono text-cyan-400">Przeliczanie wektorów GPX...</span>
        </div>
      )}
    </div>
  );
}
