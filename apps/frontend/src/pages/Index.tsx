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
    <div className="min-h-screen bg-white text-slate-900 flex flex-col selection:bg-primary/10 selection:text-slate-900 font-sans antialiased overflow-x-hidden">
      <SEO
        title="RouteMarket | Magic AI Creator Studio - Zaawansowane Projektowanie Tras"
        description="Twórz trójwymiarowe, ultra-precyzyjne trasy motocyklowe, piesze i rowerowe przy użyciu Magic AI. Pobierz profesjonalne Roadbooki i audyty pogodowe."
        url="/"
        structuredData={[buildOrganizationSchema(), buildWebsiteSchema()]}
      />

      {/* Decorative ambient radial light blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-rose-500/[0.06] blur-[140px]" />
        <div className="absolute top-[20%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-sky-500/[0.07] blur-[150px]" />
        <div className="absolute bottom-[20%] left-[10%] w-[40vw] h-[40vw] rounded-full bg-emerald-500/[0.05] blur-[130px]" />
        <div className="absolute bottom-[-10%] right-[10%] w-[50vw] h-[50vw] rounded-full bg-amber-500/[0.06] blur-[160px]" />
      </div>

      {/* Futuristic Glass Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm transition-all">
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
                    className="hidden sm:flex gap-1.5 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium shadow-lg hover:shadow-purple-500/10 border-0"
                  >
                    <Sparkles className="w-4 h-4 animate-pulse" /> Magic Studio
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="min-w-[40px] min-h-[40px] hover:bg-slate-100 text-slate-700"
                    onClick={() => navigate('/favorites')} 
                    title={t('nav.favorites')}
                  >
                    <Heart className="w-5 h-5 text-rose-500 fill-rose-500/5" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="min-w-[40px] min-h-[40px] relative hover:bg-slate-100 text-slate-700"
                    onClick={() => navigate('/messages')} 
                    title="Wiadomości"
                  >
                    <MessageSquare className="w-5 h-5" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="rounded-full min-w-[40px] min-h-[40px] hover:bg-slate-100">
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
        <section className="relative pt-12 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
          {/* Glowing Top Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-100 text-purple-700 text-xs font-semibold mb-6 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-pink-600 animate-pulse" />
            Rewolucja w Planowaniu Podróży: Kreator Magic AI
          </div>

          {/* Master Heading */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight max-w-4xl leading-tight text-slate-900">
            Projektuj Ultra-Precyzyjne <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500">
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
              className="w-full sm:w-auto h-14 px-8 rounded-xl bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 hover:from-purple-600 hover:via-pink-600 hover:to-rose-600 text-white font-semibold text-base shadow-[0_4px_25px_rgba(236,72,153,0.3)] hover:shadow-[0_4px_30px_rgba(236,72,153,0.5)] transition-all duration-300 hover:-translate-y-0.5 group"
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

          {/* Welcome Credit Pool Highlight Widget */}
          <div className="mt-16 w-full max-w-3xl rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.08] to-yellow-600/[0.02] p-6 backdrop-blur-xl relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl" />
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-left">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                  <h3 className="text-base font-bold text-amber-850 flex items-center gap-1.5">
                    Twój Darmowy Pakiet Powitalny: 100 Kredytów
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 leading-normal max-w-xl">
                  Każdy nowo zarejestrowany twórca otrzymuje darmową pulę kredytów. Wystarczą na wygenerowanie 3 do 4 kompletnych, zaawansowanych tras z plikami GPX, modelami 3D, analizami pogody i interaktywnymi roadbookami PDF.
                </p>
              </div>
              <div className="shrink-0 bg-amber-500/10 border border-amber-400/20 rounded-xl px-5 py-3 text-center sm:text-right min-w-[140px]">
                <span className="text-[10px] uppercase font-mono tracking-widest text-amber-700 font-semibold">Na Start</span>
                <p className="text-2xl font-black text-amber-800 font-mono">100 CR</p>
                <span className="text-[9px] text-amber-700/70 font-semibold block">Bezpłatnie</span>
              </div>
            </div>
          </div>
        </section>

        {/* 4 Flagship AI Archetypes Grid */}
        <section className="py-20 bg-slate-50 border-y border-slate-200/60 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
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
                className="group cursor-pointer rounded-2xl border border-rose-100 bg-white hover:bg-rose-50/10 p-6 shadow-sm hover:shadow-md hover:border-rose-300 transition-all duration-300 relative overflow-hidden flex flex-col justify-between min-h-[360px]"
              >
                <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/[0.02] rounded-full blur-2xl group-hover:bg-rose-500/[0.05] transition-colors" />
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 border border-rose-100 group-hover:scale-110 transition-transform duration-300">
                    <Zap className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full">
                      Szosowy Esteta
                    </span>
                    <h3 className="text-lg font-bold mt-2.5 text-slate-800 group-hover:text-rose-600 transition-colors">
                      Motocykl Szosowy
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Priorytet dla idealnej nawierzchni bitumicznej, sekwencji ciasnych zakrętów, malowniczych panoram oraz nastrojowych kawiarni i parkingów.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100 space-y-3">
                  <ul className="space-y-1.5 text-[11px] text-slate-500">
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-rose-500" />
                      Audyt gładkości asfaltu
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-rose-500" />
                      Filtrowanie dróg gruntowych
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-rose-500" />
                      Kamera 3D i krętość
                    </li>
                  </ul>
                  <div className="text-[11px] font-semibold text-rose-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Twórz trasę moto <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

              {/* Archetype 2: Rowerzysta */}
              <div 
                onClick={() => handleArchetypeSelect('family')}
                className="group cursor-pointer rounded-2xl border border-emerald-100 bg-white hover:bg-emerald-50/10 p-6 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all duration-300 relative overflow-hidden flex flex-col justify-between min-h-[360px]"
              >
                <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/[0.02] rounded-full blur-2xl group-hover:bg-emerald-500/[0.05] transition-colors" />
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100 group-hover:scale-110 transition-transform duration-300">
                    <Bike className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                      Dwa Oblicza
                    </span>
                    <h3 className="text-lg font-bold mt-2.5 text-slate-800 group-hover:text-emerald-600 transition-colors">
                      Rower (Szosa vs Gravel/MTB)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Stworzone dla kolarzy szosowych szukających doskonałego asfaltu lub pasjonatów gravela/MTB pragnących leśnych duktów i bezdroży.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100 space-y-3">
                  <ul className="space-y-1.5 text-[11px] text-slate-500">
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-emerald-500" />
                      Wybór nawierzchni (Asfalt vs Szuter)
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-emerald-500" />
                      Audyt punktów serwisowych i wiat
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-emerald-500" />
                      Dopasowanie do e-bike i sakw
                    </li>
                  </ul>
                  <div className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Twórz trasę rowerową <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

              {/* Archetype 3: Górski Wyjadacz */}
              <div 
                onClick={() => handleArchetypeSelect('mountain')}
                className="group cursor-pointer rounded-2xl border border-amber-100 bg-white hover:bg-amber-50/10 p-6 shadow-sm hover:shadow-md hover:border-amber-300 transition-all duration-300 relative overflow-hidden flex flex-col justify-between min-h-[360px]"
              >
                <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/[0.02] rounded-full blur-2xl group-hover:bg-amber-500/[0.05] transition-colors" />
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100 group-hover:scale-110 transition-transform duration-300">
                    <Compass className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                      Górski Wyjadacz
                    </span>
                    <h3 className="text-lg font-bold mt-2.5 text-slate-800 group-hover:text-amber-600 transition-colors">
                      Trekking (1 do 14 dni)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Od krótkich jednodniowych wycieczek po wymagające 14-dniowe trekkingi górskie. Pełny audyt bezpieczeństwa, noclegów i zasobów wody.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100 space-y-3">
                  <ul className="space-y-1.5 text-[11px] text-slate-500">
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-amber-500" />
                      Schroniska, źródła wody i wiaty
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-amber-500" />
                      Interaktywne profile wysokości szlaku
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-amber-500" />
                      Ostrzeżenia o nachyleniu i GSM
                    </li>
                  </ul>
                  <div className="text-[11px] font-semibold text-amber-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Twórz wyprawę górską <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Dynamic Studio Pipeline Tracker Section */}
        <section className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
              Poczuj Magię: Proces Projektowy Krok po Kroku
            </h2>
            <p className="mt-4 text-base text-slate-600">
              Od luźnej inspiracji do w pełni udokumentowanej wyprawy w zaledwie kilka minut. Zobacz, jak nasz silnik spina surowe dane w interaktywną całość.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 relative">
            
            {/* Connection line for Desktop */}
            <div className="hidden lg:block absolute top-1/2 left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-amber-500/20 -translate-y-8 -z-10" />

            {/* Step 1 */}
            <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-6 hover:border-purple-500/30 hover:bg-white hover:shadow-md transition-all flex flex-col justify-between">
              <div className="space-y-4">
                <div className="text-xs font-mono text-purple-600 font-bold tracking-widest uppercase">Etap 01</div>
                <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
                  <Upload className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Załadowanie Materiałów</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Prześlij nagranie z YouTube, link do bloga turystycznego, ślad GPX ze Strava / Suunto lub po prostu wpisz swoje luźne notatki.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-6 hover:border-pink-500/30 hover:bg-white hover:shadow-md transition-all flex flex-col justify-between">
              <div className="space-y-4">
                <div className="text-xs font-mono text-pink-600 font-bold tracking-widest uppercase">Etap 02</div>
                <div className="w-10 h-10 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center text-pink-600">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">AI Wywiad & Konspekt</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  System przeprowadzi z Tobą krótki, zautomatyzowany czat, doprecyzuje tempo i wygeneruje wstępny plan do akceptacji.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-6 hover:border-rose-500/30 hover:bg-white hover:shadow-md transition-all flex flex-col justify-between">
              <div className="space-y-4">
                <div className="text-xs font-mono text-rose-600 font-bold tracking-widest uppercase">Etap 03</div>
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                  <Activity className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Trójwymiarowy Przelot</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Zobacz trasę w 3D na pełnej mapie wysokościowej. Uruchom Wirtualny Przelot Drona i śledź trajektorię szlaku z lotu ptaka.
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-6 hover:border-amber-500/30 hover:bg-white hover:shadow-md transition-all flex flex-col justify-between">
              <div className="space-y-4">
                <div className="text-xs font-mono text-amber-600 font-bold tracking-widest uppercase">Etap 04</div>
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                  <CloudRain className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Klimat i Roadbook PDF</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Przeanalizuj mikroklimaty, dobierz opony, pobierz kompletny segmentowy Roadbook w PDF i opublikuj gotowy przewodnik!
                </p>
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
