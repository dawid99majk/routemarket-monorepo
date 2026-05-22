import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { useProfileBalance } from '@/hooks/use-profile-balance';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  Coins,
  TrendingUp,
  ArrowUpRight,
  Loader2,
  Calendar,
  Wallet,
  Sparkles,
  Info,
  CheckCircle,
  HelpCircle,
  Banknote,
  DollarSign
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function CreatorEarnings() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { balance, isLoading: balanceLoading } = useProfileBalance(user?.id);
  const queryClient = useQueryClient();

  const [withdrawAmount, setWithdrawAmount] = useState<number>(0);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);

  const tokenBalance = balance?.token_balance ?? 0;
  const tokenValuePln = 1.0; // 1 token = 1.00 PLN

  // Fetch all token transactions for the user
  const { data: transactions = [], isLoading: txsLoading } = useQuery({
    queryKey: ['all-token-transactions', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('token_transactions')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching token transactions:', error);
        return [];
      }
      return data ?? [];
    }
  });

  // Extract route IDs to fetch details
  const routeIds = [...new Set(transactions.map(t => t.route_id))].filter(Boolean) as number[];
  
  const { data: routes = [] } = useQuery({
    queryKey: ['routes-for-token-transactions', routeIds],
    enabled: routeIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('routes')
        .select('id, title')
        .in('id', routeIds);
      return data ?? [];
    },
  });

  const routeMap = Object.fromEntries(routes.map(r => [r.id, r.title]));

  // Calculate sum of positive route download earnings
  const lifetimeEarnings = transactions
    .filter(t => t.purpose === 'route_download_earning')
    .reduce((sum, t) => sum + (t.amount ?? 0), 0);

  // Spend/Payout Mutation
  const payoutMutation = useMutation({
    mutationFn: async (amount: number) => {
      if (!user?.id) throw new Error('Użytkownik nie jest zalogowany.');
      if (amount <= 0) throw new Error('Podaj prawidłową kwotę.');
      if (tokenBalance < amount) throw new Error('Niewystarczająca liczba tokenów.');

      const newBalance = tokenBalance - amount;

      // 1. Update profiles table
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ token_balance: newBalance })
        .eq('user_id', user.id);

      if (profileErr) throw profileErr;

      // 2. Log token transaction as payout
      const { error: txErr } = await supabase
        .from('token_transactions')
        .insert({
          user_id: user.id,
          amount: -amount,
          purpose: 'payout',
        });

      if (txErr) console.warn('Zapisano wypłatę, lecz logowanie transakcji nie powiodło się:', txErr);

      // 3. Update total earnings in creator profile if exists (optional but keeps statistics aligned)
      const { data: cProfile } = await supabase
        .from('creator_profiles')
        .select('total_earnings')
        .eq('user_id', user.id)
        .maybeSingle();

      if (cProfile) {
        const cashValue = amount * tokenValuePln;
        const newEarnings = Math.max(0, (cProfile.total_earnings ?? 0) - cashValue);
        await supabase
          .from('creator_profiles')
          .update({ total_earnings: newEarnings })
          .eq('user_id', user.id);
      }

      return { amount, newBalance };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['profile-balance', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['all-token-transactions', user?.id] });
      toast.success(`Wypłata ${data.amount} PLN została zlecona pomyślnie!`);
      setWithdrawSuccess(true);
      setWithdrawAmount(0);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Wystąpił błąd podczas zlecania wypłaty.');
    }
  });

  const handlePayoutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (withdrawAmount < 10) {
      toast.error('Minimalna kwota wypłaty wynosi 10 tokenów (10 PLN).');
      return;
    }
    payoutMutation.mutate(withdrawAmount);
  };

  if (authLoading || balanceLoading || txsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Ładowanie portfela twórcy...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card/85 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/creator-dashboard')} className="gap-1 px-3">
              <ArrowLeft className="w-4 h-4" />
              <span>Panel twórcy</span>
            </Button>
            <Logo size="sm" />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-card text-xs font-bold font-mono">
              <Coins className="w-3.5 h-3.5 text-accent" />
              <span>{tokenBalance} Tokenów</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold flex items-center gap-2.5">
              <Wallet className="h-8 w-8 text-primary" />
              Portfel i Zarobki Twórcy
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Zarządzaj swoimi środkami, sprawdzaj historię zakupów Twoich tras oraz zlecaj natychmiastowe wypłaty.
            </p>
          </div>
          
          <Badge variant="outline" className="px-3 py-1 text-xs bg-accent/5 border-accent/25 text-accent self-start flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 animate-pulse text-accent" />
            Prowizja twórcy: 80% (4 z 5 tokenów)
          </Badge>
        </div>

        {/* Balance Grid & Payout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Card 1: Token Balance */}
          <Card className="glass-premium border-primary/20 shadow-md flex flex-col justify-between overflow-hidden relative group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors"></div>
            <CardHeader className="pb-3">
              <CardDescription className="text-xs uppercase tracking-wider font-mono">Dostępne Tokeny</CardDescription>
              <CardTitle className="text-4xl font-extrabold font-mono text-foreground flex items-center gap-2 mt-1">
                <Coins className="w-9 h-9 text-accent shrink-0" />
                {tokenBalance}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-muted/40 rounded-lg border border-border/80 text-xs">
                <div className="flex justify-between text-muted-foreground mb-1">
                  <span>Wartość wypłaty:</span>
                  <span className="font-semibold text-foreground font-mono">{(tokenBalance * tokenValuePln).toFixed(2)} PLN</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Kurs wymiany:</span>
                  <span className="font-mono">1 Token = 1.00 PLN</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Lifetime Earnings */}
          <Card className="glass-premium border-border/80 shadow-md flex flex-col justify-between overflow-hidden relative">
            <CardHeader className="pb-3">
              <CardDescription className="text-xs uppercase tracking-wider font-mono">Zarobki Łączne (Lifetime)</CardDescription>
              <CardTitle className="text-4xl font-extrabold font-mono text-foreground flex items-center gap-2 mt-1">
                <TrendingUp className="w-9 h-9 text-emerald-500 shrink-0" />
                {lifetimeEarnings}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-muted/40 rounded-lg border border-border/80 text-xs">
                <div className="flex justify-between text-muted-foreground mb-1">
                  <span>Przychód brutto:</span>
                  <span className="font-semibold text-foreground font-mono">{(lifetimeEarnings * tokenValuePln).toFixed(2)} PLN</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Wypłacone środki:</span>
                  <span className="font-semibold text-foreground font-mono">
                    {Math.abs(transactions.filter(t => t.purpose === 'payout').reduce((sum, t) => sum + (t.amount ?? 0), 0)).toFixed(2)} PLN
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Payout Panel */}
          <Card className="glass-premium border-border/80 shadow-md md:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-bold flex items-center gap-1.5">
                <Banknote className="w-5 h-5 text-primary" />
                Zleć Wypłatę
              </CardTitle>
              <CardDescription className="text-xs">Wypłać zarobione środki bezpośrednio na konto.</CardDescription>
            </CardHeader>
            <CardContent>
              {withdrawSuccess ? (
                <div className="space-y-3 py-2 text-center">
                  <CheckCircle className="w-9 h-9 text-emerald-500 mx-auto animate-bounce" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">Wypłata zlecona!</p>
                    <p className="text-[10px] text-muted-foreground">Środki trafią na Twoje konto bankowe w ciągu 24 godzin.</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setWithdrawSuccess(false)} className="w-full mt-2">
                    Zleć kolejną
                  </Button>
                </div>
              ) : (
                <form onSubmit={handlePayoutSubmit} className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Kwota wypłaty (Tokeny)</label>
                    <div className="relative">
                      <Input
                        type="number"
                        min="10"
                        max={tokenBalance}
                        value={withdrawAmount || ''}
                        onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                        placeholder="Min. 10 tokenów"
                        className="font-mono pr-12 text-sm"
                        disabled={tokenBalance < 10}
                        required
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-muted-foreground font-semibold">PLN</span>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground px-1">
                    <span>Opłata manipulacyjna:</span>
                    <span className="font-bold text-emerald-500">0.00 PLN (Darmowa)</span>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-xs min-h-[40px]" 
                    disabled={payoutMutation.isPending || tokenBalance < 10 || withdrawAmount > tokenBalance}
                  >
                    {payoutMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : (
                      <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Wypłać {(withdrawAmount * tokenValuePln).toFixed(2)} PLN
                  </Button>
                  
                  {tokenBalance < 10 && (
                    <p className="text-[9px] text-rose-500 font-medium text-center">
                      * Wymagane minimum 10 tokenów do zlecenia wypłaty.
                    </p>
                  )}
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Ledger / Transactions Section */}
        <Card className="glass-premium border-border/80 shadow-md">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="text-xl font-extrabold flex items-center gap-2">
              <Coins className="w-5 h-5 text-primary" />
              Księga Transakcji Portfela
            </CardTitle>
            <CardDescription className="text-xs">
              Pełny, transparentny rejestr wszystkich operacji finansowych, doładowań i zarobków.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {transactions.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Coins className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-semibold">Brak transakcji w historii</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">Twoje operacje pojawią się tutaj natychmiast.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <th className="px-5 py-3.5">Typ operacji</th>
                      <th className="px-5 py-3.5">Szczegóły / Trasa</th>
                      <th className="px-5 py-3.5 text-right">Kwota (Tokeny)</th>
                      <th className="px-5 py-3.5 text-right">Wartość cash</th>
                      <th className="px-5 py-3.5">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-sm">
                    {transactions.map((t) => {
                      const isPositive = t.amount > 0;
                      return (
                        <tr key={t.id} className="hover:bg-muted/15 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              {t.purpose === 'route_download_earning' && (
                                <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-xs font-bold px-2 py-0.5">
                                  Zarobki
                                </Badge>
                              )}
                              {t.purpose === 'topup' && (
                                <Badge className="bg-blue-500/10 text-blue-500 border border-blue-500/20 text-xs font-bold px-2 py-0.5">
                                  Doładowanie
                                </Badge>
                              )}
                              {t.purpose === 'payout' && (
                                <Badge className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-xs font-bold px-2 py-0.5">
                                  Wypłata
                                </Badge>
                              )}
                              {t.purpose === 'route_download' && (
                                <Badge className="bg-rose-500/10 text-rose-500 border border-rose-500/20 text-xs font-bold px-2 py-0.5">
                                  Zakup
                                </Badge>
                              )}
                              {!['route_download_earning', 'topup', 'payout', 'route_download'].includes(t.purpose) && (
                                <Badge variant="outline" className="text-xs px-2 py-0.5">
                                  {t.purpose}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            {t.purpose === 'route_download_earning' && (
                              <div>
                                <span className="font-semibold text-foreground">Sprzedaż trasy</span>
                                <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate max-w-[280px]">
                                  {routeMap[t.route_id] ?? `ID Trasy: #${t.route_id}`}
                                </p>
                              </div>
                            )}
                            {t.purpose === 'route_download' && (
                              <div>
                                <span className="font-semibold text-foreground font-mono">Pobranie trasy</span>
                                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[280px]">
                                  {routeMap[t.route_id] ?? `ID Trasy: #${t.route_id}`}
                                </p>
                              </div>
                            )}
                            {t.purpose === 'topup' && (
                              <span className="text-muted-foreground font-semibold">Doładowanie salda tokenów</span>
                            )}
                            {t.purpose === 'payout' && (
                              <span className="text-muted-foreground font-semibold">Zlecenie przelewu na konto</span>
                            )}
                            {!['route_download_earning', 'route_download', 'topup', 'payout'].includes(t.purpose) && (
                              <span className="text-muted-foreground font-mono">Transakcja #{t.id.slice(0, 8)}</span>
                            )}
                          </td>
                          <td className={`px-5 py-4 text-right font-mono font-bold ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {isPositive ? '+' : ''}{t.amount} tok
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-muted-foreground font-semibold">
                            {(t.amount * tokenValuePln).toFixed(2)} PLN
                          </td>
                          <td className="px-5 py-4 text-xs text-muted-foreground font-semibold">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                              {new Date(t.created_at).toLocaleDateString('pl-PL', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
