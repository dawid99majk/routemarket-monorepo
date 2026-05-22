import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { Send, Sparkles, Image as ImageIcon, FileText, Trash2, Copy, Download, Loader2, MessageSquare, Package } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import ContentPackageGenerator from '@/components/admin/ContentPackageGenerator';

type Msg = { role: 'user' | 'assistant'; content: string };

const QUICK_PROMPTS = [
  { label: 'Post IG o nowej trasie', prompt: 'Wybierz losową świeżą trasę z listy i napisz post na Instagram (z hashtagami i CTA do RouteMarket.io).' },
  { label: 'Karuzela IG (5 slajdów)', prompt: 'Wygeneruj treść 5-slajdowej karuzeli na Instagram o tym dlaczego warto kupować trasy GPX zamiast szukać za darmo. Każdy slajd: tytuł + 1-2 zdania.' },
  { label: 'Newsletter tygodniowy', prompt: 'Napisz krótki newsletter (max 200 słów) z 3 nowymi trasami z platformy. Ton: ekspercki, konkretny.' },
  { label: 'OG image dla bloga', prompt: 'Wygeneruj og_image dla artykułu "Jak wybrać trasę motocyklową na weekend". Tytuł czytelny, w deep forest green.' },
  { label: 'IG square — promo', prompt: 'Wygeneruj instagram_square z hasłem "Twoja następna przygoda zaczyna się tutaj" i mapą topograficzną w tle.' },
];

export default function AdminContentGenerator() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput('');
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('content-generator', {
        body: { messages: next },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMessages([...next, { role: 'assistant', content: data.message ?? '(brak odpowiedzi)' }]);
      qc.invalidateQueries({ queryKey: ['generated-content'] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Błąd generowania');
      setMessages(next);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <header className="h-16 border-b border-border px-6 flex items-center gap-3 shrink-0">
        <Sparkles className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Content Generator AI</h1>
        <Badge variant="secondary" className="ml-2">Gemini 3.5 Flash + Nano Banana 2</Badge>
      </header>

      <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0">
        <div className="px-6 pt-3 border-b border-border shrink-0">
          <TabsList>
            <TabsTrigger value="chat" className="gap-2"><MessageSquare className="h-4 w-4" /> Chat AI</TabsTrigger>
            <TabsTrigger value="packages" className="gap-2"><Package className="h-4 w-4" /> Pakiety per trasa</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="chat" className="flex-1 m-0 min-h-0 grid grid-cols-1 lg:grid-cols-2">
          {/* LEFT: Chat */}
          <section className="flex flex-col border-r border-border min-h-0">
          <ScrollArea className="flex-1 px-6 py-4" ref={scrollRef as any}>
            {messages.length === 0 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Wybierz szablon albo napisz swój prompt:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q.label}
                      onClick={() => send(q.prompt)}
                      className="text-left p-3 rounded-lg border border-border hover:border-primary hover:bg-muted transition-colors text-sm"
                    >
                      <div className="font-medium">{q.label}</div>
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{q.prompt}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                    <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Myślę i wywołuję narzędzia…
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="border-t border-border p-4 space-y-2 shrink-0">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Napisz prompt… (Cmd/Ctrl+Enter wysyła)"
              className="min-h-[80px] resize-none"
              disabled={loading}
            />
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground">AI ma dostęp do tras, kategorii i Nano Banana 2.</p>
              <Button onClick={() => send()} disabled={loading || !input.trim()} size="sm">
                <Send className="h-4 w-4 mr-2" /> Wyślij
              </Button>
            </div>
          </div>
        </section>

          {/* RIGHT: Library */}
          <section className="flex flex-col min-h-0">
            <Library />
          </section>
        </TabsContent>

        <TabsContent value="packages" className="flex-1 m-0 min-h-0">
          <ContentPackageGenerator />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Library() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['generated-content'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('generated_content')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 5000,
  });

  const images = items.filter((i: any) => i.content_type === 'image');
  const texts = items.filter((i: any) => i.content_type === 'text');

  const remove = async (id: string, fileKey?: string | null) => {
    if (!confirm('Usunąć?')) return;
    if (fileKey) await supabase.storage.from('marketing-assets').remove([fileKey]);
    const { error } = await supabase.from('generated_content').delete().eq('id', id);
    if (error) toast.error(error.message);
    else {
      toast.success('Usunięto');
      qc.invalidateQueries({ queryKey: ['generated-content'] });
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Skopiowano');
  };

  const publicUrl = (key: string) => supabase.storage.from('marketing-assets').getPublicUrl(key).data.publicUrl;

  return (
    <Tabs defaultValue="images" className="flex flex-col h-full">
      <div className="px-6 pt-4 shrink-0">
        <TabsList>
          <TabsTrigger value="images" className="gap-2"><ImageIcon className="h-4 w-4" /> Obrazy ({images.length})</TabsTrigger>
          <TabsTrigger value="texts" className="gap-2"><FileText className="h-4 w-4" /> Teksty ({texts.length})</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="images" className="flex-1 min-h-0 m-0 px-6 pb-6 pt-4">
        <ScrollArea className="h-full">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Ładuję…</p>
          ) : images.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak wygenerowanych obrazów. Poproś AI o coś jak "Wygeneruj instagram_square z…".</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {images.map((img: any) => {
                const url = publicUrl(img.file_key);
                return (
                  <Card key={img.id} className="overflow-hidden group">
                    <div className="aspect-square bg-muted overflow-hidden">
                      <img src={url} alt={img.metadata?.title ?? 'asset'} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{img.metadata?.title ?? 'Untitled'}</p>
                          <Badge variant="outline" className="text-[10px] mt-1">{img.category}</Badge>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{img.prompt}</p>
                      <div className="flex gap-1">
                        <Button asChild size="sm" variant="outline" className="flex-1">
                          <a href={url} download target="_blank" rel="noreferrer"><Download className="h-3 w-3 mr-1" /> Pobierz</a>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(img.id, img.file_key)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </TabsContent>

      <TabsContent value="texts" className="flex-1 min-h-0 m-0 px-6 pb-6 pt-4">
        <ScrollArea className="h-full">
          {texts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak zapisanych tekstów. Każda dłuższa odpowiedź AI jest zapisywana automatycznie.</p>
          ) : (
            <div className="space-y-3">
              {texts.map((t: any) => (
                <Card key={t.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-muted-foreground line-clamp-1 flex-1">📝 {t.prompt}</p>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{new Date(t.created_at).toLocaleDateString('pl-PL')}</span>
                  </div>
                  <div className="text-sm bg-muted p-2 rounded max-h-40 overflow-y-auto whitespace-pre-wrap">{t.result_text}</div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => copyText(t.result_text)}>
                      <Copy className="h-3 w-3 mr-1" /> Kopiuj
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(t.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}
