import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const REMEMBER_FLAG_KEY = 'goatbridge-remember';

/** Call before setAuth() to choose where the auth state is persisted for this login. */
export function setRememberMe(remember: boolean) {
  if (typeof window === 'undefined') return;
  if (remember) {
    window.sessionStorage.removeItem(REMEMBER_FLAG_KEY);
  } else {
    window.sessionStorage.setItem(REMEMBER_FLAG_KEY, '0');
  }
}

const isSessionOnly = () =>
  typeof window !== 'undefined' &&
  window.sessionStorage.getItem(REMEMBER_FLAG_KEY) === '0';

// Custom storage that routes to sessionStorage when "Remember me" is off,
// otherwise localStorage. Always mirrors removal to both to avoid stale copies.
const authStorage: Storage = {
  get length() { return 0; },
  clear: () => {},
  key: () => null,
  getItem: (name: string) => {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(name) ?? window.localStorage.getItem(name);
  },
  setItem: (name: string, value: string) => {
    if (typeof window === 'undefined') return;
    if (isSessionOnly()) {
      window.sessionStorage.setItem(name, value);
      window.localStorage.removeItem(name);
    } else {
      window.localStorage.setItem(name, value);
      window.sessionStorage.removeItem(name);
    }
  },
  removeItem: (name: string) => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(name);
    window.localStorage.removeItem(name);
  },
};

interface AuthState {
  token: string | null;
  userId: string | null;
  username: string | null;
  goatBalance: number;
  skillPoints: number;
  handsPlayed: number;
  bleats: number;
  activeCardBackSkin: string;
  isAdmin: boolean;
  canCreateTournament: boolean;
  setAuth: (token: string, userId: string, username: string) => void;
  setGoatBalance: (balance: number) => void;
  setSkillPoints: (points: number) => void;
  setHandsPlayed: (count: number) => void;
  setBleats: (bleats: number) => void;
  setSkin: (skin: string) => void;
  setIsAdmin: (val: boolean) => void;
  setCanCreateTournament: (val: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userId: null,
      username: null,
      goatBalance: 0,
      skillPoints: 0,
      handsPlayed: 0,
      bleats: 0,
      activeCardBackSkin: 'classic',
      isAdmin: false,
      canCreateTournament: false,
      setAuth: (token, userId, username) => set({ token, userId, username }),
      setGoatBalance: (balance) => set({ goatBalance: balance }),
      setSkillPoints: (points) => set({ skillPoints: points }),
      setHandsPlayed: (count) => set({ handsPlayed: count }),
      setBleats: (bleats) => set({ bleats }),
      setSkin: (skin) => set({ activeCardBackSkin: skin }),
      setIsAdmin: (val) => set({ isAdmin: val }),
      setCanCreateTournament: (val) => set({ canCreateTournament: val }),
      logout: () => set({ token: null, userId: null, username: null, isAdmin: false, canCreateTournament: false }),
    }),
    { name: 'goatbridge-auth', storage: createJSONStorage(() => authStorage) },
  ),
);
