import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { toast } from 'sonner';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';

export type AppRole = 'user' | 'creator' | 'admin';

interface User {
  id: string;
  email: string;
  name?: string;
  roles: AppRole[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isCreator: boolean;
  login: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

async function fetchUserRoles(userId: string): Promise<AppRole[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);
  if (error || !data) return ['user'];
  return data.map((r) => r.role as AppRole);
}

function mapSupabaseUser(su: SupabaseUser, roles: AppRole[]): User {
  return {
    id: su.id,
    email: su.email ?? '',
    name: su.user_metadata?.full_name ?? su.email,
    roles,
  };
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = async (su: SupabaseUser | null) => {
    if (!su) {
      setUser(null);
      setLoading(false);
      return;
    }
    const roles = await fetchUserRoles(su.id);
    setUser(mapSupabaseUser(su, roles));
    setLoading(false);
  };

  useEffect(() => {
    let mounted = true;
    let authEventReceived = false;

    // 1. Restore session from storage FIRST. Keep loading=true if it fails so protected routes don't flash away.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted || authEventReceived) return;
      loadUser(session?.user ?? null);
    }).catch((error) => {
      console.warn('[AuthProvider] session restore failed', error);
      if (mounted) {
        setUser(null);
        setLoading(false);
      }
    });

    // 2. Then listen for subsequent auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventReceived = true;
      loadUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const isAdmin = useMemo(() => user?.roles.includes('admin') ?? false, [user]);
  const isCreator = useMemo(() => (user?.roles.includes('creator') || user?.roles.includes('admin')) ?? false, [user]);

  const login = async () => {
    const redirectTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.href = `/auth?redirect=${encodeURIComponent(redirectTo)}`;
  };

  const loginWithGoogle = async () => {
    const { error } = await lovable.auth.signInWithOAuth('google', {
      redirect_uri: window.location.origin,
    });
    if (error) toast.error(String(error));
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    toast.success('Wylogowano');
  };

  const refetch = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    await loadUser(session?.user ?? null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isCreator, login, loginWithGoogle, logout, refetch }}>
      {children}
    </AuthContext.Provider>
  );
};
