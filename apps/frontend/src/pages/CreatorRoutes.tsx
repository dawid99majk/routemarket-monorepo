import { useNavigate } from 'react-router-dom';
import Logo from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronLeft, Plus, Package, Loader2, Eye, EyeOff, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';

function getCoverUrl(key: string | null): string {
  if (!key) return 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600&h=400&fit=crop';
  if (key.startsWith('http')) return key;
  const { data } = supabase.storage.from('route-covers').getPublicUrl(key);
  return data.publicUrl;
}

export default function CreatorRoutes() {
  const navigate = useNavigate();
  const { user, login, loading: authLoading } = useAuth();

  const { data: routes = [], isLoading } = useQuery({
    queryKey: ['creator-routes', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('routes')
        .select('id, title, price, status, created_at, cover_image_key, location_string, distance_km')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (authLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Package className="w-16 h-16 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold text-muted-foreground">Zaloguj się, aby zobaczyć swoje trasy</h2>
        <Button onClick={login} className="bg-accent hover:bg-accent/90 text-accent-foreground">Zaloguj się</Button>
      </div>
    );
  }

  const publishedRoutes = routes.filter(r => r.status === 'published');
  const draftRoutes = routes.filter(r => r.status !== 'published');

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mr-2"><ChevronLeft className="w-4 h-4 mr-1" /> Wróć</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mr-4"><ArrowLeft className="w-4 h-4 mr-1" /> Home</Button>
            <Logo size="sm" />
          </div>
          <Button onClick={() => navigate('/create')} className="bg-accent hover:bg-accent/90 text-accent-foreground"><Plus className="w-4 h-4 mr-1" /> Nowa trasa</Button>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Moje trasy</h1>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : routes.length > 0 ? (
          <div className="space-y-4">
            {routes.map((route) => (
              <div
                key={route.id}
                className="bg-card rounded-xl shadow-sm overflow-hidden flex flex-col sm:flex-row cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/route/${route.id}`)}
              >
                <img
                  src={getCoverUrl(route.cover_image_key)}
                  alt={route.title}
                  className="w-full sm:w-48 h-32 sm:h-auto object-cover"
                />
                <div className="p-4 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-lg">{route.title}</h3>
                    <Badge variant={route.status === 'published' ? 'default' : 'secondary'} className="text-xs">
                      {route.status === 'published' ? (
                        <><Eye className="w-3 h-3 mr-1" /> Opublikowana</>
                      ) : (
                        <><EyeOff className="w-3 h-3 mr-1" /> Szkic</>
                      )}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{route.location_string}</p>
                  <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-4">
                      <span>{route.price?.toFixed(2)} zł</span>
                      {route.distance_km && <span>{route.distance_km} km</span>}
                      <span>{new Date(route.created_at).toLocaleDateString('pl-PL')}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); navigate(`/edit-route/${route.id}`); }}
                      className="gap-1"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edytuj
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-card rounded-xl shadow-sm">
            <Package className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground">Brak tras</h3>
            <p className="text-muted-foreground/70 mt-1 mb-4">Utwórz swoją pierwszą trasę</p>
            <Button onClick={() => navigate('/create')} className="bg-accent hover:bg-accent/90 text-accent-foreground"><Plus className="w-4 h-4 mr-1" /> Utwórz trasę</Button>
          </div>
        )}
      </main>
    </div>
  );
}
