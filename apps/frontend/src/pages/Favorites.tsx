import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Logo from '@/components/Logo';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePublishedRoutes, useRouteStats } from '@/hooks/use-routes';
import { useUserFavorites, useFavoritesCount } from '@/hooks/use-favorites';
import RouteCard from '@/components/RouteCard';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Heart } from 'lucide-react';

export default function Favorites() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: routes = [] } = usePublishedRoutes();
  const { data: favoriteIds = [], isLoading } = useUserFavorites(user?.id);
  const routeIds = useMemo(() => routes.map((r) => r.id), [routes]);
  const { data: statsMap = {} } = useRouteStats(routeIds);
  const { data: favCounts = {} } = useFavoritesCount(routeIds);

  const favoriteRoutes = useMemo(() => {
    return routes.filter((r) => favoriteIds.includes(r.id));
  }, [routes, favoriteIds]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mr-4">
              <ArrowLeft className="w-4 h-4 mr-1" /> {t('common.back')}
            </Button>
            <Logo size="sm" />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Heart className="w-6 h-6 text-red-500 fill-red-500" />
          <h1 className="text-2xl font-bold">{t('favorites.title')}</h1>
          <span className="text-sm text-muted-foreground">({favoriteRoutes.length})</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin" />
          </div>
        ) : favoriteRoutes.length === 0 ? (
          <div className="text-center py-20">
            <Heart className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground">{t('favorites.no_favorites')}</h3>
            <p className="text-muted-foreground/70 mt-1">{t('favorites.no_favorites_hint')}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/')}>
              {t('favorites.browse_routes')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {favoriteRoutes.map((route) => (
              <RouteCard
                key={route.id}
                route={route}
                stats={statsMap[route.id]}
                isFavorited={true}
                favCount={favCounts[route.id] ?? 0}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
