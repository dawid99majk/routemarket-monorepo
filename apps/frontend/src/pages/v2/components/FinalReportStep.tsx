import { lazy, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Download, Sparkles, Map as MapIcon, Loader2, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const RouteDetailMap = lazy(() => import('@/components/RouteDetailMap'));

interface FinalReportStepProps {
  summaryData: {
    distance_km: number;
    duration_h: number;
  } | null;
  trackPoints: [number, number][] | null;
  places: { name: string; lat: number; lng: number }[] | null;
  showMap: boolean;
  reportText: string | null;
  sources: { title: string; url: string }[] | null;
  onDownloadGpx: () => void;
  onReset: () => void;
}

export default function FinalReportStep({
  summaryData,
  trackPoints,
  places,
  showMap,
  reportText,
  sources,
  onDownloadGpx,
  onReset
}: FinalReportStepProps) {

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-300">
      
      {/* Stats & Actions */}
      <div className="lg:col-span-4 space-y-6">
        <Card className="bg-zinc-950 border-zinc-800 shadow-xl">
          <CardHeader className="border-b border-zinc-800/80 pb-4">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
              <CardTitle className="text-xl">Trasa gotowa!</CardTitle>
            </div>
            <CardDescription className="text-zinc-400">
              Ślad GPX oraz przewodnik AI zostały wygenerowane pomyślnie.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            
            {summaryData && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-zinc-900/60 border border-zinc-800/80 p-3 rounded-xl">
                  <p className="text-xs text-zinc-500">Dystans końcowy</p>
                  <p className="font-extrabold text-xl text-zinc-100 mt-1">{summaryData.distance_km} km</p>
                </div>
                <div className="bg-zinc-900/60 border border-zinc-800/80 p-3 rounded-xl">
                  <p className="text-xs text-zinc-500">Szacowany czas</p>
                  <p className="font-extrabold text-xl text-zinc-100 mt-1">{summaryData.duration_h} h</p>
                </div>
              </div>
            )}

            <div className="space-y-2 pt-2">
              <Button 
                onClick={onDownloadGpx} 
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-6 text-base shadow-lg shadow-emerald-950/20 flex items-center justify-center gap-2"
              >
                <Download className="h-5 w-5" /> Pobierz plik GPX
              </Button>
              <Button 
                onClick={onReset} 
                variant="secondary" 
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
              >
                Stwórz kolejną trasę
              </Button>
            </div>

          </CardContent>
        </Card>
      </div>

      {/* Map & Markdown Guide */}
      <div className="lg:col-span-8 space-y-6 flex flex-col">
        
        {/* Final map preview */}
        <Card className="h-[380px] overflow-hidden border border-zinc-800 shadow-2xl relative rounded-2xl">
          {showMap && trackPoints ? (
            <Suspense fallback={<div className="w-full h-full flex items-center justify-center bg-zinc-950"><Loader2 className="animate-spin text-cyan-400" /></div>}>
              <RouteDetailMap track={trackPoints} places={places} className="w-full h-full min-h-[380px]" />
            </Suspense>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 text-zinc-500 space-y-4">
              <MapIcon className="h-12 w-12 opacity-20" />
              <p className="text-sm font-semibold uppercase tracking-widest font-mono">Trwa ładowanie mapy...</p>
            </div>
          )}
        </Card>

        {/* AI Generated Markdown Guide */}
        {reportText && (
          <Card className="border-zinc-800 shadow-xl bg-zinc-950/80 rounded-2xl overflow-hidden">
            <CardHeader className="bg-zinc-900/30 border-b border-zinc-800/80 flex flex-row items-center gap-2 py-4">
              <Sparkles className="text-cyan-400 h-5 w-5 animate-pulse" />
              <CardTitle className="text-lg">Przewodnik Turystyczny AI</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              
              {/* Markdown content with beautiful slate style */}
              <div className="prose prose-sm dark:prose-invert max-w-none text-zinc-300 leading-relaxed font-sans text-sm">
                <ReactMarkdown>{reportText}</ReactMarkdown>
              </div>

              {/* Fact checking sources */}
              {sources && sources.length > 0 && (
                <div className="pt-6 border-t border-zinc-900 space-y-3">
                  <h4 className="text-xs font-semibold text-cyan-400 flex items-center gap-2 uppercase tracking-wider">
                    🔍 Źródła i weryfikacja faktów (Google Search):
                  </h4>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    {sources.map((src, i) => (
                      <li key={i}>
                        <a 
                          href={src.url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-zinc-400 hover:text-cyan-400 transition-colors hover:underline p-2 rounded-lg bg-zinc-900/40 border border-zinc-800/40 hover:border-cyan-800/30"
                        >
                          <ExternalLink className="h-3 w-3 text-cyan-400 flex-shrink-0" />
                          <span className="truncate">{src.title}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            </CardContent>
          </Card>
        )}

      </div>

    </div>
  );
}
