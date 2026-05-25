import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useProfileBalance } from '@/hooks/use-profile-balance';
import { Button } from '@/components/ui/button';
import { Coins, Sparkles, Plus, Loader2 } from 'lucide-react';
import { TopUpModal } from './TopUpModal';

export const BalanceWidget: React.FC = () => {
  const { user } = useAuth();
  const { balance, isLoading } = useProfileBalance(user?.id);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const unlimitedCredits = balance?.unlimited_credits ?? false;

  if (!user) return null;

  return (
    <div className="flex items-center gap-2 sm:gap-3 bg-muted/40 p-1 pr-2 sm:pr-3 rounded-full border border-border/80 glass-premium shadow-token-xs transition-all duration-300 hover:shadow-token-sm">
      {/* Credits (Kredyty) Pill */}
      <div 
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold select-none cursor-help hover:bg-primary/15 transition-colors"
        title="Kredyty Magic AI (służą do tworzenia tras)"
      >
        <Sparkles className="w-3.5 h-3.5 animate-pulse text-primary shrink-0" />
        <span className="hidden xs:inline">Kredyty:</span>
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <span className={unlimitedCredits ? 'font-semibold' : 'font-mono tabular-nums'}>
            {unlimitedCredits ? 'bez limitu' : balance?.credit_balance ?? 0}
          </span>
        )}
      </div>

      {/* Tokens (Tokeny) Pill */}
      <div 
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold select-none cursor-help hover:bg-accent/15 transition-colors"
        title="Tokeny platformy (służą do pobierania gotowych tras)"
      >
        <Coins className="w-3.5 h-3.5 text-accent shrink-0" />
        <span className="hidden xs:inline">Tokeny:</span>
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <span className="font-mono tabular-nums">{balance?.token_balance ?? 0}</span>
        )}
      </div>

      {/* Buy More Trigger */}
      {!unlimitedCredits && (
        <Button 
          size="icon" 
          variant="ghost" 
          onClick={() => setTopUpOpen(true)}
          className="w-7 h-7 rounded-full bg-background border border-border hover:bg-accent hover:text-accent-foreground hover:border-accent transition-all duration-300 ml-0.5 shrink-0"
          title="Doładuj konto"
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      )}

      {/* TopUp Modal */}
      <TopUpModal open={topUpOpen} onOpenChange={setTopUpOpen} />
    </div>
  );
};
