import axios from 'axios';
import { useAuthStore } from './store/authStore.js';

const api = axios.create({
  baseURL: '/',
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
