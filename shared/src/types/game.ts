import type { Card } from './card.js';
import type { BidCall, BiddingState, Strain } from './bidding.js';
import type { Contract, Vulnerability, RubberScore } from './scoring.js';

export type Seat = 'north' | 'east' | 'south' | 'west';
export const SEATS: Seat[] = ['north', 'east', 'south', 'west'];

export type GamePhase = 'waiting' | 'bidding' | 'playing' | 'scoring' | 'complete';

export interface TrickCard {
  seat: Seat;
  card: Card;
}

export interface Trick {
  cards: TrickCard[];
  leader: Seat;
  winner: Seat | null;
}

export interface SeatInfo {
  seat: Seat;
  userId: string | null;
  displayName: string;
  isAI: boolean;
  isConnected: boolean;
  disconnected: boolean;
  disconnectedAt: number | null;
  originalUserId: string | null;
  activeCardBackSkin: string;
}

export interface SpectatorInfo {
  userId: string;
  displayName: string;
}

export interface GameState {
  phase: GamePhase;
  dealer: Seat;
  vulnerability: Vulnerability;
  bidding: BiddingState;
  contract: Contract | null;
  declarer: Seat | null;
  dummy: Seat | null;
  dummyHand: Card[] | null; // null until dummy is revealed
  currentTrick: Trick | null;
  completedTricks: Trick[];
  trickCounts: Record<'ns' | 'ew', number>;
  scores: RubberScore;
  seats: Record<Seat, SeatInfo>;
  currentTurn: Seat | null;
  hostUserId: string;
  kibitzingAllowed: boolean;
  spectators: SpectatorInfo[];
  handNumber: number;
  // Undo support
  pendingUndoFrom: Seat | null;
  undoApprovals: Record<Seat, boolean | null>;
  // Claim support
  pendingClaim: { fromSeat: Seat; approvals: Record<Seat, boolean | null> } | null;
}

export interface RoomState {
  roomCode: string;
  hostUserId: string;
  status: 'waiting' | 'playing' | 'complete';
  game: GameState | null;
  seats: Record<Seat, SeatInfo>;
  kibitzingAllowed: boolean;
  spectators: SpectatorInfo[];
}
