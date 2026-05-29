import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FileUp, ArrowLeft, Activity, Bike, Compass } from 'lucide-react';

type ActivityType = 'hiking' | 'motorcycle' | 'cycling' | 'city_walk';

interface GpxUploadStepProps {
  routeType: ActivityType;
  setRouteType: (type: ActivityType) => void;
  onGpxUpload: (file: File) => void;
  onBack: () => void;
  dragActive: boolean;
  setDragActive: (active: boolean) => void;
  loading: boolean;
}

export default function GpxUploadStep({
  routeType,
  setRouteType,
  onGpxUpload,
  onBack,
  dragActive,
  setDragActive,
  loading
}: GpxUploadStepProps) {

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onGpxUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <Card className="bg-zinc-950 border-zinc-800 max-w-2xl mx-auto shadow-xl animate-in fade-in duration-300">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-zinc-800/80">
        <div>
          <CardTitle className="text-xl flex items-center gap-2">
            <FileUp className="text-emerald-400" /> 1. Ulepsz plik GPX
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Wgraj ślad w formacie .gpx i określ rodzaj aktywności.
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack} className="text-zinc-400">
          <ArrowLeft className="mr-1 h-4 w-4" /> Anuluj
        </Button>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        
        {/* Activity selector */}
        <div className="space-y-3">
          <Label className="text-zinc-300">Co to za rodzaj aktywności?</Label>
          <div className="grid grid-cols-3 gap-3">
            <div 
              onClick={() => setRouteType('motorcycle')}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center cursor-pointer transition-all ${
                routeType === 'motorcycle' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-zinc-800 hover:bg-zinc-900 text-zinc-400'
              }`}
            >
              <Activity className="h-6 w-6 mb-2" />
              <span className="text-xs font-semibold">Motocykl</span>
            </div>
            <div 
              onClick={() => setRouteType('cycling')}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center cursor-pointer transition-all ${
                routeType === 'cycling' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-zinc-800 hover:bg-zinc-900 text-zinc-400'
              }`}
            >
              <Bike className="h-6 w-6 mb-2" />
              <span className="text-xs font-semibold">Rower</span>
            </div>
            <div 
              onClick={() => setRouteType('hiking')}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center cursor-pointer transition-all ${
                routeType === 'hiking' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-zinc-800 hover:bg-zinc-900 text-zinc-400'
              }`}
            >
              <Compass className="h-6 w-6 mb-2" />
              <span className="text-xs font-semibold">Hiking</span>
            </div>
          </div>
        </div>

        {/* Drag & Drop GPX Area */}
        <div 
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center p-8 text-center border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
            dragActive ? 'bg-emerald-500/10 border-emerald-500 scale-[1.01]' : 'border-zinc-800 hover:bg-zinc-900/40 bg-zinc-900/10'
          }`}
        >
          <input 
            type="file" 
            id="gpx-upload" 
            className="hidden" 
            accept=".gpx"
            disabled={loading}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                onGpxUpload(e.target.files[0]);
              }
            }}
          />
          <label htmlFor="gpx-upload" className="cursor-pointer w-full flex flex-col items-center">
            <FileUp className="h-12 w-12 text-emerald-400 animate-bounce mb-3" />
            <h3 className="font-bold text-lg text-zinc-200">Przeciągnij i upuść plik GPX</h3>
            <p className="text-sm text-zinc-500 mt-1 max-w-sm">
              Wgraj plik z komputera lub telefonu. Obsługujemy standardowe formaty GPX ze śladem GPS.
            </p>
            <Button variant="outline" size="sm" className="mt-4 border-zinc-700 bg-zinc-800 text-zinc-200 pointer-events-none" disabled={loading}>
              Wybierz z dysku
            </Button>
          </label>
        </div>
        
      </CardContent>
    </Card>
  );
}
