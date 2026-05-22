import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'PLN', symbol: 'zł', name: 'Polski Złoty' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint' },
  { code: 'RON', symbol: 'lei', name: 'Romanian Leu' },
  { code: 'BGN', symbol: 'лв', name: 'Bulgarian Lev' },
  { code: 'HRK', symbol: 'kn', name: 'Croatian Kuna' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
] as const;

export type CurrencyCode = typeof CURRENCIES[number]['code'];

export function getCurrencySymbol(code: string): string {
  return CURRENCIES.find(c => c.code === code)?.symbol || code;
}

/** Detect user's likely currency from browser locale */
export function detectUserCurrency(): CurrencyCode {
  const lang = navigator.language || 'en-US';
  const region = lang.split('-')[1]?.toUpperCase() || '';

  const regionToCurrency: Record<string, CurrencyCode> = {
    PL: 'PLN', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR',
    AT: 'EUR', BE: 'EUR', FI: 'EUR', PT: 'EUR', IE: 'EUR', GR: 'EUR',
    SK: 'EUR', SI: 'EUR', LT: 'EUR', LV: 'EUR', EE: 'EUR', MT: 'EUR', CY: 'EUR', LU: 'EUR',
    GB: 'GBP', CZ: 'CZK', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK',
    HU: 'HUF', RO: 'RON', BG: 'BGN', HR: 'HRK', TR: 'TRY',
    JP: 'JPY', CA: 'CAD', AU: 'AUD', BR: 'BRL',
  };

  return regionToCurrency[region] || 'USD';
}

export function useConvertedPrice(amount: number, fromCurrency: string, toCurrency: string) {
  return useQuery({
    queryKey: ['exchange-rate', fromCurrency, toCurrency, amount],
    enabled: fromCurrency !== toCurrency && amount > 0,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('exchange-rate', {
        body: { from: fromCurrency, to: toCurrency, amount },
      });
      if (error) throw error;
      return data as { converted: number; rate: number };
    },
    staleTime: 1000 * 60 * 30,
    retry: 1,
  });
}

export function formatPrice(amount: number, currency: string): string {
  const symbol = getCurrencySymbol(currency);
  return `${amount.toFixed(2)} ${symbol}`;
}
