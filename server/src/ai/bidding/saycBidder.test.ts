import { describe, it, expect } from 'vitest';
import type { Card, BiddingState, BidCall, Seat } from '@goatbridge/shared';
import { chooseBid } from './saycBidder.js';

// Helper to build a hand from a spec like { spades: 'AKQ', hearts: 'J54', ... }
function makeHand(spec: Partial<Record<'spades' | 'hearts' | 'diamonds' | 'clubs', string>>): Card[] {
  const cards: Card[] = [];
  for (const [suit, ranks] of Object.entries(spec)) {
    if (!ranks) continue;
    const tokens: string[] = [];
    for (let i = 0; i < ranks.length; i++) {
      const c = ranks[i]!;
      if (c === '1' && ranks[i + 1] === '0') {
        tokens.push('10');
        i++;
      } else {
        tokens.push(c);
      }
    }
    for (const r of tokens) cards.push({ suit: suit as Card['suit'], rank: r as Card['rank'] });
  }
  return cards;
}

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
  return {
    calls,
    currentBid,
    doubleStatus,
    passCount,
    isComplete: false,
    passedOut: false,
  };
}

describe('SAYC bidder — opening bids', () => {
  it('opens 1NT with 15-17 balanced', () => {
    // AK4=7, K53=3, Q52=2, KQ54=5 → 17 HCP, 3-3-3-4 balanced
    const hand = makeHand({ spades: 'AK4', hearts: 'K53', diamonds: 'Q52', clubs: 'KQ54' });
    const bid = chooseBid(hand, 'south', makeBidding([]));
    expect(bid).toEqual({ type: 'bid', level: 1, strain: 'notrump' });
  });

  it('opens 1♠ with 12 HCP and 5+ spades', () => {
    const hand = makeHand({ spades: 'AKQ54', hearts: 'K54', diamonds: '842', clubs: '54' });
    const bid = chooseBid(hand, 'south', makeBidding([]));
    expect(bid).toEqual({ type: 'bid', level: 1, strain: 'spades' });
  });

  it('opens 2♣ with 22+ HCP', () => {
    const hand = makeHand({ spades: 'AKQJ', hearts: 'AKQ', diamonds: 'AK4', clubs: '542' });
    const bid = chooseBid(hand, 'south', makeBidding([]));
    expect(bid).toEqual({ type: 'bid', level: 2, strain: 'clubs' });
  });

  it('opens weak 2♠ with 6-10 HCP and 6+ spades', () => {
    const hand = makeHand({ spades: 'KQJ543', hearts: '54', diamonds: '842', clubs: '54' });
    const bid = chooseBid(hand, 'south', makeBidding([]));
    expect(bid).toEqual({ type: 'bid', level: 2, strain: 'spades' });
  });

  it('passes with fewer than 12 HCP', () => {
    const hand = makeHand({ spades: 'K84', hearts: 'Q73', diamonds: 'J652', clubs: '542' });
    const bid = chooseBid(hand, 'south', makeBidding([]));
    expect(bid).toEqual({ type: 'pass' });
  });
});

