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

/**
 * Who may sit down at a table.
 * - `public`: anyone can take a free seat.
 * - `invite_only`: only users the host invited (or who the host approved) may sit.
 */
export type TableVisibility = 'public' | 'invite_only';

/** A table as shown in the lobby browser. */
export interface TableSummary {
  roomCode: string;
  hostUserId: string;
  hostName: string;
  visibility: TableVisibility;
  phase: string;
  kibitzingAllowed: boolean;
  spectatorCount: number;
  openSeats: number;
  players: { seat: Seat; displayName: string; isAI: boolean }[];
  /** True when the viewer was invited (or approved) and so may join an invite-only table. */
  invited: boolean;
}

/** An invitation from a host asking someone to join their table. */
export interface TableInvite {
  roomCode: string;
  fromUserId: string;
  fromUsername: string;
  visibility: TableVisibility;
  createdAt: number;
}

/** A request from a player asking the host to let them into an invite-only table. */
export interface TableJoinRequest {
  roomCode: string;
  userId: string;
  username: string;
  createdAt: number;
}
