import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, MapPin, Map, FileUp, Send, Bot, Compass, ChevronRight, CheckCircle2, Link as LinkIcon, Trash2, X, FileText, UploadCloud, FileType } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

      <div className="absolute bottom-6 left-6 flex gap-3 z-[1000]">
        <Badge variant="outline" className="bg-white/80 border-emerald-500/30 text-emerald-600 backdrop-blur-xl py-1.5 px-4 rounded-full shadow-lg">
          <MapPin className="w-3 h-3 mr-2" /> GraphHopper
        </Badge>
        <Badge variant="outline" className="bg-white/80 border-purple-500/30 text-purple-600 backdrop-blur-xl py-1.5 px-4 rounded-full shadow-lg">
          <Sparkles className="w-3 h-3 mr-2" /> Deep Research AI
        </Badge>
      </div>
    </div>
  );
}

export default function RouteBuilderV2() {
  const [mode, setMode] = useState<'sources' | 'processing' | 'interview' | 'generating' | 'done'>('sources');
  const [projectId, setProjectId] = useState<string | null>(null);
  
  // Sources State
  const [sourceLinks, setSourceLinks] = useState<string[]>([]);
  const [newLink, setNewLink] = useState('');
  const [inputNotes, setInputNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Chat/Generation State
  const [geometry, setGeometry] = useState<any>(null);
  const [guideUrl, setGuideUrl] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>('Analizuję twoje materiały...');
  const [chatMessages, setChatMessages] = useState<{role: 'agent'|'user', text: string}[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping]);

  const addLink = () => {
    if (newLink && !sourceLinks.includes(newLink)) {
      setSourceLinks([...sourceLinks, newLink]);
      setNewLink('');
    }
  };

  const removeLink = (url: string) => {
    setSourceLinks(sourceLinks.filter(l => l !== url));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles([...files, ...Array.from(e.target.files)]);
    }
  };

  const removeFile = (index: number) => {
    const newFiles = [...files];
    newFiles.splice(index, 1);
    setFiles(newFiles);
  };

  const handleStartProcessing = async () => {
    const hasContent = files.length > 0 || sourceLinks.length > 0 || inputNotes.trim();
    if (!hasContent) {
      // If nothing provided, we can just start empty interview
      setMode('interview');
      setChatMessages([{ role: 'agent', text: 'Cześć! Zbuduję dla Ciebie idealną trasę. Nie dodałeś żadnych źródeł, więc zacznijmy od podstaw: Gdzie jedziemy i na czym (np. rower, motor)?' }]);
      return;
    }
    
    setMode('processing');
    setUploadingFiles(true);
    setLoadingMessage('Wgrywam pliki i zapisuję materiały...');

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error('Brak sesji uzytkownika');

      // 1. Upload files
      const uploadedFilePaths: string[] = [];
      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(7)}_${Date.now()}.${fileExt}`;
        const { data, error } = await supabase.storage.from('route_builder_sources').upload(fileName, file);
        if (error) throw error;
        if (data) uploadedFilePaths.push(data.path);
      }

      setLoadingMessage('Atlas AI analizuje twoje materiały...');
      setUploadingFiles(false);

      // 2. Create Project
      const res = await fetch('/route-builder-api/route-projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          route_type: 'hiking', // default zmieniony na bezpieczniejszy
          difficulty: 'moderate',
          input_notes: inputNotes,
          source_links: sourceLinks,
          source_files: uploadedFilePaths,
          language: 'pl'
        })
      });

      if (!res.ok) throw new Error('Błąd tworzenia projektu');
      const projectData = await res.json();
      setProjectId(projectData.id);

      // 3. Inform Agent about the analysis
      setMode('interview');
      setChatMessages([
        { role: 'agent', text: 'Przeanalizowałem twoje notatki i źródła! ' + 
          (projectData.ai_extracted_meta?.distance_target_km ? `Znalazłem dystans ok. ${projectData.ai_extracted_meta.distance_target_km}km. ` : '') +
          'Zanim zacznę budować geometrię, powiedz mi, jaki dokładnie środek transportu wybierasz (np. rower MTB, motocykl szosowy) i czy mam jeszcze uwzględnić jakieś specjalne punkty po drodze?' }
      ]);
    } catch (err: any) {
      toast.error(err.message);
      setMode('sources');
      setUploadingFiles(false);
    }
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
      const response = await fetch('/route-builder-api/chat-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, project_id: projectId })
      });
      const data = await response.json();
      
      setChatMessages(prev => [...prev, { role: 'agent', text: data.reply }]);
      
      if (data.done) {
        setTimeout(async () => {
          if (projectId) {
            try {
              const { data: session } = await supabase.auth.getSession();
              const token = session.session?.access_token || '';
              await fetch(`/route-builder-api/route-projects/${projectId}`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                  route_type: data.extracted?.route_type || data.extracted?.category,
                  start_point: data.extracted?.start_point || data.extracted?.startPoint,
                  end_point: data.extracted?.end_point,
                  distance_target_km: data.extracted?.distance ? parseInt(data.extracted.distance, 10) : undefined,
                  difficulty: data.extracted?.difficulty,
                  loop: data.extracted?.loop ?? (!data.extracted?.end_point),
                  input_notes: data.extracted?.intent,
                  surface_preferences: data.extracted?.surface_preferences,
                  key_waypoints: data.extracted?.key_waypoints
                })
              });
              startGeneration(projectId, token);
            } catch (err) {
              console.error('Failed to update project before generation', err);
              startGeneration(projectId); // proceed anyway
            }
          } else {
            // fallback if no project id
            startGenerationFallback(data.extracted);
          }
        }, 1500);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsTyping(false);
    }
  };

  const startGenerationFallback = async (extracted: any) => {
    setMode('generating');
    setLoadingMessage('Budowanie geometrii...');
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';

      const res = await fetch('/route-builder-api/route-projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          route_type: extracted?.route_type || extracted?.category || 'hiking',
          start_point: extracted?.start_point || extracted?.startPoint || null,
          end_point: extracted?.end_point || null,
          distance_target_km: parseInt(extracted?.distance || '30', 10),
          difficulty: extracted?.difficulty || 'moderate',
          loop: extracted?.loop ?? (!extracted?.end_point),
          input_notes: extracted?.intent || '',
          surface_preferences: extracted?.surface_preferences || [],
          key_waypoints: extracted?.key_waypoints || []
        })
      });

      const pData = await res.json();
      setProjectId(pData.id);
      startGeneration(pData.id, token);
    } catch (e: any) {
      toast.error(e.message);
      setMode('interview');
    }
  };

  const startGeneration = async (id: string, existingToken?: string) => {
    setMode('generating');
    setLoadingMessage('Inicjowanie zadania na serwerze...');
    try {
      let token = existingToken;
      if (!token) {
        const { data: session } = await supabase.auth.getSession();
        token = session.session?.access_token || '';
      }

      const res = await fetch(`/route-builder-api/route-projects/${id}/jobs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Błąd startu zadania');
      pollJobStatus(id, token);
    } catch (err: any) {
      toast.error(err.message);
      setMode('interview');
    }
  };

  const pollJobStatus = (id: string, token: string) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 30) {
        clearInterval(interval);
        setMode('interview');
        toast.error('Przekroczono czas oczekiwania na trasę.');
        return;
      }
      try {
        const res = await fetch(`/route-builder-api/route-projects/${id}/jobs`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const jobs = await res.json();
        const activeJob = jobs.find((j: any) => j.status === 'running' || j.status === 'ready' || j.status === 'queued');
        
        if (activeJob) {
          if (activeJob.current_step) setLoadingMessage(activeJob.current_step);
          if (activeJob.status === 'ready') {
            clearInterval(interval);
            loadArtifacts(id, token);
          }
        }
      } catch (err) {
        console.error(err);
      }
    }, 3000);
  };

  const loadArtifacts = async (id: string, token: string) => {
    try {
      const res = await fetch(`/route-builder-api/route-projects/${id}/artifacts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const artifacts = await res.json();
      
      const gpxArtifact = artifacts.find((a: any) => a.artifact_type === 'gpx');
      if (gpxArtifact && gpxArtifact.content?.geometry) {
        setGeometry(gpxArtifact.content.geometry);
      }
      
      const reportArtifact = artifacts.find((a: any) => a.artifact_type === 'report');
      if (reportArtifact) {
        setGuideUrl(`/routes/${id}`);
      }

      setMode('done');
      toast.success('Twoja trasa jest gotowa!');
    } catch (err: any) {
      toast.error('Błąd pobierania artefaktów');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-[1400px] mx-auto h-[calc(100vh-4rem)] flex flex-col lg:flex-row gap-6">
        
        {/* Left Panel - Wizard */}
        <div className="w-full lg:w-1/3 flex flex-col z-10">
          <Card className="flex-1 bg-white border-0 shadow-2xl shadow-slate-200/50 rounded-2xl overflow-hidden flex flex-col">
            
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-emerald-500" />
                  Atlas Builder
                </h2>
                <p className="text-sm text-slate-500 font-medium mt-1">Zaprojektuj idealną trasę</p>
              </div>
            </div>

            {mode === 'sources' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-6 animate-in slide-in-from-left-4 duration-500 bg-slate-50">
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-slate-800">Krok 1: Twoje źródła (Opcjonalne)</h3>
                  <p className="text-sm text-slate-500">Wgraj zrzuty ekranu, PDFy z blogów, wklej linki do relacji z YouTube lub własne notatki, a Atlas Agent je przeanalizuje i stworzy na ich podstawie plan wycieczki.</p>
                </div>

                {/* File Upload */}
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-slate-700">Wgraj pliki (PDF, Obrazki, Dokumenty)</label>
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer bg-white hover:bg-slate-50 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                      <p className="mb-2 text-sm text-slate-500"><span className="font-semibold">Kliknij</span> lub przeciągnij i upuść</p>
                    </div>
                    <input type="file" className="hidden" multiple onChange={handleFileChange} />
                  </label>
                  {files.length > 0 && (
                    <div className="space-y-2 mt-2">
                      {files.map((f, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200">
                          <div className="flex items-center gap-2 text-sm text-slate-600 truncate max-w-[200px]">
                            <FileType className="w-4 h-4 text-emerald-500" />
                            <span className="truncate">{f.name}</span>
                          </div>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:text-red-700" onClick={() => removeFile(idx)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Links */}
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-slate-700">Linki i inspiracje (YouTube, blogi)</label>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="https://..." 
                      value={newLink} 
                      onChange={e => setNewLink(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addLink()}
                      className="bg-white"
                    />
                    <Button onClick={addLink} variant="secondary">Dodaj</Button>
                  </div>
                  {sourceLinks.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {sourceLinks.map((link, idx) => (
                        <Badge key={idx} variant="secondary" className="pl-2 pr-1 py-1 flex items-center gap-1 bg-white border border-slate-200">
                          <LinkIcon className="w-3 h-3 text-slate-400" />
                          <span className="truncate max-w-[150px]">{link}</span>
                          <button onClick={() => removeLink(link)} className="ml-1 hover:bg-slate-200 rounded-full p-0.5">
                            <X className="w-3 h-3 text-slate-500" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-slate-700">Własne notatki i pomysły</label>
                  <Textarea 
                    placeholder="Wklej luźne myśli, opisy tras znalezione w internecie, preferencje..." 
                    className="min-h-[100px] bg-white resize-none"
                    value={inputNotes}
                    onChange={e => setInputNotes(e.target.value)}
                  />
                </div>

                <Button 
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 group"
                  onClick={handleStartProcessing}
                >
                  <Bot className="w-5 h-5 mr-2" />
                  Przejdź do Agenta
                  <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
            )}

            {mode === 'processing' && (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-6 animate-in fade-in duration-700 bg-white">
                <div className="relative">
                  <div className="absolute inset-0 bg-emerald-500/10 blur-xl rounded-full animate-pulse"></div>
                  <Loader2 className="w-16 h-16 text-emerald-500 animate-spin relative z-10" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-800 mb-2">Przetwarzanie Źródeł</h3>
                  <p className="text-emerald-600 text-sm font-medium animate-pulse">{loadingMessage}</p>
                </div>
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
                    <p className="text-xs text-emerald-600 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Analiza zakończona</p>
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
                    setMode('sources');
                    setGeometry(null);
                    setChatMessages([]);
                    setFiles([]);
                    setSourceLinks([]);
                    setInputNotes('');
                  }}
                >
                  Stwórz kolejną trasę
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full text-slate-700 hover:text-slate-900"
                  onClick={() => {
                    setMode('interview');
                    setChatMessages(prev => [
                      ...prev, 
                      { role: 'agent', text: 'Jasne, patrzę na Twoją wygenerowaną trasę. Co byś chciał(a) w niej zmienić?' }
                    ]);
                  }}
                >
                  Oceń i popraw z Agentem
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Right Panel - Map */}
        <div className="w-full lg:w-2/3 h-full relative z-0 animate-in fade-in duration-1000">
          {(!geometry) && (
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
