import type { Card, Suit } from '@goatbridge/shared';
import { RANK_ORDER } from '@goatbridge/shared';
import type { Seat, Trick, TrickCard } from '@goatbridge/shared';
import type { Strain } from '@goatbridge/shared';

export function cardRank(card: Card): number {
  return RANK_ORDER.indexOf(card.rank);
}

export function canFollowSuit(hand: Card[], ledSuit: Suit): boolean {
  return hand.some(c => c.suit === ledSuit);
}

export function isValidPlay(
  card: Card,
  hand: Card[],
  currentTrick: Trick | null,
): { valid: boolean; error?: string } {
  if (!hand.some(c => c.suit === card.suit && c.rank === card.rank)) {
    return { valid: false, error: 'Card not in hand' };
  }

  if (currentTrick && currentTrick.cards.length > 0) {
    const ledSuit = currentTrick.cards[0]!.card.suit;
    if (card.suit !== ledSuit && canFollowSuit(hand, ledSuit)) {
      return { valid: false, error: `Must follow suit: ${ledSuit}` };
    }
  }

  return { valid: true };
}

export function determineTrickWinner(trick: Trick, trumpSuit: Suit | null): Seat {
  const led = trick.cards[0]!;
  let winner = led;

  for (const tc of trick.cards.slice(1)) {
    if (trumpSuit && tc.card.suit === trumpSuit) {
      if (winner.card.suit !== trumpSuit || cardRank(tc.card) > cardRank(winner.card)) {
        winner = tc;
      }
    } else if (tc.card.suit === led.card.suit) {
      if (winner.card.suit !== trumpSuit && cardRank(tc.card) > cardRank(winner.card)) {
        winner = tc;
      }
    }
  }

  return winner.seat;
}

export function getTrumpSuit(strain: Strain): Suit | null {
  if (strain === 'notrump') return null;
  return strain as Suit;
}

export function removeCardFromHand(hand: Card[], card: Card): Card[] {
  const idx = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
  if (idx === -1) return hand;
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}

export function nextSeat(seat: Seat): Seat {
  const seats: Seat[] = ['north', 'east', 'south', 'west'];
  return seats[(seats.indexOf(seat) + 1) % 4]!;
}
