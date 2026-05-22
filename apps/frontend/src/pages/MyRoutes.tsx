import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Logo from '@/components/Logo';
import Footer from '@/components/Footer';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPurchases } from '@/hooks/use-purchases';
import { useRouteById } from '@/hooks/use-routes';
import { useRoutePdfs } from '@/hooks/use-route-pdfs';
import { getLanguageFlag, getLanguageName } from '@/lib/languages';
import { fetchPurchaseAccess } from '@/lib/purchase-access';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft, ShoppingBag, Loader2, Download, FileText, MapPin,
  ExternalLink, HelpCircle, Mail, MessageCircle, CloudSun, Shield,
  AlertTriangle, Search,
} from 'lucide-react';
import { toast } from 'sonner';

function openDownload(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function PurchasedRouteCard({ purchase }: { purchase: any }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: route } = useRouteById(purchase.route_id);
  const { data: pdfs = [] } = useRoutePdfs(purchase.route_id);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  if (!route) return null;

  const handleDownloadGpx = async () => {
    setLoadingKey('gpx');
    try {
      const access = await fetchPurchaseAccess({ routeId: purchase.route_id });
      if (!access.gpx_download?.url) { toast.error(t('purchases.gpx_no_file')); return; }
      openDownload(access.gpx_download.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('purchases.download_error_gpx'));
    } finally { setLoadingKey(null); }
  };

  const handleDownloadPdf = async (languageCode?: string) => {
    setLoadingKey(languageCode ?? 'pdf');
    try {
      const access = await fetchPurchaseAccess({ routeId: purchase.route_id });
      const pdf = access.pdf_downloads.find((item) => (item.language_code ?? 'default') === (languageCode ?? 'default'))
        ?? access.pdf_downloads[0];
      if (!pdf?.url) { toast.error(t('purchases.pdf_no_file')); return; }
      openDownload(pdf.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('purchases.download_error_pdf'));
    } finally { setLoadingKey(null); }
  };

  const purchaseDate = new Date(purchase.purchased_at).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <div className="group bg-card rounded-xl border border-border/60 shadow-token-sm hover:shadow-token-md transition-shadow overflow-hidden">
      {/* Cover image */}
      <div
        className="relative aspect-[16/7] sm:aspect-[16/6] cursor-pointer overflow-hidden"
        onClick={() => navigate(`/route/${route.id}`)}
      >
        <img
          src={route.cover_image_key}
          alt={route.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-4 right-4">
          <h3 className="text-white font-bold text-lg leading-snug drop-shadow-sm line-clamp-1">
            {route.title}
          </h3>
          <div className="flex items-center gap-1.5 mt-1 text-white/80 text-sm">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="line-clamp-1">{route.location_string}</span>
          </div>
        </div>
        {route.difficulty && (
          <Badge className="absolute top-3 right-3 capitalize text-[11px]" variant="secondary">
            {route.difficulty}
          </Badge>
        )}
      </div>

      {/* Content */}
      <div className="p-4 sm:p-5">
        {/* Meta row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{purchaseDate}</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
            <Badge variant="outline" className="text-xs font-medium">
              {Number(purchase.amount_paid).toFixed(2)} zł
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-primary min-h-[44px] min-w-[44px] -mr-2"
            onClick={() => navigate(`/route/${route.id}`)}
            title={t('purchases.view_route', 'View route')}
          >
            <ExternalLink className="w-4 h-4" />
          </Button>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => navigate(`/route/${route.id}`)}
            className="gap-1.5 min-h-[44px]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {t('purchases.open_route', 'Open route')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadGpx}
            disabled={loadingKey === 'gpx'}
            className="gap-1.5 min-h-[44px]"
          >
            {loadingKey === 'gpx' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            GPX
          </Button>
          {pdfs.length > 0 ? (
            pdfs.map((p) => (
              <Button
                key={p.language_code}
                size="sm"
                variant="outline"
                onClick={() => handleDownloadPdf(p.language_code)}
                disabled={loadingKey === p.language_code}
                className="gap-1.5 min-h-[44px]"
              >
                {loadingKey === p.language_code ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                {getLanguageFlag(p.language_code)} {getLanguageName(p.language_code)}
              </Button>
            ))
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDownloadPdf()}
              disabled={loadingKey === 'pdf'}
              className="gap-1.5 min-h-[44px]"
            >
              {loadingKey === 'pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              PDF
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MyRoutes() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, login, loading: authLoading } = useAuth();
  const { data: purchases, isLoading } = useUserPurchases(user?.id);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const syncPurchases = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('sync-purchases', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (!cancelled && !error && data?.syncedCount) {
        await queryClient.invalidateQueries({ queryKey: ['purchases', user.id] });
      }
    };
    syncPurchases();
    return () => { cancelled = true; };
  }, [queryClient, user?.id]);

  if (authLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <ShoppingBag className="w-16 h-16 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold text-muted-foreground">{t('purchases.login_to_view')}</h2>
        <Button onClick={login} className="bg-accent hover:bg-accent/90 text-accent-foreground">{t('common.login')}</Button>
      </div>
    );
  }

  const hasPurchases = purchases && purchases.length > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mr-2 min-h-[44px] min-w-[44px]">
            <ChevronLeft className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">{t('common.back')}</span>
          </Button>
          <Logo size="sm" />
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6">
        {/* Page title */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{t('purchases.title')}</h1>
          {hasPurchases && (
            <p className="text-sm text-muted-foreground mt-1">
              {t('purchases.count', { count: purchases.length, defaultValue: '{{count}} purchased routes' })}
            </p>
          )}
        </div>

        {/* ── Safety reminder banner ── */}
        {hasPurchases && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-300/50 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-700/40 px-4 py-3.5">
            <CloudSun className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                {t('purchases.weather_reminder', 'Verify weather and current route conditions before departure.')}
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/70 mt-0.5">
                {t('purchases.weather_reminder_sub', 'Trail conditions can change rapidly. Always check local forecasts and alerts.')}
              </p>
            </div>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : hasPurchases ? (
          <>
            {/* Route cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              {purchases.map((p) => (
                <PurchasedRouteCard key={p.id} purchase={p} />
              ))}
            </div>

            {/* Support & Help section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
              {/* Help block */}
              <div className="bg-card rounded-xl border border-border/60 shadow-token-sm p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <HelpCircle className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-1">{t('purchases.need_help', 'Need help with a purchase?')}</h3>
                    <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                      {t('purchases.support_description', 'Issues downloading files or accessing routes? We\'re here to help.')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="gap-1.5 min-h-[44px]">
                        <Mail className="w-3.5 h-3.5" /> {t('purchases.contact_support', 'Contact')}
                      </Button>
                      <Button variant="ghost" size="sm" className="gap-1.5 min-h-[44px] text-muted-foreground">
                        <MessageCircle className="w-3.5 h-3.5" /> {t('purchases.faq', 'FAQ')}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Refund & safety block */}
              <div className="bg-card rounded-xl border border-border/60 shadow-token-sm p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-1">{t('purchases.safety_refunds', 'Safety & Refunds')}</h3>
                    <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                      {t('purchases.safety_refunds_desc', 'Review safety info before each trip. Damaged or incorrect files may qualify for a refund.')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Link to="/legal/refunds">
                        <Button variant="outline" size="sm" className="gap-1.5 min-h-[44px]">
                          <AlertTriangle className="w-3.5 h-3.5" /> {t('purchases.refund_policy', 'Refund policy')}
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* ── Empty state ── */
          <div className="text-center py-16 sm:py-24">
            <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-6">
              <ShoppingBag className="w-10 h-10 text-muted-foreground/30" />
            </div>
            <h3 className="text-xl font-semibold">{t('purchases.no_purchases')}</h3>
            <p className="text-muted-foreground mt-2 mb-8 max-w-md mx-auto text-sm leading-relaxed">
              {t('purchases.no_purchases_hint', 'Explore our marketplace to find curated routes with GPX tracks and PDF guides.')}
            </p>
            <Button
              onClick={() => navigate('/')}
              className="bg-accent hover:bg-accent/90 text-accent-foreground min-h-[44px] px-6 gap-2"
            >
              <Search className="w-4 h-4" />
              {t('purchases.browse_routes', 'Browse routes')}
            </Button>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
