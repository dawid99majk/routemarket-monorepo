import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Loader2, CheckCircle, ArrowLeft, CreditCard, ExternalLink, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import Logo from '@/components/Logo';
import { useQuery } from '@tanstack/react-query';

export default function BecomeCreator() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, login, loading: authLoading, isCreator, refetch } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);

  const stripeReturn = searchParams.get('stripe_return') === 'true';
  const stripeRefresh = searchParams.get('stripe_refresh') === 'true';

  // Check Stripe Connect status for existing creators
  const { data: connectStatus, refetch: refetchConnect, isLoading: connectChecking } = useQuery({
    queryKey: ['stripe-connect-status', user?.id],
    enabled: !!user?.id && isCreator,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('create-connect-account', {
        body: { action: 'check-status', origin: window.location.origin },
      });
      if (error) throw error;
      return data as { connected: boolean; charges_enabled?: boolean; payouts_enabled?: boolean; onboarding_complete?: boolean };
    },
  });

  // Re-check after returning from Stripe
  useEffect(() => {
    if ((stripeReturn || stripeRefresh) && isCreator) {
      refetchConnect();
    }
  }, [stripeReturn, stripeRefresh, isCreator, refetchConnect]);

  if (authLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Sparkles className="w-16 h-16 text-accent" />
        <h2 className="text-xl font-semibold text-muted-foreground">Zaloguj się, aby zostać twórcą</h2>
        <Button onClick={login} className="bg-accent hover:bg-accent/90 text-accent-foreground">Zaloguj się</Button>
      </div>
    );
  }

  // Creator already set up with Stripe Connect complete
  if (isCreator && !success && connectStatus?.onboarding_complete) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <CheckCircle className="w-16 h-16 text-primary" />
        <h2 className="text-xl font-semibold">Jesteś już twórcą!</h2>
        <p className="text-muted-foreground text-sm">Konto Stripe Connect jest aktywne ✅</p>
        <Button onClick={() => navigate('/creator-dashboard')} className="bg-accent hover:bg-accent/90 text-accent-foreground">Przejdź do panelu twórcy</Button>
      </div>
    );
  }

  // Creator exists but needs Stripe Connect
  if (isCreator && !success) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 bg-card border-b border-border">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4 mr-1" /> Wróć</Button>
            <Logo size="sm" />
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 py-12 space-y-8">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto">
              <CreditCard className="w-8 h-8 text-accent" />
            </div>
            <h1 className="text-2xl font-bold">Podłącz płatności</h1>
            <p className="text-muted-foreground">
              Aby otrzymywać wypłaty ze sprzedaży tras, musisz podłączyć konto Stripe Connect.
            </p>
          </div>

          {connectChecking ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <div className="bg-card rounded-xl p-6 shadow-sm space-y-4">
              {connectStatus?.connected && !connectStatus.onboarding_complete && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800">
                  <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-yellow-800 dark:text-yellow-200">Onboarding niekompletny</p>
                    <p className="text-yellow-700 dark:text-yellow-300 mt-1">Dokończ konfigurację konta Stripe, aby móc otrzymywać wypłaty.</p>
                  </div>
                </div>
              )}

              <Button
                onClick={handleStripeConnect}
                disabled={connectLoading}
                className="w-full bg-[#635bff] hover:bg-[#5851db] text-white"
              >
                {connectLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4 mr-2" />
                )}
                {connectStatus?.connected ? 'Dokończ konfigurację Stripe' : 'Podłącz konto Stripe Connect'}
              </Button>

              <Button variant="ghost" onClick={() => navigate('/creator-dashboard')} className="w-full">
                Pomiń na razie → Panel twórcy
              </Button>
            </div>
          )}

          <div className="bg-muted/50 rounded-xl p-5 space-y-3">
            <h3 className="font-semibold text-sm">Dlaczego Stripe Connect?</h3>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li>✅ Bezpieczne wypłaty bezpośrednio na Twoje konto</li>
              <li>✅ 65% z każdej sprzedaży trafia do Ciebie</li>
              <li>✅ Automatyczne rozliczenia i raporty</li>
              <li>✅ Obsługiwane przez Stripe — lidera płatności online</li>
            </ul>
          </div>
        </main>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-4">
        <CheckCircle className="w-20 h-20 text-primary" />
        <h1 className="text-2xl font-bold">Gratulacje! 🎉</h1>
        <p className="text-muted-foreground text-center max-w-md">Twoje konto twórcy zostało aktywowane. Teraz podłącz Stripe Connect, aby otrzymywać wypłaty.</p>
        <div className="flex gap-3">
          <Button onClick={handleStripeConnect} disabled={connectLoading} className="bg-[#635bff] hover:bg-[#5851db] text-white">
            {connectLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
            Podłącz Stripe
          </Button>
          <Button variant="outline" onClick={() => navigate('/creator-dashboard')}>
            Później
          </Button>
        </div>
      </div>
    );
  }

  async function handleStripeConnect() {
    setConnectLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-connect-account', {
        body: { origin: window.location.origin },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      toast.error(err.message || 'Nie udało się połączyć ze Stripe');
    } finally {
      setConnectLoading(false);
    }
  }

  const handleSubmit = async () => {
    if (!displayName.trim()) {
      toast.error('Podaj nazwę wyświetlaną');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('become-creator', {
        body: { display_name: displayName, bio },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await refetch();
      setSuccess(true);
      toast.success('Konto twórcy zostało aktywowane!');
    } catch (err: any) {
      toast.error(err.message || 'Nie udało się aktywować konta twórcy');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4 mr-1" /> Wróć</Button>
          <Logo size="sm" />
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-12 space-y-8">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto">
            <Sparkles className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-2xl font-bold">Zostań twórcą</h1>
          <p className="text-muted-foreground">Dziel się swoimi trasami ze społecznością i zarabiaj 65% z każdej sprzedaży.</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 text-sm">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 text-accent font-medium">
            <span className="w-5 h-5 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs">1</span>
            Profil twórcy
          </div>
          <div className="w-8 h-px bg-border" />
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-muted-foreground">
            <span className="w-5 h-5 rounded-full bg-muted-foreground/20 flex items-center justify-center text-xs">2</span>
            Stripe Connect
          </div>
        </div>

        <div className="bg-card rounded-xl p-6 shadow-sm space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Nazwa wyświetlana *</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jak chcesz się nazywać jako twórca?"
              maxLength={50}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">O Tobie</label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Krótki opis — co Cię inspiruje, jakie trasy tworzysz..."
              rows={3}
              maxLength={500}
            />
          </div>
          <Button onClick={handleSubmit} disabled={submitting} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {submitting ? 'Aktywowanie...' : 'Dalej — Aktywuj i podłącz Stripe'}
          </Button>
        </div>

        <div className="bg-muted/50 rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-sm">Co zyskujesz jako twórca?</h3>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li>✅ Publikuj i sprzedawaj trasy GPX</li>
            <li>✅ 65% prowizji z każdej sprzedaży</li>
            <li>✅ Panel ze statystykami i zarobkami</li>
            <li>✅ Automatyczne wypłaty przez Stripe</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
