import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sparkles, Bike, Compass, Mountain, Landmark, ChevronRight } from 'lucide-react';

export default function HeroSection() {
  const navigate = useNavigate();

  const domains = [
    {
      icon: Compass,
      label: 'Motocykl',
      desc: 'Tylko drogi asfaltowe, szybkie trasy, precyzyjne mapowanie Google Maps.',
      color: 'from-orange-500/20 to-red-500/20 text-orange-400 border-orange-500/30'
    },
    {
      icon: Mountain,
      label: 'Turystyka Piesza',
      desc: 'Szlaki górskie, parkingi, schroniska turystyczne, integracja OpenStreetMap.',
      color: 'from-emerald-500/20 to-teal-500/20 text-emerald-400 border-emerald-500/30'
    },
    {
      icon: Landmark,
      label: 'Zwiedzanie Miast',
      desc: 'Deptaki, kawiarnie, ciekawe zabytki, trasy spacerowe na OpenStreetMap.',
      color: 'from-blue-500/20 to-indigo-500/20 text-blue-400 border-blue-500/30'
    },
    {
      icon: Bike,
      label: 'Turystyka Rowerowa',
      desc: 'Wybór: Szosa (Google Maps) lub Teren/Gravel (OpenStreetMap).',
      color: 'from-yellow-500/20 to-amber-500/20 text-yellow-400 border-yellow-500/30'
    }
  ];

  return (
    <div className="dark col-span-2 row-span-2 h-full rounded-2xl border border-primary/20 bg-card p-6 sm:p-8 flex flex-col justify-between bg-gradient-premium bg-contour-soft overflow-hidden shadow-token-lg hover:shadow-token-xl transition-all duration-[450ms] ease-out glow-border group">
      <div>
        {/* Eyebrow badge with glowing Sparkles */}
        <div className="flex items-center justify-between gap-2.5 mb-5 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/20 text-primary border border-primary/30 badge-glow-primary">
              <Sparkles className="w-4 h-4 animate-pulse" />
            </span>
            <span className="font-narrow text-xs uppercase tracking-[0.25em] text-primary font-bold">
              MAGIC AI CREATOR
            </span>
          </div>
          
          {/* Credit balance visual price tag */}
          <div className="flex gap-2">
            <span className="text-[10px] sm:text-xs font-mono font-medium px-2.5 py-1 rounded-full bg-secondary border border-border flex items-center gap-1.5 shadow-sm text-foreground/80">
              <span className="w-1.5 h-1.5 rounded-full bg-primary badge-glow-primary" />
              Standard: 25 cr
            </span>
            <span className="text-[10px] sm:text-xs font-mono font-medium px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 flex items-center gap-1.5 shadow-sm text-primary">
              <span className="w-1.5 h-1.5 rounded-full bg-accent badge-glow-accent animate-ping" />
              Deep Research: 50 cr
            </span>
          </div>
        </div>

        {/* Headline */}
        <h2 className="font-display text-2xl sm:text-3xl text-foreground font-normal tracking-tight leading-tight">
          Twórz <em className="font-display-italic text-primary">super zaawansowane</em> trasy z asystentem AI.
        </h2>
        
        <p className="mt-3 text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-[50ch]">
          Nasz generator prowadzi Cię za rękę. Podaj notatki, wklej link z YouTube, dodaj pliki, a Gemini w trybie deep research zaplanuje parkingi, noclegi i wyeksportuje plik GPX.
        </p>

        {/* Interactive 4 domain showcase grid */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {domains.map((dom) => (
            <div 
              key={dom.label} 
              className={`p-3 rounded-xl border bg-gradient-to-br ${dom.color} hover:scale-[1.02] transition-transform duration-200 flex gap-2.5 items-start`}
            >
              <dom.icon className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">{dom.label}</h4>
                <p className="text-[10px] text-muted-foreground leading-normal mt-0.5">{dom.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action CTA and small info */}
      <div className="mt-6 pt-4 border-t border-border/30 flex items-center justify-between gap-4 flex-wrap">
        <div className="text-[10px] sm:text-xs text-muted-foreground/80 max-w-[28ch]">
          Każdy nowy użytkownik otrzymuje <strong className="text-foreground">100 kredytów za darmo</strong> (3-4 trasy).
        </div>
        <Button 
          onClick={() => navigate('/creator-ai-studio')} 
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 hover-lift shadow-md font-medium text-sm group/btn px-5 h-11"
        >
          Uruchom Kreator Magic AI
          <ChevronRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
        </Button>
      </div>
    </div>
  );
}
