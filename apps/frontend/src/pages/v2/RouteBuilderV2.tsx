import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, MapPin, Send, Bot, Trash2, Navigation, Bike, Route as RouteIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useSearchParams, useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
// Leaflet Components
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
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

export default function RouteBuilderV2({ initialMode, onBack }: { initialMode?: string, onBack?: () => void }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState<string | null>(searchParams.get('projectId'));
  
  // map initialMode ('fastbike', 'trekking', 'hiking-mountain') to vehicleType/bikeSubtype
  const getInitialTypes = () => {
    if (initialMode === 'fastbike') return { v: 'bicycle' as const, b: 'road' as const };
    if (initialMode === 'hiking-mountain') return { v: 'hiking' as const, b: 'gravel' as const };
    return { v: 'bicycle' as const, b: 'gravel' as const };
  };
  
  const [vehicleType, setVehicleType] = useState<'motorcycle' | 'bicycle' | 'hiking'>(getInitialTypes().v);
  const [bikeSubtype, setBikeSubtype] = useState<'gravel' | 'road' | 'mtb'>(getInitialTypes().b);
  
  const [waypoints, setWaypoints] = useState<{lat: number, lng: number, type: string}[]>([]);
  const [geometry, setGeometry] = useState<any>(null);
  const [isRouting, setIsRouting] = useState(false);

  const [inputNotes, setInputNotes] = useState('');
  const [chatMessages, setChatMessages] = useState<{role: 'agent'|'user', text: string}[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [gpxData, setGpxData] = useState<string | null>(null);
  const [guideText, setGuideText] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load existing project if projectId is in URL
  const skipNextCalc = useRef(false);
  useEffect(() => {
    if (projectId) {
      supabase.from('route_builder_projects').select('*').eq('id', projectId).single()
        .then(({ data }) => {
           if (data && data.requirements) {
              const reqs = data.requirements;
              if (reqs.chatMessages) setChatMessages(reqs.chatMessages);
              if (reqs.gpxData) setGpxData(reqs.gpxData);
              if (reqs.guideText) setGuideText(reqs.guideText);
              if (reqs.vehicleType) setVehicleType(reqs.vehicleType);
              if (reqs.bikeSubtype) setBikeSubtype(reqs.bikeSubtype);
              if (reqs.geometry) setGeometry({ type: 'LineString', coordinates: reqs.geometry.map((p: any) => [p[1], p[0]]) });
              if (reqs.waypoints) {
                  skipNextCalc.current = true;
                  setWaypoints(reqs.waypoints);
              }
           }
        });
    }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping]);

  // Recalculate route whenever waypoints or vehicle type changes
  useEffect(() => {
    if (skipNextCalc.current) {
        skipNextCalc.current = false;
        return;
    }
    if (waypoints.length >= 2) {
      // Use a small delay to avoid calling while state is still being set
      const timer = setTimeout(() => {
        doCalculateLiveRoute(waypoints, vehicleType, bikeSubtype);
      }, 100);
      return () => clearTimeout(timer);
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

  const handleMarkerDrag = (index: number, e: any) => {
    const newPos = e.target.getLatLng();
    setWaypoints(prev => {
      const newWps = [...prev];
      newWps[index] = { ...newWps[index], lat: newPos.lat, lng: newPos.lng };
      return newWps;
    });
  };

  const handleRemoveWaypoint = (index: number) => {
    setWaypoints(prev => {
      const newWps = [...prev];
      newWps.splice(index, 1);
      // Re-assign types based on length
      if (newWps.length === 1) {
        newWps[0].type = 'start';
      } else if (newWps.length > 1) {
        newWps[0].type = 'start';
        newWps[newWps.length - 1].type = 'end';
        for (let i = 1; i < newWps.length - 1; i++) {
          newWps[i].type = 'waypoint';
        }
      }
      return newWps;
    });
  };

  const doCalculateLiveRoute = async (
    wps: typeof waypoints, 
    vType: typeof vehicleType, 
    bType: typeof bikeSubtype,
    forceMessages?: {role: string, text: string}[]
  ) => {
    setIsRouting(true);
    try {
      let messagesToUse = forceMessages || chatMessages;
      
      // Fallback if user clicks generate without chatting
      if (messagesToUse.length === 0) {
          let fallbackText = "Proszę wyznacz trasę na podstawie moich punktów.";
          if (inputNotes) fallbackText += ` Moje notatki: ${inputNotes}`;
          if (wps.length > 0) {
              // Add rough coordinates to help the agent find the locations
              fallbackText += ` Wyznaczam przez ${wps.length} punktów: ${wps.map((wp, i) => `Pkt ${i+1} (lat:${wp.lat.toFixed(4)}, lng:${wp.lng.toFixed(4)})`).join(', ')}`;
          }
          messagesToUse = [{ role: 'user', text: fallbackText }];
      }
      
      const res = await fetch('/atlas/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: messagesToUse.map(m => ({ role: m.role, content: m.text })),
          profile: vType === 'bicycle' ? bType : vType
        })
      });

      if (!res.ok) throw new Error('Generation failed: ' + res.status);
      const data = await res.json();
      
      if (data.trackPoints && data.trackPoints.length > 0) {
        setGeometry({
          type: 'LineString',
          coordinates: data.trackPoints.map((p: number[]) => [p[1], p[0]]) // [lat,lng] -> [lng,lat] for GeoJSON
        });
        
        // Populate waypoints from generated points if available
        if (data.points && data.points.length > 1) {
            // we could parse them here, but the map will show the geometry.
        }
        
        toast.success("Trasa wygenerowana pomyślnie!");
        
        if (data.gpx) {
            setGpxData(data.gpx);
        }
        if (data.guide) {
            setGuideText(data.guide);
        }

        // Save project to supabase
        try {
          const { data: userData } = await supabase.auth.getUser();
          if (userData.user) {
            if (!projectId) {
              const { data: project } = await supabase
                .from('route_builder_projects')
                .insert({
                  user_id: userData.user.id,
                  requirements: {
                    title: data.title || 'Nowa Trasa AI',
                    chatMessages: messagesToUse,
                    waypoints: wps,
                    geometry: data.trackPoints,
                    gpxData: data.gpx,
                    guideText: data.guide,
                    vehicleType: vType,
                    bikeSubtype: bType
                  }
                })
                .select()
                .single();
              if (project) {
                setProjectId(project.id);
                navigate(`/create?projectId=${project.id}`, { replace: true });
              }
            } else {
              // Update existing
              await supabase
                .from('route_builder_projects')
                .update({
                  requirements: {
                    title: data.title || 'Nowa Trasa AI',
                    chatMessages: messagesToUse,
                    waypoints: wps,
                    geometry: data.trackPoints,
                    gpxData: data.gpx,
                    guideText: data.guide,
                    vehicleType: vType,
                    bikeSubtype: bType
                  },
                  updated_at: new Date().toISOString()
                })
                .eq('id', projectId);
            }
          }
        } catch (e) {
          console.error("Failed to save project", e);
        }

      } else {
          toast.error("Agent nie zwrócił współrzędnych trasy.");
      }
    } catch (err: any) {
      toast.error('Błąd wyznaczania trasy: ' + err.message);
    } finally {
      setIsRouting(false);
    }
  };

  const calculateLiveRoute = async () => {
    doCalculateLiveRoute(waypoints, vehicleType, bikeSubtype);
  };

  const clearRoute = () => {
    setWaypoints([]);
    setGeometry(null);
    setGpxData(null);
    setGuideText(null);
    setProjectId(null);
    navigate('/create', { replace: true });
  };

  const handleDownloadPdf = () => {
    if (!guideText) return;
    const doc = new jsPDF();
    doc.addFont("Helvetica", "Helvetica", "normal");
    doc.setFont("Helvetica");
    
    // Split text to fit page width
    const splitText = doc.splitTextToSize(guideText, 180);
    
    let y = 20;
    doc.setFontSize(16);
    doc.text("Przewodnik po Trasie", 10, y);
    y += 15;
    
    doc.setFontSize(12);
    for (let i = 0; i < splitText.length; i++) {
        if (y > 280) {
            doc.addPage();
            y = 20;
        }
        doc.text(splitText[i], 10, y);
        y += 7;
    }
    doc.save("przewodnik_trasy.pdf");
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isTyping) return;

    let userText = inputValue;
    setInputValue('');
    
    // Inject map context into user message if they have waypoints or notes
    let userContext = '';
    if (waypoints.length > 0) userContext += ` [Mam na mapie ${waypoints.length} punktów]`;
    if (inputNotes) userContext += ` [Moje notatki: ${inputNotes}]`;
    if (vehicleType) userContext += ` [Pojazd: ${vehicleType}]`;
    
    const actualTextToSend = userText + userContext;
    
    const newMessages: {role: 'agent'|'user', text: string}[] = [...chatMessages, { role: 'user', text: actualTextToSend }];
    setChatMessages(newMessages);
    setIsTyping(true);

    try {
      const response = await fetch('/atlas/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: newMessages.map(m => ({ role: m.role, content: m.text }))
        }) 
      });
      const data = await response.json();
      
      if (data.reply) {
        setChatMessages(prev => [...prev, { role: 'agent', text: data.reply }]);
      }
      
      if (data.is_ready) {
        toast.success("Agent zebrał dane. Rozpoczynam planowanie trasy...");
        // Auto-trigger generation
        doCalculateLiveRoute(waypoints, vehicleType, bikeSubtype, newMessages);
      }
      
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
          {onBack && (
            <button onClick={onBack} className="text-xs text-slate-500 hover:text-slate-700 flex items-center mb-3">
              ← Zmień tryb
            </button>
          )}
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
              key={`${i}-${wp.lat}-${wp.lng}`} 
              position={[wp.lat, wp.lng]} 
              icon={wp.type === 'start' ? startIcon : (wp.type === 'end' ? endIcon : wpIcon)}
              draggable={true}
              eventHandlers={{
                dragend: (e) => handleMarkerDrag(i, e)
              }}
            >
              <Popup>
                <div className="text-center">
                  <p className="text-sm font-semibold mb-2">Punkt trasy</p>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="h-7 text-xs"
                    onClick={() => handleRemoveWaypoint(i)}
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Usuń punkt
                  </Button>
                </div>
              </Popup>
            </Marker>
          ))}
          
          <MapResizer geometry={geometry} />
        </MapContainer>
        
        <div className="absolute bottom-6 left-6 z-[1000]">
          <Badge variant="outline" className="bg-white/90 border-emerald-500/30 text-emerald-600 backdrop-blur-md py-1.5 px-4 rounded-full shadow-lg">
            <MapPin className="w-3 h-3 mr-2" /> Live GraphHopper
          </Badge>
        </div>

        {gpxData && (
          <div className="absolute top-6 right-6 z-[1000] flex flex-col gap-4 w-96 max-h-[90vh]">
            <Card className="p-4 bg-white/95 backdrop-blur shadow-xl border-emerald-100 shrink-0">
              <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500"/>
                Twoja Trasa
              </h3>
              <Button 
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-md mb-2"
                onClick={() => {
                  const blob = new Blob([gpxData], { type: 'application/gpx+xml' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'trasa_routemarket.gpx';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Pobierz Plik GPX
              </Button>
              {guideText && (
                <Button 
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white shadow-md"
                  onClick={handleDownloadPdf}
                >
                  Pobierz Przewodnik PDF
                </Button>
              )}
            </Card>

            {guideText && (
              <Card className="p-5 bg-white/95 backdrop-blur shadow-xl border-emerald-100 overflow-y-auto flex-1">
                <h3 className="font-bold text-slate-800 mb-3">Przewodnik po trasie</h3>
                <div className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                  {guideText}
                </div>
              </Card>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
