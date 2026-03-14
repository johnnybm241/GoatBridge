import type { Card, Suit } from '@goatbridge/shared';
import { SUIT_ORDER } from '@goatbridge/shared';

export interface HandEvaluation {
  hcp: number;
  distributionPoints: number;
  totalPoints: number;
  shape: Record<Suit, number>;
  isBalanced: boolean;
  longestSuit: Suit;
  longestSuitLength: number;
  stoppers: Record<Suit, boolean>;
}

const HCP_VALUES: Record<string, number> = { A: 4, K: 3, Q: 2, J: 1 };

export function evaluateHand(hand: Card[]): HandEvaluation {
  let hcp = 0;
  const shape: Record<Suit, number> = { clubs: 0, diamonds: 0, hearts: 0, spades: 0 };

  for (const card of hand) {
    hcp += HCP_VALUES[card.rank] ?? 0;
    shape[card.suit]++;
  }

  // Distribution points: 1 pt per card over 4 in a suit
  let distributionPoints = 0;
  for (const suit of SUIT_ORDER as Suit[]) {
    if (shape[suit] > 4) distributionPoints += shape[suit] - 4;
  }

  const isBalanced = isBalancedHand(shape);

  let longestSuit: Suit = 'spades';
  let longestSuitLength = 0;
  for (const suit of SUIT_ORDER as Suit[]) {
    if (shape[suit] > longestSuitLength) {
      longestSuitLength = shape[suit];
      longestSuit = suit;
    }
  }

  const stoppers: Record<Suit, boolean> = {
    clubs: hasStopperInSuit(hand, 'clubs'),
    diamonds: hasStopperInSuit(hand, 'diamonds'),
    hearts: hasStopperInSuit(hand, 'hearts'),
    spades: hasStopperInSuit(hand, 'spades'),
  };

  return {
    hcp,
    distributionPoints,
    totalPoints: hcp + distributionPoints,
    shape,
    isBalanced,
    longestSuit,
    longestSuitLength,
    stoppers,
  };
}

function isBalancedHand(shape: Record<Suit, number>): boolean {
  const counts = Object.values(shape).sort();
  const patterns = [
    [4, 3, 3, 3],
    [4, 4, 3, 2],
    [5, 3, 3, 2],
  ];
  return patterns.some(p => p.every((v, i) => v === counts[i]));
}

function hasStopperInSuit(hand: Card[], suit: Suit): boolean {
  const suitCards = hand.filter(c => c.suit === suit);
  if (suitCards.some(c => c.rank === 'A')) return true;
  if (suitCards.some(c => c.rank === 'K') && suitCards.length >= 2) return true;
  if (suitCards.some(c => c.rank === 'Q') && suitCards.length >= 3) return true;
  return false;
}
