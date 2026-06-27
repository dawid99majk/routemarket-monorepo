import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Logo from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, ChevronLeft, Plus, LayoutDashboard, Loader2, Package, User, Sparkles, Wand2, Video } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

export default function CreatorDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, login, loading: authLoading } = useAuth();

  const { data: myRoutes = [] } = useQuery({
    queryKey: ['my-routes-count', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('routes')
        .select('id, title, status, created_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const { data: generatedRoutes = [] } = useQuery({
    queryKey: ['my-generated-routes', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('route_builder_projects')
        .select('id, requirements, updated_at')
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false });
      return data ?? [];
    },
  });

  if (authLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <LayoutDashboard className="w-16 h-16 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold text-muted-foreground">{t('creator.login_to_manage')}</h2>
        <Button onClick={login} className="bg-accent hover:bg-accent/90 text-accent-foreground">{t('common.login')}</Button>
      </div>
    );
  }

  const publishedRoutes = myRoutes.filter(r => r.status === 'published');

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mr-2 min-h-[44px] min-w-[44px]"><ChevronLeft className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">{t('common.back')}</span></Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mr-2 sm:mr-4 min-h-[44px]"><ArrowLeft className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">{t('common.home')}</span></Button>
            <Logo size="sm" />
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate('/profile')} title={t('nav.my_profile')} className="min-h-[44px] min-w-[44px]">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center"><User className="w-4 h-4 text-primary" /></div>
            </Button>
            <Button onClick={() => navigate('/create')} className="bg-accent hover:bg-accent/90 text-accent-foreground min-h-[44px]">
              <Plus className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">{t('creator.new_route')}</span><span className="sm:hidden">{t('common.new', 'New')}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Page heading */}
        <div>
          <h1 className="text-2xl font-bold">{t('creator.dashboard_title', 'Route Studio')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('creator.dashboard_subtitle', 'Manage your AI generated routes')}</p>
        </div>

        {/* Magic AI route factory */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-accent/30 bg-card p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">Magic AI Route Factory</h2>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Full AI</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Budowa produktu z multimediów: PDF, YouTube, zdjęcia i notatki. Pełen research i przewodnik.
                </p>
              </div>
            </div>
            <Button onClick={() => navigate('/create')} className="mt-4 min-h-[44px] w-full bg-accent text-accent-foreground hover:bg-accent/90">
              <Video className="mr-2 h-4 w-4" /> Otworz studio AI (v1)
            </Button>
          </div>

          <div className="rounded-xl border border-primary/30 bg-card p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Wand2 className="h-6 w-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-primary">Szybki Route Builder</h2>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">v2 Beta</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Najszybsza droga do GPX. Podaj start i region, a AI wygeneruje realną trasę na mapie w kilka sekund.
                </p>
              </div>
            </div>
            <Button onClick={() => navigate('/route-builder-v2')} className="mt-4 min-h-[44px] w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20">
              <Sparkles className="mr-2 h-4 w-4" /> Uruchom Builder v2
            </Button>
          </div>
        </div>

        {/* AI Route Projects Section */}
        {generatedRoutes.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground">Wygenerowane trasy AI</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate('/my-routes')} className="text-xs text-muted-foreground h-9 px-3">
                Zobacz wszystkie ({generatedRoutes.length})
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {generatedRoutes.slice(0, 4).map((proj: any) => {
                const reqs = proj.requirements || {};
                const title = reqs.title || 'Moja trasa AI';
                const updatedDate = new Date(proj.updated_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
                return (
                  <Card key={proj.id} className="border-border/60 hover:shadow-token-md transition-all duration-200 bg-card">
                    <CardContent className="p-5 flex flex-col justify-between h-full min-h-[130px]">
                      <div>
                        <h3 className="font-bold text-base leading-snug line-clamp-1">{title}</h3>
                        <p className="text-xs text-muted-foreground mt-1">Ostatnia edycja: {updatedDate}</p>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button size="sm" onClick={() => navigate(`/route-builder-v2?projectId=${proj.id}`)} className="bg-primary hover:bg-primary/90 text-primary-foreground min-h-[36px] h-9">
                          <Wand2 className="w-3.5 h-3.5 mr-1" /> Wznów edycję
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="min-h-[36px] h-9"
                          onClick={() => navigate('/my-routes')}
                        >
                          Szczegóły
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {generatedRoutes.length === 0 && publishedRoutes.length === 0 && (
          <Card className="border-dashed border-2 border-border/60">
            <CardContent className="text-center py-16">
              <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-5">
                <Package className="w-10 h-10 text-muted-foreground/40" />
              </div>
              <h3 className="text-lg font-semibold">{t('creator.no_routes', 'No routes created yet')}</h3>
              <p className="text-muted-foreground mt-1 mb-6 max-w-sm mx-auto">{t('creator.no_routes_hint', 'Create your first route to see it here')}</p>
              <Button onClick={() => navigate('/create')} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                <Plus className="w-4 h-4 mr-1" /> {t('creator.create_first', 'Create First Route')}
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
