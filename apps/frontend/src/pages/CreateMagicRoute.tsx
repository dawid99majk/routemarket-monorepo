import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, UploadCloud, Sparkles, X, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function CreateMagicRoute() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [instructions, setInstructions] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...droppedFiles]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selectedFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });

  const readTextFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsText(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });

  const handleGenerate = async () => {
    if (!instructions.trim() && files.length === 0) {
      toast.error('Dodaj instrukcje lub załącz pliki, aby rozpocząć.');
      return;
    }

    setLoading(true);
    try {
      const processedFiles = await Promise.all(
        files.map(async (file) => {
          if (file.type.startsWith('image/')) {
            const b64 = await toBase64(file);
            return { type: 'image', name: file.name, data: b64 };
          } else if (
            file.type === 'application/pdf' || 
            file.name.endsWith('.pdf') ||
            file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            file.name.endsWith('.docx')
          ) {
            const b64 = await toBase64(file);
            const type = file.name.endsWith('.docx') || file.type.includes('word') ? 'docx' : 'pdf';
            return { type, name: file.name, data: b64 };
          } else if (
            file.type.startsWith('text/') || 
            file.name.endsWith('.md') || 
            file.name.endsWith('.csv') || 
            file.name.endsWith('.gpx') || 
            file.type === 'application/gpx+xml'
          ) {
            const text = await readTextFile(file);
            return { type: 'text', name: file.name, data: text };
          } else {
            return { type: 'unsupported', name: file.name, data: '' };
          }
        })
      );

      const validFiles = processedFiles.filter((f) => f.type !== 'unsupported');

      const { data, error } = await supabase.functions.invoke('generate-magic-route', {
        body: {
          instructions,
          files: validFiles,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.route_id) {
        toast.success('Magia zadziałała! 🪄 Trasa wygenerowana.');
        navigate(`/edit-route/${data.route_id}`);
      } else {
        throw new Error('Brak ID wygenerowanej trasy.');
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Wystąpił błąd podczas generowania trasy.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mr-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Wróć
          </Button>
          <h1 className="font-semibold text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Magic Generator
          </h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <Card className="border-primary/20 shadow-sm">
          <CardContent className="p-6 sm:p-8 space-y-8">
            <div>
              <h2 className="text-xl font-bold mb-2">Zmień swoje materiały w gotową trasę</h2>
              <p className="text-muted-foreground">
                Opisz, o jakiej trasie myślisz, lub wgraj swoje notatki, pliki tekstowe (np. opisy dzień po dniu) i zdjęcia. Nasze AI ułoży z tego strukturę gotową do publikacji.
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold">Opis / Instrukcje dla AI</label>
              <Textarea
                placeholder="Np. 'Stwórz 3-dniową trasę rowerową po Tatrach Wysokich. Pierwszy dzień z Zakopanego do Morskiego Oka...'"
                className="min-h-[120px] resize-y bg-muted/30"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold">Materiały źródłowe (Notatki, Teksty, Zdjęcia)</label>
              <div
                className="border-2 border-dashed border-border/60 rounded-xl p-8 text-center hover:bg-muted/30 transition-colors cursor-pointer"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => document.getElementById('magic-file-upload')?.click()}
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <UploadCloud className="w-6 h-6 text-primary" />
                </div>
                <p className="text-sm font-medium">Przeciągnij i upuść pliki tutaj</p>
                <p className="text-xs text-muted-foreground mt-1">lub kliknij, aby wybrać (TXT, MD, DOCX, PDF, GPX, JPG, PNG)</p>
                <input
                  id="magic-file-upload"
                  type="file"
                  multiple
                  accept=".txt,.md,.docx,.csv,.pdf,.gpx,image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              {files.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                  {files.map((file, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                      {file.type.startsWith('image/') ? (
                        <ImageIcon className="w-8 h-8 text-blue-500 shrink-0" />
                      ) : file.type === 'application/pdf' || file.name.endsWith('.pdf') ? (
                        <FileText className="w-8 h-8 text-red-500 shrink-0" />
                      ) : (
                        <FileText className="w-8 h-8 text-orange-500 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeFile(i)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-border">
              <Button
                size="lg"
                className="w-full sm:w-auto font-semibold gap-2"
                onClick={handleGenerate}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generowanie magii... (może to potrwać kilkanaście sekund)
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Wygeneruj Trasę
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
