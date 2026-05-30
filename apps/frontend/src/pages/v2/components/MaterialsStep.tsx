import { FileText, Youtube, Trash2, Plus, Info, AlertTriangle, File as FileIcon, Image as ImageIcon, Globe, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useRef, useState } from 'react';

interface MaterialsStepProps {
  userNotes: string;
  setUserNotes: (val: string) => void;
  youtubeLink: string;
  setYoutubeLink: (val: string) => void;
  youtubeStatus: 'idle' | 'fetching' | 'success';
  onYoutubeFetch: () => void;
  onLinkAdd?: (url: string) => Promise<void>;
  onNext: () => void;
  onBack: () => void;
  region?: string;
  routeType?: string;
  onFileUpload?: (file: File) => Promise<void>;
  files?: any[];
  onDeleteFile?: (fileId: string) => void;
  analysisResult?: any;
}

export default function MaterialsStep({
  userNotes,
  setUserNotes,
  youtubeLink,
  setYoutubeLink,
  youtubeStatus,
  onYoutubeFetch,
  onLinkAdd,
  onNext,
  onBack,
  region,
  routeType,
  onFileUpload,
  files = [],
  onDeleteFile,
  analysisResult
}: MaterialsStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [newLink, setNewLink] = useState('');
  
  const conflicts = analysisResult?.conflicts || [];
  const manualConflict = userNotes.toLowerCase().includes('karpaty') && region?.toLowerCase().includes('sudety');
  if (manualConflict && !conflicts.includes('Wykryto Karpaty w notatkach przy regionie Sudety')) {
    conflicts.push('Potencjalny konflikt regionów: Karpaty vs Sudety');
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onFileUpload) {
      setIsUploading(true);
      try {
        await onFileUpload(file);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const handleAddLink = async () => {
    if (newLink && onLinkAdd) {
      await onLinkAdd(newLink);
      setNewLink('');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 font-mono tracking-tight">MATERIAŁY PROJEKTU</h2>
          <p className="text-zinc-400 text-sm">Zarządzaj źródłami i sprawdź analizę merytoryczną.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} className="border-zinc-800 hover:bg-zinc-900 transition-colors">Wróć</Button>
          <Button onClick={onNext} className="bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white px-8 shadow-lg shadow-cyan-900/20">
            Analizuj i Kontynuuj
          </Button>
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="bg-red-950/20 border border-red-900/30 rounded-2xl p-5 flex gap-4 items-start animate-pulse">
          <AlertTriangle className="h-6 w-6 text-red-500 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-red-300 uppercase tracking-wider">Wykryto Konflikty Treści</h4>
            <ul className="text-xs text-red-400/90 leading-relaxed list-disc list-inside">
              {conflicts.map((c: string, i: number) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-8 space-y-6">
          {/* TEXT NOTES */}
          <Card className="bg-zinc-900/40 border-zinc-800 overflow-hidden">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold flex items-center gap-2 text-zinc-100">
                  <FileText className="h-4 w-4 text-cyan-400" /> Notatki i Treść Ekstrakcyjna
                </h3>
                <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700">Editable</Badge>
              </div>
              <textarea
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                placeholder="Wklej tutaj treść artykułu, własne notatki, plan wycieczki lub dowolne wskazówki..."
                className="w-full h-80 bg-zinc-950 border border-zinc-800/80 rounded-xl p-4 text-sm text-zinc-300 focus:ring-1 focus:ring-cyan-500 outline-none transition-all resize-none font-sans"
              />
            </CardContent>
          </Card>

          {/* SOURCES GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* YOUTUBE */}
            <Card className="bg-zinc-900/40 border-zinc-800">
              <CardContent className="pt-6 space-y-4">
                <h3 className="font-bold flex items-center gap-2 text-zinc-200 text-sm">
                  <Youtube className="h-4 w-4 text-red-500" /> YouTube
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={youtubeLink}
                    onChange={(e) => setYoutubeLink(e.target.value)}
                    placeholder="Link do wideo..."
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-[11px] text-zinc-300 outline-none"
                  />
                  <Button onClick={onYoutubeFetch} size="sm" className="bg-zinc-800 text-[10px]">OK</Button>
                </div>
              </CardContent>
            </Card>

            {/* OTHER LINKS */}
            <Card className="bg-zinc-900/40 border-zinc-800">
              <CardContent className="pt-6 space-y-4">
                <h3 className="font-bold flex items-center gap-2 text-zinc-200 text-sm">
                  <Globe className="h-4 w-4 text-emerald-500" /> Inne Linki WWW
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newLink}
                    onChange={(e) => setNewLink(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-[11px] text-zinc-300 outline-none"
                  />
                  <Button onClick={handleAddLink} size="sm" className="bg-zinc-800 text-[10px]">Dodaj</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="md:col-span-4 space-y-6">
          {/* ANALYSIS SUMMARY */}
          <Card className="bg-zinc-900/60 border-zinc-800 shadow-xl border-l-4 border-l-cyan-600">
            <CardContent className="pt-6 space-y-4">
              <h3 className="font-bold text-zinc-100 flex items-center justify-between">
                Analiza AI 
                {analysisResult && <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Analyzed</Badge>}
              </h3>
              
              {analysisResult ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase text-zinc-500 font-bold tracking-widest">Wykryte Miejsca (POI)</span>
                    <div className="flex flex-wrap gap-1">
                      {analysisResult.pois?.map((p: string, i: number) => (
                        <Badge key={i} variant="secondary" className="bg-zinc-800 text-zinc-300 text-[9px] py-0">{p}</Badge>
                      ))}
                      {(!analysisResult.pois || analysisResult.pois.length === 0) && <span className="text-xs text-zinc-600 italic">Brak POI</span>}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] uppercase text-zinc-500 font-bold tracking-widest">Parametry Trasy</span>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <div className="p-2 rounded bg-zinc-950 border border-zinc-800/50">
                        <div className="text-[9px] text-zinc-500 uppercase">Region</div>
                        <div className="text-xs text-zinc-300 truncate">{analysisResult.region || '-'}</div>
                      </div>
                      <div className="p-2 rounded bg-zinc-950 border border-zinc-800/50">
                        <div className="text-[9px] text-zinc-500 uppercase">Dystans</div>
                        <div className="text-xs text-zinc-300">{analysisResult.distance_km ? `${analysisResult.distance_km} km` : '-'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center space-y-2">
                  <Info className="h-8 w-8 text-zinc-800 mx-auto" />
                  <p className="text-[11px] text-zinc-600 italic">Uruchom analizę, aby zobaczyć wyodrębnione fakty.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* FILES LIST */}
          <Card className="bg-zinc-900/40 border-zinc-800">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-zinc-200 text-sm">Wgrane Pliki</h3>
                <Badge className="bg-zinc-800 text-zinc-500 text-[9px]">{files.length}</Badge>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {files.map((file) => (
                  <div key={file.id} className="flex items-center justify-between p-2 rounded bg-zinc-950 border border-zinc-800/50 text-[10px]">
                    <div className="flex items-center gap-2 truncate">
                      {file.name?.toLowerCase().endsWith('.pdf') ? <FileIcon className="h-3 w-3 text-red-400" /> : <ImageIcon className="h-3 w-3 text-emerald-400" />}
                      <span className="text-zinc-400 truncate">{file.name}</span>
                    </div>
                    <button onClick={() => onDeleteFile?.(file.id)} className="text-zinc-600 hover:text-red-400">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {files.length === 0 && <p className="text-[10px] text-zinc-600 italic py-2">Brak załączników.</p>}
              </div>

              <div className="pt-2">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  className="hidden" 
                  accept=".pdf,.txt,.md,.jpg,.jpeg,.png"
                />
                <Button 
                  variant="outline" 
                  className="w-full border-zinc-800 text-[10px] gap-2 h-8" 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  Dodaj PDF / Obraz / Tekst
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

