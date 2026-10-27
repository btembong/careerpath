import axios from 'axios';
import Cookies from 'js-cookie';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1',
});

api.interceptors.request.use((config) => {
  // HttpOnly cookie is sent automatically by the browser,
  // but we also attach from js-cookie as a fallback for SSR/API calls
  const token = Cookies.get('cpa_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      await fetch('/api/auth/clear-token', { method: 'POST' }).catch(() => {});
      Cookies.remove('cpa_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

/**
 * Set the JWT as an HttpOnly cookie via our Next.js API route.
 * Also sets a non-HttpOnly copy for client-side decode (role redirect).
 */
export async function setAuthToken(token: string, rememberMe = true) {
  // HttpOnly cookie (secure, not readable by JS/XSS)
  await fetch('/api/auth/set-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, rememberMe }),
  });
  // Non-HttpOnly copy for client-side role decode (useAuth hook)
  // This is low-risk: the real session cookie is HttpOnly
  const isProd = typeof window !== 'undefined' && window.location.protocol === 'https:';
  Cookies.set('cpa_token', token, {
    expires: rememberMe ? 7 : undefined,
    sameSite: 'lax',
    secure: isProd,
  });
}

export async function clearAuthToken() {
  await fetch('/api/auth/clear-token', { method: 'POST' }).catch(() => {});
  Cookies.remove('cpa_token');
}

export default api;
