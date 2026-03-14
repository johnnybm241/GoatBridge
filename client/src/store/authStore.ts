import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  userId: string | null;
  username: string | null;
  goatBalance: number;
  activeCardBackSkin: string;
  setAuth: (token: string, userId: string, username: string) => void;
  setGoatBalance: (balance: number) => void;
  setSkin: (skin: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userId: null,
      username: null,
      goatBalance: 0,
      activeCardBackSkin: 'classic',
      setAuth: (token, userId, username) => set({ token, userId, username }),
      setGoatBalance: (balance) => set({ goatBalance: balance }),
      setSkin: (skin) => set({ activeCardBackSkin: skin }),
      logout: () => set({ token: null, userId: null, username: null }),
    }),
    { name: 'goatbridge-auth' },
  ),
);
