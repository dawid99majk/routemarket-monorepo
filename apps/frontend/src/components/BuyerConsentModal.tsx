import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ShoppingCart, Loader2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

const CONSENT_VERSION = '1.0';

interface BuyerConsentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (consentVersion: string) => void;
  loading?: boolean;
}

const DECLARATION_KEYS = [
  'buyer_consent.risk',
  'buyer_consent.conditions',
  'buyer_consent.weather',
  'buyer_consent.skills',
  'buyer_consent.terms',
] as const;

export default function BuyerConsentModal({ open, onOpenChange, onConfirm, loading }: BuyerConsentModalProps) {
  const { t } = useTranslation();
  const [checks, setChecks] = useState<boolean[]>(new Array(5).fill(false));
  const allChecked = checks.every(Boolean);

  const toggle = (i: number, val: boolean) => {
    setChecks(prev => prev.map((v, idx) => idx === i ? val : v));
  };

  const toggleAll = (val: boolean) => setChecks(new Array(5).fill(val));

  const handleConfirm = () => {
    if (allChecked) onConfirm(CONSENT_VERSION);
  };

  // Reset on close
  const handleOpenChange = (v: boolean) => {
    if (!v) setChecks(new Array(5).fill(false));
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            {t('buyer_consent.title')}
          </DialogTitle>
          <DialogDescription>{t('buyer_consent.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-primary">
            <Checkbox checked={allChecked} onCheckedChange={(c) => toggleAll(c === true)} />
            {t('buyer_consent.select_all')}
          </label>
          <div className="border-t border-border" />
          {DECLARATION_KEYS.map((key, i) => (
            <label key={key} className="flex items-start gap-3 cursor-pointer">
              <Checkbox checked={checks[i]} onCheckedChange={(c) => toggle(i, c === true)} className="mt-0.5" />
              <span className="text-sm text-foreground leading-snug">
                {key === 'buyer_consent.terms' ? (
                  <>
                    {t('buyer_consent.terms_prefix')}{' '}
                    <Link to="/legal/terms" target="_blank" className="underline text-primary hover:text-primary/80">{t('legal.terms')}</Link>
                    {' '}{t('legal.and')}{' '}
                    <Link to="/legal/refunds" target="_blank" className="underline text-primary hover:text-primary/80">{t('legal.refunds')}</Link>.
                  </>
                ) : t(key)}
              </span>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleConfirm} disabled={!allChecked || loading} className="bg-accent hover:bg-accent/90 text-accent-foreground">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-2" />}
            {t('buyer_consent.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
