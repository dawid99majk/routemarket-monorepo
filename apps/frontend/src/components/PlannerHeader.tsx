import { useNavigate, useLocation } from 'react-router-dom';

interface PlannerHeaderProps {
  /** Kontekst aktywnego wyjazdu po prawej, np. "Durrës · 3 dni · z dziećmi". */
  context?: string | null;
  /** Inicjały do awatara. Bez nich kółko się nie pokazuje. */
  initials?: string | null;
}

const TABS = [
  { label: 'Start', path: '/start' },
  { label: 'Odkrywaj', path: '/odkrywaj' },
  { label: 'Tablica', path: '/plany' },
  { label: 'Plan', path: '/plany?widok=plan' },
];

/**
 * Wspólny pasek planera. Wcześniej każdy ekran miał własny nagłówek z przyciskiem
 * "wstecz", przez co przejście między odkrywaniem, tablicą a planem wyglądało jak
 * skok do innej aplikacji. Projekt zakłada jeden pasek i trzy zakładki.
 */
export default function PlannerHeader({ context, initials }: PlannerHeaderProps) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const here = pathname + search;

  const isActive = (path: string) =>
    path.includes('?') ? here === path : pathname === path && !search.includes('widok=plan');

  return (
    <header className="sticky top-0 z-20 h-16 border-b border-border bg-background/85 backdrop-blur-[8px]">
      <div className="max-w-[1400px] mx-auto h-full px-6 flex items-center gap-6">
        {/* Zalogowany użytkownik wraca logotypem na Start, nie na stronę sprzedażową. */}
        <button onClick={() => navigate('/start')} className="flex items-center gap-2 shrink-0">
          <span className="font-display text-[19px] tracking-tight">Routemarket</span>
          <span className="font-narrow uppercase tracking-[0.18em] text-[9px] text-muted-foreground
                           border border-border rounded-full px-2 py-0.5">
            Planner
          </span>
        </button>

        <nav className="flex items-center gap-1">
          {TABS.map((t) => (
            <button key={t.label} onClick={() => navigate(t.path)}
              className={`px-3.5 py-1.5 text-sm rounded-sm transition-colors ${
                isActive(t.path) ? 'bg-muted font-medium' : 'text-foreground/70 hover:bg-muted/60'
              }`}>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {context && (
            <span className="font-narrow uppercase tracking-[0.18em] text-[11px] text-muted-foreground hidden md:block">
              {context}
            </span>
          )}
          {initials && (
            <button onClick={() => navigate('/profile')}
              className="w-9 h-9 rounded-full bg-tan/30 border border-border flex items-center justify-center
                         text-[12px] font-medium hover:bg-tan/45 transition-colors">
              {initials}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
