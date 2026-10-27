import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.careerpathafrica.com';

export const api = axios.create({ baseURL: API_URL, timeout: 15_000 });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('cpa_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401) {
      await SecureStore.deleteItemAsync('cpa_token');
    }
    return Promise.reject(err);
  },
);
