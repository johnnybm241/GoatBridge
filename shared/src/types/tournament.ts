import type { Card } from './card.js';
import type { BidCall, Contract } from './bidding.js';
import type { Trick, Seat } from './game.js';

export interface PairEntry {
  pairId: string;
  player1: { userId: string; displayName: string };
  player2: { userId: string; displayName: string } | null; // null = bot
}

export interface SwissRoundTable {
  tableIndex: number;
  pair1Id: string; // plays NS
  pair2Id: string; // plays EW
  roomCode: string | null;
  boardsComplete: number;
  complete: boolean;
}

export interface SwissRound {
  roundNumber: number;
  boardStart: number; // 1-indexed board number this round starts at
  boardEnd: number;   // 1-indexed board number this round ends at (inclusive)
  tables: SwissRoundTable[];
  complete: boolean;
}

export interface PairBoardResult {
  boardNumber: number;
  pairId: string;
  side: 'ns' | 'ew';
  rawScore: number;
  matchpoints: number;
}

export interface TournamentStanding {
  pairId: string;
  player1Name: string;
  player2Name: string; // 'Bot' if no player2
  totalMatchpoints: number;
  roundsPlayed: number;
  opponents: string[]; // pairIds already faced
}

/** Full record of a completed board — stored for review after play */
export interface TournamentBoardRecord {
  boardNumber: number;          // tournament-level 1-indexed board number
  roundNumber: number;
  tableIndex: number;
  nsPairId: string;
  ewPairId: string;
  dealer: Seat;
  vulnerability: string;
  deal: Record<Seat, Card[]>;   // all four hands face-up
  biddingCalls: Array<{ seat: string; call: BidCall }>;
  contract: Contract;
  declarerSeat: Seat;
  tricksMade: number;
  nsRawScore: number;           // positive = NS scored, negative = EW scored
  completedTricks: Trick[];
}

export interface TournamentState {
  tournamentCode: string;
  name: string;
  organizerUserId: string;
  totalBoards: number;
  boardsPerRound: number;
  entryFee: number;       // 0 = free
  status: 'setup' | 'in_progress' | 'complete' | 'cancelled';
  pairs: PairEntry[];
  rounds: SwissRound[];
  currentRound: number; // 0 = not started, 1+ = round number
  boardResults: PairBoardResult[];
  standings: TournamentStanding[];
  createdAt: number;
  scheduledStartAt?: number; // epoch ms, optional — null/undefined = manual start
  completedBoards: TournamentBoardRecord[]; // past boards available for review
}
