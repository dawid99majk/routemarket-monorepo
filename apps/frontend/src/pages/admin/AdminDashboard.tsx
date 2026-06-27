import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Map, Sparkles } from 'lucide-react';

export default function AdminDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [routesRes, profilesRes, aiProjectsRes] = await Promise.all([
        supabase.from('routes').select('id, status, created_at', { count: 'exact' }),
        supabase.from('profiles').select('id', { count: 'exact' }),
        (supabase as any).from('route_builder_projects').select('id', { count: 'exact' }),
      ]);

      const publishedRoutes = (routesRes.data ?? []).filter(r => r.status === 'published').length;

      return {
        totalUsers: profilesRes.count ?? 0,
        totalRoutes: routesRes.count ?? 0,
        publishedRoutes,
        totalAiProjects: aiProjectsRes.count ?? 0,
      };
    },
  });

  if (isLoading) {
    return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  const cards = [
    { icon: Users, label: 'Użytkownicy', value: stats?.totalUsers ?? 0, sub: 'Zarejestrowanych kont' },
    { icon: Map, label: 'Trasy', value: stats?.totalRoutes ?? 0, sub: `${stats?.publishedRoutes ?? 0} opublikowanych` },
    { icon: Sparkles, label: 'Projekty AI', value: stats?.totalAiProjects ?? 0, sub: 'Wygenerowanych tras' },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Panel administratora</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ icon: Icon, label, value, sub }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
