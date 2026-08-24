import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface PlannerHeaderProps {
  /** Kontekst aktywnego wyjazdu po prawej, np. "Durrës · 3 dni · z dziećmi". */
  context?: string | null;
  /** Inicjały do awatara. Bez nich kółko się nie pokazuje. */
  initials?: string | null;
}

/**
 * Zakładki tablicy i planu prowadzą do ostatnio otwartego wyjazdu. Bez tego
 * kliknięcie "Plan" po wejściu w konkretną tablicę wyrzucałoby na listę wyjazdów,
 * czyli o krok wstecz zamiast do przodu.
 */
function ostatniaTablica(): string | null {
  try { return localStorage.getItem('rm_ostatnia_tablica'); } catch { return null; }
}

function zakladki(admin: boolean) {
  const id = ostatniaTablica();
  return [
    { klucz: 'naglowek.start', path: '/start' },
    { klucz: 'naglowek.odkrywaj', path: '/odkrywaj' },
    { klucz: 'naglowek.tablica', path: id ? `/plany/${id}` : '/plany' },
    { klucz: 'naglowek.plan', path: id ? `/plany/${id}?widok=plan` : '/plany' },
    // Warsztat to narzędzie właściciela, nie funkcja serwisu — stąd osobny
    // warunek zamiast stałej pozycji dla wszystkich.
    ...(admin ? [{ klucz: 'naglowek.warsztat', path: '/marketing' }] : []),
  ];
}

/**
 * Wspólny pasek planera. Wcześniej każdy ekran miał własny nagłówek z przyciskiem
 * "wstecz", przez co przejście między odkrywaniem, tablicą a planem wyglądało jak
 * skok do innej aplikacji. Projekt zakłada jeden pasek i trzy zakładki.
 */
export default function PlannerHeader({ context, initials }: PlannerHeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { pathname, search } = useLocation();
  const here = pathname + search;

  /**
   * Zakładka świeci się także na ekranach, które do niej należą, choć mają własny
   * adres: karta miejsca i ulubione to nadal odkrywanie, moje trasy wychodzą
   * z planu. Bez tego wchodząc w szczegóły miejsca użytkownik traci informację,
   * w której części aplikacji się znajduje.
   */
  const isActive = (path: string) => {
    if (path.includes('?')) return pathname.startsWith('/plany') && search.includes('widok=plan');
    if (path.startsWith('/plany')) return pathname.startsWith('/plany') && !search.includes('widok=plan');
    if (path === '/odkrywaj') {
      return pathname === '/odkrywaj' || pathname.startsWith('/miejsce/') || pathname === '/ulubione';
    }
    return pathname === path;
  };

  return (
    <header className="sticky top-0 z-20 h-16 border-b border-border bg-background/85 backdrop-blur-[8px]">
      <div className="max-w-[1400px] mx-auto h-full px-4 sm:px-6 flex items-center gap-3 sm:gap-6">
        {/* Logotyp prowadzi na stronę główną — tak działa wszędzie i tego się po nim
            spodziewamy. Wejście do planera ma własną zakładkę „Start". */}
        <button onClick={() => navigate('/')} className="flex items-center gap-2 shrink-0">
          <span className="font-display text-[19px] tracking-tight">Routemarket</span>
          <span className="hidden sm:inline font-narrow uppercase tracking-[0.18em] text-[9px] text-muted-foreground
                           border border-border rounded-full px-2 py-0.5">
            Planner
          </span>
        </button>

        <nav className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* Zmienna nazywa się `zakladka`, nie `t` — inaczej przesłoniłaby funkcję
              tłumaczenia i wewnątrz mapy nie dałoby się wywołać t(). */}
          {zakladki(isAdmin).map((zakladka) => (
            <button key={zakladka.klucz} onClick={() => navigate(zakladka.path)}
              className={`px-3.5 py-1.5 text-sm rounded-sm transition-colors ${
                isActive(zakladka.path) ? 'bg-muted font-medium' : 'text-foreground/70 hover:bg-muted/60'
              }`}>
              {t(zakladka.klucz)}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {context && (
            <span className="font-narrow uppercase tracking-[0.18em] text-[11px] text-muted-foreground hidden md:block">
              {context}
            </span>
          )}
          {/* Jedno wejście: kolekcje są podzbiorami zapisanych, a nie osobnym
              zbiorem, więc dwa przyciski obok siebie pytały użytkownika o różnicę,
              której nie ma. */}
          <button onClick={() => navigate('/zapisane')} title={t('naglowek.zapisane_miejsca')} aria-label={t('naglowek.zapisane')}
            className="h-8 inline-flex items-center gap-1.5 rounded-full bg-muted px-3
                       hover:bg-border transition-colors">
            <Heart className="w-4 h-4 text-muted-foreground" />
            <span className="text-[13px] text-muted-foreground hidden sm:inline">{t('naglowek.zapisane')}</span>
          </button>
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
