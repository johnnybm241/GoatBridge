import type { Suit } from './card.js';

export type Strain = Suit | 'notrump';

export const STRAIN_ORDER: Strain[] = ['clubs', 'diamonds', 'hearts', 'spades', 'notrump'];

export interface LevelBid {
  type: 'bid';
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  strain: Strain;
}

export interface PassCall {
  type: 'pass';
}

export interface DoubleCall {
  type: 'double';
}

export interface RedoubleCall {
  type: 'redouble';
}

export type BidCall = LevelBid | PassCall | DoubleCall | RedoubleCall;

export type DoubleStatus = 'none' | 'doubled' | 'redoubled';

export interface BiddingState {
  calls: Array<{ seat: string; call: BidCall }>;
  currentBid: LevelBid | null;
  doubleStatus: DoubleStatus;
  passCount: number;
  isComplete: boolean;
  passedOut: boolean;
}
