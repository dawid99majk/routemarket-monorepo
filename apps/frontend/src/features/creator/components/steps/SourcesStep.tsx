import { useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowRight, 
  Upload, 
  Film, 
  FileText, 
  Link as LinkIcon, 
  Loader2, 
  Route, 
  Shield, 
  Sparkles 
} from 'lucide-react';
import { SourceFile } from '@/features/creator/types/creator.types';

interface SourcesStepProps {
  notes: string;
  onNotesChange: (val: string) => void;
  onSaveNotes: () => void;
  links: string[];
  onAddLink: (url: string) => void;
  uploadedFiles: SourceFile[];
  onUploadFiles: (files: FileList) => void;
  isUploading: boolean;
  onContinue: () => void;
}

const getLinkIconAndBrand = (url: string) => {
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return { icon: Film, brand: 'YouTube', color: 'text-red-500 bg-red-500/10 border-red-500/20' };
  }
  if (url.includes('instagram.com')) {
    return { icon: Film, brand: 'Instagram', color: 'text-pink-500 bg-pink-500/10 border-pink-500/20' };
  }
  if (url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.com')) {
    return { icon: Film, brand: 'Facebook', color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' };
  }
  return { icon: LinkIcon, brand: 'Blog / Strona', color: 'text-muted-foreground bg-muted/40 border-border/80' };
};

export function SourcesStep({
  notes,
  onNotesChange,
  onSaveNotes,
  links,
  onAddLink,
  uploadedFiles,
  onUploadFiles,
  isUploading,
  onContinue,
  onYoutubeImport,
  isImporting
}: SourcesStepProps & { onYoutubeImport?: (url: string) => void; isImporting?: boolean }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkInput, setLinkInput] = useState('');

  const handleAddLink = () => {
    if (linkInput) {
      onAddLink(linkInput);
      setLinkInput('');
    }
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">1. Materiały źródłowe (Inspiracja AI)</h2>
            <p className="text-sm text-muted-foreground">
              Wgraj notatki, linki z YouTube, Instagrama, Facebooka lub blogów. Służą one **wyłącznie jako inspiracja dla AI**.
            </p>
          </div>
          <Button onClick={onContinue} className="shrink-0 min-h-[44px]">
            Przejdź do wywiadu z AI <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        <input 
          ref={fileInputRef} 
          type="file" 
          multiple 
          accept=".md,.markdown,.txt,.csv,.json,.geojson,.kml,.gpx,.pdf,.doc,.docx" 
          className="hidden" 
          onChange={(e) => e.target.files && onUploadFiles(e.target.files)} 
        />
        
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm font-medium text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
          >
            {isUploading ? <Loader2 className="h-7 w-7 animate-spin text-primary" /> : <Upload className="h-7 w-7 text-primary" />}
            Prześlij pliki
            <span className="text-center text-xs font-normal">Teksty (.txt/.md), PDF, Word, GPX</span>
          </button>
          
          <div className="rounded-lg border border-border bg-muted/30 p-3 sm:col-span-2 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Film className="h-4 w-4 text-primary animate-pulse" /> Dodaj wideo lub artykuł (YouTube, Instagram, FB, Blog)
            </div>
            <div className="flex gap-2">
              <Input 
                value={linkInput} 
                onChange={(e) => setLinkInput(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && handleAddLink()}
                placeholder="Wklej link (np. wideo z wyprawy)" 
              />
              <Button type="button" onClick={handleAddLink} variant="secondary">Dodaj</Button>
            </div>

            {/* Sekcja Szybkiego Importu z YouTube AI */}
            {(linkInput.includes('youtube.com') || linkInput.includes('youtu.be')) && (
              <div className="pt-2.5 mt-1 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1 bg-red-500/[0.02] p-2 rounded-lg border border-red-500/10">
                <span className="text-[10px] text-muted-foreground leading-normal max-w-[45ch]">
                  Wykryto link YouTube! Kliknij przycisk obok, aby asystent Gemini automatycznie wygenerował ślad, szczegółowy opis i naniósł punkty POI.
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={isImporting || isUploading}
                  onClick={() => onYoutubeImport?.(linkInput)}
                  className="w-full sm:w-auto shrink-0 bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm"
                >
                  {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 animate-pulse" />}
                  Projektuj z YouTube AI
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium">Twoje notatki o trasie</label>
            <Button size="sm" variant="ghost" onClick={onSaveNotes} disabled={notes.trim().length === 0}>Zapisz</Button>
          </div>
          <Textarea 
            value={notes} 
            onChange={(e) => onNotesChange(e.target.value)} 
            rows={8} 
            placeholder="Dopisz klimat wyprawy, warunki terenowe, ciekawe miejsca..." 
          />
        </div>

        {(uploadedFiles.length > 0 || links.length > 0) && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-lg bg-muted/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-primary" />
                Załadowane źródła w projekcie
              </p>
              <div className="flex flex-wrap gap-2">
                {uploadedFiles.map((file, index) => (
                  <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-full bg-background px-3 py-1 text-xs text-muted-foreground border">
                    {file.name.endsWith('.gpx') ? <Route className="h-3.5 w-3.5 text-emerald-500" /> : <FileText className="h-3.5 w-3.5 text-primary" />}
                    <span className="max-w-[240px] truncate">{file.name}</span>
                  </span>
                ))}
                {links.map((link) => {
                  const brandInfo = getLinkIconAndBrand(link);
                  const Icon = brandInfo.icon;
                  return (
                    <span key={link} className={`inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold border transition-colors ${brandInfo.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                      <span className="max-w-[280px] truncate">{brandInfo.brand}: {link}</span>
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button 
                onClick={onContinue} 
                size="lg"
                className="w-full sm:w-auto gap-2 shadow-lg shadow-primary/20"
              >
                Zatwierdź materiały i kontynuuj <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
