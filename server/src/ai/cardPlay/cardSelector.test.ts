import { describe, expect, it } from 'vitest';
import type { Card, Trick } from '@goatbridge/shared';
import { selectDefenderCard } from './cardSelector.js';

describe('selectDefenderCard - upside-down attitude on partner lead', () => {
  it('plays low to encourage when holding an honor and unable to beat', () => {
    const hand: Card[] = [
      { suit: 'clubs', rank: 'Q' },
      { suit: 'clubs', rank: '9' },
      { suit: 'clubs', rank: '2' },
      { suit: 'hearts', rank: '7' },
    ];
    const trick: Trick = {
      leader: 'west',
      winner: null,
      cards: [
        { seat: 'west', card: { suit: 'clubs', rank: 'K' } },
        { seat: 'north', card: { suit: 'clubs', rank: 'A' } },
      ],
    };

    const card = selectDefenderCard(hand, trick, 'notrump', false, 'east', 'north', 'south');
    expect(card).toEqual({ suit: 'clubs', rank: '2' });
  });

  it('plays high to discourage when holding no honor and unable to beat', () => {
    const hand: Card[] = [
      { suit: 'clubs', rank: '9' },
      { suit: 'clubs', rank: '6' },
      { suit: 'clubs', rank: '2' },
      { suit: 'hearts', rank: '7' },
    ];
    const trick: Trick = {
      leader: 'west',
      winner: null,
      cards: [
        { seat: 'west', card: { suit: 'clubs', rank: 'K' } },
        { seat: 'north', card: { suit: 'clubs', rank: 'A' } },
      ],
    };

    const card = selectDefenderCard(hand, trick, 'notrump', false, 'east', 'north', 'south');
    expect(card).toEqual({ suit: 'clubs', rank: '9' });
  });

  it('still wins third hand when it can beat declarer', () => {
    const hand: Card[] = [
      { suit: 'clubs', rank: 'A' },
      { suit: 'clubs', rank: 'K' },
      { suit: 'clubs', rank: '8' },
      { suit: 'hearts', rank: '7' },
    ];
    const trick: Trick = {
      leader: 'west',
      winner: null,
      cards: [
        { seat: 'west', card: { suit: 'clubs', rank: 'J' } },
        { seat: 'north', card: { suit: 'clubs', rank: 'Q' } },
      ],
    };

    const card = selectDefenderCard(hand, trick, 'notrump', false, 'east', 'north', 'south');
    expect(card).toEqual({ suit: 'clubs', rank: 'A' });
  });
});
