import { FileUp, FileText, Compass, ChevronRight, RefreshCw, Clock3, Trash2 } from 'lucide-react';

interface DashboardStepProps {
  onChoosePath: (path: 'path1_gpx' | 'path2_notatki' | 'path3_wywiad') => void;
  projects?: any[];
  projectsLoading?: boolean;
  onRefreshProjects?: () => void;
  onResumeProject?: (projectId: string) => void;
  onDeleteProject?: (projectId: string) => void;
}

export default function DashboardStep({
  onChoosePath,
  projects = [],
  projectsLoading = false,
  onRefreshProjects,
  onResumeProject,
  onDeleteProject
}: DashboardStepProps) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="text-center space-y-2 max-w-xl mx-auto">
        <h2 className="text-2xl font-bold tracking-tight">Powiedz, co chcesz dzisiaj zrobić:</h2>
        <p className="text-zinc-400 text-sm">
          Wybierz jedną z trzech ścieżek pracy, aby rozpocząć tworzenie niesamowitej trasy z pomocą AI.
        </p>
      </div>

      <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/80 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-zinc-100 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-cyan-400" /> Moje projekty v2
            </h3>
            <p className="text-xs text-zinc-500 mt-1">Wróć do rozpoczętej pracy albo sprawdź ostatnio wygenerowane trasy.</p>
          </div>
          <button
            type="button"
            onClick={onRefreshProjects}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${projectsLoading ? 'animate-spin' : ''}`} />
            Odśwież
          </button>
        </div>

        {projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {projects.slice(0, 6).map((project) => {
              const req = project.requirements || {};
              return (
                <div 
                  key={project.id}
                  className="group relative flex items-stretch rounded-xl border border-zinc-800/80 bg-zinc-950/50 hover:border-cyan-600/60 hover:bg-zinc-900/70 transition-colors overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => onResumeProject?.(project.id)}
                    className="flex-1 text-left p-4 pr-12"
                  >
                    <div className="font-semibold text-zinc-100 truncate">{req.region || req.start_point || 'Projekt Route Builder'}</div>
                    <div className="text-xs text-zinc-500 mt-1 truncate">
                      {req.route_type || 'route'} · {req.start_point || 'brak startu'} · {req.distance_target_km ? `${req.distance_target_km} km` : 'bez dystansu'}
                    </div>
                    <div className="text-[11px] text-zinc-600 mt-2">
                      {project.updated_at ? new Date(project.updated_at).toLocaleString() : 'ostatnio edytowany'}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Czy na pewno chcesz usunąć ten projekt?')) {
                        onDeleteProject?.(project.id);
                      }
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-950/20 rounded-lg"
                    title="Usuń projekt"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
            {projectsLoading ? 'Ładuję projekty...' : 'Nie ma jeszcze projektów v2 na tym koncie.'}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* CARD 1 */}
        <div 
          onClick={() => onChoosePath('path1_gpx')}
          className="group cursor-pointer rounded-2xl bg-zinc-900/40 border border-zinc-800/80 p-6 space-y-4 hover:border-emerald-500/50 hover:bg-zinc-900/80 hover:shadow-lg hover:shadow-emerald-950/20 transition-all duration-300 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 h-24 w-24 bg-gradient-to-br from-emerald-500/10 to-transparent blur-2xl group-hover:scale-125 transition-transform" />
          <div className="p-3 bg-emerald-500/10 rounded-xl w-fit group-hover:bg-emerald-500/20 transition-colors">
            <FileUp className="h-6 w-6 text-emerald-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-zinc-100 group-hover:text-emerald-300 transition-colors">
              1. Mam pomysł i plik GPX
            </h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Masz już nagrany ślad trasy? Wgraj go, a system automatycznie wyrysuje go na mapie, doda punkty POI i stworzy kompletny przewodnik AI.
            </p>
          </div>
          <div className="pt-2 flex items-center text-xs text-emerald-400 font-semibold group-hover:translate-x-1 transition-transform">
            Rozpocznij <ChevronRight className="h-4 w-4" />
          </div>
        </div>

        {/* CARD 2 */}
        <div 
          onClick={() => onChoosePath('path2_notatki')}
          className="group cursor-pointer rounded-2xl bg-zinc-900/40 border border-zinc-800/80 p-6 space-y-4 hover:border-cyan-500/50 hover:bg-zinc-900/80 hover:shadow-lg hover:shadow-cyan-950/20 transition-all duration-300 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 h-24 w-24 bg-gradient-to-br from-cyan-500/10 to-transparent blur-2xl group-hover:scale-125 transition-transform" />
          <div className="p-3 bg-cyan-500/10 rounded-xl w-fit group-hover:bg-cyan-500/20 transition-colors">
            <FileText className="h-6 w-6 text-cyan-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-zinc-100 group-hover:text-cyan-300 transition-colors">
              2. Mam notatki lub YouTube
            </h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Wklej własne materiały, notatki, chat z AI lub link do wideo z YouTube. Gemini wyodrębni lokalizacje, a silnik routingu wytyczy alternatywne ślady.
            </p>
          </div>
          <div className="pt-2 flex items-center text-xs text-cyan-400 font-semibold group-hover:translate-x-1 transition-transform">
            Rozpocznij <ChevronRight className="h-4 w-4" />
          </div>
        </div>

        {/* CARD 3 */}
        <div 
          onClick={() => onChoosePath('path3_wywiad')}
          className="group cursor-pointer rounded-2xl bg-zinc-900/40 border border-zinc-800/80 p-6 space-y-4 hover:border-amber-500/50 hover:bg-zinc-900/80 hover:shadow-lg hover:shadow-amber-950/20 transition-all duration-300 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 h-24 w-24 bg-gradient-to-br from-amber-500/10 to-transparent blur-2xl group-hover:scale-125 transition-transform" />
          <div className="p-3 bg-amber-500/10 rounded-xl w-fit group-hover:bg-amber-500/20 transition-colors">
            <Compass className="h-6 w-6 text-amber-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-zinc-100 group-hover:text-amber-300 transition-colors">
              3. Szukam inspiracji (Wywiad)
            </h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Nie wiesz, gdzie jechać ani co robić? Odpowiedz na 5 prostych pytań kafelkowych, a AI zaplanuje dla Ciebie 2-3 świetne gotowe pomysły wycieczek.
            </p>
          </div>
          <div className="pt-2 flex items-center text-xs text-amber-400 font-semibold group-hover:translate-x-1 transition-transform">
            Rozpocznij <ChevronRight className="h-4 w-4" />
          </div>
        </div>

      </div>
    </div>
  );
}
