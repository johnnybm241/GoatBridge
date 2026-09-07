import { create } from 'zustand';

interface FriendsState {
  pendingRequestCount: number;
  setPendingRequestCount: (count: number) => void;
  incrementPendingRequestCount: () => void;
}

export const useFriendsStore = create<FriendsState>((set) => ({
  pendingRequestCount: 0,
  setPendingRequestCount: (count) => set({ pendingRequestCount: count }),
  incrementPendingRequestCount: () => set(s => ({ pendingRequestCount: s.pendingRequestCount + 1 })),
}));
