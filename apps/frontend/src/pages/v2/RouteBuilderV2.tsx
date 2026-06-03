import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, MapPin, Send, Bot, Trash2, Navigation, Bike, Route as RouteIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';

// Leaflet Components
import { MapContainer, TileLayer, Polyline, Marker, useMap, useMapEvents } from 'react-leaflet';
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

// A green icon for start, red for end, blue for intermediate
const createIcon = (color: string) => {
  return new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
};
const startIcon = createIcon('green');
const endIcon = createIcon('red');
const wpIcon = createIcon('blue');

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

function ClickableMap({ onMapClick }: { onMapClick: (latlng: L.LatLng) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    },
  });
  return null;
}

export default function RouteBuilderV2() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [vehicleType, setVehicleType] = useState<'motorcycle' | 'bicycle' | 'hiking'>('motorcycle');
  const [bikeSubtype, setBikeSubtype] = useState<'gravel' | 'road' | 'mtb'>('gravel');
  
  const [waypoints, setWaypoints] = useState<{lat: number, lng: number, type: string}[]>([]);
  const [geometry, setGeometry] = useState<any>(null);
  const [isRouting, setIsRouting] = useState(false);

  const [inputNotes, setInputNotes] = useState('');
  const [chatMessages, setChatMessages] = useState<{role: 'agent'|'user', text: string}[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping]);

  // Recalculate route whenever waypoints or vehicle type changes
  useEffect(() => {
    if (waypoints.length >= 2) {
      calculateLiveRoute();
    } else {
      setGeometry(null);
    }
  }, [waypoints, vehicleType, bikeSubtype]);

  const handleMapClick = (latlng: L.LatLng) => {
    setWaypoints(prev => {
      const newWps = [...prev];
      if (newWps.length === 0) {
        newWps.push({ lat: latlng.lat, lng: latlng.lng, type: 'start' });
      } else if (newWps.length === 1) {
        newWps.push({ lat: latlng.lat, lng: latlng.lng, type: 'end' });
      } else {
        // Insert before the last one (end)
        const endWp = newWps.pop()!;
        newWps.push({ lat: latlng.lat, lng: latlng.lng, type: 'waypoint' });
        newWps.push(endWp);
      }
      return newWps;
    });
  };

  const calculateLiveRoute = async () => {
    setIsRouting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';

      const routeType = vehicleType === 'bicycle' ? bikeSubtype : vehicleType;

      const res = await fetch('/route-builder-api/live-route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          points: waypoints,
          route_type: routeType,
          surface_preferences: [], // can be derived from bikeSubtype later
          intent: inputNotes
        })
      });

      if (!res.ok) throw new Error('Live routing failed');
      const route = await res.json();
      if (route.geometry) {
        setGeometry(route.geometry);
      } else if (route.trackPoints) {
        // Build mock geometry from trackpoints if geometry is not standard
        setGeometry({
          type: "LineString",
          coordinates: route.trackPoints.map((p: number[]) => [p[1], p[0]])
        });
      }
    } catch (err: any) {
      toast.error('Błąd wyznaczania trasy: ' + err.message);
    } finally {
      setIsRouting(false);
    }
  };

  const clearRoute = () => {
    setWaypoints([]);
    setGeometry(null);
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isTyping) return;

    const userText = inputValue;
    setInputValue('');
    const newMessages: {role: 'agent'|'user', text: string}[] = [...chatMessages, { role: 'user', text: userText }];
    setChatMessages(newMessages);
    setIsTyping(true);

    try {
      // Wysłanie notatek dla pełniejszego kontekstu, nawet jeśli nie ma projektu
      const response = await fetch('/route-builder-api/chat-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: newMessages, 
          project_id: projectId,
          // Dodatkowy fallback: przekazanie notatek bezposrednio w body
          input_notes: inputNotes
        }) 
      });
      const data = await response.json();
      
      setChatMessages(prev => [...prev, { role: 'agent', text: data.reply }]);
      
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans overflow-hidden">
      
      {/* Left Panel - Control & Chat */}
      <div className="w-[400px] flex flex-col bg-white border-r border-slate-200 shadow-xl z-10 shrink-0">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 bg-white">
          <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-500" />
            Atlas Builder Live
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">Dodawaj punkty na mapie lub rozmawiaj z Agentem.</p>
        </div>

        {/* Notes / Settings Area */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 block">Krótki opis / cel wycieczki</label>
          <Textarea 
            placeholder="Napisz gdzie jedziesz i na czym, np. 50km w Karkonoszach pieszo..." 
            className="min-h-[80px] bg-white resize-none text-sm"
            value={inputNotes}
            onChange={e => setInputNotes(e.target.value)}
          />
          {waypoints.length > 0 && (
            <div className="mt-3 flex justify-between items-center bg-emerald-50 text-emerald-700 px-3 py-2 rounded-lg text-sm font-medium">
              <span>Punktów: {waypoints.length}</span>
              <button onClick={clearRoute} className="text-red-500 hover:text-red-700 flex items-center gap-1">
                <Trash2 className="w-4 h-4" /> Wyczyść
              </button>
            </div>
          )}
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
          {chatMessages.length === 0 && (
            <div className="text-center text-slate-400 text-sm mt-10">
              <Bot className="w-10 h-10 mx-auto mb-3 opacity-50" />
              Napisz do mnie, a pomogę Ci dobrać odpowiednią trasę i miejsca na mapie!
            </div>
          )}
          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-emerald-600 text-white rounded-br-sm' 
                  : 'bg-white text-slate-800 rounded-bl-sm border border-slate-200'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white text-slate-800 rounded-2xl rounded-bl-sm border border-slate-200 p-4 shadow-sm flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></span>
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Chat Input */}
        <div className="p-4 bg-white border-t border-slate-200">
          <form onSubmit={handleChatSubmit} className="relative flex items-center">
            <Input 
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="Zapytaj agenta o poradę..."
              className="w-full bg-slate-50 border-slate-200 rounded-full pl-4 pr-12 py-5 text-slate-900 focus-visible:ring-emerald-500/50"
            />
            <Button type="submit" size="icon" className="absolute right-1 rounded-full bg-emerald-600 hover:bg-emerald-500 w-8 h-8 text-white">
              <Send className="w-3.5 h-3.5 ml-0.5" />
            </Button>
          </form>
        </div>
      </div>

      {/* Right Panel - Map */}
      <div className="flex-1 relative bg-slate-100 h-full w-full">
        
        {/* Floating Vehicle Selector */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-2">
          
          {/* Main Selector */}
          <div className="bg-white/90 backdrop-blur-md rounded-full shadow-lg p-1.5 flex gap-1 border border-slate-200/50">
            <Button 
              variant={vehicleType === 'motorcycle' ? 'default' : 'ghost'} 
              className={`rounded-full px-5 h-10 ${vehicleType === 'motorcycle' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setVehicleType('motorcycle')}
            >
              <Navigation className="w-4 h-4 mr-2" /> Motocykl
            </Button>
            <Button 
              variant={vehicleType === 'bicycle' ? 'default' : 'ghost'} 
              className={`rounded-full px-5 h-10 ${vehicleType === 'bicycle' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setVehicleType('bicycle')}
            >
              <Bike className="w-4 h-4 mr-2" /> Rower
            </Button>
            <Button 
              variant={vehicleType === 'hiking' ? 'default' : 'ghost'} 
              className={`rounded-full px-5 h-10 ${vehicleType === 'hiking' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setVehicleType('hiking')}
            >
              <RouteIcon className="w-4 h-4 mr-2" /> Pieszo
            </Button>
          </div>

          {/* Sub Selector for Bicycle */}
          {vehicleType === 'bicycle' && (
            <div className="bg-white/90 backdrop-blur-md rounded-full shadow-md p-1 flex gap-1 border border-slate-200/50 animate-in slide-in-from-top-2">
              <Button 
                variant={bikeSubtype === 'road' ? 'secondary' : 'ghost'} 
                size="sm"
                className={`rounded-full px-4 h-8 text-xs ${bikeSubtype === 'road' ? 'bg-emerald-100 text-emerald-800' : 'text-slate-500'}`}
                onClick={() => setBikeSubtype('road')}
              >
                Szosa / Asfalt
              </Button>
              <Button 
                variant={bikeSubtype === 'gravel' ? 'secondary' : 'ghost'} 
                size="sm"
                className={`rounded-full px-4 h-8 text-xs ${bikeSubtype === 'gravel' ? 'bg-emerald-100 text-emerald-800' : 'text-slate-500'}`}
                onClick={() => setBikeSubtype('gravel')}
              >
                Szuter / Gravel
              </Button>
              <Button 
                variant={bikeSubtype === 'mtb' ? 'secondary' : 'ghost'} 
                size="sm"
                className={`rounded-full px-4 h-8 text-xs ${bikeSubtype === 'mtb' ? 'bg-emerald-100 text-emerald-800' : 'text-slate-500'}`}
                onClick={() => setBikeSubtype('mtb')}
              >
                MTB / Góry
              </Button>
            </div>
          )}
        </div>

        {/* Loading Indicator */}
        {isRouting && (
          <div className="absolute top-6 right-6 z-[1000] bg-white/90 backdrop-blur-md rounded-full shadow-lg py-2 px-4 flex items-center gap-2 border border-emerald-100">
            <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
            <span className="text-sm font-semibold text-emerald-700">Przeliczam trasę...</span>
          </div>
        )}

        {/* Map */}
        <MapContainer 
          center={[52.069, 19.480]} // Center of Poland roughly
          zoom={6} 
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          
          <ClickableMap onMapClick={handleMapClick} />

          {geometry && geometry.coordinates && (
            <Polyline 
              positions={geometry.coordinates.map((c: any) => [c[1], c[0]])} 
              pathOptions={{ 
                color: vehicleType === 'hiking' ? '#f43f5e' : '#10b981', 
                weight: 5, 
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round'
              }} 
            />
          )}

          {waypoints.map((wp, i) => (
            <Marker 
              key={i} 
              position={[wp.lat, wp.lng]} 
              icon={wp.type === 'start' ? startIcon : (wp.type === 'end' ? endIcon : wpIcon)}
            />
          ))}
          
          <MapResizer geometry={geometry} />
        </MapContainer>
        
        <div className="absolute bottom-6 right-6 z-[1000]">
          <Badge variant="outline" className="bg-white/90 border-emerald-500/30 text-emerald-600 backdrop-blur-md py-1.5 px-4 rounded-full shadow-lg">
            <MapPin className="w-3 h-3 mr-2" /> Live GraphHopper
          </Badge>
        </div>

      </div>
    </div>
  );
}
