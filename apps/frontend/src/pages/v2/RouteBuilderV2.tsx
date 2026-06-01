import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, MapPin, Map, FileUp, Send, Bot, User, Compass, ChevronRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';

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
  const center: [number, number] = start ? [start.lat, start.lng] : [49.299, 19.949];

  return (
    <div className="w-full h-full rounded-2xl overflow-hidden border border-slate-200 shadow-2xl relative bg-slate-100">
      <MapContainer 
        center={center} 
        zoom={12} 
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        
        {geometry && geometry.coordinates && (
          <Polyline 
            positions={geometry.coordinates.map((c: any) => [c[1], c[0]])} 
            pathOptions={{ 
              color: '#10b981', 
              weight: 5, 
              opacity: 0.9,
              lineCap: 'round',
              lineJoin: 'round'
            }} 
          />
        )}

        {start && <Marker position={[start.lat, start.lng]} />}
        {end && <Marker position={[end.lat, end.lng]} />}
        {midpoint && <Marker position={[midpoint.lat, midpoint.lng]} />}
        
        <MapResizer geometry={geometry} />
      </MapContainer>

      {/* Premium HUD Elements */}
      <div className="absolute bottom-6 left-6 flex gap-3 z-[1000]">
        <Badge variant="outline" className="bg-white/80 border-emerald-500/30 text-emerald-600 backdrop-blur-xl py-1.5 px-4 rounded-full shadow-lg">
          <MapPin className="w-3 h-3 mr-2" /> Google Routes
        </Badge>
        <Badge variant="outline" className="bg-white/80 border-purple-500/30 text-purple-600 backdrop-blur-xl py-1.5 px-4 rounded-full shadow-lg">
          <Sparkles className="w-3 h-3 mr-2" /> Deep Research AI
        </Badge>
      </div>
    </div>
  );
}

