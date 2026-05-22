import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function AdminModeration() {
  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['admin-comments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comments')
        .select('id, content, route_id, user_id, created_at, routes ( title )')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;

      const userIds = [...new Set((data ?? []).map(c => c.user_id))];
      const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds);
      const pMap: Record<string, string> = {};
      (profiles ?? []).forEach(p => { pMap[p.user_id] = p.display_name ?? 'Anonim'; });

      return (data ?? []).map((c: any) => ({
        ...c,
        route_title: c.routes?.title ?? `Trasa #${c.route_id}`,
        author_name: pMap[c.user_id] ?? 'Anonim',
      }));
    },
  });

  if (isLoading) return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Moderacja komentarzy ({comments.length})</h1>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Autor</TableHead>
              <TableHead>Trasa</TableHead>
              <TableHead>Treść</TableHead>
              <TableHead>Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comments.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.author_name}</TableCell>
                <TableCell className="max-w-[150px] truncate">{c.route_title}</TableCell>
                <TableCell className="max-w-[300px] truncate">{c.content}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString('pl-PL')}</TableCell>
              </TableRow>
            ))}
            {comments.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Brak komentarzy</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
