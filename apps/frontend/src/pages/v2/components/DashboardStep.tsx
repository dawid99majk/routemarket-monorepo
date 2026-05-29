import { Sparkles, FileUp, FileText, Compass, ChevronRight } from 'lucide-react';

interface DashboardStepProps {
  onChoosePath: (path: 'path1_gpx' | 'path2_notatki' | 'path3_wywiad') => void;
}

export default function DashboardStep({ onChoosePath }: DashboardStepProps) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="text-center space-y-3 max-w-xl mx-auto">
        <h2 className="text-3xl font-extrabold tracking-tight text-white drop-shadow-md">
          Powiedz, co chcesz dzisiaj zrobić:
        </h2>
        <p className="text-zinc-300 text-base leading-relaxed">
          Wybierz jedną z trzech dedykowanych ścieżek pracy, aby rozpocząć tworzenie niesamowitej trasy z pomocą AI.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* CARD 1 */}
        <div 
          onClick={() => onChoosePath('path1_gpx')}
          className="group cursor-pointer rounded-2xl bg-zinc-900 border border-zinc-800 p-6 space-y-4 hover:border-emerald-500/80 hover:bg-zinc-900/90 hover:shadow-xl hover:shadow-emerald-950/30 transition-all duration-300 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 h-24 w-24 bg-gradient-to-br from-emerald-500/20 to-transparent blur-2xl group-hover:scale-125 transition-transform" />
          <div className="p-3 bg-emerald-500/10 rounded-xl w-fit group-hover:bg-emerald-500/20 transition-colors">
            <FileUp className="h-6 w-6 text-emerald-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white group-hover:text-emerald-300 transition-colors">
              1. Mam pomysł i plik GPX
            </h3>
            <p className="text-zinc-300 text-sm leading-relaxed">
              Masz już nagrany ślad trasy? Wgraj go, a system automatycznie wyrysuje go na mapie, doda punkty POI i stworzy kompletny przewodnik AI.
            </p>
          </div>
          <div className="pt-2 flex items-center text-xs text-emerald-400 font-bold group-hover:translate-x-1 transition-transform">
            Rozpocznij <ChevronRight className="h-4 w-4" />
          </div>
        </div>

        {/* CARD 2 */}
        <div 
          onClick={() => onChoosePath('path2_notatki')}
          className="group cursor-pointer rounded-2xl bg-zinc-900 border border-zinc-800 p-6 space-y-4 hover:border-cyan-500/80 hover:bg-zinc-900/90 hover:shadow-xl hover:shadow-cyan-950/30 transition-all duration-300 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 h-24 w-24 bg-gradient-to-br from-cyan-500/20 to-transparent blur-2xl group-hover:scale-125 transition-transform" />
          <div className="p-3 bg-cyan-500/10 rounded-xl w-fit group-hover:bg-cyan-500/20 transition-colors">
            <FileText className="h-6 w-6 text-cyan-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white group-hover:text-cyan-300 transition-colors">
              2. Mam notatki lub YouTube
            </h3>
            <p className="text-zinc-300 text-sm leading-relaxed">
              Wklej własne materiały, notatki, chat z AI lub link do wideo z YouTube. Gemini wyodrębni lokalizacje, a silnik routingu wytyczy alternatywne ślady.
            </p>
          </div>
          <div className="pt-2 flex items-center text-xs text-cyan-400 font-bold group-hover:translate-x-1 transition-transform">
            Rozpocznij <ChevronRight className="h-4 w-4" />
          </div>
        </div>

        {/* CARD 3 */}
        <div 
          onClick={() => onChoosePath('path3_wywiad')}
          className="group cursor-pointer rounded-2xl bg-zinc-900 border border-zinc-800 p-6 space-y-4 hover:border-amber-500/80 hover:bg-zinc-900/90 hover:shadow-xl hover:shadow-amber-950/30 transition-all duration-300 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 h-24 w-24 bg-gradient-to-br from-amber-500/20 to-transparent blur-2xl group-hover:scale-125 transition-transform" />
          <div className="p-3 bg-amber-500/10 rounded-xl w-fit group-hover:bg-amber-500/20 transition-colors">
            <Compass className="h-6 w-6 text-amber-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white group-hover:text-amber-300 transition-colors">
              3. Szukam inspiracji (Wywiad)
            </h3>
            <p className="text-zinc-300 text-sm leading-relaxed">
              Nie wiesz, gdzie jechać ani co robić? Odpowiedz na 5 prostych pytań kafelkowych, a AI zaplanuje dla Ciebie 2-3 świetne gotowe pomysły wycieczek.
            </p>
          </div>
          <div className="pt-2 flex items-center text-xs text-amber-400 font-bold group-hover:translate-x-1 transition-transform">
            Rozpocznij <ChevronRight className="h-4 w-4" />
          </div>
        </div>

      </div>
    </div>
  );
}
