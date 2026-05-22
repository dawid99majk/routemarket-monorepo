import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './dialog';
import { Button } from './button';
import { useAuth } from '@/contexts/AuthContext';
import { useProfileBalance } from '@/hooks/use-profile-balance';
import { Coins, Sparkles, AlertTriangle, ArrowRight, Loader2, Check } from 'lucide-react';
import { TopUpModal } from './TopUpModal';

interface TokenPurchaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routeId: number;
  routeTitle: string;
  creatorId: string;
  creatorName: string;
  onSuccess?: () => void;
}

export const TokenPurchaseModal: React.FC<TokenPurchaseModalProps> = ({
  open,
  onOpenChange,
  routeId,
  routeTitle,
  creatorId,
  creatorName,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { balance, isLoading: balanceLoading, buyRoute } = useProfileBalance(user?.id);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const price = 5;
  const currentTokens = balance?.token_balance ?? 0;
  const hasEnoughTokens = currentTokens >= price;

  const handlePurchase = async () => {
    if (!user) return;
    try {
      await buyRoute.mutateAsync({
        routeId,
        creatorId,
        price,
      });
      setIsSuccess(true);
      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 1500);
      }
    } catch (err) {
      // toast notification is already handled inside the hook
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // delay reset of success state
    setTimeout(() => setIsSuccess(false), 200);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(val) => { if (!val) handleClose(); else onOpenChange(val); }}>
        <DialogContent className="max-w-md w-full p-0 overflow-hidden border border-border/80 glass-premium rounded-2xl shadow-token-xl dark:bg-card">
          
          {isSuccess ? (
            /* SUCCESS STATE */
            <div className="p-8 text-center space-y-5">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto badge-glow-primary">
                <Check className="w-6.5 h-6.5 stroke-[3]" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-xl font-bold text-foreground">Trasa odblokowana!</h3>
                <p className="text-xs text-muted-foreground">
                  Pobrano <strong className="text-foreground font-semibold">{price} tokenów</strong> z Twojego salda.
                </p>
              </div>

              <div className="bg-emerald-500/[0.03] border border-emerald-500/20 p-4 rounded-xl space-y-1 text-xs text-emerald-800 dark:text-emerald-300 max-w-sm mx-auto text-left">
                <p className="font-semibold">Transakcja zaksięgowana:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                  <li>4 tokeny trafiły bezpośrednio do portfela twórcy: <strong>{creatorName}</strong></li>
                  <li>1 token zasilił prowizję operacyjną platformy</li>
                </ul>
              </div>

              <Button 
                onClick={handleClose}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/95 min-h-[44px]"
              >
                Super, przejdź do szczegółów
              </Button>
            </div>
          ) : (
            /* PURCHASE DETAILS */
            <div className="p-6 space-y-5">
              <DialogHeader className="space-y-1">
                <DialogTitle className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                  Odblokuj trasę premium
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
                  Trasa: <span className="font-semibold text-foreground">{routeTitle}</span> od <span className="font-semibold text-foreground">{creatorName}</span>
                </DialogDescription>
              </DialogHeader>

              {/* Price Details */}
              <div className="bg-muted/40 p-4 border border-border/80 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground">Koszt odblokowania</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Coins className="w-5 h-5 text-accent" />
                    <span className="text-xl font-extrabold text-foreground font-mono">{price} Tokenów</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-muted-foreground">Twoje saldo</span>
                  <div className="flex items-center gap-1.5 justify-end mt-0.5">
                    <Coins className="w-4 h-4 text-accent/80" />
                    {balanceLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <span className="text-base font-bold text-foreground font-mono">{currentTokens}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Domain Economy Explainers */}
              <div className="text-[11px] text-muted-foreground space-y-1.5 px-1 bg-accent/5 p-3 rounded-lg border border-accent/10">
                <div className="flex items-start gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                  <p>
                    <strong>Bezpośrednie wsparcie twórcy:</strong> Pobierając gotowy plik GPX, 80% kwoty (4 tokeny) przekazujesz bezpośrednio do autora trasy! Wspierasz rozwój społeczności.
                  </p>
                </div>
              </div>

              {/* Insufficient Tokens Warning */}
              {!balanceLoading && !hasEnoughTokens && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-xl flex gap-3 text-amber-800 dark:text-amber-300 text-xs">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1">
                    <p className="font-semibold">Niewystarczająca liczba tokenów</p>
                    <p className="text-muted-foreground leading-relaxed">
                      Potrzebujesz <strong>{price} tokenów</strong>, aby odblokować tę trasę. Posiadasz jedynie {currentTokens}.
                    </p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleClose}
                  className="flex-1"
                >
                  Anuluj
                </Button>
                
                {hasEnoughTokens ? (
                  <Button 
                    onClick={handlePurchase}
                    disabled={buyRoute.isPending}
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/95 min-h-[44px]"
                  >
                    {buyRoute.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Przetwarzanie...
                      </>
                    ) : (
                      'Odblokuj trasę'
                    )}
                  </Button>
                ) : (
                  <Button 
                    onClick={() => setTopUpOpen(true)}
                    className="flex-1 bg-accent text-accent-foreground hover:bg-accent/95 min-h-[44px] gap-1.5 font-bold"
                  >
                    Doładuj tokeny
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          )}

        </DialogContent>
      </Dialog>

      {/* TopUp Modal nested trigger */}
      <TopUpModal open={topUpOpen} onOpenChange={setTopUpOpen} />
    </>
  );
};
