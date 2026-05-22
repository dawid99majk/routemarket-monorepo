import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export default function AdminUsers() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const userIds = (profiles ?? []).map(p => p.user_id);
      const { data: roles } = await supabase.from('user_roles').select('user_id, role').in('user_id', userIds);

      const roleMap: Record<string, string[]> = {};
      (roles ?? []).forEach(r => {
        if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
        roleMap[r.user_id].push(r.role);
      });

      return (profiles ?? []).map(p => ({
        ...p,
        roles: roleMap[p.user_id] ?? ['user'],
      }));
    },
  });

  if (isLoading) return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Użytkownicy ({users.length})</h1>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nazwa</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Dołączył</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map(u => (
              <TableRow key={u.user_id}>
                <TableCell className="font-medium">{u.display_name ?? 'Anonim'}</TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {u.roles.map(r => (
                      <Badge key={r} variant={r === 'admin' ? 'destructive' : r === 'creator' ? 'default' : 'secondary'}>{r}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString('pl-PL')}</TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Brak użytkowników</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