describe('SAYC bidder — opener rebid after 1M-1NT (bug from screenshot)', () => {
  // Opener has 18-19 balanced (would open 1♠ due to 5-card major)
  // Sequence: South 1♠, W Pass, North 1NT, E Pass → South rebid
  const seq1S_P_1NT_P = (): BiddingState =>
    makeBidding([
      { seat: 'south', call: { type: 'bid', level: 1, strain: 'spades' } },
      { seat: 'west', call: { type: 'pass' } },
      { seat: 'north', call: { type: 'bid', level: 1, strain: 'notrump' } },
      { seat: 'east', call: { type: 'pass' } },
    ]);

  it('18-19 balanced (5-card spades) rebids 2NT — NOT 3NT', () => {
    // AKQ54=9, KJ3=4, AJ4=5, 53=0 → 18 HCP, 5-3-3-2 balanced
    const hand = makeHand({ spades: 'AKQ54', hearts: 'KJ3', diamonds: 'AJ4', clubs: '53' });
    const bid = chooseBid(hand, 'south', seq1S_P_1NT_P());
    expect(bid).toEqual({ type: 'bid', level: 2, strain: 'notrump' });
    // Explicitly assert it did NOT jump to 3NT (the old bug)
    expect(bid).not.toEqual({ type: 'bid', level: 3, strain: 'notrump' });
  });

  it('minimum opener (12-14) with 6-card suit rebids 2 of own suit', () => {
    const hand = makeHand({ spades: 'AQ8542', hearts: 'K54', diamonds: '842', clubs: '5' });
    const bid = chooseBid(hand, 'south', seq1S_P_1NT_P());
    expect(bid).toEqual({ type: 'bid', level: 2, strain: 'spades' });
  });

  it('16-18 with 6-card suit jump rebids 3♠', () => {
    const hand = makeHand({ spades: 'AKQ854', hearts: 'AK4', diamonds: 'K42', clubs: '5' });
    const bid = chooseBid(hand, 'south', seq1S_P_1NT_P());
    expect(bid).toEqual({ type: 'bid', level: 3, strain: 'spades' });
  });
});

describe('SAYC bidder — 1NT responses', () => {
  const open1NT = (): BiddingState =>
    makeBidding([
      { seat: 'south', call: { type: 'bid', level: 1, strain: 'notrump' } },
      { seat: 'west', call: { type: 'pass' } },
    ]);

  it('responder with 8 HCP and a 4-card major bids Stayman (2♣)', () => {
    // KJ54=4, 763=0, Q52=2, Q54=2 → 8 HCP with 4-card spade suit
    const hand = makeHand({ spades: 'KJ54', hearts: '763', diamonds: 'Q52', clubs: 'Q54' });
    const bid = chooseBid(hand, 'north', open1NT());
    expect(bid).toEqual({ type: 'bid', level: 2, strain: 'clubs' });
  });

  it('responder with 5+ hearts transfers with 2♦', () => {
    const hand = makeHand({ spades: '54', hearts: 'KQJ54', diamonds: '842', clubs: 'J54' });
    const bid = chooseBid(hand, 'north', open1NT());
    expect(bid).toEqual({ type: 'bid', level: 2, strain: 'diamonds' });
  });

  it('responder with 5+ spades transfers with 2♥', () => {
    const hand = makeHand({ spades: 'KQJ54', hearts: '54', diamonds: '842', clubs: 'J54' });
    const bid = chooseBid(hand, 'north', open1NT());
    expect(bid).toEqual({ type: 'bid', level: 2, strain: 'hearts' });
  });

  it('responder with 8-9 balanced (no 4-card major) invites 2NT', () => {
    // Q83=2, K73=3, J652=1, Q54=2 → 8 HCP, no 4-card major, 3-3-4-3 balanced
    const hand = makeHand({ spades: 'Q83', hearts: 'K73', diamonds: 'J652', clubs: 'Q54' });
    const bid = chooseBid(hand, 'north', open1NT());
    expect(bid).toEqual({ type: 'bid', level: 2, strain: 'notrump' });
  });

  it('responder with 10-15 balanced (no 4-card major) bids 3NT', () => {
    // K83=3, 763=0, A652=4, AK54=7 → 14 HCP, no 4-card major, 3-3-4-3 balanced
    const hand = makeHand({ spades: 'K83', hearts: '763', diamonds: 'A652', clubs: 'AK54' });
    const bid = chooseBid(hand, 'north', open1NT());
    expect(bid).toEqual({ type: 'bid', level: 3, strain: 'notrump' });
  });
});

