import type { Card, Suit, Rank } from '@goatbridge/shared';
import { SUIT_ORDER, RANK_ORDER } from '@goatbridge/shared';
import type { Seat } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUIT_ORDER as Suit[]) {
    for (const rank of RANK_ORDER as Rank[]) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export function shuffle(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j]!, d[i]!];
  }
  return d;
}

export function deal(): Record<Seat, Card[]> {
  const deck = shuffle(createDeck());
  const hands: Record<Seat, Card[]> = { north: [], east: [], south: [], west: [] };
  for (let i = 0; i < 52; i++) {
    const seat = SEATS[i % 4]!;
    hands[seat].push(deck[i]!);
  }
  return hands;
}
