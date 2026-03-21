import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
    { name: 'goatbridge-auth' },
  ),
);
