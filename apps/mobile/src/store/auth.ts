import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { api } from '../lib/api';

interface AuthUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
  avatarUrl: string | null;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    await SecureStore.setItemAsync('cpa_token', data.access_token);
    set({ token: data.access_token, user: data.user });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('cpa_token');
    set({ token: null, user: null });
  },

  loadFromStorage: async () => {
    try {
      const token = await SecureStore.getItemAsync('cpa_token');
      if (token) {
        const { data } = await api.get('/auth/me');
        set({ token, user: data, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
