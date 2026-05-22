import { useState, lazy, Suspense } from 'react';
import { ArrowLeft, Globe, Map as MapIcon, Route, Mountain, Ruler } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const RouteDetailMap = lazy(() => import('@/components/RouteDetailMap'));
const RouteGlobe3D = lazy(() => import('@/components/RouteGlobe3D'));

const DEMO_TRACK: [number, number][] = [
  [42.0714, 19.5139],
  [42.1032, 19.5491],
  [42.142, 19.5984],
  [42.1883, 19.6349],
  [42.2354, 19.6712],
  [42.2764, 19.7003],
  [42.3184, 19.7356],
  [42.3565, 19.7541],
  [42.3897, 19.7692],
  [42.3959, 19.7745],
];

export default function GlobeLab() {
  const navigate = useNavigate();
  const [mapMode, setMapMode] = useState<'2d' | '3d'>('3d');

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold">3D Globe Lab</h1>
              <p className="text-xs text-muted-foreground">GPX preview on a photorealistic globe</p>
            </div>
          </div>
          <Tabs value={mapMode} onValueChange={(value) => setMapMode(value as '2d' | '3d')} className="w-[180px]">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="2d" className="gap-1.5">
                <MapIcon className="h-3.5 w-3.5" /> 2D
              </TabsTrigger>
              <TabsTrigger value="3d" className="gap-1.5">
                <Globe className="h-3.5 w-3.5" /> 3D
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Route className="h-4 w-4" />
              <span className="text-xs uppercase">Track Points</span>
            </div>
            <div className="mt-2 text-2xl font-semibold">{DEMO_TRACK.length}</div>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Ruler className="h-4 w-4" />
              <span className="text-xs uppercase">Distance</span>
            </div>
            <div className="mt-2 text-2xl font-semibold">47 km</div>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mountain className="h-4 w-4" />
              <span className="text-xs uppercase">Region</span>
            </div>
            <div className="mt-2 text-2xl font-semibold">Albania</div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-token-sm" style={{ height: '72vh' }}>
          <Tabs value={mapMode} className="h-full">
            <TabsContent value="2d" className="m-0 h-full">
              <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
                <RouteDetailMap track={DEMO_TRACK} />
              </Suspense>
            </TabsContent>
            <TabsContent value="3d" className="m-0 h-full">
              <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
                <RouteGlobe3D track={DEMO_TRACK} />
              </Suspense>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
