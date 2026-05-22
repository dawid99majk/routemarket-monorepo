import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Map, CreditCard, TrendingUp } from 'lucide-react';

export default function AdminDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [routesRes, purchasesRes, profilesRes, creatorsRes] = await Promise.all([
        supabase.from('routes').select('id, status, created_at', { count: 'exact' }),
        supabase.from('purchases').select('id, amount_paid, purchased_at'),
        supabase.from('profiles').select('id', { count: 'exact' }),
        supabase.from('creator_profiles').select('id', { count: 'exact' }),
      ]);

      const totalRevenue = (purchasesRes.data ?? []).reduce((s, p) => s + Number(p.amount_paid), 0);
      const publishedRoutes = (routesRes.data ?? []).filter(r => r.status === 'published').length;

      return {
        totalUsers: profilesRes.count ?? 0,
        totalRoutes: routesRes.count ?? 0,
        publishedRoutes,
        totalPurchases: purchasesRes.data?.length ?? 0,
        totalRevenue,
        totalCreators: creatorsRes.count ?? 0,
      };
    },
  });

  if (isLoading) {
    return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  const cards = [
    { icon: Users, label: 'Użytkownicy', value: stats?.totalUsers ?? 0, sub: `${stats?.totalCreators ?? 0} twórców` },
    { icon: Map, label: 'Trasy', value: stats?.totalRoutes ?? 0, sub: `${stats?.publishedRoutes ?? 0} opublikowanych` },
    { icon: CreditCard, label: 'Zakupy', value: stats?.totalPurchases ?? 0, sub: `${(stats?.totalRevenue ?? 0).toFixed(2)} zł przychodu` },
    { icon: TrendingUp, label: 'Twórcy', value: stats?.totalCreators ?? 0, sub: 'aktywnych kont' },
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
