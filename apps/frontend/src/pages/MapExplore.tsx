import { useState, useMemo, useCallback, useRef } from 'react';
import Logo from '@/components/Logo';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePublishedRoutes, useCategories, useRouteStats } from '@/hooks/use-routes';
import { useUserFavorites, useFavoritesCount } from '@/hooks/use-favorites';
import FavoriteButton from '@/components/FavoriteButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  MapPin, User, Plus, ShoppingBag, LayoutDashboard, Star, Heart,
  Globe, ArrowLeft, ChevronUp, ChevronDown, List,
} from 'lucide-react';
import RouteExplorerGlobe from '@/components/RouteExplorerGlobe';
import { SUB_CATEGORIES } from '@/lib/categories';
import CategoryChipsBar from '@/components/CategoryChips';

type MobilePanel = 'collapsed' | 'half' | 'full';

export default function MapExplore() {
  const { t } = useTranslation();
  const { user, loading: authLoading, login } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [visibleRouteIds, setVisibleRouteIds] = useState<number[]>([]);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('half');
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartPanel = useRef<MobilePanel>('half');

  const { data: allRoutes = [] } = usePublishedRoutes();
  const { data: allCategories = [] } = useCategories();
  const categories = useMemo(() => {
    return allCategories.filter((cat) => ['Motorcycling', 'Cycling', 'Hiking', 'City'].includes(cat.name));
  }, [allCategories]);
  const routeIds = useMemo(() => allRoutes.map((r) => r.id), [allRoutes]);
  const { data: statsMap = {} } = useRouteStats(routeIds);
  const { data: favoriteIds = [] } = useUserFavorites(user?.id);
  const { data: favCounts = {} } = useFavoritesCount(routeIds);

  const categoryFiltered = useMemo(() => {
    // 1. Filter routes to only include our 4 premium disciplines
    let routes = allRoutes.filter((route) => 
      ['Motorcycling', 'Cycling', 'Hiking', 'City'].includes(route.category_name)
    );

    // 2. Filter by selected category chip
    if (selectedCategory) {
      routes = routes.filter((route) => route.category_id === selectedCategory);
    }

    if (selectedSubCategory) {
      routes = routes.filter((route) => {
        const subcategory = String((route as any).subcategory ?? '');
        return subcategory.toLowerCase().includes(selectedSubCategory.toLowerCase());
      });
    }

    return routes;
  }, [allRoutes, selectedCategory, selectedSubCategory]);

  const visibleRoutes = useMemo(() => {
    if (visibleRouteIds.length === 0) return categoryFiltered;
    const visibleSet = new Set(visibleRouteIds);
    const filteredVisible = categoryFiltered.filter((route) => visibleSet.has(route.id));
    return filteredVisible.length > 0 ? filteredVisible : categoryFiltered;
  }, [categoryFiltered, visibleRouteIds]);

  const selectedCategoryName = useMemo(() => {
    if (!selectedCategory) return null;
    return categories.find((category) => category.id === selectedCategory)?.name ?? null;
  }, [selectedCategory, categories]);

  const subCategories = useMemo(() => {
    if (!selectedCategoryName) return [];
    return SUB_CATEGORIES[selectedCategoryName] ?? [];
  }, [selectedCategoryName]);

  const selectedRoute = useMemo(
    () => categoryFiltered.find((route) => route.id === selectedRouteId) ?? null,
    [categoryFiltered, selectedRouteId],
  );

  const handleGlobeSelect = useCallback((routeId: number) => {
    setSelectedRouteId(routeId);
    if (isMobile) {
      setMobilePanel('half');
    }
  }, [isMobile]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    dragStartPanel.current = mobilePanel;
  }, [mobilePanel]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const deltaY = dragStartY.current - e.changedTouches[0].clientY;
    const threshold = 50;

    if (deltaY > threshold) {
      if (dragStartPanel.current === 'collapsed') setMobilePanel('half');
      else if (dragStartPanel.current === 'half') setMobilePanel('full');
    } else if (deltaY < -threshold) {
      if (dragStartPanel.current === 'full') setMobilePanel('half');
      else if (dragStartPanel.current === 'half') setMobilePanel('collapsed');
    }

    dragStartY.current = null;
  }, []);

  const panelHeight = mobilePanel === 'full' ? 'calc(100% - 3.5rem)'
    : mobilePanel === 'half' ? '55%'
    : '5rem';

  const CategoryBar = (
    <div className="px-3 py-2">
      <CategoryChipsBar
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={(id) => {
          setSelectedCategory(id);
          setSelectedSubCategory(null);
          setVisibleRouteIds([]);
          setSelectedRouteId(null);
        }}
        allLabel="Wszystkie"
      />
    </div>
  );

  const SubCategoryBar = subCategories.length > 0 ? (
    <div className="flex items-center gap-2 overflow-x-auto px-3 py-1.5 scrollbar-hide">
      {subCategories.map((sub) => (
        <button
          key={sub}
          onClick={() => setSelectedSubCategory(selectedSubCategory === sub ? null : sub)}
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            selectedSubCategory === sub
              ? 'border-foreground bg-foreground text-background'
              : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          {sub}
        </button>
      ))}
    </div>
  ) : null;

  const RouteCard = ({ route }: { route: typeof categoryFiltered[number] }) => {
    const stats = statsMap[route.id];
    const isSelected = route.id === selectedRouteId;

    return (
      <div
        onClick={() => navigate(`/route/${route.id}`)}
        onMouseEnter={() => setSelectedRouteId(route.id)}
        className={`cursor-pointer overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${
          isSelected ? 'border-primary ring-1 ring-primary/30' : 'border-border'
        }`}
      >
        <div className="relative aspect-[4/3] overflow-hidden">
          <img src={route.cover_image_key} alt={route.title} className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" />
          <Badge className="absolute left-2 top-2 bg-card/90 px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-card/90">
            {route.category_name}
          </Badge>
          <div className="absolute right-2 top-2">
            <FavoriteButton routeId={route.id} isFavorited={favoriteIds.includes(route.id)} size="sm" className="rounded-full bg-card/80 p-1 hover:bg-card" />
          </div>
        </div>
        <div className="p-2.5">
          <div className="flex items-start justify-between gap-1">
            <h3 className="line-clamp-1 text-xs font-semibold transition-colors hover:text-primary">{route.title}</h3>
            <span className="whitespace-nowrap text-xs font-semibold">${route.price.toFixed(2)}</span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="line-clamp-1 text-[11px]">{route.location_string}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            {stats && stats.total_ratings > 0 ? (
              <div className="flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span className="text-[11px] font-medium">{stats.average_rating}</span>
                <span className="text-[10px] text-muted-foreground">({stats.total_ratings})</span>
              </div>
            ) : <span className="text-[10px] text-muted-foreground">Brak ocen</span>}
            <div className="flex items-center gap-0.5 text-muted-foreground">
              <ShoppingBag className="h-3 w-3" />
              <span className="text-[10px]">{stats?.total_purchases ?? 0}</span>
            </div>
            <div className="flex items-center gap-0.5 text-muted-foreground">
              <Heart className="h-3 w-3 fill-red-400 text-red-400" />
              <span className="text-[10px]">{favCounts[route.id] ?? 0}</span>
            </div>
          </div>
          <div className="mt-1 flex items-center gap-1 text-muted-foreground">
            <User className="h-3 w-3" />
            <span className="text-[11px]">{route.creator_name}</span>
          </div>
        </div>
      </div>
    );
  };

  const Header = (
    <header className="z-40 shrink-0 border-b border-border bg-card">
      <div className="flex h-14 items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="min-h-[44px] min-w-[44px] gap-1 px-2">
            <ArrowLeft className="h-4 w-4 text-primary" />
            <span className="hidden sm:inline">Wróć</span>
          </Button>
          <Logo size="lg" />
        </div>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          {authLoading ? <div className="h-8 w-8 animate-pulse rounded-full bg-muted" /> : user ? (
            <>
              <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" onClick={() => navigate('/create')}><Plus className="h-4 w-4 text-primary" /></Button>
              <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" onClick={() => navigate('/my-routes')}><ShoppingBag className="h-4 w-4 text-primary" /></Button>
              <Button variant="ghost" size="icon" className="hidden min-h-[44px] min-w-[44px] sm:flex" onClick={() => navigate('/creator-dashboard')}><LayoutDashboard className="h-4 w-4 text-primary" /></Button>
              <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" onClick={() => navigate('/profile')}>
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10"><User className="h-3.5 w-3.5 text-primary" /></div>
              </Button>
            </>
          ) : <Button onClick={login} size="sm" className="min-h-[44px] bg-accent text-xs text-accent-foreground hover:bg-accent/90">Zaloguj</Button>}
        </div>
      </div>
    </header>
  );

  if (isMobile) {
    return (
      <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-background">
        <SEO title={t('seo.map.title')} description={t('seo.map.description')} url="/map" />
        {Header}

        <div className="relative flex-1">
          <div className="absolute inset-0" onTouchStart={() => setMobilePanel('collapsed')}>
            <RouteExplorerGlobe
              routes={categoryFiltered}
              selectedRouteId={selectedRouteId}
              onSelectRoute={handleGlobeSelect}
              onVisibleRoutesChange={setVisibleRouteIds}
              badgeLabel="Explore Globe"
            />
          </div>

          {selectedRoute && mobilePanel === 'collapsed' && (
            <div className="absolute left-4 right-4 top-4 z-[1000] rounded-2xl border border-border bg-card/92 p-3 shadow-lg backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm font-semibold">{selectedRoute.title}</p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">{selectedRoute.location_string}</p>
                </div>
                <Button size="sm" onClick={() => navigate(`/route/${selectedRoute.id}`)}>Otwórz</Button>
              </div>
            </div>
          )}

          {mobilePanel === 'collapsed' && (
            <button
              onClick={() => setMobilePanel('half')}
              className="absolute bottom-24 left-1/2 z-[1000] flex min-h-[44px] -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-lg"
            >
              <List className="h-4 w-4" />
              {visibleRoutes.length} tras w widoku
              <ChevronUp className="h-4 w-4" />
            </button>
          )}
        </div>

        <div
          ref={panelRef}
          className="absolute bottom-0 left-0 right-0 z-[1000] flex flex-col rounded-t-2xl border-t border-border bg-card shadow-[0_-4px_20px_rgba(0,0,0,0.1)] transition-[height] duration-300 ease-out"
          style={{ height: panelHeight }}
        >
          <div
            className="flex min-h-[44px] shrink-0 cursor-grab touch-none flex-col items-center justify-center pt-2 pb-1 active:cursor-grabbing"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {visibleRoutes.length} {visibleRoutes.length === 1 ? 'trasa' : 'tras'} w tym widoku
              </span>
              {mobilePanel !== 'full' && (
                <button onClick={() => setMobilePanel('full')} className="flex min-h-[44px] min-w-[44px] items-center justify-center text-muted-foreground"><ChevronUp className="h-4 w-4" /></button>
              )}
              {mobilePanel === 'full' && (
                <button onClick={() => setMobilePanel('half')} className="flex min-h-[44px] min-w-[44px] items-center justify-center text-muted-foreground"><ChevronDown className="h-4 w-4" /></button>
              )}
            </div>
          </div>

          {mobilePanel !== 'collapsed' && (
            <div className="shrink-0 border-b border-border/50">
              {CategoryBar}
              {SubCategoryBar && <div className="border-t border-border/30">{SubCategoryBar}</div>}
            </div>
          )}

          {mobilePanel !== 'collapsed' && (
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {visibleRoutes.length === 0 ? (
                <div className="py-8 text-center">
                  <Globe className="mx-auto mb-2 h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Brak tras w tym widoku</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {visibleRoutes.map((route) => <RouteCard key={route.id} route={route} />)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <SEO title={t('seo.map.title')} description={t('seo.map.description')} url="/map" />
      {Header}

      <div className="shrink-0 border-b border-border bg-card">
        {CategoryBar}
        {SubCategoryBar && <div className="border-t border-border/30">{SubCategoryBar}</div>}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-[52%] min-h-0 flex-col border-r border-border bg-card xl:w-[48%]">
          <div className="flex items-center justify-between border-b border-border/50 px-3 py-2 text-xs text-muted-foreground">
            <span>{visibleRoutes.length} {visibleRoutes.length === 1 ? 'trasa' : 'tras'} w tym widoku</span>
            {selectedRoute && <span className="line-clamp-1 max-w-[40%] text-right">{selectedRoute.title}</span>}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
            {visibleRoutes.length === 0 ? (
              <div className="py-12 text-center">
                <Globe className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Brak tras w tym widoku</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                {visibleRoutes.map((route) => <RouteCard key={route.id} route={route} />)}
              </div>
            )}
          </div>
        </div>

        <div className="flex w-[48%] min-h-0 flex-col bg-background xl:w-[52%]">
          <div aria-hidden="true" className="h-7 shrink-0 border-b border-border/50" />
          <div className="min-h-0 flex-1 p-3">
            <div className="relative h-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <RouteExplorerGlobe
                routes={categoryFiltered}
                selectedRouteId={selectedRouteId}
                onSelectRoute={handleGlobeSelect}
                onVisibleRoutesChange={setVisibleRouteIds}
                badgeLabel="Explore Globe"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
