'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi } from './api';
import { setToken, clearToken, getToken } from './token';
import { clerkSignOut } from './clerk-signout';

const USER_CACHE_KEY = 'reprush_user_v1';

/** Last known profile, so the app can boot offline instead of bouncing to /login. */
function cacheUser(u: unknown | null) {
  if (typeof window === 'undefined') return;
  try {
    if (u) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_CACHE_KEY);
  } catch { /* storage full or blocked — offline boot is best-effort */ }
}

function getCachedUser(): any | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'user';
  heightCm?: number;
  weightKg?: number;
  profileImage?: string;
  isActivated: boolean;
  // Written by the onboarding funnel (P4). `/auth/me` has always returned the
  // whole entity; these were just missing from the type. `sex` and `birthDate`
  // pick the strength-standards column, so the Calculator needs them.
  username?: string;
  bio?: string;
  sex?: 'male' | 'female';
  birthDate?: string;
  avatarId?: string;
  experience?: string;
  goal?: string;
  trainingLocation?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await authApi.me();
      setUser(res.data);
      cacheUser(res.data);
    } catch (err: any) {
      // Distinguish "server says you're not authenticated" from "we couldn't
      // reach the server". Only the former should sign the user out — otherwise
      // opening the app offline would bounce them to /login and make the whole
      // offline mode pointless.
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        clearToken();
        cacheUser(null);
        setUser(null);
        return;
      }
      const cached = getCachedUser();
      setUser(cached && getToken() ? cached : null);
    }
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    if (res.data.token) setToken(res.data.token);
    cacheUser(res.data.user);
    setUser(res.data.user);
    return res.data.user as User;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Offline logout still clears local credentials.
    }
    // End the Clerk session too, when there is one. Clearing only the RepRush
    // token would leave Clerk signed in, and the bridge would immediately
    // exchange a fresh session and sign the user straight back in — so the
    // button would appear to do nothing.
    await clerkSignOut();
    clearToken();
    cacheUser(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
