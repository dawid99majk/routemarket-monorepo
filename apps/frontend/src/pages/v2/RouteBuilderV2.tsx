
function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;  
  const dLon = (lon2 - lon1) * Math.PI / 180; 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in km
  return d;
}
import { useState, useEffect, useRef, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, MapPin, Send, Bot, Trash2, Navigation, Bike, Route as RouteIcon, Building2, Car, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useSearchParams, useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// @ts-ignore
import html2pdf from 'html2pdf.js';
// Leaflet Components
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet icon issue
// @ts-expect-error Leaflet internal typings issue
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

import { ElevationProfile } from '@/components/ElevationProfile';
import { useWizardMachine } from '@/hooks/use-wizard-machine';

export default function RouteBuilderV2({ onBack }: { onBack?: () => void }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const { state, context, send, setField } = useWizardMachine(searchParams.get('projectId'));
  
  const projectId = context.projectId;
  const chatMessages = context.chatMessages;
  const inputNotes = context.inputNotes;
  const vehicleType = context.vehicleType;
  const bikeSubtype = context.bikeSubtype;
  const waypoints = context.waypoints;
  const geometry = context.geometry;
  const gpxData = context.gpxData;
  const guideText = context.guideText;
  const routingPreference = context.routingPreference;
  
  const isRouting = state.matches('generating_route') || state.matches('saving_project');
  const isTyping = state.matches('chatting');

  
  
  
  
  
  
  
  const [tempMarker, setTempMarker] = useState<L.LatLng | null>(null);

  const handleAddPointFromTemp = (type: 'start' | 'end' | 'waypoint') => {
    if (!tempMarker) return;
    
    // Dispatch to XState instead of manually manipulating array
    if (type === 'start' || type === 'end') {
        const existingIdx = waypoints.findIndex((w: any) => w.type === type);
        if (existingIdx >= 0) {
           send({ type: 'UPDATE_WAYPOINT', index: existingIdx, waypoint: { lat: tempMarker.lat, lng: tempMarker.lng, type } });
        } else {
           send({ type: 'ADD_WAYPOINT', waypoint: { lat: tempMarker.lat, lng: tempMarker.lng, type }, index: type === 'start' ? 0 : undefined });
        }
    } else {
        // Waypoint insertion logic simplified
        send({ type: 'ADD_WAYPOINT', waypoint: { lat: tempMarker.lat, lng: tempMarker.lng, type: 'waypoint' } });
    }

    setTempMarker(null);
  };
  
  

  
  
  const [inputValue, setInputValue] = useState('');
  
  
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<'chat' | 'details' | 'saved'>('chat');
  const [showNotes, setShowNotes] = useState<boolean>(true);

  // Calculate route stats (distance and ascent/descent)
  const routeStats = useMemo(() => {
    if (!geometry || !geometry.coordinates || geometry.coordinates.length < 2) {
      return { distance: 0, ascent: 0, descent: 0 };
    }
    let totalDist = 0;
    let totalAscent = 0;
    let totalDescent = 0;
    const coords = geometry.coordinates;
    for (let i = 0; i < coords.length - 1; i++) {
      const [lng1, lat1, ele1] = coords[i];
      const [lng2, lat2, ele2] = coords[i+1];
      totalDist += getHaversineDistance(lat1, lng1, lat2, lng2);
      const eleDiff = (ele2 || 0) - (ele1 || 0);
      if (eleDiff > 0) {
        totalAscent += eleDiff;
      } else {
        totalDescent -= eleDiff;
      }
    }
    return {
      distance: totalDist,
      ascent: totalAscent,
      descent: totalDescent
    };
  }, [geometry]);

  // Load existing project if projectId is in URL
  const skipNextCalc = useRef(false);
  useEffect(() => {
    if (projectId) {
      (supabase as any).from('route_builder_projects').select('*').eq('id', projectId).single()
        .then(({ data }) => {
           if (data && data.requirements) {
              const reqs = data.requirements;
              if (reqs.chatMessages) setField('chatMessages', reqs.chatMessages);
              if (reqs.gpxData) setField('gpxData', reqs.gpxData);
              if (reqs.guideText) setField('guideText', reqs.guideText);
              if (reqs.vehicleType) setField('vehicleType', reqs.vehicleType);
              if (reqs.bikeSubtype) setField('bikeSubtype', reqs.bikeSubtype);
              if (reqs.geometry) {
                setField('geometry', { 
                  type: 'LineString', 
                  coordinates: reqs.geometry.map((p: any) => [p[1], p[0], p[2] || 0]) 
                });
              }
              if (reqs.waypoints) {
                  skipNextCalc.current = true;
                  setField('waypoints', reqs.waypoints);
              }
              if (reqs.gpxData || reqs.guideText) {
                setActiveTab('details');
              }
           }
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping]);

  // Saved Projects states and functions
  const [savedProjects, setSavedProjects] = useState<any[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);

  const fetchSavedProjects = async () => {
    setIsLoadingSaved(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data, error } = await (supabase as any)
        .from('route_builder_projects')
        .select('*')
        .eq('user_id', userData.user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setSavedProjects(data || []);
    } catch (e: any) {
      console.error("Error fetching saved projects:", e);
      toast.error("Nie udało się pobrać zapisanych tras");
    } finally {
      setIsLoadingSaved(false);
    }
  };

  const handleLoadProject = (project: any) => {
    const reqs = project.requirements || {};
    setField('projectId', project.id);
    if (reqs.chatMessages) setField('chatMessages', reqs.chatMessages);
    if (reqs.gpxData) setField('gpxData', reqs.gpxData);
    if (reqs.guideText) setField('guideText', reqs.guideText);
    if (reqs.vehicleType) setField('vehicleType', reqs.vehicleType);
    if (reqs.bikeSubtype) setField('bikeSubtype', reqs.bikeSubtype);
    if (reqs.geometry) {
       setField('geometry', { type: 'LineString', coordinates: reqs.geometry.map((p: any) => [p[1], p[0], p[2] || 0]) });
    } else {
       setField('geometry', null);
    }
    if (reqs.waypoints) {
       skipNextCalc.current = true;
       setField('waypoints', reqs.waypoints);
    } else {
       setField('waypoints', []);
    }
    navigate(`/create?projectId=${project.id}`, { replace: true });
    setActiveTab('details');
    toast.success(`Wczytano trasę: ${reqs.title || 'Moja trasa AI'}`);
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Czy na pewno chcesz usunąć tę trasę?")) return;
    
    try {
      const { error } = await (supabase as any)
        .from('route_builder_projects')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      toast.success("Trasa została usunięta");
      setSavedProjects(prev => prev.filter(p => p.id !== id));
      if (projectId === id) {
        clearRoute();
      }
    } catch (e: any) {
      console.error("Error deleting project:", e);
      toast.error("Nie udało się usunąć trasy");
    }
  };

  useEffect(() => {
    if (activeTab === 'saved') {
      fetchSavedProjects();
    }
  }, [activeTab]);


  // Flag to prevent automatic recalculation when waypoints are updated from AI or DB load
  const skipRecalcRef = useRef(false);

  // Recalculate route whenever vehicle type, bike subtype or waypoints change
  useEffect(() => {
    if (skipNextCalc.current) {
        skipNextCalc.current = false;
        return;
    }
    if (skipRecalcRef.current) {
        skipRecalcRef.current = false;
        return;
    }
    if (waypoints.length >= 2) {
      const timer = setTimeout(() => {
        send({ type: 'CALCULATE_ROUTE' });
      }, 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints, vehicleType, bikeSubtype]);

  const handleMapClick = (latlng: L.LatLng) => {
    setTempMarker(latlng);
  };

  const handleMarkerDrag = (index: number, e: any) => {
    const newPos = e.target.getLatLng();
    send({ type: 'UPDATE_WAYPOINT', index, waypoint: { ...waypoints[index], lat: newPos.lat, lng: newPos.lng } });
  };

  const handleRemoveWaypoint = (index: number) => {
    send({ type: 'REMOVE_WAYPOINT', index });
  };

  const generateGpxString = (coords: number[][], title: string = 'Trasa RouteMarket') => {
    const points = coords.map(([lng, lat, ele]) => {
      const eleTag = ele !== undefined ? `\n        <ele>${ele.toFixed(1)}</ele>` : '';
      return `      <trkpt lat="${lat}" lon="${lng}">${eleTag}\n      </trkpt>`;
    }).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RouteMarket" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${title}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>`;
  };

  

  

  const calculateLiveRoute = async () => {
    send({ type: 'CALCULATE_ROUTE' });
  };

  const clearRoute = () => {
    setField('waypoints', []);
    setField('geometry', null);
    setField('gpxData', null);
    setField('guideText', null);
    setField('projectId', null);
    navigate('/create', { replace: true });
  };

  const handleDownloadPdf = () => {
    if (!guideText) return;
    const element = document.getElementById('guidebook-content');
    if (!element) {
        toast.error('Nie znaleziono zawartości przewodnika');
        return;
    }
    
    // Tworzymy kopię elementu, by PDF nie miał tła i szarych ramek (chcemy "czysty" styl druku)
    const printElement = element.cloneNode(true) as HTMLElement;
    printElement.className = 'prose prose-sm prose-emerald max-w-none p-8 bg-white';
    
    const wrapper = document.createElement('div');
    wrapper.appendChild(printElement);
    document.body.appendChild(wrapper);

    const opt = {
      margin:       15,
      filename:     'przewodnik_trasy.pdf',
      image: { type: 'jpeg' as 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as 'portrait' }
    };

    html2pdf().set(opt).from(wrapper).save().then(() => {
        document.body.removeChild(wrapper);
    });
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isTyping) return;
    const userText = inputValue;
    setInputValue('');
    send({ type: 'SEND_MESSAGE', text: userText });
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

        {/* Tabs Switcher */}
        <div className="flex border-b border-slate-100 p-2 bg-slate-50/30 gap-1 shrink-0">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all duration-200 ${
              activeTab === 'chat'
                ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/50'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
            }`}
          >
            Kreator AI
          </button>
          <button
            onClick={() => setActiveTab('details')}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 ${
              activeTab === 'details'
                ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/50'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
            }`}
          >
            Szczegóły
            {geometry && (
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold ml-1">
                {routeStats.distance.toFixed(1)} km
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('saved')}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all duration-200 ${
              activeTab === 'saved'
                ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/50'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
            }`}
          >
            Moje trasy
          </button>
        </div>

        {activeTab === 'chat' && (
          <>
            {/* Notes / Settings Area */}
            <div className="border-b border-slate-100 bg-slate-50/50">
              <button 
                onClick={() => setShowNotes(!showNotes)}
                className="w-full px-5 py-3 flex items-center justify-between text-xs font-semibold text-slate-700 uppercase tracking-wider hover:bg-slate-100/30 transition-colors"
              >
                <span className="flex items-center gap-1.5">Założenia trasy</span>
                <span className="text-slate-400 font-normal normal-case flex items-center gap-0.5">
                  {showNotes ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </span>
              </button>
              
              {showNotes && (
                <div className="px-5 pb-4 pt-1 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                  <Textarea 
                    placeholder="Napisz gdzie jedziesz i na czym, np. 50km w Karkonoszach pieszo..." 
                    className="min-h-[70px] bg-white resize-none text-sm border-slate-200 focus-visible:ring-emerald-500/30"
                    value={inputNotes}
                    onChange={e => setField('inputNotes', e.target.value)}
                  />
                  {waypoints.length > 0 && (
                    <div className="flex justify-between items-center bg-emerald-50 text-emerald-700 px-3 py-2 rounded-lg text-xs font-medium">
                      <span>Punkty na mapie: {waypoints.length}</span>
                      <button onClick={clearRoute} className="text-red-500 hover:text-red-700 flex items-center gap-1 font-semibold">
                        <Trash2 className="w-3.5 h-3.5" /> Wyczyść
                      </button>
                    </div>
                  )}

                  {/* Routing Preference Selector */}
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Styl trasy</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setField('routingPreference', 'popular')}
                        className={`flex-1 py-2 px-2 text-xs font-semibold rounded-lg border transition-all duration-200 flex flex-col items-center justify-center gap-1 ${
                          routingPreference === 'popular'
                            ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm'
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-lg">🏆</span>
                        Klasyki regionu
                      </button>
                      <button
                        onClick={() => setField('routingPreference', 'wild')}
                        className={`flex-1 py-2 px-2 text-xs font-semibold rounded-lg border transition-all duration-200 flex flex-col items-center justify-center gap-1 ${
                          routingPreference === 'wild'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm'
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-lg">🌲</span>
                        Poza utartym szlakiem
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
              {chatMessages.length === 0 && (
                <div className="text-center text-slate-400 text-sm mt-10 px-4">
                  <Bot className="w-10 h-10 mx-auto mb-3 opacity-40 text-emerald-600" />
                  Napisz do mnie, a pomogę Ci dobrać odpowiednią trasę i miejsca na mapie!
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-emerald-600 text-white rounded-br-sm' 
                      : 'bg-white text-slate-800 rounded-bl-sm border border-slate-200/50'
                  }`}>
                    {msg.text.replace(/\s*\[[^\]]+\]/g, '')}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white text-slate-800 rounded-2xl rounded-bl-sm border border-slate-200/50 p-4 shadow-sm flex items-center gap-1">
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
          </>
        )}

        {activeTab === 'details' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {!geometry ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-6 space-y-3 mt-10">
                <RouteIcon className="w-12 h-12 text-slate-300 animate-pulse" />
                <h3 className="font-semibold text-slate-700 text-sm">Brak aktywnej trasy</h3>
                <p className="text-xs max-w-[250px] leading-relaxed">
                  Wyznacz trasę, klikając punkty na mapie lub poproś o to Agenta w zakładce Kreator AI.
                </p>
              </div>
            ) : (
              <>
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3.5 flex flex-col">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Dystans</span>
                    <span className="text-2xl font-black text-slate-800 mt-1">
                      {routeStats.distance.toFixed(1)} <span className="text-xs font-bold text-slate-500">km</span>
                    </span>
                  </div>
                  
                  <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3.5 flex flex-col">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Suma podejść</span>
                    <span className="text-2xl font-black text-emerald-600 mt-1">
                      +{Math.round(routeStats.ascent)} <span className="text-xs font-bold text-emerald-500/80">m</span>
                    </span>
                  </div>
                </div>

                {/* Elevation Profile */}
                <ElevationProfile coordinates={geometry.coordinates} />

                {/* Actions Card */}
                {gpxData && (
                  <Card className="p-4 border-slate-200/60 bg-white shadow-sm flex flex-col gap-2.5">
                    <h4 className="font-bold text-slate-400 text-[10px] uppercase tracking-wider">Pobierz trasę</h4>
                    <div className="flex gap-2">
                      <Button 
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2 h-9"
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
                        Pobierz GPX
                      </Button>
                      {guideText && (
                        <Button 
                          className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs py-2 h-9"
                          onClick={handleDownloadPdf}
                        >
                          Przewodnik PDF
                        </Button>
                      )}
                    </div>
                  </Card>
                )}

                {/* Guide Text */}
                {guideText && (
                  <div className="space-y-3 mt-4">
                    <h3 className="font-bold text-slate-400 text-[10px] uppercase tracking-wider">Przewodnik po trasie</h3>
                    <div id="guidebook-content" className="bg-white border border-slate-200/60 shadow-sm rounded-xl p-6 sm:p-8 text-slate-800 prose prose-slate prose-sm sm:prose-base max-w-none prose-headings:font-black prose-headings:tracking-tight prose-a:text-emerald-600 hover:prose-a:text-emerald-500 prose-img:rounded-xl prose-p:leading-relaxed prose-strong:text-slate-900 prose-li:marker:text-emerald-500">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {guideText}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'saved' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <h3 className="font-bold text-slate-400 text-[10px] uppercase tracking-wider">Twoje zapisane trasy</h3>
            {isLoadingSaved ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
              </div>
            ) : savedProjects.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">Brak zapisanych tras.</p>
            ) : (
              <div className="space-y-3">
                {savedProjects.map((project) => {
                  const reqs = project.requirements || {};
                  const isCurrent = project.id === projectId;
                  let vehicleIcon = <RouteIcon className="w-4 h-4 text-emerald-500" />;
                  if (reqs.vehicleType === 'car') vehicleIcon = <Car className="w-4 h-4 text-purple-500" />;
                  else if (reqs.vehicleType === 'city') vehicleIcon = <Building2 className="w-4 h-4 text-yellow-500" />;
                  else if (reqs.vehicleType === 'hiking') vehicleIcon = <Navigation className="w-4 h-4 text-rose-500" />;
                  else if (reqs.vehicleType === 'bicycle') vehicleIcon = <Bike className="w-4 h-4 text-orange-500" />;
                  else if (reqs.vehicleType === 'motorcycle') vehicleIcon = <Navigation className="w-4 h-4 text-blue-500" />;
                  
                  return (
                    <div 
                      key={project.id}
                      onClick={() => handleLoadProject(project)}
                      className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-200 hover:shadow-md flex items-start justify-between gap-3 ${
                        isCurrent 
                          ? 'border-emerald-500 bg-emerald-50/20' 
                          : 'border-slate-200/60 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {vehicleIcon}
                          <span className="font-bold text-sm text-slate-800 truncate block">
                            {reqs.title || 'Trasa bez nazwy'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-1">
                          Start: {reqs.start_point || reqs.startLocation || '?'}
                        </p>
                        <div className="flex gap-2">
                          {reqs.distance_target_km && (
                            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-semibold bg-slate-100 text-slate-600">
                              {reqs.distance_target_km} km
                            </Badge>
                          )}
                          <span className="text-[10px] text-slate-400">
                            {new Date(project.updated_at || project.created_at).toLocaleDateString('pl-PL')}
                          </span>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => handleDeleteProject(project.id, e)}
                        className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-slate-50 shrink-0 self-center transition-colors"
                        title="Usuń trasę"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Panel - Map */}
      <div className="flex-1 relative bg-slate-100 h-full w-full">
        
        {/* Floating Vehicle Selector */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-2">
          
          {/* Main Selector */}
          <div className="bg-white/90 backdrop-blur-md rounded-full shadow-lg p-1.5 flex gap-1 border border-slate-200/50 max-w-[95vw] overflow-x-auto scrollbar-none">
            <Button 
              variant={vehicleType === 'motorcycle' ? 'default' : 'ghost'} 
              className={`rounded-full px-5 h-10 shrink-0 ${vehicleType === 'motorcycle' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setField('vehicleType', 'motorcycle')}
            >
              <Navigation className="w-4 h-4 mr-2" /> Motocykl
            </Button>
            <Button 
              variant={vehicleType === 'bicycle' ? 'default' : 'ghost'} 
              className={`rounded-full px-5 h-10 shrink-0 ${vehicleType === 'bicycle' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setField('vehicleType', 'bicycle')}
            >
              <Bike className="w-4 h-4 mr-2" /> Rower
            </Button>
            <Button 
              variant={vehicleType === 'hiking' ? 'default' : 'ghost'} 
              className={`rounded-full px-5 h-10 shrink-0 ${vehicleType === 'hiking' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setField('vehicleType', 'hiking')}
            >
              <RouteIcon className="w-4 h-4 mr-2" /> Pieszo
            </Button>
            <Button 
              variant={vehicleType === 'city' ? 'default' : 'ghost'} 
              className={`rounded-full px-5 h-10 shrink-0 ${vehicleType === 'city' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setField('vehicleType', 'city')}
            >
              <Building2 className="w-4 h-4 mr-2" /> Miasto
            </Button>
            <Button 
              variant={vehicleType === 'car' ? 'default' : 'ghost'} 
              className={`rounded-full px-5 h-10 shrink-0 ${vehicleType === 'car' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setField('vehicleType', 'car')}
            >
              <Car className="w-4 h-4 mr-2" /> Samochód
            </Button>
          </div>

          {/* Sub Selector for Bicycle */}
          {vehicleType === 'bicycle' && (
            <div className="bg-white/90 backdrop-blur-md rounded-full shadow-md p-1 flex gap-1 border border-slate-200/50 animate-in slide-in-from-top-2">
              <Button 
                variant={bikeSubtype === 'road' ? 'secondary' : 'ghost'} 
                size="sm"
                className={`rounded-full px-4 h-8 text-xs ${bikeSubtype === 'road' ? 'bg-emerald-100 text-emerald-800' : 'text-slate-500'}`}
                onClick={() => setField('bikeSubtype', 'road')}
              >
                Szosa / Asfalt
              </Button>
              <Button 
                variant={bikeSubtype === 'gravel' ? 'secondary' : 'ghost'} 
                size="sm"
                className={`rounded-full px-4 h-8 text-xs ${bikeSubtype === 'gravel' ? 'bg-emerald-100 text-emerald-800' : 'text-slate-500'}`}
                onClick={() => setField('bikeSubtype', 'gravel')}
              >
                Szuter / Gravel
              </Button>
              <Button 
                variant={bikeSubtype === 'mtb' ? 'secondary' : 'ghost'} 
                size="sm"
                className={`rounded-full px-4 h-8 text-xs ${bikeSubtype === 'mtb' ? 'bg-emerald-100 text-emerald-800' : 'text-slate-500'}`}
                onClick={() => setField('bikeSubtype', 'mtb')}
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
                color: (vehicleType === 'hiking' || vehicleType === 'city') ? '#f43f5e' : '#10b981', 
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

          {tempMarker && (
            <Popup position={[tempMarker.lat, tempMarker.lng]}>
                <div className="flex flex-col gap-2 min-w-[140px] p-1">
                  <p className="text-xs font-bold text-slate-700 mb-1 text-center">Opcje punktu</p>
                  <Button size="sm" variant="outline" className="h-8 text-xs justify-start" onClick={() => handleAddPointFromTemp('start')}>
                    <div className="w-2 h-2 rounded-full bg-green-500 mr-2" /> Ustaw jako Start
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs justify-start" onClick={() => handleAddPointFromTemp('end')}>
                    <div className="w-2 h-2 rounded-full bg-red-500 mr-2" /> Ustaw jako Metę
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs justify-start" onClick={() => handleAddPointFromTemp('waypoint')}>
                    <div className="w-2 h-2 rounded-full bg-blue-500 mr-2" /> Dodaj do trasy
                  </Button>
                </div>
            </Popup>
          )}
          
          <MapResizer geometry={geometry} />
        </MapContainer>
        
        <div className="absolute bottom-6 left-6 z-[1000] flex gap-2">
          {waypoints.length >= 2 && (
            <Button 
              onClick={() => send({ type: 'CALCULATE_ROUTE' })} 
              className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg rounded-full px-5 h-10 font-bold"
            >
              <RefreshCw className="w-4 h-4 mr-2" /> Przelicz trasę
            </Button>
          )}
          <Badge variant="outline" className="bg-white/90 border-emerald-500/30 text-emerald-600 backdrop-blur-md py-1.5 px-4 rounded-full shadow-lg h-10 flex items-center">
            <MapPin className="w-3 h-3 mr-2" /> GraphHopper
          </Badge>
        </div>



      </div>
    </div>
  );
}
