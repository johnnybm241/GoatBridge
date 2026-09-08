import { create } from 'zustand';
import type { TableInvite, TableJoinRequest } from '@goatbridge/shared';

interface InvitesState {
  /** Table invites sent to me that I haven't acted on yet. */
  invites: TableInvite[];
  /** Requests to join my table, waiting on me as host. */
  joinRequests: TableJoinRequest[];

  addInvite: (invite: TableInvite) => void;
  dismissInvite: (roomCode: string) => void;
  addJoinRequest: (request: TableJoinRequest) => void;
  dismissJoinRequest: (roomCode: string, userId: string) => void;
  reset: () => void;
}

export const useInvitesStore = create<InvitesState>((set) => ({
  invites: [],
  joinRequests: [],

  addInvite: (invite) => set(s => ({
    invites: [...s.invites.filter(i => i.roomCode !== invite.roomCode), invite],
  })),
  dismissInvite: (roomCode) => set(s => ({
    invites: s.invites.filter(i => i.roomCode !== roomCode),
  })),
  addJoinRequest: (request) => set(s => ({
    joinRequests: [
      ...s.joinRequests.filter(r => !(r.roomCode === request.roomCode && r.userId === request.userId)),
      request,
    ],
  })),
  dismissJoinRequest: (roomCode, userId) => set(s => ({
    joinRequests: s.joinRequests.filter(r => !(r.roomCode === roomCode && r.userId === userId)),
  })),
  reset: () => set({ invites: [], joinRequests: [] }),
}));
