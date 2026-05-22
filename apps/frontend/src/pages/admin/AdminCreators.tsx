import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export default function AdminCreators() {
  const { data: creators = [], isLoading } = useQuery({
    queryKey: ['admin-creators'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creator_profiles')
        .select('id, user_id, display_name, bio, total_earnings, total_sales, stripe_onboarding_complete, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Twórcy ({creators.length})</h1>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nazwa</TableHead>
              <TableHead>Sprzedaże</TableHead>
              <TableHead>Zarobki</TableHead>
              <TableHead>Stripe</TableHead>
              <TableHead>Dołączył</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {creators.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.display_name}</TableCell>
                <TableCell>{c.total_sales ?? 0}</TableCell>
                <TableCell>{Number(c.total_earnings ?? 0).toFixed(2)} zł</TableCell>
                <TableCell>
                  <Badge variant={c.stripe_onboarding_complete ? 'default' : 'secondary'}>
                    {c.stripe_onboarding_complete ? 'Aktywny' : 'Nieaktywny'}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString('pl-PL')}</TableCell>
              </TableRow>
            ))}
            {creators.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Brak twórców</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
