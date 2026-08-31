import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import Logo from '@/components/Logo';

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

/**
 * Zakładki zależą od tego, czy jest wybrany wyjazd (punkt 20 audytu). Bez tego
 * "Tablica" i "Plan dni" prowadziłyby donikąd -- obie spadały na `/plany`
 * i dawały identyczny, mylący wynik. Rozwiązanie: nie pokazują się w ogóle,
 * dopóki nie ma czego pokazać, a ich miejsce zajmują "Twoje wyjazdy".
 */
function zakladki(tripId: string | null) {
  if (!tripId) {
    return [
      { klucz: 'naglowek.odkrywaj', path: '/odkrywaj' },
      { klucz: 'naglowek.wyjazdy', path: '/plany' },
      { klucz: 'naglowek.inspiracje', path: '/tablice' },
    ];
  }
  return [
    { klucz: 'naglowek.odkrywaj', path: '/odkrywaj' },
    { klucz: 'naglowek.tablica', path: '/plany' },
    { klucz: 'naglowek.plan_dni', path: `/plany/${tripId}?widok=plan` },
    { klucz: 'naglowek.inspiracje', path: '/tablice' },
  ];
}

/**
 * Wspólny pasek planera. Wcześniej każdy ekran miał własny nagłówek z przyciskiem
 * "wstecz", przez co przejście między odkrywaniem, tablicą a planem wyglądało jak
 * skok do innej aplikacji. Projekt zakłada jeden pasek i zakładki zależne od
 * kontekstu (kierunek „Wyprawa", zadanie Z2).
 */
export default function PlannerHeader({ context, initials }: PlannerHeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { pathname, search } = useLocation();
  const tripId = ostatniaTablica();
  const [tripName, setTripName] = useState<string | null>(null);

  useEffect(() => {
    let aktualne = true;
    if (!tripId) { setTripName(null); return; }
    (supabase as any).from('trip_projects').select('name').eq('id', tripId).maybeSingle()
      .then(({ data }: any) => { if (aktualne) setTripName(data?.name ?? null); });
    return () => { aktualne = false; };
  }, [tripId]);

  /**
   * Zakładka świeci się także na ekranach, które do niej należą, choć mają własny
   * adres: karta miejsca i ulubione to nadal odkrywanie, moje trasy wychodzą
   * z planu. Bez tego wchodząc w szczegóły miejsca użytkownik traci informację,
   * w której części aplikacji się znajduje.
   */
  const isActive = (path: string) => {
    if (path.includes('?')) return pathname.startsWith('/plany') && search.includes('widok=plan');
    // „Tablica" obejmuje i listę, i otwartą tablicę — to jedna część aplikacji,
    // a nie dwa miejsca, między którymi trzeba się domyślać, gdzie się jest.
    if (path === '/plany') return pathname.startsWith('/plany') && !search.includes('widok=plan');
    if (path === '/odkrywaj') {
      return pathname === '/odkrywaj' || pathname.startsWith('/miejsce/') || pathname === '/ulubione';
    }
    return pathname === path;
  };

  return (
    <header className="sticky top-0 z-20 h-[66px] border-b border-border bg-background/85 backdrop-blur-[8px]">
      <div className="max-w-[1400px] mx-auto h-full px-4 sm:px-6 flex items-center gap-3 sm:gap-5">
        {/* Logotyp prowadzi na stronę główną — tak działa wszędzie i tego się po nim
            spodziewamy. Bez sygnatury: w aplikacji miejsce obok zajmuje przełącznik
            wyjazdu i zakładki produktu, nie hasło marketingowe. */}
        <Logo showName signature={false} size="sm" />

        {tripId && (
          <button onClick={() => navigate('/plany')}
            className="hidden md:inline-flex items-center gap-1.5 h-8 rounded-full bg-muted px-3.5
                       text-[13px] font-medium max-w-[220px] hover:bg-tan/25 transition-colors">
            <span className="truncate">{tripName || '…'}</span>
            <span className="text-muted-foreground">▾</span>
          </button>
        )}

        <nav className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* Zmienna nazywa się `zakladka`, nie `t` — inaczej przesłoniłaby funkcję
              tłumaczenia i wewnątrz mapy nie dałoby się wywołać t(). */}
          {zakladki(tripId).map((zakladka) => (
            <button key={zakladka.klucz} onClick={() => navigate(zakladka.path)}
              className={`px-3.5 py-1.5 text-sm rounded-full transition-colors ${
                isActive(zakladka.path)
                  ? 'bg-foreground text-background font-medium'
                  : 'text-foreground/70 hover:bg-muted/60'
              }`}>
              {t(zakladka.klucz)}
            </button>
          ))}
          {/* Warsztat to narzędzie właściciela, nie funkcja serwisu — stąd osobny
              warunek zamiast stałej pozycji dla wszystkich. */}
          {isAdmin && (
            <button onClick={() => navigate('/marketing')}
              className={`px-3.5 py-1.5 text-sm rounded-full transition-colors ${
                pathname === '/marketing'
                  ? 'bg-foreground text-background font-medium'
                  : 'text-foreground/70 hover:bg-muted/60'
              }`}>
              {t('naglowek.warsztat')}
            </button>
          )}
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
                       hover:bg-tan/25 transition-colors">
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
