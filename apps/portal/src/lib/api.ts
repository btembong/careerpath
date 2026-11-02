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
 * Store the JWT in the cpa_token cookie. The page reads it to send as a Bearer token to the API
 * (a different origin), and the middleware reads the same cookie for routing.
 *
 * It used to also be written as an HttpOnly cookie of the same name. That copy blocks JavaScript
 * from writing the readable one, so replacing a token while signed in (onboarding, preferences)
 * left the page with no token and signed the user out. Any old HttpOnly copy is cleared first.
 */
export async function setAuthToken(token: string, rememberMe = true) {
  await fetch('/api/auth/clear-token', { method: 'POST' }).catch(() => {});
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
