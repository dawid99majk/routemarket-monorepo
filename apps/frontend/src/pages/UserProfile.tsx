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
import RoutePreferences from '@/components/RoutePreferences';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, User, Mail, Shield, Loader2, Package, MapPin, CalendarDays, Pencil, Check, X, LogOut, Globe, CheckCircle2, AlertCircle,
} from 'lucide-react';

export default function UserProfile() {
  /** Liczby z planera zamiast statystyk sprzedaży. Trzy szybkie zliczenia,
   *  bez pobierania wierszy — profil nie potrzebuje ich treści. */
  const { data: liczby } = useQuery({
    queryKey: ['statystyki-planera'],
    queryFn: async () => {
      // Nazwa tabeli zawezona do tych, ktore faktycznie liczymy — inaczej
      // literowka w nazwie przechodzilaby az do zapytania do bazy.
      const licz = async (tabela: 'trip_projects' | 'trip_project_places' | 'trip_plans') => {
        const { count } = await supabase
          .from(tabela).select('id', { count: 'exact', head: true });
        return count ?? 0;
      };
      const [tablice, miejsca, plany] = await Promise.all([
        licz('trip_projects'), licz('trip_project_places'), licz('trip_plans'),
      ]);
      return { tablice, miejsca, plany };
    },
  });

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
        <div className="bg-card rounded-md p-6 shadow-token-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Shield className="w-5 h-5 text-primary" /> {t('profile.account_info')}</h2>
          <div className="space-y-4">
            {/* Display name */}
            <div className="flex items-center gap-3 p-3 bg-muted rounded-md">
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
            <div className="flex items-center gap-3 p-3 bg-muted rounded-md">
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
            <div className="flex items-center gap-3 p-3 bg-muted rounded-md">
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
            <div className="flex items-center gap-3 p-3 bg-muted rounded-md">
              <Shield className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t('profile.role')}</p>
                <Badge variant="secondary" className="mt-0.5">{user.roles?.join(', ') || 'user'}</Badge>
              </div>
            </div>
          </div>
        </div>


        <RoutePreferences />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: Package, label: 'Wyjazdy', value: String(liczby?.tablice ?? '—'), color: 'bg-primary/10 text-primary' },
            { icon: MapPin, label: 'Zebrane miejsca', value: String(liczby?.miejsca ?? '—'), color: 'bg-dusty-blue/10 text-dusty-blue' },
            { icon: CalendarDays, label: 'Ułożone plany', value: String(liczby?.plany ?? '—'), color: 'bg-accent/10 text-accent' },
          ].map(({ icon: I, label, value, color }) => (
            <div key={label} className="bg-card rounded-md p-5 shadow-token-sm">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-md flex items-center justify-center ${color}`}><I className="w-5 h-5" /></div>
                <div><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
