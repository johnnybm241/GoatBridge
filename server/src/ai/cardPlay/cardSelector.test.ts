import { describe, expect, it } from 'vitest';
import type { BidCall, BiddingState, Card, Seat, Trick } from '@goatbridge/shared';
import { selectDeclarerCard, selectDefenderCard } from './cardSelector.js';

function makeBidding(calls: Array<{ seat: Seat; call: BidCall }>): BiddingState {
  let currentBid: BiddingState['currentBid'] = null;
  let doubleStatus: BiddingState['doubleStatus'] = 'none';
  let passCount = 0;
  for (const { call } of calls) {
    if (call.type === 'bid') { currentBid = call; doubleStatus = 'none'; passCount = 0; }
    else if (call.type === 'pass') passCount++;
    else if (call.type === 'double') doubleStatus = 'doubled';
    else if (call.type === 'redouble') doubleStatus = 'redoubled';
  }
  return { calls, currentBid, doubleStatus, passCount, isComplete: false, passedOut: false };
}

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

  it('uses auction memory on opening lead by preferring partner shown suit', () => {
    const hand: Card[] = [
      { suit: 'clubs', rank: 'A' },
      { suit: 'clubs', rank: '7' },
      { suit: 'clubs', rank: '4' },
      { suit: 'diamonds', rank: 'K' },
      { suit: 'diamonds', rank: '8' },
      { suit: 'diamonds', rank: '6' },
      { suit: 'diamonds', rank: '3' },
      { suit: 'hearts', rank: 'Q' },
      { suit: 'hearts', rank: '5' },
      { suit: 'spades', rank: '9' },
      { suit: 'spades', rank: '7' },
      { suit: 'spades', rank: '4' },
      { suit: 'spades', rank: '2' },
    ];
    const bidding = makeBidding([
      { seat: 'south', call: { type: 'bid', level: 1, strain: 'notrump' } },
      { seat: 'west', call: { type: 'pass' } },
      { seat: 'north', call: { type: 'bid', level: 2, strain: 'diamonds' } },
      { seat: 'east', call: { type: 'pass' } },
      { seat: 'south', call: { type: 'bid', level: 3, strain: 'notrump' } },
    ]);

    const lead = selectDefenderCard(hand, null, 'notrump', true, 'east', 'south', 'north', bidding);
    expect(lead.suit).toBe('diamonds');
  });

  it('does not ruff when partner is already winning the trick', () => {
    const hand: Card[] = [
      { suit: 'spades', rank: '6' },
      { suit: 'spades', rank: '3' },
      { suit: 'clubs', rank: '2' },
      { suit: 'diamonds', rank: '4' },
    ];
    const trick: Trick = {
      leader: 'west',
      winner: null,
      cards: [
        { seat: 'west', card: { suit: 'hearts', rank: 'K' } },
        { seat: 'north', card: { suit: 'hearts', rank: '2' } },
      ],
    };

    const card = selectDefenderCard(hand, trick, 'spades', false, 'east', 'south', 'north');
    expect(card).toEqual({ suit: 'clubs', rank: '2' });
  });

  it('avoids leading an unsupported ace against a suit contract', () => {
    const hand: Card[] = [
      { suit: 'spades', rank: 'A' },
      { suit: 'spades', rank: '7' },
      { suit: 'spades', rank: '4' },
      { suit: 'diamonds', rank: 'K' },
      { suit: 'diamonds', rank: '8' },
      { suit: 'diamonds', rank: '6' },
      { suit: 'diamonds', rank: '3' },
      { suit: 'hearts', rank: 'Q' },
      { suit: 'hearts', rank: '5' },
      { suit: 'clubs', rank: '9' },
      { suit: 'clubs', rank: '7' },
      { suit: 'clubs', rank: '4' },
      { suit: 'clubs', rank: '2' },
    ];

    const lead = selectDefenderCard(hand, null, 'hearts', true, 'east', 'south', 'north');
    expect(lead).toEqual({ suit: 'diamonds', rank: '3' });
  });
});

describe('selectDeclarerCard - trump management', () => {
  it('does not ruff partner winner from declarer side', () => {
    const declarerHand: Card[] = [
      { suit: 'spades', rank: '6' },
      { suit: 'spades', rank: '3' },
      { suit: 'clubs', rank: '2' },
    ];
    const dummyHand: Card[] = [
      { suit: 'hearts', rank: 'A' },
      { suit: 'diamonds', rank: 'K' },
    ];
    const trick: Trick = {
      leader: 'north',
      winner: null,
      cards: [
        { seat: 'north', card: { suit: 'hearts', rank: 'A' } },
        { seat: 'east', card: { suit: 'hearts', rank: '3' } },
        { seat: 'south', card: { suit: 'hearts', rank: '2' } },
      ],
    };

    const card = selectDeclarerCard(
      declarerHand,
      dummyHand,
      trick,
      'spades',
      false,
      [],
      'south',
      'north',
    );
    expect(card).toEqual({ suit: 'clubs', rank: '2' });
  });
});
