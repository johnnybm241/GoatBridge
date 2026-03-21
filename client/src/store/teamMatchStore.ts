import { create } from 'zustand';
import type { TeamMatchState, TeamMatchBoardResult } from '@goatbridge/shared';

interface TeamMatchStoreState {
  currentMatch: TeamMatchState | null;
  setMatch: (match: TeamMatchState) => void;
  updateBoardResult: (payload: {
    boardNumber: number;
    t1NsSigned: number | null;
    t2NsSigned: number | null;
    impsTeam1: number | null;
    totalImpsTeam1: number;
    totalImpsTeam2: number;
  }) => void;
  clearMatch: () => void;
}

export const useTeamMatchStore = create<TeamMatchStoreState>((set) => ({
  currentMatch: null,
  setMatch: (match) => set({ currentMatch: match }),
  updateBoardResult: (payload) => set(s => {
    if (!s.currentMatch) return {};
    const existing = s.currentMatch.boardResults.findIndex(r => r.boardNumber === payload.boardNumber);
    const newResult: TeamMatchBoardResult = {
      boardNumber: payload.boardNumber,
      t1NsSigned: payload.t1NsSigned,
      t2NsSigned: payload.t2NsSigned,
      impsTeam1: payload.impsTeam1,
    };
    const boardResults = existing >= 0
      ? s.currentMatch.boardResults.map((r, i) => i === existing ? newResult : r)
      : [...s.currentMatch.boardResults, newResult];
    return {
      currentMatch: {
        ...s.currentMatch,
        boardResults,
        totalImpsTeam1: payload.totalImpsTeam1,
        totalImpsTeam2: payload.totalImpsTeam2,
      },
    };
  }),
  clearMatch: () => set({ currentMatch: null }),
}));
