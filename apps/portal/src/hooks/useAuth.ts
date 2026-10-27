'use client';
import { useState, useEffect, useCallback } from 'react';
import Cookies from 'js-cookie';
import { jwtDecode } from 'jwt-decode';
import { clearAuthToken, setAuthToken } from '@/lib/api';

interface AuthUser {
  id: string;
  email: string;
  role: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  countryId?: string | null;
}

// Refresh if token expires within 1 hour
const REFRESH_THRESHOLD_MS = 60 * 60 * 1000;

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshToken = useCallback(async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/me`,
        { headers: { Authorization: `Bearer ${Cookies.get('cpa_token')}` } },
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.accessToken) {
        await setAuthToken(data.accessToken, true);
      }
    } catch {
      // Refresh failed — let it expire naturally
    }
  }, []);

  useEffect(() => {
    const token = Cookies.get('cpa_token');
    if (token) {
      try {
        const decoded = jwtDecode<AuthUser & { exp: number }>(token);
        if (decoded.exp * 1000 > Date.now()) {
          setUser(decoded);

          // Schedule silent refresh if token is close to expiry
          const msUntilExpiry = decoded.exp * 1000 - Date.now();
          if (msUntilExpiry < REFRESH_THRESHOLD_MS) {
            refreshToken();
          } else {
            const timerId = setTimeout(refreshToken, msUntilExpiry - REFRESH_THRESHOLD_MS);
            setLoading(false);
            return () => clearTimeout(timerId);
          }
        } else {
          Cookies.remove('cpa_token');
        }
      } catch {
        Cookies.remove('cpa_token');
      }
    }
    setLoading(false);
  }, [refreshToken]);

  async function logout() {
    await clearAuthToken();
    window.location.href = '/login';
  }

  return { user, loading, logout };
}
