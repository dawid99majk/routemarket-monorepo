import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface UserBalance {
  credit_balance: number;
  token_balance: number;
  display_name?: string;
  avatar_url?: string;
  unlimited_credits?: boolean;
}

export function useProfileBalance(userId: string | undefined) {
  const queryClient = useQueryClient();

  // Fetch balance
  const balanceQuery = useQuery<UserBalance>({
    queryKey: ['profile-balance', userId],
    enabled: !!userId,
    queryFn: async () => {
      const [profileResult, rolesResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('credit_balance, token_balance, display_name, avatar_url')
          .eq('user_id', userId!)
          .maybeSingle(),
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId!)
      ]);

      const isAdmin = rolesResult.data?.some((row) => row.role === 'admin') ?? false;

      if (profileResult.error) {
        console.warn('Error fetching balance from profiles:', profileResult.error);
        // Fallback for mock/local testing if migration not fully applied yet
        return { credit_balance: isAdmin ? Number.MAX_SAFE_INTEGER : 100, token_balance: 0, unlimited_credits: isAdmin };
      }

      // Default fallbacks if database returns null or columns are empty
      return {
        credit_balance: isAdmin ? Number.MAX_SAFE_INTEGER : profileResult.data?.credit_balance ?? 100,
        token_balance: profileResult.data?.token_balance ?? 0,
        display_name: profileResult.data?.display_name,
        avatar_url: profileResult.data?.avatar_url,
        unlimited_credits: isAdmin,
      };
    },
  });

  // Top Up Credits mutation
  const topUpCredits = useMutation({
    mutationFn: async ({ amount, costPln }: { amount: number; costPln: number }) => {
      if (!userId) throw new Error('User not logged in');

      const currentBalance = balanceQuery.data?.credit_balance ?? 100;
      const newBalance = currentBalance + amount;

      // 1. Update profiles table
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ credit_balance: newBalance })
        .eq('user_id', userId);

      if (profileErr) throw profileErr;

      // 2. Log credit transaction
      const { error: txErr } = await supabase
        .from('credit_transactions')
        .insert({
          user_id: userId,
          amount: amount,
          purpose: 'topup',
        });

      if (txErr) console.warn('Logged top-up balance but transaction record failed:', txErr);

      return { amount, costPln, newBalance };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['profile-balance', userId] });
      toast.success(`Pomyślnie zasilono konto o ${data.amount} kredytów!`);
    },
    onError: (err) => {
      console.error(err);
      toast.error('Błąd podczas doładowywania kredytów.');
    },
  });

  // Top Up Tokens mutation
  const topUpTokens = useMutation({
    mutationFn: async ({ amount, costPln }: { amount: number; costPln: number }) => {
      if (!userId) throw new Error('User not logged in');

      const currentBalance = balanceQuery.data?.token_balance ?? 0;
      const newBalance = currentBalance + amount;

      // 1. Update profiles table
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ token_balance: newBalance })
        .eq('user_id', userId);

      if (profileErr) throw profileErr;

      // 2. Log token transaction
      const { error: txErr } = await supabase
        .from('token_transactions')
        .insert({
          user_id: userId,
          amount: amount,
          purpose: 'topup',
        });

      if (txErr) console.warn('Logged top-up tokens but transaction record failed:', txErr);

      return { amount, costPln, newBalance };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['profile-balance', userId] });
      toast.success(`Pomyślnie zakupiono ${data.amount} tokenów!`);
    },
    onError: (err) => {
      console.error(err);
      toast.error('Błąd podczas kupowania tokenów.');
    },
  });

  // Spend Credits mutation (e.g. creating/refining route)
  const spendCredits = useMutation({
    mutationFn: async ({ amount, purpose }: { amount: number; purpose: 'route_creation' | 'route_deep_research' }) => {
      if (!userId) throw new Error('User not logged in');

      let unlimitedCredits = balanceQuery.data?.unlimited_credits ?? false;
      if (!unlimitedCredits) {
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId);
        unlimitedCredits = roles?.some((row) => row.role === 'admin') ?? false;
      }

      if (unlimitedCredits) {
        return { amount, newBalance: Number.MAX_SAFE_INTEGER, unlimited: true };
      }

      const currentBalance = balanceQuery.data?.credit_balance ?? 100;
      if (currentBalance < amount) {
        throw new Error('Niewystarczająca ilość kredytów');
      }

      const newBalance = currentBalance - amount;

      // 1. Update profiles table
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ credit_balance: newBalance })
        .eq('user_id', userId);

      if (profileErr) throw profileErr;

      // 2. Log credit transaction
      const { error: txErr } = await supabase
        .from('credit_transactions')
        .insert({
          user_id: userId,
          amount: -amount,
          purpose: purpose,
        });

      if (txErr) console.warn('Spent credits but log failed:', txErr);

      return { amount, newBalance };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['profile-balance', userId] });
    },
  });

  // Buy Route using tokens (Transaction logic)
  const buyRoute = useMutation({
    mutationFn: async ({
      routeId,
      creatorId,
      price = 5,
    }: {
      routeId: number;
      creatorId: string;
      price?: number;
    }) => {
      if (!userId) throw new Error('Musisz być zalogowany, aby pobrać tę trasę.');
      if (userId === creatorId) throw new Error('Jesteś twórcą tej trasy.');

      // Check current buyer tokens
      const buyerTokens = balanceQuery.data?.token_balance ?? 0;
      if (buyerTokens < price) {
        throw new Error('Niewystarczająca liczba tokenów. Doładuj konto.');
      }

      // 1. Deduct tokens from buyer
      const newBuyerBalance = buyerTokens - price;
      const { error: buyerErr } = await supabase
        .from('profiles')
        .update({ token_balance: newBuyerBalance })
        .eq('user_id', userId);
      if (buyerErr) throw buyerErr;

      // 2. Log spend transaction for buyer
      await supabase.from('token_transactions').insert({
        user_id: userId,
        amount: -price,
        purpose: 'route_download',
        route_id: routeId,
      });

      // 3. Add tokens to creator (4 tokens = price - 1, representing 80% share, 1 token is commission)
      const platformFee = 1;
      const creatorShare = price - platformFee;

      // Fetch creator's current tokens
      const { data: creatorProfile } = await supabase
        .from('profiles')
        .select('token_balance')
        .eq('user_id', creatorId)
        .maybeSingle();

      const creatorTokens = creatorProfile?.token_balance ?? 0;
      const newCreatorBalance = creatorTokens + creatorShare;

      const { error: creatorErr } = await supabase
        .from('profiles')
        .update({ token_balance: newCreatorBalance })
        .eq('user_id', creatorId);
      if (creatorErr) console.warn('Failed to update creator profile tokens:', creatorErr);

      // Log earning transaction for creator
      await supabase.from('token_transactions').insert({
        user_id: creatorId,
        amount: creatorShare,
        purpose: 'route_download_earning',
        route_id: routeId,
      });

      // Also update creator's total money earnings in creator_profiles (optional helper)
      const tokenValuePln = 1.0; // 1 token = 1 PLN
      const cashEarning = creatorShare * tokenValuePln;
      
      const { data: cProfile } = await supabase
        .from('creator_profiles')
        .select('total_earnings')
        .eq('user_id', creatorId)
        .maybeSingle();
      
      if (cProfile) {
        await supabase
          .from('creator_profiles')
          .update({ total_earnings: (cProfile.total_earnings ?? 0) + cashEarning })
          .eq('user_id', creatorId);
      }

      // 4. Log purchase into purchases table
      const { error: purchaseErr } = await supabase
        .from('purchases')
        .insert({
          user_id: userId,
          route_id: routeId,
          amount_paid: cashEarning, // cash equivalent
          stripe_payment_intent_id: `token_tx_${Date.now()}`,
        });

      if (purchaseErr) throw purchaseErr;

      return { price, newBuyerBalance };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['profile-balance', userId] });
      queryClient.invalidateQueries({ queryKey: ['purchase-check', userId, variables.routeId] });
      queryClient.invalidateQueries({ queryKey: ['purchases', userId] });
      queryClient.invalidateQueries({ queryKey: ['creator-sales', variables.creatorId] });
      toast.success('Trasa została pomyślnie odblokowana za pomocą tokenów!');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Błąd podczas zakupu trasy.');
    },
  });

  return {
    balance: balanceQuery.data,
    isLoading: balanceQuery.isLoading,
    refetch: balanceQuery.refetch,
    topUpCredits,
    topUpTokens,
    spendCredits,
    buyRoute,
  };
}
