import React, { useEffect, useState } from 'react';
import { Palette, Check, Sparkles } from 'lucide-react';

export type ThemeId = 'riwiera' | 'nordic' | 'coral' | 'linear';

interface ThemeOption {
  id: ThemeId;
  name: string;
  subtitle: string;
  dotColor: string;
  badge: string;
}

const THEMES: ThemeOption[] = [
  {
    id: 'nordic',
    name: 'Nordic Horizon',
    subtitle: 'Szmaragd, świeża biel, spokój',
    dotColor: '#0F766E',
    badge: 'Wybrany',
  },
  {
    id: 'coral',
    name: 'Sunset Coral',
    subtitle: 'Styl Airbnb, ciepły koral, energia',
    dotColor: '#FF385C',
    badge: 'Airbnb vibes',
  },
  {
    id: 'linear',
    name: 'Monocle & Linear',
    subtitle: 'Minimalistyczny kobalt, modern tech',
    dotColor: '#6366F1',
    badge: 'Minimalizm',
  },
];

export const ThemeSelector: React.FC = () => {
  const [currentTheme, setCurrentTheme] = useState<ThemeId>('nordic');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let saved = (localStorage.getItem('rm_theme_variant') as ThemeId) || 'nordic';
    if (saved === 'riwiera' || !['nordic', 'coral', 'linear'].includes(saved)) {
      saved = 'nordic';
      localStorage.setItem('rm_theme_variant', 'nordic');
    }
    applyTheme(saved);
  }, []);

  const applyTheme = (themeId: ThemeId) => {
    setCurrentTheme(themeId);
    localStorage.setItem('rm_theme_variant', themeId);
    const root = document.documentElement;
    root.classList.remove('theme-riwiera', 'theme-nordic', 'theme-coral', 'theme-linear');
    root.classList.add(`theme-${themeId}`);
  };

  const activeThemeObj = THEMES.find((t) => t.id === currentTheme) || THEMES[0];

  // Niżej niż baner zgody (z-[1200]). Przy z-[9999] pigułka lądowała dokładnie
  // na przycisku „Tylko to, co niezbędne" i jedyną klikalną opcją zostawała
  // zgoda na statystyki.
  return (
    <div className="fixed bottom-5 left-5 z-[1100] font-sans">
      {/* Okno wyboru motywów po kliknięciu */}
      {isOpen && (
        <div className="mb-2 w-72 rounded-2xl bg-white/95 p-3 shadow-2xl backdrop-blur-xl border border-slate-200/80 transition-all duration-200 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Wybierz styl i paletę</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-[11px] font-medium text-slate-400 hover:text-slate-600 px-1"
            >
              Zamknij
            </button>
          </div>

          <div className="space-y-1.5">
            {THEMES.map((theme) => {
              const isActive = currentTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => {
                    applyTheme(theme.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between ${
                    isActive
                      ? 'bg-slate-100/90 shadow-xs ring-1 ring-slate-900/10'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-4 h-4 rounded-full flex-shrink-0 shadow-xs border border-white"
                      style={{ backgroundColor: theme.dotColor }}
                    />
                    <div>
                      <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                        {theme.name}
                        {theme.id === 'nordic' && (
                          <span className="text-[9px] bg-primary/10 text-primary font-medium px-1.5 py-0.5 rounded-full">
                            Polecany
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 leading-tight">
                        {theme.subtitle}
                      </div>
                    </div>
                  </div>
                  {isActive && <Check className="w-4 h-4 text-slate-900 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pływający trigger przycisk */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Zmień paletę barw i styl"
        className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/90 shadow-lg hover:shadow-xl backdrop-blur-md border border-slate-200/80 hover:border-slate-300 transition-all text-xs font-semibold text-slate-800 group"
      >
        <span
          className="w-3 h-3 rounded-full shadow-xs transition-transform group-hover:scale-110"
          style={{ backgroundColor: activeThemeObj.dotColor }}
        />
        {/* Sama nazwa palety zajmuje ok. 190 px — na waskim ekranie pigulka
            kladla sie na tresci strony (naglowek sekcji, opis kartki). Ikona
            zostaje, nazwa wraca od sm w gore. */}
        <span className="hidden sm:inline">Styl: <span className="font-bold">{activeThemeObj.name}</span></span>
        <Palette className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-colors ml-0.5" />
      </button>
    </div>
  );
};
