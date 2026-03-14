import type { Strain } from './bidding.js';

export type Vulnerability = 'none' | 'ns' | 'ew' | 'both';

export interface Contract {
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  strain: Strain;
  doubled: 'none' | 'doubled' | 'redoubled';
  declarer: string; // Seat
}

export interface HandScore {
  nsTricks: number;
  ewTricks: number;
  contractMade: boolean;
  tricksOverUnder: number; // positive = overtricks, negative = undertricks
  nsScoreBelow: number;
  nsScoreAbove: number;
  ewScoreBelow: number;
  ewScoreAbove: number;
  vulnerability: Vulnerability;
}

export interface RubberScore {
  nsGamesWon: number;
  ewGamesWon: number;
  nsBelowTotal: number;
  ewBelowTotal: number;
  nsAboveTotal: number;
  ewAboveTotal: number;
  nsBelowPartial: number; // partial game score (not yet a game)
  ewBelowPartial: number;
  isComplete: boolean;
  winner: 'ns' | 'ew' | null;
  finalNsScore: number;
  finalEwScore: number;
}

export interface ScoreHistory {
  hands: HandScore[];
  rubber: RubberScore;
}
