import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import JSZip from 'jszip';
import { Loader2, Download, Sparkles, FileText, Image as ImageIcon, Search } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';

type PackageType = 'premiere' | 'weekend_promo' | 'throwback';

const PACKAGE_OPTIONS: { value: PackageType; label: string; desc: string }[] = [
  { value: 'premiere', label: 'Premiera trasy', desc: 'Buduj ekscytację, podkreśl świeżość' },
  { value: 'weekend_promo', label: 'Weekendowa promocja', desc: 'Szybkie CTA na sobotę-niedzielę' },
  { value: 'throwback', label: 'Klasyk / sprawdzona trasa', desc: 'Social proof, autorytet' },
];

type Asset =
  | { kind: 'image'; format: string; url: string; file_key: string }
  | { kind: 'text'; format: string; text: string };

type PackageResult = {
  package_id: string;
  route: { id: number; title: string; location: string };
  package_type: PackageType;
  assets: Asset[];
};

const TEXT_LABELS: Record<string, string> = {
  ig_post: 'Post Instagram',
  fb_post: 'Post Facebook',
  story_caption: 'Caption Story',
};

const IMAGE_LABELS: Record<string, string> = {
  instagram_square: 'IG Square (1080×1080)',
  instagram_story: 'IG Story (1080×1920)',
  og_image: 'OG Image (1200×630)',
};

