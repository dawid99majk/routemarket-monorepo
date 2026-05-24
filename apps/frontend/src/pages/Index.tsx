import React, { useState, useMemo } from 'react';
import Footer from '@/components/Footer';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { BalanceWidget } from '@/components/ui/BalanceWidget';
import { useTranslation } from 'react-i18next';
import SEO, { buildOrganizationSchema, buildWebsiteSchema } from '@/components/SEO';
import Logo from '@/components/Logo';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePublishedRoutes, useRouteStats } from '@/hooks/use-routes';
import { useUserFavorites, useFavoritesCount } from '@/hooks/use-favorites';
import { useRoutePdfLanguages } from '@/hooks/use-route-pdfs';
import { getLanguageFlag } from '@/lib/languages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search, User, Plus, ShoppingBag, LayoutDashboard, Heart,
  Map as MapIcon, X, ShieldCheck, LogOut, MessageSquare,
  Sparkles, Compass, ArrowRight, Shield, Activity, CloudRain,
  BookOpen, Star, Award, Zap, ChevronRight, Upload, Bike
} from 'lucide-react';
import RouteCard from '@/components/RouteCard';
import { useCardHighlights } from '@/hooks/use-card-highlights';

export default function Index() {
  const { t } = useTranslation();
  const { user, loading: authLoading, isAdmin, login, logout } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArchetypeFilter, setSelectedArchetypeFilter] = useState<'all' | 'aesthetic' | 'mountain' | 'family'>('all');
  const [selectedSimulatorTab, setSelectedSimulatorTab] = useState<'map' | 'weather' | 'outline'>('map');

  // Fetching essential data for routes and statistics
  const { data: routes = [] } = usePublishedRoutes();
  const routeIds = useMemo(() => routes.map((r) => r.id), [routes]);
  const { data: statsMap = {} } = useRouteStats(routeIds);
  const { data: favoriteIds = [] } = useUserFavorites(user?.id);
  const { data: favCounts = {} } = useFavoritesCount(routeIds);
  const { data: pdfLangsMap = {} } = useRoutePdfLanguages(routeIds);
  const { data: cardHighlights = [] } = useCardHighlights();
  
  const highlightMap = useMemo(() => {
    const m: Record<number, string> = {};
    cardHighlights.forEach(h => { m[h.routeId] = h.campaignId; });
    return m;
  }, [cardHighlights]);

  // Clean, high-performance local search filtering for the Masterpiece Gallery
  const filteredRoutes = useMemo(() => {
    let result = routes.filter(r => !/\b(test|1234)\b/i.test(r.title));
    
    // 1. Keep only our 3 premium disciplines to get rid of legacy categories
    result = result.filter(r => ['Motorcycling', 'Cycling', 'Hiking'].includes(r.category_name));

    // 2. Filter by premium archetype selection
    if (selectedArchetypeFilter !== 'all') {
      const categoryMap: Record<string, string> = {
        aesthetic: 'Motorcycling',
        mountain: 'Hiking',
        family: 'Cycling'
      };
      const targetCategory = categoryMap[selectedArchetypeFilter as keyof typeof categoryMap];
      if (targetCategory) {
        result = result.filter(r => r.category_name === targetCategory);
      }
    }

    // 3. Filter by text search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) =>
        r.title.toLowerCase().includes(q) || 
        r.location_string?.toLowerCase().includes(q) ||
        r.category_name?.toLowerCase().includes(q) || 
        r.creator_name?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [routes, selectedArchetypeFilter, searchQuery]);

  // Handler to configure localstorage and launch Creator Studio with preset archetype
  const handleArchetypeSelect = (archetype: string) => {
    localStorage.setItem('creator_ai_studio_preset_archetype', archetype);
    navigate('/creator-ai-studio');
  };

  return (
    <div className="min-h-screen text-slate-900 flex flex-col selection:bg-primary/10 selection:text-slate-900 font-sans antialiased overflow-x-hidden">
      <SEO
        title="RouteMarket | Magic AI Creator Studio - Zaawansowane Projektowanie Tras"
        description="Twórz trójwymiarowe, ultra-precyzyjne trasy motocyklowe, piesze i rowerowe przy użyciu Magic AI. Pobierz profesjonalne Roadbooki i audyty pogodowe."
        url="/"
        structuredData={[buildOrganizationSchema(), buildWebsiteSchema()]}
      />

      {/* Decorative ambient radial light blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary/[0.04] blur-[140px]" />
        <div className="absolute top-[20%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-accent/[0.03] blur-[150px]" />
        <div className="absolute bottom-[20%] left-[10%] w-[40vw] h-[40vw] rounded-full bg-primary/[0.03] blur-[130px]" />
        <div className="absolute bottom-[-10%] right-[10%] w-[50vw] h-[50vw] rounded-full bg-accent/[0.04] blur-[160px]" />
      </div>

      {/* Futuristic Glass Header */}
      <header className="sticky top-0 z-50 bg-background/70 backdrop-blur-xl border-b border-slate-200/40 shadow-sm transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            <Logo size="xl" />
            
            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <BalanceWidget />
              
              {authLoading ? (
                <div className="w-8 h-8 rounded-full bg-slate-100 animate-pulse border border-slate-200" />
              ) : user ? (
                <>
                  <Button 
                    onClick={() => navigate('/creator-ai-studio')} 
                    className="hidden sm:flex gap-1.5 bg-primary hover:bg-primary/95 text-white font-medium shadow-md border-0 hover-lift"
                  >
                    <Sparkles className="w-4 h-4 animate-pulse" /> Magic Studio
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="min-w-[40px] min-h-[40px] hover:bg-slate-100/50 text-slate-700"
                    onClick={() => navigate('/favorites')} 
                    title={t('nav.favorites')}
                  >
                    <Heart className="w-5 h-5 text-rose-500 fill-rose-500/5" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="min-w-[40px] min-h-[40px] relative hover:bg-slate-100/50 text-slate-700"
                    onClick={() => navigate('/messages')} 
                    title="Wiadomości"
                  >
                    <MessageSquare className="w-5 h-5" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="rounded-full min-w-[40px] min-h-[40px] hover:bg-slate-100/50">
                        <div className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center border border-primary/10">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52 bg-white border border-slate-200/80 shadow-lg text-slate-800">
                      <DropdownMenuItem className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate('/profile')}>
                        <User className="w-4 h-4 mr-2" /> {t('nav.my_profile')}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate('/my-routes')}>
                        <ShoppingBag className="w-4 h-4 mr-2" /> {t('nav.my_purchases')}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate('/creator-dashboard')}>
                        <LayoutDashboard className="w-4 h-4 mr-2" /> {t('nav.creator_dashboard')}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate('/messages')}>
                        <MessageSquare className="w-4 h-4 mr-2" /> Wiadomości
                      </DropdownMenuItem>
                      <DropdownMenuItem className="hover:bg-slate-50 cursor-pointer sm:hidden" onClick={() => navigate('/creator-ai-studio')}>
                        <Sparkles className="w-4 h-4 mr-2" /> Magic Studio
                      </DropdownMenuItem>
                      {isAdmin && (
                        <>
                          <DropdownMenuSeparator className="bg-slate-100" />
                          <DropdownMenuItem className="hover:bg-slate-50 cursor-pointer text-amber-600 focus:text-amber-600" onClick={() => navigate('/admin/dashboard')}>
                            <ShieldCheck className="w-4 h-4 mr-2" /> {t('common.admin')}
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator className="bg-slate-100" />
                      <DropdownMenuItem onClick={logout} className="text-rose-600 focus:text-rose-600 hover:bg-rose-50 cursor-pointer">
                        <LogOut className="w-4 h-4 mr-2" /> {t('common.logout', 'Log out')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={login} className="border-slate-200 text-slate-700 bg-transparent hover:bg-slate-50">
                    {t('common.login')}
                  </Button>
                  <Button size="sm" onClick={() => navigate('/auth?mode=signup')} className="bg-primary text-white hover:bg-primary/90 font-medium">
                    {t('common.signup')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1">
        
        {/* Modern Immersive Hero Section */}
        <section className="relative pt-16 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
          {/* Glowing Top Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/5 border border-primary/20 text-primary text-xs font-semibold mb-6 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
            Rewolucja w Planowaniu Podróży: Kreator Magic AI
          </div>

          {/* Master Heading */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight max-w-4xl leading-tight text-slate-900">
            Projektuj Ultra-Precyzyjne <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-emerald-600 to-accent">
              Trasy Następnej Generacji
            </span>
          </h1>

          <p className="mt-6 text-base sm:text-xl text-slate-600 max-w-3xl leading-relaxed">
            Przestań klikać nudne punkty na płaskiej mapie. Wdróż zaawansowane algorytmy topograficzne, analizator klimatyczny i trójwymiarowe loty dronem, by ułożyć trasę życia przy asyście dedykowanych archetypów sztucznej inteligencji.
          </p>

          {/* Call-to-Action Group */}
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button 
              size="lg" 
              onClick={() => navigate('/creator-ai-studio')}
              className="w-full sm:w-auto h-14 px-8 rounded-xl bg-primary hover:bg-primary/95 text-white font-semibold text-base shadow-[0_4px_20px_rgba(59,102,85,0.25)] hover:shadow-[0_4px_25px_rgba(59,102,85,0.4)] transition-all duration-300 hover:-translate-y-0.5 group border-0"
            >
              Uruchom Kreator Magic AI
              <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
            </Button>
            
            <a href="#showcase" className="w-full sm:w-auto">
              <Button 
                variant="outline" 
                size="lg" 
                className="w-full h-14 px-8 rounded-xl border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-sm text-base font-semibold"
              >
                <Compass className="w-5 h-5 mr-2" /> Odkryj Gotowe Trasy
              </Button>
            </a>
          </div>

          {/* Premium subtle credit note under CTAs */}
          <p className="mt-4 text-xs text-slate-500 font-medium tracking-wide">
            * Otrzymasz <span className="text-accent font-bold">100 darmowych kredytów powitalnych</span> na pierwsze projekty tras.
          </p>
        </section>

        {/* Breathtaking Interactive AI Console Simulator Mockup */}
        <section className="w-full max-w-5xl mx-auto px-4 pb-24 -mt-6">
          <div className="glass-premium border border-slate-200/50 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl relative group">
            {/* Top Bar (Browser style mockup) */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/40 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-400" />
                <span className="w-3 h-3 rounded-full bg-amber-400" />
                <span className="w-3 h-3 rounded-full bg-emerald-400" />
              </div>
              <div className="bg-white border border-slate-200/80 rounded-md px-3 py-0.5 text-[11px] font-mono text-slate-500 w-64 text-center select-none shadow-sm truncate">
                routemarket.io/magic-ai-studio
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 badge-glow-primary animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 font-sans hidden sm:inline-block">
                  Live AI Engine
                </span>
              </div>
            </div>

            {/* Main Interactive Grid */}
            <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] min-h-[440px]">
              
              {/* Sidebar Menu Controls */}
              <div className="border-r border-slate-200/30 p-4 space-y-2 bg-slate-50/20">
                <div className="pb-3 border-b border-slate-200/30">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400 block mb-1">
                    Wizualizacja AI
                  </span>
                  <p className="text-xs font-semibold text-slate-700">Dedykowane Filtry</p>
                </div>
                
                {[
                  { id: 'map', label: '🗺️ Trójwymiarowa Mapa', desc: 'Ślad GPX i zakręty' },
                  { id: 'weather', label: '⛅ Audyt Klimatu & Szosy', desc: 'Nawierzchnia i pogoda' },
                  { id: 'outline', label: '🤖 Zarys Konspektu', desc: 'Roadbook i punkty POI' }
                ].map((tab) => {
                  const isActive = selectedSimulatorTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setSelectedSimulatorTab(tab.id as any)}
                      className={`w-full text-left p-3 rounded-xl border transition-all duration-300 hover-lift ${
                        isActive
                          ? 'bg-primary/5 border-primary/30 text-primary shadow-sm font-semibold'
                          : 'bg-transparent border-transparent text-slate-600 hover:bg-slate-50 hover:border-slate-200'
                      }`}
                    >
                      <div className="text-xs font-bold flex items-center gap-2">
                        <span>{tab.label}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 block mt-0.5 ml-0 leading-normal pl-5 font-medium">
                        {tab.desc}
                      </span>
                    </button>
                  );
                })}

                <div className="pt-8 text-center hidden md:block">
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white/40 backdrop-blur-sm shadow-sm space-y-1">
                    <Award className="w-5 h-5 text-accent mx-auto animate-bounce" />
                    <p className="text-[10px] font-bold text-slate-700">Standard Premium</p>
                    <p className="text-[8px] text-slate-400 leading-normal">
                      Pobierz gotowy plik GPX + profesjonalny przewodnik PDF na telefon.
                    </p>
                  </div>
                </div>
              </div>

              {/* Main Content Viewer Pane */}
              <div className="p-6 sm:p-8 flex flex-col justify-between bg-white/30 relative">
                
                {/* 1. Map & Curviness View */}
                {selectedSimulatorTab === 'map' && (
                  <div className="space-y-6 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary bg-primary/5 px-2 py-0.5 rounded-full border border-primary/20">
                            Telemetry 3D Engine
                          </span>
                          <h4 className="text-lg font-bold text-slate-900 mt-1 text-left">
                            Pętla Gorczańsko-Pienińska (GPX)
                          </h4>
                        </div>
                        <span className="text-xs font-extrabold text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 shadow-sm animate-pulse shrink-0">
                          ASPHALT QUALITY: 96%
                        </span>
                      </div>

                      {/* Mock Route Map Visualizer */}
                      <div className="mt-5 h-44 rounded-xl border border-slate-200 bg-slate-950 relative overflow-hidden shadow-inner flex items-center justify-center">
                        {/* Winding mountain path simulation */}
                        <svg className="absolute inset-0 w-full h-full p-6 text-emerald-500/40" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <path
                            d="M 10 80 Q 25 10, 45 55 T 80 20 T 95 60"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            className="stroke-emerald-500/30"
                          />
                          <path
                            d="M 10 80 Q 25 10, 45 55 T 80 20 T 95 60"
                            fill="none"
                            stroke="url(#grad)"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            strokeDasharray="400"
                            strokeDashoffset="0"
                            className="animate-pulse stroke-emerald-500"
                          />
                          <defs>
                            <linearGradient id="grad" x1="0%" y1="100%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#10b981" />
                              <stop offset="50%" stopColor="#34d399" />
                              <stop offset="100%" stopColor="#059669" />
                            </linearGradient>
                          </defs>
                        </svg>

                        {/* Pulsing pins on map path */}
                        <div className="absolute top-[50%] left-[28%] w-3 h-3 bg-rose-500 rounded-full border-2 border-white shadow-md cursor-pointer animate-ping" />
                        <div className="absolute top-[50%] left-[28%] w-3 h-3 bg-rose-500 rounded-full border-2 border-white shadow-md cursor-pointer" title="Przełęcz Knurowska" />
                        <div className="absolute top-[28%] left-[45%] w-3 h-3 bg-amber-500 rounded-full border-2 border-white shadow-md cursor-pointer" title="Schronisko PTTK" />
                        <div className="absolute top-[23%] left-[78%] w-3 h-3 bg-emerald-500 rounded-full border-2 border-white shadow-md cursor-pointer" title="Punkt widokowy Ochotnica" />

                        {/* Floating live AI logger */}
                        <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded px-2.5 py-1 text-[8px] sm:text-[10px] font-mono text-emerald-400 space-y-0.5 shadow-md text-left">
                          <p>&gt; Scanning coordinates: [49.524, 20.124]</p>
                          <p>&gt; Curves quality ratio: 9.4/10 (Extreme Curves)</p>
                        </div>
                      </div>
                    </div>

                    {/* Stats telemetry panel */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-200/50">
                      {[
                        { label: 'Dystans całkowity', val: '72.4 km', desc: 'Precyzyjny ślad GPX' },
                        { label: 'Wznios pionowy', val: '+1,240 m', desc: 'Analiza wysokościowa' },
                        { label: 'Wsp. Zakrętów', val: '9.4 / 10', desc: 'Ekstremalna krętość' },
                        { label: 'Audyt bezpieczeństwa', val: '100% Zgodny', desc: 'Brak niebezpieczeństw' }
                      ].map((stat, i) => (
                        <div key={i} className="p-3 rounded-xl border border-slate-200 bg-white/60 shadow-sm hover:scale-[1.02] transition-transform duration-300 text-left">
                          <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-semibold leading-none">{stat.label}</span>
                          <span className="text-sm font-extrabold text-slate-800 block mt-1">{stat.val}</span>
                          <span className="text-[8px] text-slate-400 block mt-0.5">{stat.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Weather & Asphalt Audit View */}
                {selectedSimulatorTab === 'weather' && (
                  <div className="space-y-6 flex-1 flex flex-col justify-between text-left">
                    <div>
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary bg-primary/5 px-2 py-0.5 rounded-full border border-primary/20">
                            Asphalt & Climate Audit
                          </span>
                          <h4 className="text-lg font-bold text-slate-900 mt-1">
                            Audyt Jakości Nawierzchni & Profil Klimatyczny
                          </h4>
                        </div>
                      </div>

                      {/* Asphalt quality chart mockup */}
                      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="p-4 rounded-xl border border-slate-200 bg-white/60 shadow-sm space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Gładkość Szosy</span>
                            <Zap className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                          </div>
                          <p className="text-2xl font-extrabold text-slate-800">96 / 100</p>
                          <p className="text-[9px] text-emerald-600 font-semibold">SMA Premium Asphalt</p>
                          <p className="text-[8px] text-slate-400 leading-normal pt-1">
                            Całkowity brak pęknięć, żwiru i ubytków. Idealnie wyprofilowane zakręty o wysokiej przyczepności.
                          </p>
                        </div>

                        <div className="p-4 rounded-xl border border-slate-200 bg-white/60 shadow-sm space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Najlepsze Miesiące</span>
                            <Activity className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <p className="text-2xl font-extrabold text-slate-800">Maj - Paźdz.</p>
                          <p className="text-[9px] text-primary font-semibold">Zalecana Pora Sezonu</p>
                          <p className="text-[8px] text-slate-400 leading-normal pt-1">
                            Optymalne warunki temperaturowe, stabilna wilgotność oraz niski współczynnik bocznych podmuchów wiatru.
                          </p>
                        </div>

                        <div className="p-4 rounded-xl border border-slate-200 bg-white/60 shadow-sm space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Bezpieczeństwo</span>
                            <Shield className="w-3.5 h-3.5 text-accent animate-pulse" />
                          </div>
                          <p className="text-2xl font-extrabold text-slate-800">92%</p>
                          <p className="text-[9px] text-accent font-semibold">Wiatr & Wilgotność OK</p>
                          <p className="text-[8px] text-slate-400 leading-normal pt-1">
                            Niewielkie ryzyko nagłego załamania aury. Przełęcze górskie mogą mieć obniżoną temperaturę o ok. 4°C wczesnym rankiem.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Meteorological Micro-advice Banner */}
                    <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/[0.03] flex items-start gap-3 shadow-inner">
                      <CloudRain className="w-5 h-5 text-primary shrink-0 mt-0.5 animate-bounce" />
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-slate-800">Rada Klimatyczna Asystenta AI:</p>
                        <p className="text-[10px] text-slate-500 leading-relaxed">
                          "Brak poważniejszych zagrożeń na trasie. Wąwozy wzdłuż Dunajca mogą utrzymywać wilgoć w zalesionych odcinkach do godz. 10:00. Zalecamy opony o podwyższonej przyczepności na mokro i wczesny start dla uniknięcia popołudniowych burz."
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. AI Generated Outline View */}
                {selectedSimulatorTab === 'outline' && (
                  <div className="space-y-6 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1 text-left">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary bg-primary/5 px-2 py-0.5 rounded-full border border-primary/20">
                            AI Route Book
                          </span>
                          <h4 className="text-lg font-bold text-slate-900 mt-1">
                            Książka Drogowa & Punkty POI (Outline)
                          </h4>
                        </div>
                      </div>

                      {/* Mock generated roadbook steps */}
                      <div className="mt-5 space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                        {[
                          { km: 'Km 0.0', title: 'Ochotnica Dolna (Parking startowy P1)', type: 'parking', desc: 'Dogodny punkt startu, bezpieczny parking na 30 aut, bezpłatny.' },
                          { km: 'Km 12.4', title: 'Przełęcz Knurowska (Górski punkt widokowy)', type: 'viewpoint', desc: 'Zatoczka postojowa, spektakularna panorama Tatr Bielskich i Wysokich.' },
                          { km: 'Km 24.8', title: 'Schronisko Gorczańskie (Baza logistyczna)', type: 'hotel', desc: 'Zalecany odpoczynek, ciepłe posiłki, punkt czerpania wody pitnej.' },
                          { km: 'Km 38.2', title: 'Dynamiczne serpentyny (Nachylenie 8%)', type: 'danger', desc: 'Wymagające zakręty o dużym pochyleniu poprzecznym. Zachować ostrożność.' },
                          { km: 'Km 72.4', title: 'Meta: Przełęcz Knurowska (Zakończenie wyprawy)', type: 'finish', desc: 'Powrót do bazy startowej przez urokliwą pętlę Dunajca.' }
                        ].map((step, idx) => (
                          <div key={idx} className="p-3 rounded-xl border border-slate-200 bg-white/60 hover:bg-slate-50 transition-colors shadow-sm flex items-center justify-between gap-4 group">
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded shrink-0">
                                {step.km}
                              </span>
                              <div className="space-y-0.5 text-left">
                                <p className="text-xs font-bold text-slate-800 group-hover:text-primary transition-colors">{step.title}</p>
                                <p className="text-[9px] text-slate-400 leading-normal">{step.desc}</p>
                              </div>
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 shrink-0 hidden sm:inline-block">
                              {step.type}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* POI summary bar */}
                    <div className="pt-4 border-t border-slate-200/50 flex items-center justify-between text-xs text-slate-500">
                      <p>Wygenerowano w asyście **Gemini Pro 1.5**</p>
                      <p className="font-semibold text-primary">5 punktów POI naniesionych na mapę</p>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        </section>

        {/* 4 Flagship AI Archetypes Grid */}
        <section className="py-20 bg-slate-100/[0.08] backdrop-blur-md border-y border-slate-200/40 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 font-display">
                Wybierz Dedykowany Archetyp AI
              </h2>
              <p className="mt-4 text-base sm:text-lg text-slate-600">
                Nasze sztuczne inteligencje zostały wyszkolone pod kątem różnych stylów podróżowania. Każdy archetyp to zoptymalizowany zestaw filtrów nawierzchni, punktów POI i analiz bezpieczeństwa.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              
              {/* Archetype 1: Szosowy Esteta */}
              <div 
                onClick={() => handleArchetypeSelect('aesthetic')}
                className="group cursor-pointer rounded-2xl border border-primary/20 glass-premium hover:bg-primary/[0.02] p-6 shadow-token-sm hover:shadow-token-md hover:border-primary/50 transition-all duration-300 relative overflow-hidden flex flex-col justify-between min-h-[360px] hover-lift"
              >
                <div className="absolute top-0 right-0 w-20 h-20 bg-primary/[0.02] rounded-full blur-2xl group-hover:bg-primary/[0.05] transition-colors" />
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 group-hover:scale-110 transition-transform duration-300">
                    <Zap className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/5 border border-primary/20 px-2 py-0.5 rounded-full">
                      Szosowy Esteta
                    </span>
                    <h3 className="text-lg font-bold mt-2.5 text-slate-800 group-hover:text-primary transition-colors">
                      Motocykl Szosowy
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Priorytet dla idealnej nawierzchni bitumicznej, sekwencji ciasnych zakrętów, malowniczych panoram oraz nastrojowych kawiarni i parkingów.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-200/60 space-y-3">
                  <ul className="space-y-1.5 text-[11px] text-slate-500">
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-primary" />
                      Audyt gładkości asfaltu
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-primary" />
                      Filtrowanie dróg gruntowych
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-primary" />
                      Kamera 3D i krętość
                    </li>
                  </ul>
                  <div className="text-[11px] font-semibold text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Twórz trasę moto <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

              {/* Archetype 2: Rowerzysta */}
              <div 
                onClick={() => handleArchetypeSelect('family')}
                className="group cursor-pointer rounded-2xl border border-primary/20 glass-premium hover:bg-primary/[0.02] p-6 shadow-token-sm hover:shadow-token-md hover:border-primary/50 transition-all duration-300 relative overflow-hidden flex flex-col justify-between min-h-[360px] hover-lift"
              >
                <div className="absolute top-0 right-0 w-20 h-20 bg-primary/[0.02] rounded-full blur-2xl group-hover:bg-primary/[0.05] transition-colors" />
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 group-hover:scale-110 transition-transform duration-300">
                    <Bike className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/5 border border-primary/20 px-2 py-0.5 rounded-full">
                      Dwa Oblicza
                    </span>
                    <h3 className="text-lg font-bold mt-2.5 text-slate-800 group-hover:text-primary transition-colors">
                      Rower (Szosa vs Gravel/MTB)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Stworzone dla kolarzy szosowych szukających doskonałego asfaltu lub pasjonatów gravela/MTB pragnących leśnych duktów i bezdroży.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-200/60 space-y-3">
                  <ul className="space-y-1.5 text-[11px] text-slate-500">
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-primary" />
                      Wybór nawierzchni (Asfalt vs Szuter)
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-primary" />
                      Audyt punktów serwisowych i wiat
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-primary" />
                      Dopasowanie do e-bike i sakw
                    </li>
                  </ul>
                  <div className="text-[11px] font-semibold text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Twórz trasę rowerową <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

              {/* Archetype 3: Górski Wyjadacz */}
              <div 
                onClick={() => handleArchetypeSelect('mountain')}
                className="group cursor-pointer rounded-2xl border border-accent/20 glass-premium hover:bg-accent/[0.01] p-6 shadow-token-sm hover:shadow-token-md hover:border-accent/50 transition-all duration-300 relative overflow-hidden flex flex-col justify-between min-h-[360px] hover-lift"
              >
                <div className="absolute top-0 right-0 w-20 h-20 bg-accent/[0.01] rounded-full blur-2xl group-hover:bg-accent/[0.03] transition-colors" />
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent border border-accent/20 group-hover:scale-110 transition-transform duration-300">
                    <Compass className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-accent bg-accent/5 border border-accent/20 px-2 py-0.5 rounded-full">
                      Górski Wyjadacz
                    </span>
                    <h3 className="text-lg font-bold mt-2.5 text-slate-800 group-hover:text-accent transition-colors">
                      Trekking (1 do 14 dni)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Od krótkich jednodniowych wycieczek po wymagające 14-dniowe trekkingi górskie. Pełny audyt bezpieczeństwa, noclegów i zasobów wody.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-200/60 space-y-3">
                  <ul className="space-y-1.5 text-[11px] text-slate-500">
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-accent" />
                      Schroniska, źródła wody i wiaty
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-accent" />
                      Interaktywne profile wysokości szlaku
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-accent" />
                      Ostrzeżenia o nachyleniu i GSM
                    </li>
                  </ul>
                  <div className="text-[11px] font-semibold text-accent flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Twórz wyprawę górską <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Curated Masterpiece Route Gallery */}
        <section id="showcase" className="py-24 bg-slate-50/50 border-t border-slate-200/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            {/* Section Header */}
            <div className="flex flex-col gap-8 mb-12">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                  <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight flex items-center gap-2 text-slate-900">
                    <Compass className="w-7 h-7 text-purple-600 animate-spin-slow animate-pulse" />
                    Galeria Arcydzieł Społeczności
                  </h2>
                  <p className="text-slate-600 text-sm sm:text-base max-w-2xl">
                    Przeglądaj zweryfikowane, wysokiej jakości trasy wygenerowane przez naszych twórców w asyście Magic AI. Wybierz gotową ścieżkę lub stwórz własną wersję.
                  </p>
                </div>
                
                {/* Premium Slim Region Search */}
                <div className="relative w-full md:w-80 shrink-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    placeholder="Wyszukaj według regionu / nazwy..." 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)} 
                    className="pl-10 h-11 bg-white border border-slate-200/80 text-slate-800 placeholder-slate-400 focus:border-primary/50 focus:ring-primary/20 rounded-xl shadow-sm"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')} 
                      className="absolute right-3 top-1/2 -translate-y-1/2 min-w-[32px] min-h-[32px] flex items-center justify-center hover:text-slate-700"
                    >
                      <X className="w-4 h-4 text-slate-400" />
                    </button>
                  )}
                </div>
              </div>

              {/* Glowing Dark-Glassmorphic Archetype Filter Bar */}
              <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-hide border-b border-slate-200/60 scroll-smooth">
                {[
                  { id: 'all', label: 'Wszystkie trasy', color: 'hover:border-purple-300 active:bg-purple-50 active:border-purple-500', activeStyle: 'bg-purple-50 border-purple-500 text-purple-700 shadow-sm' },
                  { id: 'aesthetic', label: 'Motocykl Szosowy (Scenic)', color: 'hover:border-rose-300 active:bg-rose-50 active:border-rose-500', activeStyle: 'bg-rose-50 border-rose-500 text-rose-700 shadow-sm' },
                  { id: 'mountain', label: 'Trekking (1-14 dni)', color: 'hover:border-amber-300 active:bg-amber-50 active:border-amber-500', activeStyle: 'bg-amber-50 border-amber-500 text-amber-850 shadow-sm' },
                  { id: 'family', label: 'Rower (Szosa/Gravel/MTB)', color: 'hover:border-emerald-300 active:bg-emerald-50 active:border-emerald-500', activeStyle: 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm' },
                ].map((item) => {
                  const isActive = selectedArchetypeFilter === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedArchetypeFilter(item.id as any)}
                      className={`shrink-0 px-4 py-2 rounded-full border text-xs font-semibold backdrop-blur-md transition-all duration-300 ${
                        isActive 
                          ? item.activeStyle 
                          : `bg-white border-slate-200/80 text-slate-600 ${item.color}`
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Showcase Grid */}
            {filteredRoutes.length === 0 ? (
              <div className="text-center py-20 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                <MapIcon className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-600">Brak tras w wybranej lokalizacji</h3>
                <p className="text-xs text-slate-500 mt-1">Bądź pierwszym, który stworzy trasę w tym regionie przy pomocy AI!</p>
                <Button 
                  onClick={() => navigate('/creator-ai-studio')} 
                  variant="outline" 
                  size="sm" 
                  className="mt-4 border-slate-200 hover:bg-slate-50 text-slate-700"
                >
                  Uruchom Kreator AI
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-fr">
                {filteredRoutes.map((route, idx) => (
                  <div key={route.id} className="hover:-translate-y-1 transition-transform duration-300">
                    <RouteCard
                      route={route}
                      stats={statsMap[route.id]}
                      isFavorited={favoriteIds.includes(route.id)}
                      favCount={favCounts[route.id] ?? 0}
                      pdfLangs={pdfLangsMap[route.id]}
                      getLangFlag={getLanguageFlag}
                      promotedCampaignId={highlightMap[route.id]}
                      priority={idx < 4}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}
