import type { Seat } from './game.js';

/** Relationship between the requesting user and another player. */
export type FriendshipStatus = 'self' | 'none' | 'pending_sent' | 'pending_received' | 'friends';

/** Where a player is currently seated/spectating, if anywhere. */
export interface RoomPresence {
  roomCode: string;
  seat: Seat | null;
  isSpectator: boolean;
  kibitzingAllowed: boolean;
  phase: string;
  /** Display names of the other three seats (or "AI Bot") for a quick glance. */
  occupants: { seat: Seat; displayName: string; isAI: boolean }[];
}

export interface FriendSummary {
  userId: string;
  username: string;
  bleats: number;
  presence: RoomPresence | null;
}

export interface FriendRequestSummary {
  id: string;
  userId: string;
  username: string;
  createdAt: number;
}

export interface PlayerProfile {
  userId: string;
  username: string;
  bleats: number;
  handsPlayed: number;
  friendshipStatus: FriendshipStatus;
  /** Only set when there is a pending request the viewer can act on/cancel. */
  friendRequestId: string | null;
  presence: RoomPresence | null;
}
