import { describe, it, expect } from 'vitest';
import { isValidPlay, determineTrickWinner } from './cardPlay.js';
import type { Trick } from '@goatbridge/shared';

describe('cardPlay', () => {
  it('can play any card on first trick', () => {
    const hand = [{ suit: 'spades' as const, rank: 'A' as const }];
    const r = isValidPlay({ suit: 'spades', rank: 'A' }, hand, null);
    expect(r.valid).toBe(true);
  });

  it('must follow suit if possible', () => {
    const hand = [
      { suit: 'hearts' as const, rank: 'A' as const },
      { suit: 'spades' as const, rank: '2' as const },
    ];
    const trick: Trick = {
      cards: [{ seat: 'north', card: { suit: 'hearts', rank: 'K' } }],
      leader: 'north',
      winner: null,
    };
    const r = isValidPlay({ suit: 'spades', rank: '2' }, hand, trick);
    expect(r.valid).toBe(false);
  });

  it('can play off-suit if void in led suit', () => {
    const hand = [{ suit: 'spades' as const, rank: '2' as const }];
    const trick: Trick = {
      cards: [{ seat: 'north', card: { suit: 'hearts', rank: 'K' } }],
      leader: 'north',
      winner: null,
    };
    const r = isValidPlay({ suit: 'spades', rank: '2' }, hand, trick);
    expect(r.valid).toBe(true);
  });

  it('trump wins over led suit', () => {
    const trick: Trick = {
      cards: [
        { seat: 'north', card: { suit: 'hearts', rank: 'A' } },
        { seat: 'east', card: { suit: 'spades', rank: '2' } }, // spades is trump
      ],
      leader: 'north',
      winner: null,
    };
    const winner = determineTrickWinner(trick, 'spades');
    expect(winner).toBe('east');
  });

  it('highest card of led suit wins (no trump played)', () => {
    const trick: Trick = {
      cards: [
        { seat: 'north', card: { suit: 'hearts', rank: '9' } },
        { seat: 'east', card: { suit: 'hearts', rank: 'A' } },
        { seat: 'south', card: { suit: 'diamonds', rank: 'K' } }, // off-suit
        { seat: 'west', card: { suit: 'hearts', rank: 'K' } },
      ],
      leader: 'north',
      winner: null,
    };
    const winner = determineTrickWinner(trick, null);
    expect(winner).toBe('east');
  });
});
