import { useNavigate } from 'react-router-dom';
import Logo from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, ShoppingCart, Heart, Star, MessageSquare, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

interface RouteStats {
  id: number;
  title: string;
  price: number;
  status: string;
  purchases: number;
  favorites: number;
  avgRating: number;
  ratingsCount: number;
  commentsCount: number;
  revenue: number;
}

export default function CreatorStats() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const { data: stats = [], isLoading } = useQuery({
    queryKey: ['creator-stats', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // Fetch creator's routes
      const { data: routes } = await supabase
        .from('routes')
        .select('id, title, price, status')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (!routes?.length) return [];

      const routeIds = routes.map(r => r.id);

      // Fetch all stats in parallel
      const [purchasesRes, favoritesRes, ratingsRes, commentsRes] = await Promise.all([
        supabase.from('purchases').select('route_id, amount_paid').in('route_id', routeIds),
        supabase.from('favorites').select('route_id').in('route_id', routeIds),
        supabase.from('ratings').select('route_id, score').in('route_id', routeIds),
        supabase.from('comments').select('route_id').in('route_id', routeIds),
      ]);

      const purchasesByRoute: Record<number, { count: number; revenue: number }> = {};
      (purchasesRes.data ?? []).forEach(p => {
        if (!purchasesByRoute[p.route_id]) purchasesByRoute[p.route_id] = { count: 0, revenue: 0 };
        purchasesByRoute[p.route_id].count++;
        purchasesByRoute[p.route_id].revenue += p.amount_paid;
      });

      const favsByRoute: Record<number, number> = {};
      (favoritesRes.data ?? []).forEach(f => {
        favsByRoute[f.route_id] = (favsByRoute[f.route_id] || 0) + 1;
      });

      const ratingsByRoute: Record<number, { sum: number; count: number }> = {};
      (ratingsRes.data ?? []).forEach(r => {
        if (!ratingsByRoute[r.route_id]) ratingsByRoute[r.route_id] = { sum: 0, count: 0 };
        ratingsByRoute[r.route_id].sum += r.score;
        ratingsByRoute[r.route_id].count++;
      });

      const commentsByRoute: Record<number, number> = {};
      (commentsRes.data ?? []).forEach(c => {
        commentsByRoute[c.route_id] = (commentsByRoute[c.route_id] || 0) + 1;
      });

      return routes.map(r => ({
        id: r.id,
        title: r.title,
        price: r.price,
        status: r.status,
        purchases: purchasesByRoute[r.id]?.count ?? 0,
        revenue: purchasesByRoute[r.id]?.revenue ?? 0,
        favorites: favsByRoute[r.id] ?? 0,
        avgRating: ratingsByRoute[r.id] ? ratingsByRoute[r.id].sum / ratingsByRoute[r.id].count : 0,
        ratingsCount: ratingsByRoute[r.id]?.count ?? 0,
        commentsCount: commentsByRoute[r.id] ?? 0,
      })) as RouteStats[];
    },
  });

  if (authLoading || isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const totalPurchases = stats.reduce((s, r) => s + r.purchases, 0);
  const totalFavorites = stats.reduce((s, r) => s + r.favorites, 0);
  const totalRevenue = stats.reduce((s, r) => s + r.revenue, 0);
  const totalComments = stats.reduce((s, r) => s + r.commentsCount, 0);
  const bestSeller = [...stats].sort((a, b) => b.purchases - a.purchases)[0];
  const mostFavorited = [...stats].sort((a, b) => b.favorites - a.favorites)[0];

  const summaryCards = [
    { icon: ShoppingCart, label: 'Łączna sprzedaż', value: String(totalPurchases), color: 'bg-primary/10 text-primary' },
    { icon: Heart, label: 'Polubienia', value: String(totalFavorites), color: 'bg-red-500/10 text-red-500' },
    { icon: TrendingUp, label: 'Przychód brutto', value: `${totalRevenue.toFixed(2)} zł`, color: 'bg-accent/10 text-accent' },
    { icon: MessageSquare, label: 'Komentarze', value: String(totalComments), color: 'bg-muted text-primary' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/creator-dashboard')}><ArrowLeft className="w-4 h-4 mr-1" /> Panel twórcy</Button>
          <Logo size="sm" />
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Statystyki sprzedaży</h1>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {summaryCards.map(({ icon: I, label, value, color }) => (
            <div key={label} className="bg-card rounded-xl p-4 shadow-sm">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}><I className="w-4 h-4" /></div>
              <p className="text-xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Highlights */}
        {bestSeller && bestSeller.purchases > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <div className="bg-card rounded-xl p-5 shadow-sm border-l-4 border-primary">
              <p className="text-xs text-muted-foreground mb-1">🏆 Najczęściej kupowana</p>
              <p className="font-semibold truncate">{bestSeller.title}</p>
              <p className="text-sm text-muted-foreground">{bestSeller.purchases} zakupów</p>
            </div>
            {mostFavorited && mostFavorited.favorites > 0 && (
              <div className="bg-card rounded-xl p-5 shadow-sm border-l-4 border-red-500">
                <p className="text-xs text-muted-foreground mb-1">❤️ Najczęściej polubiona</p>
                <p className="font-semibold truncate">{mostFavorited.title}</p>
                <p className="text-sm text-muted-foreground">{mostFavorited.favorites} polubień</p>
              </div>
            )}
          </div>
        )}

        {/* Per-route table */}
        {stats.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-xl shadow-sm">
            <TrendingUp className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground">Brak tras</h3>
            <p className="text-muted-foreground/70 mt-1">Statystyki pojawią się po dodaniu tras</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-5 py-3 font-medium">Trasa</th>
                  <th className="text-center px-3 py-3 font-medium"><ShoppingCart className="w-3.5 h-3.5 mx-auto" /></th>
                  <th className="text-center px-3 py-3 font-medium"><Heart className="w-3.5 h-3.5 mx-auto" /></th>
                  <th className="text-center px-3 py-3 font-medium"><Star className="w-3.5 h-3.5 mx-auto" /></th>
                  <th className="text-center px-3 py-3 font-medium"><MessageSquare className="w-3.5 h-3.5 mx-auto" /></th>
                  <th className="text-right px-5 py-3 font-medium">Przychód</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats.map(r => (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/route/${r.id}`)}>
                    <td className="px-5 py-3">
                      <p className="font-medium truncate max-w-[200px]">{r.title}</p>
                      <p className="text-xs text-muted-foreground">{r.price.toFixed(2)} zł · {r.status === 'published' ? 'Opublikowana' : 'Szkic'}</p>
                    </td>
                    <td className="text-center px-3 py-3 font-semibold">{r.purchases}</td>
                    <td className="text-center px-3 py-3">{r.favorites}</td>
                    <td className="text-center px-3 py-3">{r.avgRating > 0 ? `${r.avgRating.toFixed(1)} (${r.ratingsCount})` : '—'}</td>
                    <td className="text-center px-3 py-3">{r.commentsCount}</td>
                    <td className="text-right px-5 py-3 font-semibold whitespace-nowrap">{r.revenue.toFixed(2)} zł</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
