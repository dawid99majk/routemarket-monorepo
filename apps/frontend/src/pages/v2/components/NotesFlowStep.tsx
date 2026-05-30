import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, ArrowLeft, Youtube, Loader2, ChevronRight } from 'lucide-react';

type ActivityType = 'hiking' | 'motorcycle' | 'cycling' | 'city_walk';

interface NotesFlowStepProps {
  userNotes: string;
  setUserNotes: (notes: string) => void;
  youtubeLink: string;
  setYoutubeLink: (link: string) => void;
  youtubeStatus: 'idle' | 'fetching' | 'success';
  onYoutubeFetch: () => void;
  routeType: ActivityType;
  setRouteType: (type: ActivityType) => void;
  region: string;
  setRegion: (region: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function NotesFlowStep({
  userNotes,
  setUserNotes,
  youtubeLink,
  setYoutubeLink,
  youtubeStatus,
  onYoutubeFetch,
  routeType,
  setRouteType,
  region,
  setRegion,
  onBack,
  onNext
}: NotesFlowStepProps) {

  return (
    <Card className="bg-zinc-950 border-zinc-800 max-w-3xl mx-auto shadow-xl animate-in fade-in duration-300">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-zinc-800/80">
        <div>
          <CardTitle className="text-xl flex items-center gap-2">
            <FileText className="text-cyan-400" /> 2. Mam notatki, chat lub wideo
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Stwórz trasę od zera z posiadanych materiałów, filmów lub rozmowy z AI.
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack} className="text-zinc-400">
          <ArrowLeft className="mr-1 h-4 w-4" /> Anuluj
        </Button>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        
        {/* YouTube link import */}
        <div className="space-y-2 p-4 rounded-xl bg-cyan-950/20 border border-cyan-800/30">
          <Label className="text-zinc-300 font-semibold flex items-center gap-2">
            <Youtube className="text-red-500 h-5 w-5" /> Import inspiracji z YouTube
          </Label>
          <p className="text-xs text-zinc-500">
            AI automatycznie pobierze transkrypcję z wideo i wyciągnie z niej nazwy geograficzne.
          </p>
          <div className="flex gap-2 mt-2">
            <Input 
              placeholder="Wklej link do filmu, np. https://www.youtube.com/watch?v=..." 
              value={youtubeLink}
              onChange={(e) => setYoutubeLink(e.target.value)}
              className="bg-zinc-900 border-zinc-800 focus-visible:ring-cyan-500"
            />
            <Button 
              onClick={onYoutubeFetch} 
              disabled={youtubeStatus === 'fetching'}
              className="bg-cyan-600 hover:bg-cyan-700 text-white flex items-center gap-2"
            >
              {youtubeStatus === 'fetching' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Pobierz'}
            </Button>
          </div>
        </div>

        {/* Notes editor */}
        <div className="space-y-2">
          <Label className="text-zinc-300 font-semibold">Notatki, plan wycieczki lub czat z Gemini</Label>
          <Textarea 
            placeholder="Wpisz lub wklej wszystko co wiesz o trasie. Np.: 'Chcę wystartować z Krynicy-Zdroju, pojechać przez przełęcz do Tylicza, zobaczyć cerkiew, a potem wrócić przez las trasą rekreacyjną. Całość około 25 km.'"
            value={userNotes}
            onChange={(e) => setUserNotes(e.target.value)}
            className="min-h-[150px] bg-zinc-900 border-zinc-800 focus-visible:ring-cyan-500 font-sans text-sm"
          />
        </div>

        {/* Form settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-zinc-300">Aktywność</Label>
            <Select value={routeType} onValueChange={(v: ActivityType) => setRouteType(v)}>
              <SelectTrigger className="bg-zinc-900 border-zinc-800">
                <SelectValue placeholder="Typ" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="hiking">🥾 Hiking (Pieszo)</SelectItem>
                <SelectItem value="motorcycle">🏍️ Motocykl</SelectItem>
                <SelectItem value="cycling">🚴 Rower</SelectItem>
                <SelectItem value="city_walk">🚶 Spacer miejski</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-zinc-300">Miasto / Region startu <span className="text-xs text-zinc-500 font-normal">(Opcjonalne)</span></Label>
              {region && (
                <button 
                  type="button"
                  onClick={() => setRegion('')}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 hover:underline transition-all"
                >
                  Pomiń (niech AI określi start)
                </button>
              )}
            </div>
            <Input 
              placeholder="np. Zakopane (zostaw puste, by AI wyciągnęło start z notatek)" 
              value={region} 
              onChange={(e) => setRegion(e.target.value)}
              className="bg-zinc-900 border-zinc-800 focus-visible:ring-cyan-500"
            />
            {!region && (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1 animate-pulse font-medium">
                ✨ AI automatycznie wyodrębni punkt startowy z Twoich notatek!
              </p>
            )}
          </div>
        </div>

        <Button 
          onClick={onNext} 
          disabled={!userNotes}
          className="w-full bg-cyan-600 hover:bg-cyan-700 text-white py-6 text-base font-semibold rounded-xl flex items-center justify-center gap-2"
        >
          Dalej do preferencji <ChevronRight className="h-5 w-5" />
        </Button>

      </CardContent>
    </Card>
  );
}
