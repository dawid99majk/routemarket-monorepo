import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { BookOpen, CalendarDays, Compass, Heart, HelpCircle, LayoutGrid } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import Logo from '@/components/Logo';

interface PlannerHeaderProps {
  /** Kontekst aktywnego wyjazdu po prawej, np. "Durrës · 3 dni · z dziećmi". */
  context?: string | null;
  /** Inicjały do awatara. Bez nich kółko się nie pokazuje. */
  initials?: string | null;
  /** Odkrywaj ma własny, większy przełącznik -- pigułka obok logo dublowałaby go. */
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
  /* Ostatnia tablica decyduje już tylko o tym, czy pokazać zakładkę „Plan dni" —
     pigułka z jej nazwą zniknęła, bo ten sam wybór robi teraz pasek kart. */
  const tripId = ostatniaTablica();
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
    <>
    <header className="sticky top-0 z-20 h-[64px] md:h-[72px] bg-background/90 backdrop-blur-[8px]">
      <div className="max-w-[1400px] mx-auto h-full px-4 sm:px-6 flex items-center gap-3 sm:gap-5">
        {/* Logotyp prowadzi na stronę główną — tak działa wszędzie i tego się po nim
            spodziewamy. Bez sygnatury: w aplikacji miejsce obok zajmuje przełącznik
            wyjazdu i zakładki produktu, nie hasło marketingowe. */}
        {/* Na mobile zostaje sam znak: nazwa zajmowala 137 z 375 px i nawigacji
            zostawalo 58 px widocznej szerokosci — mniej niz jedna zakladka. */}
        <Logo showName signature={false} size="sm" className="shrink-0" />

        {/* min-w-0 jest tu warunkiem dzialania overflow-x-auto: bez niego element
            flex nie kurczy sie ponizej szerokosci tresci, wiec zakladki nie
            przewijaly sie, tylko wychodzily poza ekran (przy 375 px siegaly
            x=558), a ikony po prawej rysowaly sie na nich. */}
        <nav className="hidden md:flex items-center gap-1 min-w-0 overflow-x-auto rounded-full bg-card p-1 shadow-token-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* Zmienna nazywa się `zakladka`, nie `t` — inaczej przesłoniłaby funkcję
              tłumaczenia i wewnątrz mapy nie dałoby się wywołać t(). */}
          {zakladki(tripId).map((zakladka) => (
            <button key={zakladka.klucz} onClick={() => navigate(zakladka.path)}
              className={`px-4 py-2 text-sm font-semibold rounded-full whitespace-nowrap transition-colors ${
                isActive(zakladka.path)
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}>
              {t(zakladka.klucz)}
            </button>
          ))}
          {/* Warsztat to narzędzie właściciela, nie funkcja serwisu — stąd osobny
              warunek zamiast stałej pozycji dla wszystkich. */}
          {isAdmin && (
            <button onClick={() => navigate('/marketing')}
              className={`px-4 py-2 text-sm font-semibold rounded-full whitespace-nowrap transition-colors ${
                pathname === '/marketing'
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}>
              {t('naglowek.warsztat')}
            </button>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {context && (
            <span className="text-[13px] font-semibold text-muted-foreground hidden md:block">
              {context}
            </span>
          )}
          {/* Jedno wejście: kolekcje są podzbiorami zapisanych, a nie osobnym
              zbiorem, więc dwa przyciski obok siebie pytały użytkownika o różnicę,
              której nie ma. */}
          <button onClick={() => navigate('/zapisane')} title={t('naglowek.zapisane_miejsca')} aria-label={t('naglowek.zapisane')}
            className="h-9 hidden md:inline-flex items-center gap-1.5 rounded-full px-3
                       hover:bg-card transition-colors">
            <Heart className="w-4 h-4 text-muted-foreground" />
            <span className="text-[14px] font-semibold text-muted-foreground hidden sm:inline">{t('naglowek.zapisane')}</span>
          </button>
          <button onClick={() => window.dispatchEvent(new Event('rm:pomoc'))}
            aria-label={t('naglowek.pomoc', 'Jak to działa')} title={t('naglowek.pomoc', 'Jak to działa')}
            className="md:hidden w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-card">
            <HelpCircle className="w-5 h-5" />
          </button>
          {initials && (
            <button onClick={() => navigate('/profile')}
              className="w-9 h-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center
                         text-[13px] font-bold hover:bg-accent-strong transition-colors">
              {initials}
            </button>
          )}
        </div>
      </div>
    </header>

    {/* Telefon: zakładki na dole, w zasięgu kciuka. U góry mieściły się trzy
        z pięciu, a „Inspiracje” i „Warsztat” trzeba było odkrywać przewijaniem. */}
    <nav aria-label={t('naglowek.nawigacja', 'Nawigacja')}
      className="rm-dolny-pasek md:hidden fixed bottom-0 inset-x-0 z-[1250] bg-card/95 backdrop-blur-[8px]
                 shadow-[0_-4px_20px_rgba(37,36,58,0.08)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch justify-around h-16 px-1">
        {[
          ...zakladki(tripId).map((z) => ({ ...z, ikona: z.path === '/odkrywaj' ? Compass
            : z.path === '/tablice' ? BookOpen : z.path.includes('widok=plan') ? CalendarDays : LayoutGrid })),
          { klucz: 'naglowek.zapisane', path: '/zapisane', ikona: Heart },
        ].map(({ klucz, path, ikona: Ikona }) => {
          const aktywna = path === '/zapisane' ? pathname === '/zapisane' : isActive(path);
          return (
            <button key={klucz} onClick={() => navigate(path)} aria-current={aktywna ? 'page' : undefined}
              className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1">
              <span className={`h-8 w-14 rounded-full flex items-center justify-center transition-colors ${
                aktywna ? 'bg-foreground text-background' : 'text-muted-foreground'}`}>
                <Ikona className="w-[18px] h-[18px]" />
              </span>
              <span className={`text-[11px] leading-none truncate max-w-full ${
                aktywna ? 'font-bold text-foreground' : 'font-semibold text-muted-foreground'}`}>
                {t(klucz)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
    </>
  );
}
