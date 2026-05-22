import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CheckCircle, Download, FileText, Home, Loader2, MapPin, ShoppingBag } from 'lucide-react';
import { fetchPurchaseAccess, type PurchaseAccessData } from '@/lib/purchase-access';
import { getLanguageFlag, getLanguageName } from '@/lib/languages';
import { trackEvent } from '@/lib/analytics';

function openDownload(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function PaymentSuccess() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [purchaseAccess, setPurchaseAccess] = useState<PurchaseAccessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      setError(t('payment.no_session'));
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadPurchase = async () => {
      try {
        const data = await fetchPurchaseAccess({ sessionId });
        if (!cancelled) {
          setPurchaseAccess(data);
          trackEvent({
            event: 'checkout_completed',
            routeId: data.route?.id,
            metadata: { session_id: sessionId },
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('payment.fetch_error'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadPurchase();

    return () => {
      cancelled = true;
    };
  }, [searchParams, t]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t('payment.confirming')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-4">
      <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
        <CheckCircle className="w-10 h-10 text-accent" />
      </div>
      <h1 className="text-2xl font-bold">{t('payment.success_title')}</h1>
      {error ? (
        <p className="text-muted-foreground text-center max-w-md">{error}</p>
      ) : purchaseAccess ? (
        <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
          <div className="space-y-2 text-center">
            <h2 className="text-xl font-semibold">{purchaseAccess.route.title}</h2>
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4" />
              {purchaseAccess.route.location_string}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('payment.purchased_on', { date: new Date(purchaseAccess.purchase.purchased_at).toLocaleDateString('pl-PL'), amount: Number(purchaseAccess.purchase.amount_paid).toFixed(2) })}
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">{t('payment.download_files')}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {purchaseAccess.gpx_download && (
                <Button variant="outline" onClick={() => openDownload(purchaseAccess.gpx_download!.url)}>
                  <Download className="w-4 h-4 mr-2" /> GPX Track
                </Button>
              )}
              {purchaseAccess.pdf_downloads.map((pdf) => (
                <Button key={pdf.file_key} variant="outline" onClick={() => openDownload(pdf.url)}>
                  <FileText className="w-4 h-4 mr-2" />
                  {pdf.language_code ? `${getLanguageFlag(pdf.language_code)} ${getLanguageName(pdf.language_code)}` : 'PDF'}
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="outline" onClick={() => navigate('/')}><Home className="w-4 h-4 mr-2" /> {t('payment.go_home')}</Button>
        <Button onClick={() => navigate('/my-routes')} className="bg-accent hover:bg-accent/90 text-accent-foreground"><ShoppingBag className="w-4 h-4 mr-2" /> {t('payment.my_routes')}</Button>
      </div>
    </div>
  );
}