export default function RouteBuilderV2() {
  const [mode, setMode] = useState<'initial' | 'interview' | 'generating' | 'done'>('initial');
  const [projectId, setProjectId] = useState<string | null>(null);
  
  // Parametry trasy zebrane z wywiadu
  const [startPoint, setStartPoint] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [distance, setDistance] = useState<string>('');
  const [intent, setIntent] = useState<string>('');
  const [geometry, setGeometry] = useState<any>(null);
  const [guideUrl, setGuideUrl] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>('Inicjalizacja...');

  // Chat state
  const [chatScenario, setChatScenario] = useState<'custom' | 'surprise'>('custom');
  const [chatStep, setChatStep] = useState(0);
  const [chatMessages, setChatMessages] = useState<{role: 'agent'|'user', text: string}[]>([]);
  const [inputValue, setInputValue] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const startInterview = (scenario: 'custom' | 'surprise') => {
    setChatScenario(scenario);
    setChatStep(0);
    setMode('interview');
    if (scenario === 'custom') {
      setChatMessages([{ role: 'agent', text: 'Cześć! Zbuduję dla Ciebie idealną trasę. Skąd wyruszamy? (np. Kraków, Bieszczady, Gdańsk)' }]);
    } else {
      setChatMessages([{ role: 'agent', text: 'Zaskoczę Cię wspaniałą pętlą! Powiedz mi tylko, skąd wyruszasz i na czym będziesz jechać? (np. Warszawa, Motocykl)' }]);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userText = inputValue;
    setInputValue('');
    setChatMessages(prev => [...prev, { role: 'user', text: userText }]);

    setTimeout(() => {
      if (chatScenario === 'surprise') {
        if (chatStep === 0) {
          // One-shot for surprise
          setStartPoint(userText); // It will have both location and vehicle in one string
          setCategory('auto'); // Let backend AI extract from input_notes
          setDistance('100'); // default 100km for surprise
          setIntent('Zaskocz mnie czymś pięknym i spektakularnym w tej okolicy.');
          setChatMessages(prev => [...prev, { role: 'agent', text: 'Będzie rewelacyjnie! Rozpoczynam planowanie trasy z wykorzystaniem Atlas AI. Zapnij pasy!' }]);
          setTimeout(() => startGeneration(userText, 'auto', '100', 'Zaskocz mnie czymś pięknym i spektakularnym w tej okolicy.'), 1500);
        }
      } else {
        // Custom scenario steps
        if (chatStep === 0) {
          setStartPoint(userText);
          setChatMessages(prev => [...prev, { role: 'agent', text: 'Super. Na czym będziesz jechać? (np. Motocykl, Rower Szosowy, Samochód)' }]);
          setChatStep(1);
        } else if (chatStep === 1) {
          setCategory(userText);
          setChatMessages(prev => [...prev, { role: 'agent', text: 'Jasne. Jaki dystans (w km) Cię interesuje?' }]);
          setChatStep(2);
        } else if (chatStep === 2) {
          setDistance(userText);
          setChatMessages(prev => [...prev, { role: 'agent', text: 'Zrozumiałem. Masz jakieś specjalne życzenia? (np. dużo zakrętów, wzdłuż rzeki, unikanie głównych dróg)' }]);
          setChatStep(3);
        } else if (chatStep === 3) {
          setIntent(userText);
          setChatMessages(prev => [...prev, { role: 'agent', text: 'Wszystko jasne! Rozpoczynam planowanie trasy z wykorzystaniem Atlas AI. Zapnij pasy!' }]);
          setTimeout(() => startGeneration(startPoint, category, distance, userText), 1500);
        }
      }
    }, 600);
  };

  const startGeneration = async (finalStart: string, finalCat: string, finalDist: string, finalIntent: string) => {
    setMode('generating');
    setLoadingMessage('Tworzenie projektu...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const lowerCat = finalCat.toLowerCase();
      let routeType = 'motorcycle';
      if (lowerCat.includes('rower') || lowerCat.includes('szos')) routeType = 'cycling';
      if (lowerCat.includes('gravel')) routeType = 'gravel';
      if (lowerCat.includes('pieszo') || lowerCat.includes('chodz') || lowerCat.includes('spacer')) routeType = 'hiking';
      
      // 1. Create Project
      const resProj = await fetch('/route-builder-api/route-projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          start_point: finalStart || 'Polska',
          region: 'Global',
          route_type: routeType,
          distance_target_km: parseInt(finalDist) || 50,
          difficulty: 'moderate',
          input_notes: finalIntent,
          loop: true
        })
      });
      if (!resProj.ok) throw new Error(await resProj.text());
      const projData = await resProj.json();
      setProjectId(projData.id);

      // 2. Start Job
      setLoadingMessage('Uruchamianie Atlas AI...');
      const resJob = await fetch(`/route-builder-api/route-projects/${projData.id}/jobs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!resJob.ok) throw new Error('Nie udało się uruchomić zadania');
      const jobData = await resJob.json();
      
      // 3. Poll Job Status
      let isDone = false;
      while (!isDone) {
        await new Promise(r => setTimeout(r, 2000));
        const pollRes = await fetch(`/route-builder-api/route-projects/${projData.id}/jobs/${jobData.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (pollRes.ok) {
          const statusData = await pollRes.json();
          if (statusData.human_message) {
            setLoadingMessage(statusData.human_message);
          }
          if (statusData.status === 'ready' || statusData.status === 'completed') {
            isDone = true;
          } else if (statusData.status === 'failed') {
            throw new Error(statusData.error_message || 'Błąd podczas generowania trasy');
          } else if (statusData.status === 'waiting_for_user') {
            throw new Error(statusData.human_message || 'Brakuje danych do wygenerowania trasy.');
          }
        }
      }

      // 4. Fetch Geometry (Summary Artifact)
      setLoadingMessage('Pobieranie geometrii mapy...');
      const resSum = await fetch(`/route-builder-api/route-projects/${projData.id}/artifacts/summary`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resSum.ok) {
        const summary = await resSum.json();
        if (summary.content && summary.content.track) {
          setGeometry({
            type: 'LineString',
            coordinates: summary.content.track.map((p: number[]) => [p[1], p[0]]) // leaflet expects [lng, lat] for geojson? Actually GeoJSON is [lng, lat]
          });
        }
      }
      
      setGuideUrl(`/route-projects/${projData.id}`);
      setMode('done');
      toast.success('Trasa i przewodnik gotowe!');
    } catch (err: any) {
      toast.error('Wystąpił błąd: ' + err.message);
      setMode('initial');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8 pt-24 font-sans selection:bg-emerald-500/30">
      <div className="max-w-7xl mx-auto h-[80vh] flex flex-col lg:flex-row gap-6">
        
        {/* Left Panel - Wizard / Chat */}
        <div className="w-full lg:w-1/3 flex flex-col relative z-10 h-full">
          <div className="mb-8">
            <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 mb-3 px-3 py-1">AI Studio V2</Badge>
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
              Route Builder
            </h1>
            <p className="text-slate-500 mt-2 text-sm leading-relaxed">
              Zaprojektuj idealną trasę z pomocą Agenta AI i potężnego silnika Atlas GIS.
            </p>
          </div>

          <Card className="flex-1 bg-white border-slate-200 shadow-xl overflow-hidden flex flex-col rounded-2xl">
            {mode === 'initial' && (
              <div className="p-6 space-y-4 flex flex-col h-full justify-center animate-in fade-in zoom-in-95 duration-500">
                <Button 
                  onClick={() => startInterview('custom')}
                  className="h-20 w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-xl shadow-xl shadow-emerald-500/20 flex flex-col items-start p-4 transition-all hover:scale-[1.02] border-0"
                >
                  <div className="flex items-center gap-2 font-bold text-lg">
                    <Sparkles className="w-5 h-5 text-emerald-50" /> Mam Pomysł
                  </div>
                  <span className="text-emerald-50 font-normal text-sm">Zbudujmy to razem z Agentem AI</span>
                </Button>

                <Button 
                  variant="outline"
                  className="h-20 w-full bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-xl border border-slate-200 flex flex-col items-start p-4 transition-all hover:border-blue-500/30 group"
                  onClick={() => startInterview('surprise')}
                >
                  <div className="flex items-center gap-2 font-bold text-lg group-hover:text-blue-500 transition-colors">
                    <Compass className="w-5 h-5 text-blue-500" /> Zaskocz mnie
                  </div>
                  <span className="text-slate-500 font-normal text-sm">Wygeneruj najlepszą trasę w okolicy</span>
                </Button>

                <Button 
                  variant="outline"
                  className="h-20 w-full bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-xl border border-slate-200 flex flex-col items-start p-4 transition-all hover:border-purple-500/30 group"
                >
                  <div className="flex items-center gap-2 font-bold text-lg group-hover:text-purple-500 transition-colors">
                    <FileUp className="w-5 h-5 text-purple-500" /> Mam GPX
                  </div>
                  <span className="text-slate-500 font-normal text-sm">Wgraj plik i pozwól nam stworzyć przewodnik</span>
                </Button>
              </div>
            )}

            {mode === 'interview' && (
              <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-500 bg-slate-50">
                <div className="p-4 border-b border-slate-200 bg-white flex items-center gap-3 shadow-sm z-10">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center border border-emerald-200">
                    <Bot className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">Atlas Agent</p>
                    <p className="text-xs text-emerald-600 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Online</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                  <div ref={chatEndRef} />
                </div>

                <div className="p-4 bg-white border-t border-slate-200 z-10">
                  <form onSubmit={handleChatSubmit} className="relative flex items-center">
                    <Input 
                      autoFocus
                      value={inputValue}
                      onChange={e => setInputValue(e.target.value)}
                      placeholder="Napisz..."
                      className="w-full bg-slate-50 border-slate-200 rounded-full pl-4 pr-12 py-6 text-slate-900 shadow-inner focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/50"
                    />
                    <Button type="submit" size="icon" className="absolute right-2 rounded-full bg-emerald-600 hover:bg-emerald-500 w-10 h-10 text-white">
                      <Send className="w-4 h-4 ml-1" />
                    </Button>
                  </form>
                </div>
              </div>
            )}

            {mode === 'generating' && (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-6 animate-in fade-in duration-700 bg-white">
                <div className="relative">
                  <div className="absolute inset-0 bg-emerald-500/10 blur-xl rounded-full animate-pulse"></div>
                  <Loader2 className="w-16 h-16 text-emerald-500 animate-spin relative z-10" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-800 mb-2">Buduję Trasę</h3>
                  <p className="text-emerald-600 text-sm font-medium animate-pulse">{loadingMessage}</p>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                  <div className="bg-gradient-to-r from-emerald-500 to-emerald-400 w-1/2 h-full rounded-full animate-pulse"></div>
                </div>
              </div>
            )}

            {mode === 'done' && (
              <div className="flex flex-col h-full p-6 space-y-6 justify-center animate-in zoom-in-95 duration-500 bg-white">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-slate-800">Gotowe!</h3>
                  <p className="text-slate-500 text-sm mt-2">Geometria wyliczona, a przewodnik wygenerowany. Zobacz podgląd trasy na mapie obok.</p>
                </div>
                <Button 
                  className="w-full h-14 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 group border-0"
                  onClick={() => window.location.href = guideUrl || '#'}
                >
                  Przejdź do Artykułu <ChevronRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full text-slate-500 hover:text-slate-800"
                  onClick={() => {
                    setMode('initial');
                    setGeometry(null);
                    setChatMessages([]);
                    setChatStep(0);
                  }}
                >
                  Stwórz kolejną trasę
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Right Panel - Map */}
        <div className="w-full lg:w-2/3 h-full relative z-0 animate-in fade-in duration-1000">
          {(!geometry || mode !== 'done') && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[2px] text-center p-8 rounded-2xl transition-all duration-700">
              <Map className="w-20 h-20 text-slate-400 mb-6 drop-shadow-md" strokeWidth={1} />
              <h3 className="text-2xl font-bold text-slate-800">Mapa Oczekuje</h3>
              <p className="text-slate-500 mt-2 max-w-sm">Przejdź przez wywiad z Agentem, aby wygenerować profesjonalną ścieżkę z Twardą Geometrią.</p>
            </div>
          )}
          <UnifiedMap geometry={geometry} start={null} end={null} midpoint={null} />
        </div>

      </div>
    </div>
  );
}
