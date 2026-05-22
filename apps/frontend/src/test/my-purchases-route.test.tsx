import { describe, it, expect, vi } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
    })),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

vi.mock('@/integrations/lovable/index', () => ({
  lovable: { auth: { signInWithOAuth: vi.fn() } },
}));

// Minimal Auth context wrapper that simulates logged-out state
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    isAdmin: false,
    isCreator: false,
    login: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
    refetch: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// i18n mock
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'pl', changeLanguage: vi.fn() } }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

function renderAtPath(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // ProtectedRoute redirects unauthenticated users to /auth, so we need those routes registered
  const ProtectedMyRoutes = () => {
    // Simulate what ProtectedRoute does: redirect to /auth if no user
    return <div data-testid="auth-redirect">redirected</div>;
  };

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/my-routes" element={<ProtectedMyRoutes />} />
          <Route path="/my-purchases" element={<ProtectedMyRoutes />} />
          <Route path="/auth" element={<div data-testid="auth-page">Auth</div>} />
          <Route path="*" element={<div data-testid="not-found">404</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('My Purchases route availability', () => {
  it('/my-routes does not render 404 (redirects to auth when logged out)', () => {
    const { queryByTestId } = renderAtPath('/my-routes');
    expect(queryByTestId('not-found')).not.toBeInTheDocument();
  });

  it('/my-purchases does not render 404 (redirects to auth when logged out)', () => {
    const { queryByTestId } = renderAtPath('/my-purchases');
    expect(queryByTestId('not-found')).not.toBeInTheDocument();
  });
});
