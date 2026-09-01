import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getAccessToken, setAccessToken } from './api.js';

export interface AuthUser {
  id: string;
  name: string;
  institution: string;
  function: string;
  accessLevel: 'ADMIN' | 'OPERATOR' | 'PARTICIPANT';
  memberId: string | null;
  email: string | null;
  mustChangePassword: boolean;
  identityVerified: boolean;
  certificateIdentityName: string | null;
  authenticationMethod: 'EMAIL_PASSWORD' | 'ICPBRASIL_MTLS' | 'PASSWORD_ADMIN';
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  emailLogin(email: string, password: string): Promise<AuthUser>;
  passwordLogin(username: string, password: string): Promise<AuthUser>;
  changePassword(newPassword: string): Promise<void>;
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

  const emailLogin = useCallback(async (email: string, password: string) => {
    const result = await api.post<{ accessToken: string; user: AuthUser }>('/auth/email/login', { email, password });
    setAccessToken(result.accessToken);
    setUser(result.user);
    return result.user;
  }, []);

  const passwordLogin = useCallback(async (username: string, password: string) => {
    const result = await api.post<{ accessToken: string; user: AuthUser }>('/auth/password/login', { username, password });
    setAccessToken(result.accessToken);
    setUser(result.user);
    return result.user;
  }, []);

  const changePassword = useCallback(async (newPassword: string) => {
    await api.post('/auth/password/change', { newPassword });
    setAccessToken(null);
    setUser(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, emailLogin, passwordLogin, changePassword, logout }),
    [user, loading, emailLogin, passwordLogin, changePassword, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return context;
}
