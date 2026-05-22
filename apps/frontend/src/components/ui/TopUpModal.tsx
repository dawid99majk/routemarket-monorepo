import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs';
import { Card, CardContent } from './card';
import { Button } from './button';
import { useAuth } from '@/contexts/AuthContext';
import { useProfileBalance } from '@/hooks/use-profile-balance';
import { Coins, Sparkles, CreditCard, ShieldCheck, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';

interface TopUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TopUpModal: React.FC<TopUpModalProps> = ({ open, onOpenChange }) => {
  const { user } = useAuth();
  const { topUpCredits, topUpTokens } = useProfileBalance(user?.id);
  const [activeTab, setActiveTab] = useState<'credits' | 'tokens'>('credits');
  
  // Checkout simulation states
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [selectedPack, setSelectedPack] = useState<{
    id: string;
    name: string;
    amount: number;
    cost: number;
    type: 'credits' | 'tokens';
  } | null>(null);

  const [paymentStep, setPaymentStep] = useState<'select' | 'payment' | 'success'>('select');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');

  const creditPacks = [
    { id: 'c1', name: 'Zestaw Startowy', amount: 50, cost: 19, desc: 'Dobre na stworzenie ok. 2 tras AI' },
    { id: 'c2', name: 'Rekomendowany Creator', amount: 100, cost: 29, desc: 'Optymalny do pełnego stworzenia 4 tras w studio', popular: true },
    { id: 'c3', name: 'Studio Master', amount: 250, cost: 59, desc: 'Dla aktywnych twórców (ok. 10 tras + Deep Research)' },
  ];

  const tokenPacks = [
    { id: 't1', name: 'Pakiet Odkrywcy', amount: 10, cost: 9, desc: 'Dobre na pobranie 2 gotowych tras GPX' },
    { id: 't2', name: 'Paczka Przygody', amount: 25, cost: 19, desc: 'Pozwala na odblokowanie 5 zaawansowanych tras', popular: true },
    { id: 't3', name: 'Globetrotter Gold', amount: 50, cost: 29, desc: 'Bezlimitowy dostęp do najlepszych tras na rynku' },
  ];

  const handleSelectPack = (pack: typeof creditPacks[0] | typeof tokenPacks[0], type: 'credits' | 'tokens') => {
    setSelectedPack({
      id: pack.id,
      name: pack.name,
      amount: pack.amount,
      cost: pack.cost,
      type
    });
    setPaymentStep('payment');
  };

  const handleSimulatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPack || !user) return;

    setIsCheckingOut(true);
    // Simulate secure network transaction delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    try {
      if (selectedPack.type === 'credits') {
        await topUpCredits.mutateAsync({
          amount: selectedPack.amount,
          costPln: selectedPack.cost
        });
      } else {
        await topUpTokens.mutateAsync({
          amount: selectedPack.amount,
          costPln: selectedPack.cost
        });
      }
      setPaymentStep('success');
    } catch (err) {
      toast.error('Wystąpił błąd podczas autoryzacji karty płatniczej.');
    } finally {
      setIsCheckingOut(false);
    }
  };

  const resetState = () => {
    setPaymentStep('select');
    setSelectedPack(null);
    setCardNumber('');
    setCardExpiry('');
    setCardCvc('');
    setIsCheckingOut(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    // Delay resetting state slightly so it is invisible to user while closing
    setTimeout(resetState, 200);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) handleClose(); else onOpenChange(val); }}>
      <DialogContent className="max-w-md w-full p-0 overflow-hidden border border-border/80 glass-premium rounded-2xl shadow-token-xl dark:bg-card">
        
        {/* STEP 1: CHOOSE PACKAGE */}
        {paymentStep === 'select' && (
          <div className="p-6 space-y-6">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Doładowanie portfela RouteMarket
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
                Wybierz pakiet kredytów do Magic AI Creator lub tokeny do pobierania tras turystycznych.
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="credits" onValueChange={(val) => setActiveTab(val as any)}>
              <TabsList className="grid grid-cols-2 h-11 bg-muted/60 p-1 rounded-full border border-border/50">
                <TabsTrigger value="credits" className="rounded-full flex items-center justify-center gap-1.5 text-xs sm:text-sm py-2">
                  <Sparkles className="w-3.5 h-3.5" /> Kredyty Creator
                </TabsTrigger>
                <TabsTrigger value="tokens" className="rounded-full flex items-center justify-center gap-1.5 text-xs sm:text-sm py-2">
                  <Coins className="w-3.5 h-3.5" /> Tokeny Pobierania
                </TabsTrigger>
              </TabsList>

              {/* CREDITS CONTENT */}
              <TabsContent value="credits" className="space-y-3 mt-4">
                <p className="text-[11px] text-muted-foreground italic px-1">
                  Kredyty służą do zasilania kreatora Magic AI (25 kredytów za generowanie standardowe, 50 za Gemini Deep Research).
                </p>
                {creditPacks.map((pack) => (
                  <Card 
                    key={pack.id} 
                    className={`relative overflow-hidden cursor-pointer hover:border-primary hover-lift border transition-all duration-300 ${
                      pack.popular ? 'border-primary/60 bg-primary/[0.02] dark:bg-primary/[0.04]' : 'border-border/80 bg-card'
                    }`}
                    onClick={() => handleSelectPack(pack, 'credits')}
                  >
                    {pack.popular && (
                      <span className="absolute top-0 right-0 bg-primary text-primary-foreground text-[9px] font-bold px-2 py-0.5 rounded-bl">
                        Najczęściej kupowany
                      </span>
                    )}
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <h4 className="font-bold text-sm sm:text-base flex items-center gap-1.5 text-foreground">
                          <Sparkles className="w-4 h-4 text-primary" /> {pack.amount} Kredytów
                        </h4>
                        <p className="text-[11px] text-muted-foreground font-normal">{pack.desc}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-lg font-extrabold text-foreground">{pack.cost} PLN</span>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Płatność jednorazowa</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              {/* TOKENS CONTENT */}
              <TabsContent value="tokens" className="space-y-3 mt-4">
                <p className="text-[11px] text-muted-foreground italic px-1">
                  Tokeny służą do pobierania gotowych tras (5 tokenów za pobranie. 4 trafiają bezpośrednio do portfela twórcy trasy!).
                </p>
                {tokenPacks.map((pack) => (
                  <Card 
                    key={pack.id} 
                    className={`relative overflow-hidden cursor-pointer hover:border-accent hover-lift border transition-all duration-300 ${
                      pack.popular ? 'border-accent/60 bg-accent/[0.02] dark:bg-accent/[0.04]' : 'border-border/80 bg-card'
                    }`}
                    onClick={() => handleSelectPack(pack, 'tokens')}
                  >
                    {pack.popular && (
                      <span className="absolute top-0 right-0 bg-accent text-accent-foreground text-[9px] font-bold px-2 py-0.5 rounded-bl">
                        Najlepsza opcja
                      </span>
                    )}
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <h4 className="font-bold text-sm sm:text-base flex items-center gap-1.5 text-foreground">
                          <Coins className="w-4 h-4 text-accent" /> {pack.amount} Tokenów
                        </h4>
                        <p className="text-[11px] text-muted-foreground font-normal">{pack.desc}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-lg font-extrabold text-foreground">{pack.cost} PLN</span>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Płatność jednorazowa</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* STEP 2: CHECKOUT CARD PAYMENT */}
        {paymentStep === 'payment' && selectedPack && (
          <div className="p-6 space-y-5">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                Bezpieczna płatność Stripe
              </DialogTitle>
              <DialogDescription className="text-xs">
                Zamawiasz: <strong className="text-foreground">{selectedPack.amount} {selectedPack.type === 'credits' ? 'Kredytów' : 'Tokenów'}</strong> ({selectedPack.name}) za <strong className="text-foreground">{selectedPack.cost} PLN</strong>.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSimulatePayment} className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="card-nr" className="text-xs font-semibold text-muted-foreground">Numer karty</label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input 
                      id="card-nr"
                      required
                      placeholder="4242 4242 4242 4242"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value.replace(/\s?/g, '').replace(/(\d{4})/g, '$1 ').trim())}
                      maxLength={19}
                      className="w-full h-10 pl-10 pr-3 rounded-lg border border-border/80 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="card-exp" className="text-xs font-semibold text-muted-foreground">Termin ważności</label>
                    <input 
                      id="card-exp"
                      required
                      placeholder="MM/YY"
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      maxLength={5}
                      className="w-full h-10 px-3 rounded-lg border border-border/80 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary text-center"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="card-cvc" className="text-xs font-semibold text-muted-foreground">Kod CVC</label>
                    <input 
                      id="card-cvc"
                      required
                      placeholder="CVC"
                      type="password"
                      value={cardCvc}
                      onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, ''))}
                      maxLength={3}
                      className="w-full h-10 px-3 rounded-lg border border-border/80 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary text-center"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Bezpieczne połączenie szyfrowane SSL (256-bit).</span>
              </div>

              <div className="flex gap-2 pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  disabled={isCheckingOut}
                  onClick={() => setPaymentStep('select')}
                  className="flex-1"
                >
                  Wstecz
                </Button>
                <Button 
                  type="submit" 
                  disabled={isCheckingOut}
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/95 min-h-[44px]"
                >
                  {isCheckingOut ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Przetwarzanie...
                    </>
                  ) : (
                    `Zapłać ${selectedPack.cost} PLN`
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 3: TRANSACTION SUCCESS */}
        {paymentStep === 'success' && selectedPack && (
          <div className="p-8 text-center space-y-5">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto badge-glow-primary">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xl font-bold text-foreground">Transakcja zakończona sukcesem!</h3>
              <p className="text-xs text-muted-foreground">
                Zasilono Twój profil o <strong className="text-foreground font-semibold">{selectedPack.amount} {selectedPack.type === 'credits' ? 'Kredytów Magic Creator' : 'Tokenów Odkrywcy'}</strong>.
              </p>
            </div>

            <div className="bg-muted/40 p-4 border border-border/80 rounded-xl space-y-1.5 text-xs text-muted-foreground max-w-sm mx-auto">
              <div className="flex justify-between">
                <span>Metoda płatności:</span>
                <span className="font-semibold text-foreground">Karta płatnicza (Stripe)</span>
              </div>
              <div className="flex justify-between">
                <span>Numer referencyjny:</span>
                <span className="font-mono text-[10px]">TX-{Math.random().toString(36).substr(2, 9).toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span>Suma:</span>
                <span className="font-semibold text-foreground">{selectedPack.cost}.00 PLN</span>
              </div>
            </div>

            <Button 
              onClick={handleClose}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/95 min-h-[44px]"
            >
              Zamknij i przejdź do profilu
            </Button>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
};
