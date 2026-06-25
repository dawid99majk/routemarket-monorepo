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
  return R * c; // Distance in km
}

function ElevationProfile({ coordinates }: { coordinates: number[][] }) {
  if (!coordinates || coordinates.length < 2) return null;
  let totalDist = 0;
  const points: { dist: number; ele: number }[] = [];
  for (let i = 0; i < coordinates.length; i++) {
    const [lng, lat, ele] = coordinates[i];
    if (i > 0) {
      const [pLng, pLat] = coordinates[i-1];
      totalDist += getHaversineDistance(pLat, pLng, lat, lng);
    }
    points.push({ dist: totalDist, ele: ele || 0 });
  }
  const minEle = Math.min(...points.map(p => p.ele));
  const maxEle = Math.max(...points.map(p => p.ele));
  const eleRange = Math.max(maxEle - minEle, 10);
  const pathData = points.map((p, i) => {
    const x = totalDist > 0 ? (p.dist / totalDist) * 100 : 0;
    const y = 40 - ((p.ele - minEle) / eleRange) * 40;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  const polygonData = `${pathData} L 100 40 L 0 40 Z`;

  return (
    <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 flex flex-col gap-2">
      <h3 className="font-bold text-slate-400 text-[10px] uppercase tracking-wider">Profil wysokościowy</h3>
      <div className="relative w-full h-24 mt-2">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-full overflow-visible">
          <polygon points={polygonData.replace(/M|L/g, '')} className="fill-emerald-100/50" />
          <path d={pathData} fill="none" className="stroke-emerald-500" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="absolute top-0 left-0 text-[9px] font-semibold text-slate-400 -translate-y-3">{Math.round(maxEle)} m</div>
        <div className="absolute bottom-0 left-0 text-[9px] font-semibold text-slate-400 translate-y-3">{Math.round(minEle)} m</div>
      </div>
    </div>
  );
}

import { WizardData } from '../CreateRoute';

export default function RouteBuilderV2({ initialData, onBack }: { initialData?: WizardData, onBack?: () => void }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState<string | null>(searchParams.get('projectId'));
  
  // map initialData mode ('fastbike', 'trekking', 'hiking-mountain', 'city', 'car') to vehicleType/bikeSubtype
  const getInitialTypes = () => {
    if (initialData?.mode === 'fastbike') return { v: 'bicycle' as const, b: 'road' as const };
    if (initialData?.mode === 'trekking') return { v: 'bicycle' as const, b: 'gravel' as const };
    if (initialData?.mode === 'hiking-mountain') return { v: 'hiking' as const, b: 'gravel' as const };
    if (initialData?.mode === 'city') return { v: 'city' as const, b: 'gravel' as const };
    if (initialData?.mode === 'car') return { v: 'car' as const, b: 'road' as const };
    return { v: 'bicycle' as const, b: 'gravel' as const };
  };
  
  const [vehicleType, setVehicleType] = useState<'motorcycle' | 'bicycle' | 'hiking' | 'city' | 'car'>(getInitialTypes().v);
  const [bikeSubtype, setBikeSubtype] = useState<'gravel' | 'road' | 'mtb'>(getInitialTypes().b);
  
  const [waypoints, setWaypoints] = useState<{lat: number, lng: number, type: string}[]>([]);
  const [tempMarker, setTempMarker] = useState<L.LatLng | null>(null);

  const handleAddPointFromTemp = (type: 'start' | 'end' | 'waypoint') => {
    if (!tempMarker) return;
    setWaypoints(prev => {
      let currentWps = [...prev];
      
      // Auto-populate from geometry if we are starting from scratch but have an AI route
      if (currentWps.length === 0 && geometry && geometry.coordinates) {
         const coords = geometry.coordinates;
         const startC = coords[0];
         const endC = coords[coords.length - 1];
         currentWps = [
            { lat: startC[1], lng: startC[0], type: 'start' },
            { lat: endC[1], lng: endC[0], type: 'end' }
         ];
      }

      if (type === 'start') {
        const existingStart = currentWps.findIndex(w => w.type === 'start');
        if (existingStart >= 0) {
           currentWps[existingStart] = { lat: tempMarker.lat, lng: tempMarker.lng, type: 'start' };
        } else {
           currentWps.unshift({ lat: tempMarker.lat, lng: tempMarker.lng, type: 'start' });
        }
      } else if (type === 'end') {
        const existingEnd = currentWps.findIndex(w => w.type === 'end');
        if (existingEnd >= 0) {
           currentWps[existingEnd] = { lat: tempMarker.lat, lng: tempMarker.lng, type: 'end' };
        } else {
           currentWps.push({ lat: tempMarker.lat, lng: tempMarker.lng, type: 'end' });
        }
      } else {
        // waypoint
        if (currentWps.length === 0) {
           currentWps.push({ lat: tempMarker.lat, lng: tempMarker.lng, type: 'waypoint' });
        } else {
           const endIdx = currentWps.findIndex(w => w.type === 'end');
           if (endIdx >= 0) {
               currentWps.splice(endIdx, 0, { lat: tempMarker.lat, lng: tempMarker.lng, type: 'waypoint' });
           } else {
               currentWps.push({ lat: tempMarker.lat, lng: tempMarker.lng, type: 'waypoint' });
           }
        }
      }
      return currentWps;
    });
    setTempMarker(null);
  };
  const [geometry, setGeometry] = useState<any>(null);
  const [isRouting, setIsRouting] = useState(false);

  const [inputNotes, setInputNotes] = useState('');
  const [chatMessages, setChatMessages] = useState<{role: 'agent'|'user', text: string}[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [gpxData, setGpxData] = useState<string | null>(null);
  const [guideText, setGuideText] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<'chat' | 'details'>('chat');
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
      supabase.from('route_builder_projects').select('*').eq('id', projectId).single()
        .then(({ data }) => {
           if (data && data.requirements) {
              const reqs = data.requirements;
              if (reqs.chatMessages) setChatMessages(reqs.chatMessages);
              if (reqs.gpxData) setGpxData(reqs.gpxData);
              if (reqs.guideText) setGuideText(reqs.guideText);
              if (reqs.vehicleType) setVehicleType(reqs.vehicleType);
              if (reqs.bikeSubtype) setBikeSubtype(reqs.bikeSubtype);
              if (reqs.geometry) {
                setGeometry({ 
                  type: 'LineString', 
                  coordinates: reqs.geometry.map((p: any) => [p[1], p[0], p[2] || 0]) 
                });
              }
              if (reqs.waypoints) {
                  skipNextCalc.current = true;
                  setWaypoints(reqs.waypoints);
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

  // Handle initialization with wizard data
  const initialized = useRef(false);
  useEffect(() => {
    if (initialData && !projectId && !initialized.current) {
      initialized.current = true;
      
      const promptText = `Chcę zaplanować trasę. Aktywność: ${
        initialData.mode === 'fastbike' ? 'Rower Szosowy' : 
        initialData.mode === 'trekking' ? 'Gravel / MTB' : 
        initialData.mode === 'hiking-mountain' ? 'Hiking' : 
        initialData.mode === 'city' ? 'Zwiedzanie miasta' : 
        initialData.mode === 'car' ? 'Samochód' : 'Inna'
      }. Start: ${initialData.startLocation}. Typ trasy: ${initialData.routeType}. ${initialData.destination ? `Meta: ${initialData.destination}. ` : ''}Dystans: ok. ${initialData.distance} km. Poziom trudności: ${initialData.difficulty}.`;
      
      const newMessages = [{ role: 'user' as const, text: promptText }];
      setChatMessages(newMessages);
      setIsTyping(true);
      
      fetch('/atlas/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: newMessages.map(m => ({ role: m.role, content: m.text }))
        }) 
      }).then(res => res.json()).then(data => {
        if (data.reply) {
          setChatMessages(prev => [...prev, { role: 'agent', text: data.reply }]);
        }
        if (data.is_ready) {
          toast.success("Agent zebrał dane. Rozpoczynam planowanie trasy...");
          doCalculateLiveRoute(waypoints, vehicleType, bikeSubtype, newMessages);
        }
      }).catch(err => {
        toast.error(err.message);
      }).finally(() => {
        setIsTyping(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData, projectId]);

  // Recalculate route whenever vehicle type changes
  useEffect(() => {
    if (skipNextCalc.current) {
        skipNextCalc.current = false;
        return;
    }
    if (waypoints.length >= 2) {
      const timer = setTimeout(() => {
        doCalculateFastRoute(waypoints, vehicleType, bikeSubtype);
      }, 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleType, bikeSubtype]);

  const handleMapClick = (latlng: L.LatLng) => {
    setTempMarker(latlng);
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

  const doCalculateFastRoute = async (
    wps: typeof waypoints, 
    vType: typeof vehicleType, 
    bType: typeof bikeSubtype
  ) => {
    setIsRouting(true);
    try {
      const res = await fetch('/route-builder-api/live-route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          points: wps.map((wp, i) => ({
            name: wp.type === 'start' ? 'Start' : (wp.type === 'end' ? 'Meta' : `Punkt ${i}`),
            lat: wp.lat,
            lng: wp.lng
          })),
          route_type: vType,
          surface_preferences: bType ? [bType] : []
        })
      });

      if (!res.ok) throw new Error('Live route calculation failed');
      const data = await res.json();

      if (data.trackPoints && data.trackPoints.length > 0) {
        const mappedCoords = data.trackPoints.map((p: number[]) => [p[1], p[0], p[2] || 0]);
        setGeometry({
          type: 'LineString',
          coordinates: mappedCoords
        });

        const newGpx = generateGpxString(mappedCoords, 'Moja Trasa AI');
        setGpxData(newGpx);

        if (projectId) {
          try {
            const { data: project } = await supabase
              .from('route_builder_projects')
              .select('requirements')
              .eq('id', projectId)
              .single();
            let existingTitle = 'Moja Trasa AI';
            let existingReqs: any = {};
            if (project && project.requirements) {
              existingReqs = project.requirements;
              existingTitle = existingReqs.title || 'Moja Trasa AI';
            }

            const dbGpx = generateGpxString(mappedCoords, existingTitle);
            setGpxData(dbGpx);

            await supabase
              .from('route_builder_projects')
              .update({
                requirements: {
                  ...existingReqs,
                  waypoints: wps,
                  geometry: data.trackPoints,
                  gpxData: dbGpx,
                  vehicleType: vType,
                  bikeSubtype: bType
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', projectId);
          } catch (dbErr) {
            console.error("DB update error:", dbErr);
          }
        }
      }
    } catch (err: any) {
      console.error("[doCalculateFastRoute] Error:", err);
      toast.error("Błąd wyznaczania trasy na mapie.");
    } finally {
      setIsRouting(false);
    }
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
        const mappedCoords = data.trackPoints.map((p: number[]) => [p[1], p[0], p[2] || 0]);
        setGeometry({
          type: 'LineString',
          coordinates: mappedCoords
        });
        
        toast.success("Trasa wygenerowana pomyślnie!");
        setActiveTab('details');
        
        let finalGpx = data.gpx;
        if (!finalGpx) {
          finalGpx = generateGpxString(mappedCoords, data.title || 'Nowa Trasa AI');
        }
        setGpxData(finalGpx);

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
                    gpxData: finalGpx,
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
                    gpxData: finalGpx,
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

    const userText = inputValue;
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
            Szczegóły trasy
            {geometry && (
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold">
                {routeStats.distance.toFixed(1)} km
              </span>
            )}
          </button>
        </div>

        {activeTab === 'chat' ? (
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
                    onChange={e => setInputNotes(e.target.value)}
                  />
                  {waypoints.length > 0 && (
                    <div className="flex justify-between items-center bg-emerald-50 text-emerald-700 px-3 py-2 rounded-lg text-xs font-medium">
                      <span>Punkty na mapie: {waypoints.length}</span>
                      <button onClick={clearRoute} className="text-red-500 hover:text-red-700 flex items-center gap-1 font-semibold">
                        <Trash2 className="w-3.5 h-3.5" /> Wyczyść
                      </button>
                    </div>
                  )}
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
        ) : (
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
                  <div className="space-y-2">
                    <h3 className="font-bold text-slate-400 text-[10px] uppercase tracking-wider">Przewodnik po trasie</h3>
                    <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                      {guideText}
                    </div>
                  </div>
                )}
              </>
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
              onClick={() => setVehicleType('motorcycle')}
            >
              <Navigation className="w-4 h-4 mr-2" /> Motocykl
            </Button>
            <Button 
              variant={vehicleType === 'bicycle' ? 'default' : 'ghost'} 
              className={`rounded-full px-5 h-10 shrink-0 ${vehicleType === 'bicycle' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setVehicleType('bicycle')}
            >
              <Bike className="w-4 h-4 mr-2" /> Rower
            </Button>
            <Button 
              variant={vehicleType === 'hiking' ? 'default' : 'ghost'} 
              className={`rounded-full px-5 h-10 shrink-0 ${vehicleType === 'hiking' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setVehicleType('hiking')}
            >
              <RouteIcon className="w-4 h-4 mr-2" /> Pieszo
            </Button>
            <Button 
              variant={vehicleType === 'city' ? 'default' : 'ghost'} 
              className={`rounded-full px-5 h-10 shrink-0 ${vehicleType === 'city' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setVehicleType('city')}
            >
              <Building2 className="w-4 h-4 mr-2" /> Miasto
            </Button>
            <Button 
              variant={vehicleType === 'car' ? 'default' : 'ghost'} 
              className={`rounded-full px-5 h-10 shrink-0 ${vehicleType === 'car' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setVehicleType('car')}
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
            <Popup position={[tempMarker.lat, tempMarker.lng]} onClose={() => setTempMarker(null)}>
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
              onClick={() => doCalculateFastRoute(waypoints, vehicleType, bikeSubtype)} 
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