export default function ContentPackageGenerator() {
  const [search, setSearch] = useState('');
  const [routeId, setRouteId] = useState<number | null>(null);
  const [packageType, setPackageType] = useState<PackageType>('premiere');
  const [customInstructions, setCustomInstructions] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<PackageResult | null>(null);
  const [downloading, setDownloading] = useState(false);

  const { data: routes = [] } = useQuery({
    queryKey: ['admin-routes-search', search],
    queryFn: async () => {
      let q = supabase
        .from('routes')
        .select('id, title, location_string, status')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(20);
      if (search.trim()) q = q.ilike('title', `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const generate = async () => {
    if (!routeId) {
      toast.error('Wybierz trasę');
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-content-package', {
        body: { route_id: routeId, package_type: packageType, custom_instructions: customInstructions.trim() || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data as PackageResult);
      toast.success('Pakiet wygenerowany!');
    } catch (e: any) {
      toast.error(e?.message ?? 'Błąd generowania pakietu');
    } finally {
      setGenerating(false);
    }
  };

  const downloadZip = async () => {
    if (!result) return;
    setDownloading(true);
    try {
      const zip = new JSZip();
      const safeTitle = result.route.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40);

      // README
      zip.file(
        'README.md',
        `# Pakiet marketingowy — ${result.route.title}\n\n` +
          `**Lokalizacja:** ${result.route.location}\n` +
          `**Typ pakietu:** ${PACKAGE_OPTIONS.find((p) => p.value === result.package_type)?.label}\n` +
          `**Wygenerowano:** ${new Date().toLocaleString('pl-PL')}\n\n` +
          `## Co publikować gdzie\n\n` +
          `- \`instagram_square.png\` → grid Instagram (z postem z \`ig_post.txt\`)\n` +
          `- \`instagram_story.png\` → IG Story / FB Story (z caption z \`story_caption.txt\`)\n` +
          `- \`og_image.png\` → preview linku gdy wrzucasz na FB/LinkedIn/X\n` +
          `- \`fb_post.txt\` → Facebook post (długi storytelling)\n\n` +
          `Link do trasy: https://routemarket.io/route/${result.route.id}\n`,
      );

      // Texts
      const texts = result.assets.filter((a): a is Extract<Asset, { kind: 'text' }> => a.kind === 'text');
      for (const t of texts) {
        zip.file(`${t.format}.txt`, t.text);
      }

      // Images (download as blobs)
      const images = result.assets.filter((a): a is Extract<Asset, { kind: 'image' }> => a.kind === 'image');
      await Promise.all(
        images.map(async (img) => {
          const resp = await fetch(img.url);
          const blob = await resp.blob();
          zip.file(`${img.format}.png`, blob);
        }),
      );

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `routemarket-${safeTitle}-${result.package_type}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('ZIP pobrany');
    } catch (e: any) {
      toast.error(e?.message ?? 'Błąd pakowania ZIP');
    } finally {
      setDownloading(false);
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Skopiowano');
  };

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="px-6 py-3 border-b border-border space-y-3 shrink-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Trasa</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Szukaj trasy po tytule…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 mb-2"
              />
            </div>
            <Select value={routeId?.toString() ?? ''} onValueChange={(v) => setRouteId(Number(v))}>
              <SelectTrigger>
                <SelectValue placeholder={`Wybierz z ${routes.length} tras…`} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {routes.map((r: any) => (
                  <SelectItem key={r.id} value={r.id.toString()}>
                    <span className="font-medium">{r.title}</span>
                    <span className="text-muted-foreground text-xs ml-2">{r.location_string}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Typ pakietu</label>
            <Select value={packageType} onValueChange={(v) => setPackageType(v as PackageType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PACKAGE_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <div>
                      <div className="font-medium">{p.label}</div>
                      <div className="text-xs text-muted-foreground">{p.desc}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Dodatkowe instrukcje (opcjonalnie) — np. "podkreśl widoki na morze", "ton bardziej luźny", "dodaj hashtag #wakacje2026"
          </label>
          <Textarea
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            placeholder="Zostaw puste aby AI generowało automatycznie wg typu pakietu…"
            className="min-h-[60px] resize-none text-sm"
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={generate} disabled={generating || !routeId} className="flex-1">
            {generating ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generuję pakiet (15-30s)…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" /> Generuj pakiet (3 obrazy + 3 teksty)</>
            )}
          </Button>
          {result && (
            <Button onClick={downloadZip} disabled={downloading} variant="default">
              {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Pobierz ZIP
            </Button>
          )}
        </div>
      </div>

      {/* Results */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6">
          {!result && !generating && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Wybierz trasę + typ pakietu i kliknij "Generuj pakiet". Wszystkie 6 assetów (3 obrazy + 3 teksty) generują się równolegle.
            </div>
          )}

          {generating && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="aspect-square bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          )}

          {result && (
            <div className="space-y-6">
              <div className="text-sm">
                <p className="font-medium">{result.route.title}</p>
                <p className="text-muted-foreground text-xs">{result.route.location} • {result.assets.length}/6 assetów</p>
              </div>

              {/* Images grid */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">Obrazy</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {result.assets.filter((a): a is Extract<Asset, { kind: 'image' }> => a.kind === 'image').map((img) => (
                    <Card key={img.format} className="overflow-hidden">
                      <div className={`bg-muted overflow-hidden ${img.format === 'instagram_story' ? 'aspect-[9/16]' : img.format === 'og_image' ? 'aspect-[1200/630]' : 'aspect-square'}`}>
                        <img src={img.url} alt={img.format} className="w-full h-full object-cover" loading="lazy" />
                      </div>
                      <div className="p-3 flex items-center justify-between gap-2">
                        <Badge variant="outline" className="text-[10px]">{IMAGE_LABELS[img.format] ?? img.format}</Badge>
                        <Button asChild size="sm" variant="ghost">
                          <a href={img.url} download target="_blank" rel="noreferrer"><Download className="h-3 w-3" /></a>
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Texts */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">Teksty</h3>
                </div>
                <div className="space-y-3">
                  {result.assets.filter((a): a is Extract<Asset, { kind: 'text' }> => a.kind === 'text').map((t) => (
                    <Card key={t.format} className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[10px]">{TEXT_LABELS[t.format] ?? t.format}</Badge>
                        <Button size="sm" variant="ghost" onClick={() => copyText(t.text)}>Kopiuj</Button>
                      </div>
                      <div className="text-sm bg-muted p-3 rounded whitespace-pre-wrap max-h-60 overflow-y-auto">{t.text}</div>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
