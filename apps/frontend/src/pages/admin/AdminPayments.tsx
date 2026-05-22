import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function AdminPayments() {
  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['admin-purchases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchases')
        .select('id, route_id, user_id, amount_paid, purchased_at, routes ( title )')
        .order('purchased_at', { ascending: false });
      if (error) throw error;

      const userIds = [...new Set((data ?? []).map(p => p.user_id))];
      const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds);
      const pMap: Record<string, string> = {};
      (profiles ?? []).forEach(p => { pMap[p.user_id] = p.display_name ?? 'Anonim'; });

      return (data ?? []).map((p: any) => ({
        ...p,
        route_title: p.routes?.title ?? `Trasa #${p.route_id}`,
        buyer_name: pMap[p.user_id] ?? 'Anonim',
      }));
    },
  });

  const totalRevenue = purchases.reduce((s, p) => s + Number(p.amount_paid), 0);

  if (isLoading) return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-2">Płatności ({purchases.length})</h1>
      <p className="text-muted-foreground mb-4">Łączny przychód: <span className="font-semibold text-foreground">{totalRevenue.toFixed(2)} zł</span></p>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Trasa</TableHead>
              <TableHead>Kupujący</TableHead>
              <TableHead>Kwota</TableHead>
              <TableHead>Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchases.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.id}</TableCell>
                <TableCell className="font-medium max-w-[200px] truncate">{p.route_title}</TableCell>
                <TableCell>{p.buyer_name}</TableCell>
                <TableCell>{Number(p.amount_paid).toFixed(2)} zł</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(p.purchased_at).toLocaleDateString('pl-PL')}</TableCell>
              </TableRow>
            ))}
            {purchases.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Brak płatności</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