describe('SAYC bidder — 1M responses', () => {
  const open1S = (): BiddingState =>
    makeBidding([
      { seat: 'south', call: { type: 'bid', level: 1, strain: 'spades' } },
      { seat: 'west', call: { type: 'pass' } },
    ]);

  it('6-9 HCP with 3-card spade support raises to 2♠', () => {
    const hand = makeHand({ spades: 'K83', hearts: 'J73', diamonds: '8652', clubs: 'Q54' });
    const bid = chooseBid(hand, 'north', open1S());
    expect(bid).toEqual({ type: 'bid', level: 2, strain: 'spades' });
  });

  it('10-12 HCP with 4-card support makes a limit raise 3♠', () => {
    const hand = makeHand({ spades: 'K853', hearts: 'AJ3', diamonds: '852', clubs: 'K54' });
    const bid = chooseBid(hand, 'north', open1S());
    expect(bid).toEqual({ type: 'bid', level: 3, strain: 'spades' });
  });

  it('minimum responder (<6 HCP) passes', () => {
    const hand = makeHand({ spades: '3', hearts: 'J732', diamonds: '8652', clubs: 'J543' });
    const bid = chooseBid(hand, 'north', open1S());
    expect(bid).toEqual({ type: 'pass' });
  });

  it('6-10 HCP no fit bids 1NT', () => {
    const hand = makeHand({ spades: '83', hearts: 'K732', diamonds: '8652', clubs: 'K54' });
    const bid = chooseBid(hand, 'north', open1S());
    expect(bid).toEqual({ type: 'bid', level: 1, strain: 'notrump' });
  });
});

describe('SAYC bidder — overcalls & takeout doubles', () => {
  const opp1S = (): BiddingState =>
    makeBidding([
      { seat: 'south', call: { type: 'bid', level: 1, strain: 'spades' } },
    ]);

  it('12+ HCP short in spades with support for other suits doubles', () => {
    // 13 HCP, singleton spade, 4-4-4-1 shape
    const hand = makeHand({ spades: '5', hearts: 'KQ73', diamonds: 'AJ84', clubs: 'K843' });
    const bid = chooseBid(hand, 'west', opp1S());
    expect(bid).toEqual({ type: 'double' });
  });

  it('10-16 HCP with 5+ hearts overcalls 2♥', () => {
    // 54=0, KQJ84=6, AK4=7, 843=0 → 13 HCP with 5-card hearts
    const hand = makeHand({ spades: '54', hearts: 'KQJ84', diamonds: 'AK4', clubs: '843' });
    const bid = chooseBid(hand, 'west', opp1S());
    expect(bid).toEqual({ type: 'bid', level: 2, strain: 'hearts' });
  });

  it('weak hand passes', () => {
    const hand = makeHand({ spades: '83', hearts: 'J732', diamonds: '8652', clubs: 'J54' });
    const bid = chooseBid(hand, 'west', opp1S());
    expect(bid).toEqual({ type: 'pass' });
  });
});

describe('SAYC bidder — safety net', () => {
  it('never produces an illegal (too-low) bid; falls back to pass', () => {
    // Contrived: opponents have bid 4♠; simulate a weird scenario where opener would try to rebid
    const bidding = makeBidding([
      { seat: 'south', call: { type: 'bid', level: 1, strain: 'clubs' } },
      { seat: 'west', call: { type: 'bid', level: 4, strain: 'spades' } },
      { seat: 'north', call: { type: 'pass' } },
      { seat: 'east', call: { type: 'pass' } },
    ]);
    const hand = makeHand({ spades: '5', hearts: '842', diamonds: '842', clubs: 'AKQJ543' });
    const bid = chooseBid(hand, 'south', bidding);
    // Whatever the bidder wants, it must not be a level 1-3 bid (illegal below 4♠)
    if (bid.type === 'bid') {
      const strainIdx = ['clubs','diamonds','hearts','spades','notrump'].indexOf(bid.strain);
      const spadesIdx = 3;
      const higher = bid.level > 4 || (bid.level === 4 && strainIdx > spadesIdx);
      expect(higher).toBe(true);
    }
    // If not a bid, must be pass/double/redouble — all fine
  });
});
