import { describe, it, expect } from 'vitest';
import { createDeck, shuffle, deal } from './deck.js';

describe('deck', () => {
  it('creates 52 unique cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    const keys = deck.map(c => `${c.suit}-${c.rank}`);
    expect(new Set(keys).size).toBe(52);
  });

  it('shuffle returns 52 cards', () => {
    const deck = createDeck();
    const shuffled = shuffle(deck);
    expect(shuffled).toHaveLength(52);
  });

  it('deals 13 cards to each player', () => {
    const hands = deal();
    for (const seat of ['north', 'east', 'south', 'west'] as const) {
      expect(hands[seat]).toHaveLength(13);
    }
  });

  it('deal produces no duplicates', () => {
    const hands = deal();
    const allCards = [
      ...hands.north,
      ...hands.east,
      ...hands.south,
      ...hands.west,
    ].map(c => `${c.suit}-${c.rank}`);
    expect(new Set(allCards).size).toBe(52);
  });
});
