import { create } from 'zustand';
import type { TournamentState } from '@goatbridge/shared';

interface TournamentStoreState {
  currentTournament: TournamentState | null;
  setTournament: (t: TournamentState) => void;
  clearTournament: () => void;
}

export const useTournamentStore = create<TournamentStoreState>((set) => ({
  currentTournament: null,
  setTournament: (t) => set({ currentTournament: t }),
  clearTournament: () => set({ currentTournament: null }),
}));
