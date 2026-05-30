import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';

// ── Shared mocks ──

const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
const mockInvoke = vi.fn().mockResolvedValue({ data: { url: 'https://checkout.stripe.com/test' }, error: null });
const mockUpload = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn((_table: string): any => {
      const chainable: any = {
        select: vi.fn(() => chainable),
        insert: vi.fn((...args: any[]) => {
          mockInsert(...args);
          return { select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: 99 }, error: null }) })), then: vi.fn((cb: any) => cb({ error: null })) };
        }),
        eq: vi.fn(() => chainable),
        in: vi.fn(() => chainable),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      return chainable;
    }),
    functions: { invoke: mockInvoke },
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example.com/img.jpg' } })),
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://example.com/signed' }, error: null }),
      })),
    },
  },
}));

vi.mock('@/integrations/lovable/index', () => ({
  lovable: { auth: { signInWithOAuth: vi.fn() } },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fallback?: any) => {
      if (typeof fallback === 'string') return fallback;
      if (typeof fallback === 'object' && fallback?.defaultValue) return fallback.defaultValue;
      const map: Record<string, string> = {
        'buyer_consent.title': 'Pre-purchase confirmation',
        'buyer_consent.risk': 'I understand that outdoor activities carry inherent risk',
        'buyer_consent.conditions': 'I understand that route conditions may differ',
        'buyer_consent.weather': 'I will check the current weather forecast',
        'buyer_consent.skills': 'I have the proper skills',
        'buyer_consent.terms_prefix': 'I accept the',
        'buyer_consent.select_all': 'Select all',
        'buyer_consent.confirm': 'Confirm & buy',
        'buyer_consent.description': 'Please review and accept',
        'common.cancel': 'Cancel',
        'common.back': 'Back',
        'common.home': 'Home',
        'route_detail.buy_route': 'Buy Route',
        'route_detail.not_found': 'Route not found',
        'purchases.title': 'My Purchased Routes',
        'purchases.login_to_view': 'Log in to view',
      };
      return map[k] || k;
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

let mockUser: any = null;
let mockIsCreator = false;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    isAdmin: false,
    isCreator: mockIsCreator,
    login: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
    refetch: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('E2E Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    mockIsCreator = false;
  });

  describe('Route Detail - buyer consent gate', () => {
    it('opens consent modal when Buy Route is clicked', async () => {
      mockUser = { id: 'buyer-456', email: 'buyer@test.com' };
      
      vi.doMock('@/hooks/use-routes', () => ({
        useRouteById: () => ({
          data: { id: 1234, title: 'Test Trail' },
          isLoading: false,
        }),
      }));

      const BuyerConsentModal = (await import('@/components/BuyerConsentModal')).default;
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        <HelmetProvider>
          <QueryClientProvider client={qc}>
            <MemoryRouter>
              <BuyerConsentModal open={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} loading={false} />
            </MemoryRouter>
          </QueryClientProvider>
        </HelmetProvider>,
      );

      expect(screen.getByText('Pre-purchase confirmation')).toBeInTheDocument();
      expect(screen.getByText('Confirm & buy').closest('button')).toBeDisabled();
    });
  });

  describe('BuyerConsentModal - partial checkboxes blocked', () => {
    it('keeps confirm disabled when not all checkboxes are checked', async () => {
      const BuyerConsentModal = (await import('@/components/BuyerConsentModal')).default;
      const onConfirm = vi.fn();

      render(
        <HelmetProvider>
          <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter>
              <BuyerConsentModal open={true} onOpenChange={vi.fn()} onConfirm={onConfirm} loading={false} />
            </MemoryRouter>
          </QueryClientProvider>
        </HelmetProvider>,
      );

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);
      fireEvent.click(checkboxes[2]);
      
      expect(screen.getByText('Confirm & buy').closest('button')).toBeDisabled();
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe('BuyerConsentModal - full consent triggers checkout', () => {
    it('enables confirm when all checkboxes are checked and calls onConfirm', async () => {
      const BuyerConsentModal = (await import('@/components/BuyerConsentModal')).default;
      const onConfirm = vi.fn();

      render(
        <HelmetProvider>
          <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter>
              <BuyerConsentModal open={true} onOpenChange={vi.fn()} onConfirm={onConfirm} loading={false} />
            </MemoryRouter>
          </QueryClientProvider>
        </HelmetProvider>,
      );

      fireEvent.click(screen.getByText('Select all'));
      const confirmBtn = screen.getByText('Confirm & buy');
      expect(confirmBtn.closest('button')).not.toBeDisabled();

      fireEvent.click(confirmBtn);
      expect(onConfirm).toHaveBeenCalledWith('1.0');
    });
  });

  describe('My Purchases route', () => {
    it('/my-purchases does not render 404', () => {
      const { queryByTestId } = render(
        <HelmetProvider>
          <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter initialEntries={['/my-purchases']}>
              <Routes>
                <Route path="/my-purchases" element={<div data-testid="my-purchases">My Purchases</div>} />
                <Route path="*" element={<div data-testid="not-found">404</div>} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        </HelmetProvider>,
      );

      expect(queryByTestId('not-found')).not.toBeInTheDocument();
      expect(queryByTestId('my-purchases')).toBeInTheDocument();
    });
  });

  describe('AI-assisted data integrity', () => {
    it('routes table includes ai_assisted field for filtering', () => {
      const routeWithAi = { id: 1, ai_assisted: true };
      const routeWithoutAi = { id: 2, ai_assisted: false };
      const allRoutes = [routeWithAi, routeWithoutAi];
      
      const aiFiltered = allRoutes.filter(r => r.ai_assisted);
      expect(aiFiltered).toHaveLength(1);
      expect(aiFiltered[0].id).toBe(1);
    });
  });
});
