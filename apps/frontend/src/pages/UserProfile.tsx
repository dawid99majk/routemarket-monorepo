import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Logo from '@/components/Logo';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { LANGUAGES } from '@/lib/languages';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, User, Mail, Shield, Loader2, Package, CreditCard, DollarSign, Sparkles, Pencil, Check, X, LogOut, Globe, Link2, ExternalLink, CheckCircle2, AlertCircle,
} from 'lucide-react';

function StripeConnectStatus({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: creatorProfile, isLoading: loadingProfile, refetch: refetchProfile } = useQuery({
    queryKey: ['creator-profile-stripe', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('creator_profiles')
        .select('stripe_connect_account_id, stripe_onboarding_complete, total_earnings, total_sales')
        .eq('user_id', userId)
        .maybeSingle();
      return data;
    },
  });

  const { data: stripeStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['stripe-connect-status', userId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('create-connect-account', {
        body: { action: 'check-status', origin: window.location.origin },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (res.error) throw res.error;
      return res.data as { connected: boolean; charges_enabled?: boolean; payouts_enabled?: boolean; onboarding_complete?: boolean } | null;
    },
    staleTime: 60_000,
  });

  const startOnboarding = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('create-connect-account', {
        body: { origin: window.location.origin },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (res.error) throw res.error;
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        toast.error(res.data?.error || t('stripe.onboarding_error'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('stripe.connection_error'));
    }
  };

  if (loadingProfile) return null;

  const hasAccount = !!creatorProfile?.stripe_connect_account_id || !!stripeStatus?.connected;
  const isComplete = !!creatorProfile?.stripe_onboarding_complete || !!stripeStatus?.onboarding_complete;

  return (
    <div className="bg-card rounded-xl p-6 shadow-sm">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Link2 className="w-5 h-5 text-primary" /> {t('stripe.title')}
      </h2>
      <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
        {isComplete ? (
          <>
            <CheckCircle2 className="w-6 h-6 text-accent shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{t('stripe.account_active')}</p>
              <p className="text-xs text-muted-foreground">{t('stripe.active_desc')}</p>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span>{t('stripe.sales_count')}: <strong className="text-foreground">{creatorProfile?.total_sales ?? 0}</strong></span>
                <span>{t('stripe.earnings_label')}: <strong className="text-foreground">{Number(creatorProfile?.total_earnings ?? 0).toFixed(2)} zł</strong></span>
              </div>
            </div>
          </>
        ) : hasAccount ? (
          <>
            <AlertCircle className="w-6 h-6 text-primary shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{t('stripe.onboarding_incomplete')}</p>
              <p className="text-xs text-muted-foreground">{t('stripe.finish_desc')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={startOnboarding} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                  <ExternalLink className="w-3.5 h-3.5 mr-1" /> {t('stripe.finish_onboarding')}
                </Button>
                <Button size="sm" variant="outline" onClick={async () => { await refetchProfile(); await refetchStatus(); }}>
                  {t('common.refresh_status')}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <AlertCircle className="w-6 h-6 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">{t('stripe.no_account')}</p>
              <p className="text-xs text-muted-foreground">{t('stripe.no_account_desc')}</p>
              <Button size="sm" onClick={startOnboarding} className="mt-2 bg-accent hover:bg-accent/90 text-accent-foreground">
                <ExternalLink className="w-3.5 h-3.5 mr-1" /> {t('stripe.connect_stripe')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function UserProfile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout, loading: authLoading, refetch } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [primaryLanguage, setPrimaryLanguage] = useState('en');
  const [savingLang, setSavingLang] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  useEffect(() => {
    if (user) {
      supabase
        .from('profiles')
        .select('display_name, primary_language')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          setDisplayName(data?.display_name || user.name || '');
          setPrimaryLanguage(data?.primary_language || 'en');
        });
    }
  }, [user]);

  const saveDisplayName = async () => {
    if (!user || !displayName.trim()) return;
    setSavingName(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() })
      .eq('user_id', user.id);
    setSavingName(false);
    if (error) {
      toast.error(t('profile.name_save_error'));
    } else {
      toast.success(t('profile.name_save_success'));
      setEditingName(false);
      await refetch();
    }
  };

  const saveLanguage = async (code: string) => {
    if (!user) return;
    setPrimaryLanguage(code);
    setSavingLang(true);
    const { error } = await supabase
      .from('profiles')
      .update({ primary_language: code })
      .eq('user_id', user.id);
    setSavingLang(false);
    if (error) {
      toast.error(t('profile.lang_save_error'));
    } else {
      toast.success(t('profile.lang_save_success'));
    }
  };

  const saveEmail = async () => {
    if (!user || !newEmail.trim()) return;
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setSavingEmail(false);
    if (error) {
      toast.error(error.message || t('profile.email_save_error'));
    } else {
      toast.success(t('profile.email_confirm_sent'));
      setEditingEmail(false);
      setNewEmail('');
    }
  };

  if (authLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <User className="w-16 h-16 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold text-muted-foreground">{t('profile.login_to_view')}</h2>
        <Button onClick={() => navigate('/auth')} className="bg-accent hover:bg-accent/90 text-accent-foreground">{t('common.login')}</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mr-4"><ArrowLeft className="w-4 h-4 mr-1" /> {t('common.home')}</Button>
            <Logo size="sm" />
          </div>
          <Button variant="ghost" size="sm" onClick={async () => { await logout(); navigate('/'); }} className="text-destructive hover:text-destructive hover:bg-destructive/10">
            <LogOut className="w-4 h-4 mr-1" /> {t('common.logout')}
          </Button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold">{t('profile.title')}</h1>
        <div className="bg-card rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Shield className="w-5 h-5 text-primary" /> {t('profile.account_info')}</h2>
          <div className="space-y-4">
            {/* Display name */}
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <User className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">{t('profile.username')}</p>
                {editingName ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="h-8 text-sm" placeholder={t('profile.username_placeholder')} maxLength={50} />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveDisplayName} disabled={savingName}>
                      {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-primary" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingName(false)}><X className="w-4 h-4" /></Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{displayName || t('profile.not_set')}</p>
                    <button onClick={() => setEditingName(true)} className="text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            </div>

            {/* Email */}
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Mail className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">{t('profile.email')}</p>
                {editingEmail ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="h-8 text-sm" placeholder={t('profile.new_email_placeholder')} type="email" />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveEmail} disabled={savingEmail}>
                      {savingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-primary" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingEmail(false); setNewEmail(''); }}><X className="w-4 h-4" /></Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{user.email}</p>
                    <button onClick={() => { setEditingEmail(true); setNewEmail(user.email || ''); }} className="text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            </div>

            {/* Primary language */}
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Globe className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">{t('profile.primary_language')}</p>
                <div className="mt-1">
                  <Select value={primaryLanguage} onValueChange={saveLanguage} disabled={savingLang}>
                    <SelectTrigger className="h-8 text-sm w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {LANGUAGES.map(l => (
                        <SelectItem key={l.code} value={l.code}>
                          {l.flag} {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Role */}
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Shield className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t('profile.role')}</p>
                <Badge variant="secondary" className="mt-0.5">{user.roles?.join(', ') || 'user'}</Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Stripe Connect status for creators */}
        {(user.roles?.includes('creator') || user.roles?.includes('admin')) && (
          <StripeConnectStatus userId={user.id} />
        )}

        {!user.roles?.includes('creator') && !user.roles?.includes('admin') && (
          <div className="bg-gradient-to-r from-accent/10 via-accent/5 to-primary/10 rounded-xl p-6 shadow-sm border border-accent/20">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center shrink-0"><Sparkles className="w-6 h-6 text-accent" /></div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold">{t('creator.become_cta')}</h2>
                <p className="text-sm text-muted-foreground mt-1">{t('creator.earn_share')}</p>
                <Button onClick={() => navigate('/become-creator')} className="mt-3 bg-accent hover:bg-accent/90 text-accent-foreground"><Sparkles className="w-4 h-4 mr-2" /> {t('creator.become_cta')}</Button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: Package, label: t('profile.published_routes'), value: '0', color: 'bg-primary/10 text-primary' },
            { icon: CreditCard, label: t('profile.purchased_routes'), value: '0', color: 'bg-blue-50 text-blue-500' },
            { icon: DollarSign, label: t('profile.total_earnings'), value: '0 zł', color: 'bg-accent/10 text-accent' },
          ].map(({ icon: I, label, value, color }) => (
            <div key={label} className="bg-card rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}><I className="w-5 h-5" /></div>
                <div><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
