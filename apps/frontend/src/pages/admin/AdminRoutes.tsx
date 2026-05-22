import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export default function AdminRoutes() {
  const { data: routes = [], isLoading } = useQuery({
    queryKey: ['admin-routes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('routes')
        .select('id, title, status, price, location_string, created_at, user_id, categories ( name )')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const userIds = [...new Set((data ?? []).map(r => r.user_id))];
      const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds);
      const pMap: Record<string, string> = {};
      (profiles ?? []).forEach(p => { pMap[p.user_id] = p.display_name ?? 'Anonim'; });

      return (data ?? []).map((r: any) => ({
        ...r,
        category_name: r.categories?.name ?? '—',
        creator_name: pMap[r.user_id] ?? 'Anonim',
      }));
    },
  });

  if (isLoading) return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Zarządzanie trasami ({routes.length})</h1>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Tytuł</TableHead>
              <TableHead>Twórca</TableHead>
              <TableHead>Kategoria</TableHead>
              <TableHead>Cena</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.id}</TableCell>
                <TableCell className="font-medium max-w-[200px] truncate">{r.title}</TableCell>
                <TableCell>{r.creator_name}</TableCell>
                <TableCell>{r.category_name}</TableCell>
                <TableCell>{Number(r.price).toFixed(2)} zł</TableCell>
                <TableCell>
                  <Badge variant={r.status === 'published' ? 'default' : 'secondary'}>{r.status}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString('pl-PL')}</TableCell>
              </TableRow>
            ))}
            {routes.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Brak tras</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
