import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getAccessToken, setAccessToken } from './api.js';

export interface AuthUser {
  id: string;
  name: string;
  institution: string;
  function: string;
  accessLevel: 'ADMIN' | 'OPERATOR' | 'PARTICIPANT';
  memberId: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  exchange(code: string): Promise<AuthUser>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    api.get<{ user: AuthUser }>('/auth/me')
      .then((result) => setUser(result.user))
      .catch(() => setAccessToken(null))
      .finally(() => setLoading(false));
  }, []);

  const exchange = useCallback(async (code: string) => {
    const result = await api.post<{ accessToken: string; user: AuthUser }>('/auth/exchange', { code });
    setAccessToken(result.accessToken);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, exchange, logout }), [user, loading, exchange, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return context;
}
