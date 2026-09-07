import type { BidCall, BiddingState, LevelBid } from '@goatbridge/shared';
import type { Card, Suit } from '@goatbridge/shared';
import type { Seat } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';
import { evaluateHand, type HandEvaluation } from './handEvaluator.js';
import { validateCall } from '../../game/bidding.js';

const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
const MAJORS: Suit[] = ['hearts', 'spades'];
const MINORS: Suit[] = ['clubs', 'diamonds'];

type Role =
  | { kind: 'opening' }
  | { kind: 'overcaller-first'; opening: { seat: Seat; call: LevelBid } }
  | { kind: 'responder-first'; opening: { seat: Seat; call: LevelBid }; interference: LevelBid | null }
  | {
      kind: 'advancer-after-takeout-double';
      opening: { seat: Seat; call: LevelBid };
      doubledBid: LevelBid;
    }
  | { kind: 'advancer-first'; overcall: { seat: Seat; call: LevelBid }; opening: { seat: Seat; call: LevelBid } }
  | {
      kind: 'opener-rebid';
      opening: LevelBid;
      response: LevelBid | null; // null if partner passed
      interference: boolean;
      interferenceBid: LevelBid | null;
    }
  | {
      kind: 'opener-second-rebid';
      opening: LevelBid;
      response: LevelBid | null;
      myRebid: BidCall | null;
      partnerLatest: BidCall | null;
    }
  | {
      kind: 'responder-rebid';
      opening: LevelBid;
      response: LevelBid;
      openerRebid: BidCall | null;
    }
  | { kind: 'competitive-rebid'; opening: { seat: Seat; call: LevelBid } };

function partnerIdx(seatIdx: number): number {
  return (seatIdx + 2) % 4;
}

function minLegalLevelForStrain(
  strain: Suit | 'notrump',
  currentBid: LevelBid | null,
): number {
  if (!currentBid) return 1;
  const strainOrder: (Suit | 'notrump')[] = ['clubs', 'diamonds', 'hearts', 'spades', 'notrump'];
  const myIdx = strainOrder.indexOf(strain);
  const oppIdx = strainOrder.indexOf(currentBid.strain);
  return myIdx > oppIdx ? currentBid.level : currentBid.level + 1;
}

function suitHonors(hand: Card[], suit: Suit): number {
  return hand.filter(card => card.suit === suit && ['A', 'K', 'Q', 'J', '10'].includes(card.rank)).length;
}

function hasSoundOvercallSuit(hand: Card[], suit: Suit, length: number): boolean {
  if (length >= 6) return true;
  const honors = suitHonors(hand, suit);
  return honors >= 2;
}

// ────────────────────────────────────────────────────────────────────────────
// Blackwood 4NT ace-ask (over agreed suit contracts)
// ────────────────────────────────────────────────────────────────────────────

function countAces(hand: Card[]): number {
  return hand.filter(c => c.rank === 'A').length;
}

function countKings(hand: Card[]): number {
  return hand.filter(c => c.rank === 'K').length;
}

/**
 * Detects if partner's most recent bid is a Blackwood 4NT ask.
 * True iff:
 *   - partner just bid 4NT
 *   - the auction has an established suit context (previous non-pass
 *     bid before 4NT is a suit at 3 or 4, not a natural NT)
 */
function isPartnerBlackwoodAsk(seat: Seat, bidding: BiddingState): boolean {
  const seatIdx = SEATS.indexOf(seat);
  const partnerSeat = SEATS[partnerIdx(seatIdx)]!;
  const calls = bidding.calls;
  // Find partner's most recent bid
  const partnerLast = [...calls].reverse().find(c => c.seat === partnerSeat && c.call.type === 'bid');
  if (!partnerLast) return false;
  const call = partnerLast.call as LevelBid;
  if (call.level !== 4 || call.strain !== 'notrump') return false;
  // Find the bid immediately preceding partner's 4NT
  const partnerIdxInCalls = calls.indexOf(partnerLast);
  const priorBids = calls
    .slice(0, partnerIdxInCalls)
    .filter(c => c.call.type === 'bid')
    .map(c => c.call as LevelBid);
  if (priorBids.length === 0) return false;
  const prev = priorBids[priorBids.length - 1]!;
  // If most recent prior bid is a natural NT (1NT/2NT/3NT), 4NT is quantitative, not Blackwood
  if (prev.strain === 'notrump') return false;
  // If auction only reached 1-of-a-suit, 4NT is more likely natural — require level ≥ 2
  if (prev.level < 2) return false;
  return true;
}

function answerBlackwood(hand: Card[]): BidCall {
  const aces = countAces(hand);
  // 5♣ = 0 or 4 aces, 5♦ = 1, 5♥ = 2, 5♠ = 3
  const map: Record<number, Suit> = { 0: 'clubs', 1: 'diamonds', 2: 'hearts', 3: 'spades', 4: 'clubs' };
  return { type: 'bid', level: 5, strain: map[aces]! };
}

/** Detects partner's 5NT king-ask following an earlier Blackwood 4NT sequence. */
function isPartnerBlackwoodKingAsk(seat: Seat, bidding: BiddingState): boolean {
  const seatIdx = SEATS.indexOf(seat);
  const partnerSeat = SEATS[partnerIdx(seatIdx)]!;
  const calls = bidding.calls;
  const partnerLast = [...calls].reverse().find(c => c.seat === partnerSeat && c.call.type === 'bid');
  if (!partnerLast) return false;
  const call = partnerLast.call as LevelBid;
  if (call.level !== 5 || call.strain !== 'notrump') return false;
  // Ensure I previously answered Blackwood with 5-of-a-suit
  const partnerIdxInCalls = calls.indexOf(partnerLast);
  const myPrior = calls
    .slice(0, partnerIdxInCalls)
    .filter(c => c.seat === seat && c.call.type === 'bid');
  const lastMine = myPrior[myPrior.length - 1];
  if (!lastMine) return false;
  const lastBid = lastMine.call as LevelBid;
  return lastBid.level === 5 && lastBid.strain !== 'notrump';
}

function answerKingAsk(hand: Card[]): BidCall {
  const kings = countKings(hand);
  const map: Record<number, Suit> = { 0: 'clubs', 1: 'diamonds', 2: 'hearts', 3: 'spades', 4: 'clubs' };
  return { type: 'bid', level: 6, strain: map[kings]! };
}

// ────────────────────────────────────────────────────────────────────────────
// Gerber 4♣ ace-ask (over NT contracts)
// Responses: 4♦=0/4, 4♥=1, 4♠=2, 4NT=3
// ────────────────────────────────────────────────────────────────────────────

function isPartnerGerberAsk(seat: Seat, bidding: BiddingState): boolean {
  const seatIdx = SEATS.indexOf(seat);
  const partnerSeat = SEATS[partnerIdx(seatIdx)]!;
  const calls = bidding.calls;
  const partnerLast = [...calls].reverse().find(c => c.seat === partnerSeat && c.call.type === 'bid');
  if (!partnerLast) return false;
  const call = partnerLast.call as LevelBid;
  if (call.level !== 4 || call.strain !== 'clubs') return false;
  // Prior bid must be a natural NT (1NT/2NT/3NT) for Gerber to apply
  const partnerIdxInCalls = calls.indexOf(partnerLast);
  const priorBids = calls
    .slice(0, partnerIdxInCalls)
    .filter(c => c.call.type === 'bid')
    .map(c => c.call as LevelBid);
  if (priorBids.length === 0) return false;
  const prev = priorBids[priorBids.length - 1]!;
  return prev.strain === 'notrump';
}

function answerGerber(hand: Card[]): BidCall {
  const aces = countAces(hand);
  const map: Record<number, { level: number; strain: Suit | 'notrump' }> = {
    0: { level: 4, strain: 'diamonds' },
    1: { level: 4, strain: 'hearts' },
    2: { level: 4, strain: 'spades' },
    3: { level: 4, strain: 'notrump' },
    4: { level: 4, strain: 'diamonds' },
  };
  const m = map[aces]!;
  return { type: 'bid', level: m.level, strain: m.strain };
}

// Ensures a chosen bid is legal (strictly higher than currentBid); else pass.
function maybeLegal(chosen: BidCall, bidding: BiddingState): BidCall {
  if (chosen.type !== 'bid') return chosen;
  if (!bidding.currentBid) return chosen;
  const cb = bidding.currentBid;
  const strainIdx = (s: string) => ['clubs', 'diamonds', 'hearts', 'spades', 'notrump'].indexOf(s);
  const higher = chosen.level > cb.level || (chosen.level === cb.level && strainIdx(chosen.strain) > strainIdx(cb.strain));
  return higher ? chosen : { type: 'pass' };
}


function classifyRole(seat: Seat, bidding: BiddingState): Role {
  const seatIdx = SEATS.indexOf(seat);
  const partnerSeat = SEATS[partnerIdx(seatIdx)]!;
  const calls = bidding.calls;

  // No prior level-bid → opening seat
  const firstBidIdx = calls.findIndex(c => c.call.type === 'bid');
  if (firstBidIdx === -1) return { kind: 'opening' };

  const opener = calls[firstBidIdx]!;
  const openingCall = opener.call as LevelBid;
  const openerSeat = opener.seat as Seat;
  const iOpened = openerSeat === seat;
  const partnerOpened = openerSeat === partnerSeat;

  // Count my own prior level bids
  const myPriorBids = calls
    .slice(0, calls.length)
    .filter(c => c.seat === seat && c.call.type === 'bid').length;

  const partnersPriorBids = calls
    .filter(c => c.seat === partnerSeat && c.call.type === 'bid')
    .map(c => c.call as LevelBid);

  if (iOpened) {
    // Opener
    const response = partnersPriorBids[0] ?? null;
    // interference = between opener and partner's response there was an opp bid
    const interference =
      response
        ? calls
            .slice(firstBidIdx + 1)
            .findIndex(c => c.seat === partnerSeat && c.call.type === 'bid') > 0
        : false;
    if (myPriorBids === 1) {
      // Interference between opener and partner's response (if response exists)
      // OR between response and my rebid seat.
      const callsAfterOpen = calls.slice(firstBidIdx + 1);
      const oppBidBeforeMe = callsAfterOpen
        .filter(c => c.seat !== seat && c.seat !== partnerSeat && c.call.type === 'bid')
        .map(c => c.call as LevelBid);
      const interferenceBid = oppBidBeforeMe.length > 0 ? oppBidBeforeMe[oppBidBeforeMe.length - 1]! : null;
      return { kind: 'opener-rebid', opening: openingCall, response, interference, interferenceBid };
    }
    // 2nd+ opener rebid: gather my prior rebid + partner's latest bid so we can handle NMF etc.
    const myBids = calls.filter(c => c.seat === seat && c.call.type === 'bid');
    const myRebid = myBids[1] ? myBids[1]!.call : null;
    const partnerLatestEntry = [...calls].reverse().find(c => c.seat === partnerSeat && c.call.type === 'bid');
    const partnerLatest = partnerLatestEntry ? partnerLatestEntry.call : null;
    return {
      kind: 'opener-second-rebid',
      opening: openingCall,
      response,
      myRebid,
      partnerLatest,
    };
  }

  if (partnerOpened) {
    if (myPriorBids === 0) {
      // Detect RHO interference (any opp bid between opener's bid and me)
      const interferenceEntry = calls
        .slice(firstBidIdx + 1)
        .find(c => c.seat !== seat && c.seat !== partnerSeat && c.call.type === 'bid');
      const interference = interferenceEntry ? (interferenceEntry.call as LevelBid) : null;
      return { kind: 'responder-first', opening: { seat: openerSeat, call: openingCall }, interference };
    }
    // Responder rebid
    const response = partnersPriorBids[0]; // partner (opener) rebid — actually myPrior responses = my bids
    void response;
    const myResponse = calls.find(c => c.seat === seat && c.call.type === 'bid');
    const openerRebidEntry = calls
      .slice((myResponse ? calls.indexOf(myResponse) : 0) + 1)
      .find(c => c.seat === partnerSeat);
    const openerRebid = openerRebidEntry ? openerRebidEntry.call : null;
    return {
      kind: 'responder-rebid',
      opening: openingCall,
      response: (myResponse!.call as LevelBid),
      openerRebid,
    };
  }

  // Opponent opened
  const partnerFirstDoubleEntry = calls.find(c => c.seat === partnerSeat && c.call.type === 'double');
  if (partnerFirstDoubleEntry && myPriorBids === 0) {
    const partnerDoubleIdx = calls.indexOf(partnerFirstDoubleEntry);
    const doubledBidEntry = [...calls.slice(0, partnerDoubleIdx)].reverse().find(c => c.call.type === 'bid');
    if (doubledBidEntry && doubledBidEntry.call.type === 'bid') {
      return {
        kind: 'advancer-after-takeout-double',
        opening: { seat: openerSeat, call: openingCall },
        doubledBid: doubledBidEntry.call,
      };
    }
  }

  const partnerOvercalled = partnersPriorBids.length > 0;
  if (partnerOvercalled && myPriorBids === 0) {
    // Find partner's overcall entry
    const overcallEntry = calls.find(c => c.seat === partnerSeat && c.call.type === 'bid')!;
    return {
      kind: 'advancer-first',
      overcall: { seat: partnerSeat, call: overcallEntry.call as LevelBid },
      opening: { seat: openerSeat, call: openingCall },
    };
  }
  if (!partnerOvercalled && myPriorBids === 0) {
    return { kind: 'overcaller-first', opening: { seat: openerSeat, call: openingCall } };
  }
  return { kind: 'competitive-rebid', opening: { seat: openerSeat, call: openingCall } };
}

// ────────────────────────────────────────────────────────────────────────────
// Opening bids
// ────────────────────────────────────────────────────────────────────────────

function openingBid(eval_: HandEvaluation): BidCall {
  const { hcp, isBalanced, shape } = eval_;

  if (hcp >= 22) return { type: 'bid', level: 2, strain: 'clubs' };

  if (isBalanced) {
    if (hcp >= 15 && hcp <= 17) return { type: 'bid', level: 1, strain: 'notrump' };
    if (hcp >= 20 && hcp <= 21) return { type: 'bid', level: 2, strain: 'notrump' };
  }

  if (hcp < 12) {
    // Weak twos: 6-10 HCP, good 6-card major or diamonds
    if (hcp >= 6 && hcp <= 10) {
      if (shape.spades >= 6) return { type: 'bid', level: 2, strain: 'spades' };
      if (shape.hearts >= 6) return { type: 'bid', level: 2, strain: 'hearts' };
      if (shape.diamonds >= 6) return { type: 'bid', level: 2, strain: 'diamonds' };
    }
    // Preempts: 7-card suit, weak
    if (hcp >= 5 && hcp <= 10) {
      for (const s of SUITS) {
        if (shape[s] >= 7) return { type: 'bid', level: 3, strain: s };
      }
    }
    return { type: 'pass' };
  }

  // 12+ HCP, non-balanced-NT-range → 1-level opening
  if (shape.spades >= 5 && shape.spades >= shape.hearts) return { type: 'bid', level: 1, strain: 'spades' };
  if (shape.hearts >= 5) return { type: 'bid', level: 1, strain: 'hearts' };
  if (shape.diamonds >= shape.clubs) return { type: 'bid', level: 1, strain: 'diamonds' };
  return { type: 'bid', level: 1, strain: 'clubs' };
}

// ────────────────────────────────────────────────────────────────────────────
// Responder's first bid
// ────────────────────────────────────────────────────────────────────────────

function responderFirst(eval_: HandEvaluation, opening: LevelBid, interference: LevelBid | null = null): BidCall {
  const { hcp, shape, isBalanced, stoppers } = eval_;

  // Negative Doubles: after 1X-(1Y or 2Y overcall) with a suit interference through 3♠,
  // Dbl is takeout, showing 6+ HCP and unbid major(s).
  if (interference && interference.strain !== 'notrump' && opening.strain !== 'notrump') {
    const openSuit = opening.strain as Suit;
    const oppSuit = interference.strain as Suit;
    const isThroughThreeSpades =
      interference.level <= 2 ||
      (interference.level === 3 && ['clubs', 'diamonds', 'hearts', 'spades'].indexOf(oppSuit) <= 3);
    if (isThroughThreeSpades && hcp >= 6) {
      const unbidMajors = (['hearts', 'spades'] as Suit[]).filter(m => m !== openSuit && m !== oppSuit);
      // 1m-(1♥)-Dbl = 4+ spades; 1♣-(1♦)-Dbl = 4-4 majors; 1m-(1♠)-Dbl = 4+ hearts
      const majorsShown = unbidMajors.filter(m => shape[m] >= 4);
      const needsBothMajors = openSuit !== 'hearts' && openSuit !== 'spades' && oppSuit !== 'hearts' && oppSuit !== 'spades';
      if (needsBothMajors) {
        if (shape.hearts >= 4 && shape.spades >= 4) return { type: 'double' };
      } else if (unbidMajors.length === 1 && majorsShown.length === 1) {
        // Higher HCP required for 2-level negative doubles (8+)
        if (interference.level === 1 || (interference.level >= 2 && hcp >= 8)) {
          return { type: 'double' };
        }
      } else if (unbidMajors.length === 2 && majorsShown.length >= 1) {
        if (interference.level === 1 || hcp >= 8) return { type: 'double' };
      }
    }
    // Raise partner's suit through interference
    if (shape[openSuit] >= 3 && (openSuit === 'hearts' || openSuit === 'spades')) {
      if (hcp >= 10 && shape[openSuit] >= 4) return { type: 'bid', level: 3, strain: openSuit };
      if (hcp >= 6 && hcp <= 9) return { type: 'bid', level: 2, strain: openSuit };
    }
    // Otherwise fall through to normal logic (may pass if nothing else fits)
  }

  // Response to 1NT (15-17 balanced)
  if (opening.strain === 'notrump' && opening.level === 1) {
    // Stayman with 4-card major and 8+ HCP
    const has4CardMajor = shape.hearts >= 4 || shape.spades >= 4;
    if (hcp >= 8 && has4CardMajor) return { type: 'bid', level: 2, strain: 'clubs' };
    // Jacoby transfer to hearts
    if (shape.hearts >= 5 && shape.hearts >= shape.spades) return { type: 'bid', level: 2, strain: 'diamonds' };
    // Jacoby transfer to spades
    if (shape.spades >= 5) return { type: 'bid', level: 2, strain: 'hearts' };
    // 2NT invitational
    if (hcp >= 8 && hcp <= 9) return { type: 'bid', level: 2, strain: 'notrump' };
    // 3NT to play (10-15)
    if (hcp >= 10 && hcp <= 15) return { type: 'bid', level: 3, strain: 'notrump' };
    // 4NT quantitative invite to slam (16-17)
    if (hcp >= 16 && hcp <= 17) return { type: 'bid', level: 4, strain: 'notrump' };
    // 6NT to play (18-19)
    if (hcp >= 18) return { type: 'bid', level: 6, strain: 'notrump' };
    return { type: 'pass' };
  }

  // Response to 2NT (20-21 balanced)
  if (opening.strain === 'notrump' && opening.level === 2) {
    const has4CardMajor = shape.hearts >= 4 || shape.spades >= 4;
    if (hcp >= 4 && has4CardMajor) return { type: 'bid', level: 3, strain: 'clubs' }; // Stayman
    if (shape.hearts >= 5) return { type: 'bid', level: 3, strain: 'diamonds' }; // transfer
    if (shape.spades >= 5) return { type: 'bid', level: 3, strain: 'hearts' }; // transfer
    if (hcp >= 4) return { type: 'bid', level: 3, strain: 'notrump' };
    return { type: 'pass' };
  }

  // Response to strong 2♣ — waiting bid
  if (opening.strain === 'clubs' && opening.level === 2 /* strong 2♣ */) {
    if (hcp >= 8) {
      // Show a good 5+ suit (very simplified positive)
      for (const s of ['spades', 'hearts', 'diamonds'] as Suit[]) {
        if (shape[s] >= 5) return { type: 'bid', level: 2, strain: s };
      }
      return { type: 'bid', level: 2, strain: 'notrump' }; // 2NT positive balanced 8+
    }
    return { type: 'bid', level: 2, strain: 'diamonds' }; // waiting
  }

  // Weak two response
  if (opening.level === 2 && opening.strain !== 'clubs' && opening.strain !== 'notrump') {
    const suit = opening.strain as Suit;
    // Raise with 3+ card support and some HCP; game with fit and 12+
    if (shape[suit] >= 3) {
      if (hcp >= 15) return { type: 'bid', level: 4, strain: suit };
      if (hcp >= 8) return { type: 'bid', level: 3, strain: suit }; // preemptive/invitational raise
    }
    if (hcp >= 16 && isBalanced) return { type: 'bid', level: 2, strain: 'notrump' }; // feature ask
    return { type: 'pass' };
  }

  // Response to 1 of a suit
  if (opening.level === 1 && opening.strain !== 'notrump') {
    const openerSuit = opening.strain as Suit;
    const isMajorOpen = openerSuit === 'hearts' || openerSuit === 'spades';

    if (hcp < 6) return { type: 'pass' };

    if (isMajorOpen) {
      // Jacoby 2NT: 4+ trump support, 13+ HCP, no void/singleton in a side suit
      // that we'd rather show first. Priority over 4M raise (allows slam try).
      if (
        shape[openerSuit] >= 4 &&
        hcp >= 13 // Jacoby 2NT is unlimited on top: any GF major raise with 4+ trump
      ) {
        return { type: 'bid', level: 2, strain: 'notrump' };
      }
      // Raises (standard SAYC: 2M=6-10 w/ 3+, 3M=10-12 w/ 4+, 4M=<13 w/ 5+)
      if (shape[openerSuit] >= 5 && hcp < 10) {
        return { type: 'bid', level: 4, strain: openerSuit }; // preemptive game raise
      }
      if (shape[openerSuit] >= 4 && hcp >= 10 && hcp <= 12) {
        return { type: 'bid', level: 3, strain: openerSuit }; // limit raise
      }
      if (shape[openerSuit] >= 3 && hcp >= 6 && hcp <= 9) {
        return { type: 'bid', level: 2, strain: openerSuit }; // simple raise
      }
      // New suit at 1-level (spades over 1H) with 4+
      if (openerSuit === 'hearts' && shape.spades >= 4 && hcp >= 6)
        return { type: 'bid', level: 1, strain: 'spades' };
      // 2/1 game force: 11+ HCP with 5+ card side suit
      if (hcp >= 11) {
        for (const s of ['clubs', 'diamonds'] as Suit[]) {
          if (shape[s] >= 5 && s !== openerSuit) return { type: 'bid', level: 2, strain: s };
        }
        if (openerSuit === 'spades' && shape.hearts >= 5) return { type: 'bid', level: 2, strain: 'hearts' };
      }
      // 1NT semi-forcing catch-all
      return { type: 'bid', level: 1, strain: 'notrump' };
    }

    // Minor open — respond with 4-card major up-the-line at 1-level
    if (hcp >= 6) {
      if (shape.hearts >= 4) return { type: 'bid', level: 1, strain: 'hearts' };
      if (shape.spades >= 4) return { type: 'bid', level: 1, strain: 'spades' };
      // No 4-card major
      if (isBalanced) {
        if (hcp >= 13) return { type: 'bid', level: 2, strain: 'notrump' };
        if (hcp >= 6 && hcp <= 10) return { type: 'bid', level: 1, strain: 'notrump' };
      }
      // Raise partner's minor
      if (shape[openerSuit] >= 5) {
        if (hcp >= 11) return { type: 'bid', level: 3, strain: openerSuit };
        return { type: 'bid', level: 2, strain: openerSuit };
      }
      // fallback
      return { type: 'bid', level: 1, strain: 'notrump' };
    }
  }

  // Reference stoppers to silence unused warning in a safe branch
  void stoppers;
  return { type: 'pass' };
}

// ────────────────────────────────────────────────────────────────────────────
// New Minor Forcing (NMF) helpers
//   Applies after:
//     1m - 1M - 1NT  →  NMF = 2 of the other minor
//     1m - 1M - 2NT  →  NMF = 3 of the other minor
//   NMF is artificial and forcing to game (or invitational with 2NT rebid path).
//   Asks opener to show 3-card support for responder's major or a 4-card other
//   major, otherwise clarify shape (rebid own suit / NT).
// ────────────────────────────────────────────────────────────────────────────

interface NMFTrigger {
  ask: LevelBid;
  responderMajor: Suit; // hearts or spades
  openerRebidLevel: 1 | 2; // 1NT rebid or 2NT rebid
}

function detectNMFTrigger(
  opening: LevelBid,
  response: LevelBid,
  openerRebid: BidCall,
): NMFTrigger | null {
  if (openerRebid.type !== 'bid') return null;
  if (openerRebid.strain !== 'notrump') return null;
  if (openerRebid.level !== 1 && openerRebid.level !== 2) return null;
  if (opening.strain !== 'clubs' && opening.strain !== 'diamonds') return null;
  if (response.level !== 1) return null;
  if (response.strain !== 'hearts' && response.strain !== 'spades') return null;
  const newMinor: Suit = opening.strain === 'clubs' ? 'diamonds' : 'clubs';
  const askLevel = openerRebid.level === 1 ? 2 : 3;
  return {
    ask: { type: 'bid', level: askLevel, strain: newMinor },
    responderMajor: response.strain as Suit,
    openerRebidLevel: openerRebid.level as 1 | 2,
  };
}

/** Returns true if `partnerLatest` is the NMF ask consistent with this auction. */
function isNMFAsk(
  opening: LevelBid,
  response: LevelBid | null,
  myRebid: BidCall | null,
  partnerLatest: BidCall | null,
): NMFTrigger | null {
  if (!response || !myRebid || !partnerLatest) return null;
  if (myRebid.type !== 'bid' || partnerLatest.type !== 'bid') return null;
  const trigger = detectNMFTrigger(opening, response, myRebid);
  if (!trigger) return null;
  if (partnerLatest.strain !== trigger.ask.strain) return null;
  if (partnerLatest.level !== trigger.ask.level) return null;
  return trigger;
}


function openerRebid(
  eval_: HandEvaluation,
  opening: LevelBid,
  response: LevelBid | null,
  interferenceBid: LevelBid | null = null,
): BidCall {
  const { hcp, totalPoints, shape, isBalanced, stoppers } = eval_;
  const openerSuit = opening.strain !== 'notrump' ? (opening.strain as Suit) : null;

  // Support Double: after 1X - (P) - 1Y - (opp overcalls up to 2Y),
  // opener's Dbl shows EXACTLY 3-card support for responder's suit.
  if (response && response.strain !== 'notrump' && response.level === 1 && interferenceBid) {
    const respSuit = response.strain as Suit;
    const oppLevel = interferenceBid.level;
    // Applies when opp overcall is at or below 2 of responder's suit
    const strainRank = ['clubs', 'diamonds', 'hearts', 'spades'];
    const oppOverBelow2Resp =
      oppLevel === 1 ||
      (oppLevel === 2 && strainRank.indexOf(interferenceBid.strain) < strainRank.indexOf(respSuit));
    if (oppOverBelow2Resp && shape[respSuit] === 3) {
      return { type: 'double' };
    }
    // With 4-card support, raise instead
    if (shape[respSuit] >= 4) {
      if (totalPoints >= 16) return maybeLegal({ type: 'bid', level: 3, strain: respSuit }, { calls: [], currentBid: interferenceBid, doubleStatus: 'none', passCount: 0, isComplete: false, passedOut: false });
      return maybeLegal({ type: 'bid', level: 2, strain: respSuit }, { calls: [], currentBid: interferenceBid, doubleStatus: 'none', passCount: 0, isComplete: false, passedOut: false });
    }
  }

  // Partner passed → auction is essentially over. Pass unless super strong.
  if (!response) return { type: 'pass' };

  // Rebids after 1NT opening — normally partner uses Stayman/transfers; handle common cases
  if (opening.strain === 'notrump' && opening.level === 1) {
    // Stayman: partner bid 2♣ → show 4-card major, else 2♦
    if (response.strain === 'clubs' && response.level === 2) {
      if (shape.hearts >= 4 && shape.hearts >= shape.spades) return { type: 'bid', level: 2, strain: 'hearts' };
      if (shape.spades >= 4) return { type: 'bid', level: 2, strain: 'spades' };
      return { type: 'bid', level: 2, strain: 'diamonds' };
    }
    // Jacoby transfer accept
    if (response.strain === 'diamonds' && response.level === 2) return { type: 'bid', level: 2, strain: 'hearts' };
    if (response.strain === 'hearts' && response.level === 2) return { type: 'bid', level: 2, strain: 'spades' };
    // 2NT invitational — accept with max (17)
    if (response.strain === 'notrump' && response.level === 2) {
      if (hcp >= 17) return { type: 'bid', level: 3, strain: 'notrump' };
      return { type: 'pass' };
    }
    return { type: 'pass' };
  }

  // Opener rebids after 1-of-a-suit opening
  if (opening.level !== 1 || !openerSuit) return { type: 'pass' };

  // Jacoby 2NT answer: partner bid 2NT after our 1M — GF raise, 4+ trumps, 13+ HCP.
  // Canonical answers (Karen Walker):
  //   3-of-a-side-suit (below 4M) = singleton or void in that suit
  //   4-of-a-side-suit (below 4M) = 5-card second suit, no shortness
  //   3NT = 12-14 balanced, no shortness, no side suit
  //   3M (rebid own suit at 3) = 15+ HCP no shortness, slam interest
  //   4M = 12-14, no shortness, no side suit (minimum)
  const isMajorOpen = openerSuit === 'hearts' || openerSuit === 'spades';
  if (isMajorOpen && response.strain === 'notrump' && response.level === 2) {
    // 1) Shortness in a side suit (singleton or void)?
    const sideSuits: Suit[] = SUITS.filter(s => s !== openerSuit);
    for (const s of sideSuits) {
      if (shape[s] <= 1) {
        // Must be bid at a level <= 3 (below 4M). All 3-level sides are legal.
        const strainIdx = ['clubs', 'diamonds', 'hearts', 'spades'].indexOf(s);
        const openerIdx = ['clubs', 'diamonds', 'hearts', 'spades'].indexOf(openerSuit);
        // If side suit is higher-ranked than opener's major, bidding it at 3 exceeds 3M — skip
        if (strainIdx > openerIdx) continue;
        return { type: 'bid', level: 3, strain: s };
      }
    }
    // 2) 5-card side suit (no shortness) → show it at the 4-level (below or at game)
    for (const s of sideSuits) {
      if (shape[s] >= 5) {
        const strainIdx = ['clubs', 'diamonds', 'hearts', 'spades'].indexOf(s);
        const openerIdx = ['clubs', 'diamonds', 'hearts', 'spades'].indexOf(openerSuit);
        if (strainIdx < openerIdx) {
          return { type: 'bid', level: 4, strain: s };
        }
        // Higher-ranked side suit than opener's major would push past 4M; skip
      }
    }
    // 3) Balanced no-shortness distinctions
    if (hcp >= 15) {
      // Extras with slam interest — rebid own suit at 3
      return { type: 'bid', level: 3, strain: openerSuit };
    }
    if (isBalanced && hcp >= 12 && hcp <= 14) {
      // 3NT shows 12-14 balanced, no side interest
      return { type: 'bid', level: 3, strain: 'notrump' };
    }
    // Fallback: minimum, no shortness, no side suit → 4M
    return { type: 'bid', level: 4, strain: openerSuit };
  }

  // Partner raised our suit (simple raise 2M or limit raise 3M or game 4M)
  if (response.strain === openerSuit) {
    if (response.level === 2) {
      // Simple raise 6-10: pass on min, invite with 15-17, game with 18+
      if (totalPoints >= 18) return { type: 'bid', level: 4, strain: openerSuit };
      if (totalPoints >= 15) return { type: 'bid', level: 3, strain: openerSuit };
      return { type: 'pass' };
    }
    if (response.level === 3) {
      // Limit raise 10-12: accept with 14+ total pts
      if (totalPoints >= 14) return { type: 'bid', level: 4, strain: openerSuit };
      return { type: 'pass' };
    }
    if (response.level >= 4) return { type: 'pass' }; // preemptive raise
  }

  // Response was 1NT (6-10)
  if (response.strain === 'notrump' && response.level === 1) {
    // 18-19 balanced → jump to 2NT (invite)
    if (isBalanced && hcp >= 18 && hcp <= 19) return { type: 'bid', level: 2, strain: 'notrump' };
    // 12-14 with 6-card suit → rebid own suit at 2
    if (shape[openerSuit] >= 6) {
      if (hcp >= 16) return { type: 'bid', level: 3, strain: openerSuit }; // jump rebid 16-18
      return { type: 'bid', level: 2, strain: openerSuit };
    }
    // Bid a lower 4-card suit as a natural rebid
    for (const s of ['clubs', 'diamonds', 'hearts'] as Suit[]) {
      if (s === openerSuit) continue;
      if (shape[s] >= 4) return { type: 'bid', level: 2, strain: s };
    }
    return { type: 'pass' };
  }

  // Response was 1 of a new suit
  if (response.level === 1 && response.strain !== 'notrump') {
    const respSuit = response.strain as Suit;
    // 4+ card support for partner's major → raise
    if ((respSuit === 'hearts' || respSuit === 'spades') && shape[respSuit] >= 4) {
      if (totalPoints >= 19) return { type: 'bid', level: 4, strain: respSuit };
      if (totalPoints >= 16) return { type: 'bid', level: 3, strain: respSuit };
      return { type: 'bid', level: 2, strain: respSuit };
    }
    // 6-card opener suit → rebid it
    if (shape[openerSuit] >= 6) {
      if (hcp >= 16) return { type: 'bid', level: 3, strain: openerSuit };
      return { type: 'bid', level: 2, strain: openerSuit };
    }
    // Rebid 1NT with balanced 12-14
    if (isBalanced && hcp >= 12 && hcp <= 14) return { type: 'bid', level: 1, strain: 'notrump' };
    // Jump to 2NT with 18-19 balanced
    if (isBalanced && hcp >= 18 && hcp <= 19) return { type: 'bid', level: 2, strain: 'notrump' };
    // Bid a new 4-card suit up-the-line at the 1 or 2 level
    if (response.strain === 'hearts' && shape.spades >= 4) return { type: 'bid', level: 1, strain: 'spades' };
    for (const s of ['clubs', 'diamonds'] as Suit[]) {
      if (s === openerSuit) continue;
      if (shape[s] >= 4) return { type: 'bid', level: 2, strain: s };
    }
    return { type: 'pass' };
  }

  // Response was 2/1 (game force)
  if (response.level === 2 && response.strain !== openerSuit && response.strain !== 'notrump') {
    const respSuit = response.strain as Suit;
    // Support partner if 4+
    if (shape[respSuit] >= 4) return { type: 'bid', level: 3, strain: respSuit };
    // Rebid own suit with 6+
    if (shape[openerSuit] >= 6) return { type: 'bid', level: 3, strain: openerSuit };
    // 2NT with stopper in the remaining suit
    if (isBalanced && stoppers) return { type: 'bid', level: 2, strain: 'notrump' };
    return { type: 'bid', level: 2, strain: openerSuit };
  }

  // Response was 2NT (13-15 balanced game force in modern SAYC)
  if (response.strain === 'notrump' && response.level === 2) {
    if (hcp >= 15 || totalPoints >= 15) return { type: 'bid', level: 3, strain: 'notrump' };
    return { type: 'pass' };
  }

  return { type: 'pass' };
}

// ────────────────────────────────────────────────────────────────────────────
// Responder's rebid
// ────────────────────────────────────────────────────────────────────────────

function responderRebid(
  eval_: HandEvaluation,
  opening: LevelBid,
  response: LevelBid,
  openerRebid: BidCall | null,
): BidCall {
  const { hcp, totalPoints, shape, isBalanced, stoppers } = eval_;
  if (!openerRebid || openerRebid.type !== 'bid') return { type: 'pass' };

  // 4th Suit Forcing (GF): 1X-1Y-1Z pattern. If I have 12+ HCP with no fit
  // and no natural bid, bid the 4th (unbid) suit at the 2-level.
  if (
    opening.level === 1 && opening.strain !== 'notrump' &&
    response.level === 1 && response.strain !== 'notrump' &&
    openerRebid.level === 1 && openerRebid.strain !== 'notrump'
  ) {
    const bidSuits = new Set<Suit>([
      opening.strain as Suit,
      response.strain as Suit,
      openerRebid.strain as Suit,
    ]);
    const fourthSuit = SUITS.find(s => !bidSuits.has(s));
    if (fourthSuit && hcp >= 12) {
      const openerRebidSuit = openerRebid.strain as Suit;
      const responseSuit = response.strain as Suit;
      const openerSuit = opening.strain as Suit;
      // Check if there's already a natural rebid available: 3-card support for
      // opener's rebid major, a 6-card own suit, or balanced with NT bid
      const hasOpenerMajorSupport =
        (openerRebidSuit === 'hearts' || openerRebidSuit === 'spades') && shape[openerRebidSuit] >= 3;
      const hasLongOwnSuit = shape[responseSuit] >= 6;
      if (!hasOpenerMajorSupport && !hasLongOwnSuit && shape[openerSuit] < 3) {
        return { type: 'bid', level: 2, strain: fourthSuit };
      }
    }
  }

  // Blackwood ask: opener raised our major (or agreed a fit) and we have slam-try values.
  const openerRaisedMyMajor =
    (response.strain === 'hearts' || response.strain === 'spades') &&
    openerRebid.strain === response.strain &&
    openerRebid.level >= 3;
  const openerJumpRaisedInAJacoby =
    // Jacoby 2NT sequence: I bid 2NT, opener answered. If opener rebid own major at 3/4 = min/max
    response.strain === 'notrump' && response.level === 2 &&
    (opening.strain === 'hearts' || opening.strain === 'spades') &&
    openerRebid.strain === opening.strain;
  if (openerRaisedMyMajor && totalPoints >= 17 && shape[response.strain as Suit] >= 5) {
    return { type: 'bid', level: 4, strain: 'notrump' };
  }
  if (openerJumpRaisedInAJacoby && openerRebid.level === 3 && totalPoints >= 16) {
    // Opener showed extras (15+) → we have GF+ and slam try
    return { type: 'bid', level: 4, strain: 'notrump' };
  }

  // NMF: if opener rebid 1NT or 2NT and I have invitational+ values with major interest,
  // bid the "new minor" to ask about 3-card support / 4-card other major.
  const nmf = detectNMFTrigger(opening, response, openerRebid);
  if (nmf) {
    const other: Suit = nmf.responderMajor === 'hearts' ? 'spades' : 'hearts';
    const has5CardOwnMajor = shape[nmf.responderMajor] >= 5;
    const has4OtherMajor = shape[other] >= 4;
    const invitationalOrBetter = nmf.openerRebidLevel === 1 ? hcp >= 10 : hcp >= 4;
    if (invitationalOrBetter && (has5CardOwnMajor || has4OtherMajor)) {
      return nmf.ask;
    }
  }

  // Very conservative: with a decent hand, raise NT rebid to game
  if (openerRebid.strain === 'notrump' && openerRebid.level === 1 && hcp >= 12) {
    return { type: 'bid', level: 3, strain: 'notrump' };
  }
  if (openerRebid.strain === 'notrump' && openerRebid.level === 2 && hcp >= 5) {
    return { type: 'bid', level: 3, strain: 'notrump' };
  }
  // With extras, raise a jump-rebid suit to game
  if (openerRebid.level >= 3 && hcp >= 8) {
    if (openerRebid.strain === 'hearts' || openerRebid.strain === 'spades') {
      return { type: 'bid', level: 4, strain: openerRebid.strain as Suit };
    }
  }
  return { type: 'pass' };
}

// ────────────────────────────────────────────────────────────────────────────
// Opener's 2nd rebid (3rd bid) — mainly used to answer NMF
// ────────────────────────────────────────────────────────────────────────────

function openerSecondRebid(
  eval_: HandEvaluation,
  opening: LevelBid,
  response: LevelBid | null,
  myRebid: BidCall | null,
  partnerLatest: BidCall | null,
): BidCall {
  const { hcp, shape, isBalanced, stoppers } = eval_;

  // 4SF answer: partner bid the 4th suit at 2-level over my 1-level rebid → GF.
  // Describe: 3-card support for partner's major → raise; 6-card own suit → rebid;
  // stopper in 4SF suit → NT; else 2-level 3-card raise of partner's suit or nothing.
  if (
    opening.level === 1 && opening.strain !== 'notrump' &&
    response && response.level === 1 && response.strain !== 'notrump' &&
    myRebid && myRebid.type === 'bid' && myRebid.level === 1 && myRebid.strain !== 'notrump' &&
    partnerLatest && partnerLatest.type === 'bid' && partnerLatest.level === 2
  ) {
    const bidSuits = new Set<Suit>([
      opening.strain as Suit,
      response.strain as Suit,
      myRebid.strain as Suit,
    ]);
    const isFourthSuit = !bidSuits.has(partnerLatest.strain as Suit) && partnerLatest.strain !== 'notrump';
    if (isFourthSuit) {
      const responderSuit = response.strain as Suit;
      const fourthSuit = partnerLatest.strain as Suit;
      const openerSuit = opening.strain as Suit;
      // 1) 3+ card support for responder's major → raise it
      if ((responderSuit === 'hearts' || responderSuit === 'spades') && shape[responderSuit] >= 3) {
        return { type: 'bid', level: hcp >= 15 ? 3 : 2, strain: responderSuit };
      }
      // 2) Stopper in 4SF suit + balanced → NT
      if (stoppers && shape[fourthSuit] >= 2) {
        return { type: 'bid', level: hcp >= 15 ? 3 : 2, strain: 'notrump' };
      }
      // 3) 6-card opening suit → rebid it
      if (shape[openerSuit] >= 6) {
        return { type: 'bid', level: hcp >= 15 ? 3 : 2, strain: openerSuit };
      }
      // 4) Default fallback: NT (deny stopper, but game force)
      return { type: 'bid', level: 2, strain: 'notrump' };
    }
  }

  const nmf = isNMFAsk(opening, response, myRebid, partnerLatest);
  if (nmf && myRebid && myRebid.type === 'bid') {
    const responderMajor = nmf.responderMajor;
    const otherMajor: Suit = responderMajor === 'hearts' ? 'spades' : 'hearts';
    const baseLevel = nmf.openerRebidLevel === 1 ? 2 : 3;
    const isMax = nmf.openerRebidLevel === 1 ? hcp >= 14 : hcp >= 19;

    // 1) 3-card support for responder's major → bid it (jump with max)
    if (shape[responderMajor] >= 3) {
      const level = isMax ? baseLevel + 1 : baseLevel;
      return { type: 'bid', level, strain: responderMajor };
    }
    // 2) 4-card other major → show it (jump with max)
    if (shape[otherMajor] >= 4) {
      const level = isMax ? baseLevel + 1 : baseLevel;
      return { type: 'bid', level, strain: otherMajor };
    }
    // 3) No major fit — sign off in NT (min) or jump to 3NT (max)
    if (isBalanced) {
      if (nmf.openerRebidLevel === 1) {
        return { type: 'bid', level: isMax ? 3 : 2, strain: 'notrump' };
      }
      return { type: 'bid', level: 3, strain: 'notrump' };
    }
    // 4) 6+ card opening suit — rebid it
    if (opening.strain !== 'notrump' && shape[opening.strain as Suit] >= 6) {
      return { type: 'bid', level: baseLevel + 1, strain: opening.strain };
    }
    return { type: 'bid', level: baseLevel, strain: 'notrump' };
  }
  return { type: 'pass' };
}

// ────────────────────────────────────────────────────────────────────────────
// Overcaller / advancer (defensive side)
// ────────────────────────────────────────────────────────────────────────────

function overcallerFirst(
  eval_: HandEvaluation,
  hand: Card[],
  opening: { seat: Seat; call: LevelBid },
  bidding: BiddingState,
): BidCall {
  const { hcp, shape, isBalanced, stoppers } = eval_;
  const oppSuit = opening.call.strain !== 'notrump' ? (opening.call.strain as Suit) : null;
  const currentBid = bidding.currentBid;

  // Weak → pass
  if (hcp < 8) {
    // Preemptive jump overcall with 7-card suit and 5-10 HCP
    if (hcp >= 5) {
      for (const s of SUITS) {
        if (shape[s] >= 7 && s !== oppSuit) {
          const level = currentBid && currentBid.level >= 2 ? 3 : 2;
          return { type: 'bid', level, strain: s };
        }
      }
    }
    return { type: 'pass' };
  }

  // Helper: find the minimum legal level to bid suit s over currentBid
  const strainOrder: (Suit | 'notrump')[] = ['clubs', 'diamonds', 'hearts', 'spades', 'notrump'];
  const minLegalLevel = (s: Suit): number => {
    if (!currentBid) return 1;
    const myIdx = strainOrder.indexOf(s);
    const oppIdx = strainOrder.indexOf(currentBid.strain);
    return myIdx > oppIdx ? currentBid.level : currentBid.level + 1;
  };

  // 1NT overcall: 15-18 HCP balanced with stopper
  if (
    opening.call.level === 1 &&
    opening.call.strain !== 'notrump' &&
    hcp >= 15 &&
    hcp <= 18 &&
    isBalanced &&
    oppSuit &&
    stoppers[oppSuit]
  ) {
    return { type: 'bid', level: 1, strain: 'notrump' };
  }

  // Prefer a natural overcall with a good 5+ card suit (esp. majors) before takeout double.
  // A "good" suit here = at least 2 of top-3 honors (A/K/Q) or 3+ of top-5.
  if (hcp >= 8 && hcp <= 17) {
    for (const s of ['spades', 'hearts', 'diamonds', 'clubs'] as Suit[]) {
      if (s === oppSuit) continue;
      if (shape[s] < 5) continue;
      if (!hasSoundOvercallSuit(hand, s, shape[s])) continue;
      const minLevel = minLegalLevel(s);
      if (minLevel > 3) continue;
      if (minLevel >= 2 && hcp < 10) continue; // 2-level overcalls need opening strength
      return { type: 'bid', level: minLevel as 1 | 2 | 3, strain: s };
    }
  }

  // Takeout double: 12+ HCP, short in opener's suit (≤2), support (3+) for unbid suits
  if (
    opening.call.level === 1 &&
    opening.call.strain !== 'notrump' &&
    hcp >= 12 &&
    oppSuit &&
    shape[oppSuit] <= 2
  ) {
    const unbid = SUITS.filter(s => s !== oppSuit);
    const supports = unbid.filter(s => shape[s] >= 3).length;
    if (supports >= 3) return { type: 'double' };
  }

  return { type: 'pass' };
}

function advancerFirst(
  eval_: HandEvaluation,
  overcall: { seat: Seat; call: LevelBid },
  bidding: BiddingState,
): BidCall {
  const { hcp, shape } = eval_;
  if (overcall.call.type !== 'bid') return { type: 'pass' };
  const ocSuit = overcall.call.strain !== 'notrump' ? (overcall.call.strain as Suit) : null;
  if (!ocSuit) return { type: 'pass' };
  // Raise partner's overcall with 3+ support
  if (shape[ocSuit] >= 3) {
    const simpleRaiseLevel = minLegalLevelForStrain(ocSuit, bidding.currentBid);
    if (simpleRaiseLevel <= 7) {
      if (hcp >= 10 && shape[ocSuit] >= 4 && simpleRaiseLevel + 1 <= 7) {
        return { type: 'bid', level: (simpleRaiseLevel + 1) as 2 | 3 | 4 | 5 | 6 | 7, strain: ocSuit };
      }
      if (hcp >= 6) {
        return { type: 'bid', level: simpleRaiseLevel as 1 | 2 | 3 | 4 | 5 | 6 | 7, strain: ocSuit };
      }
    }
  }
  return { type: 'pass' };
}

function competitiveRebid(
  eval_: HandEvaluation,
  seat: Seat,
  bidding: BiddingState,
): BidCall {
  const { hcp, shape } = eval_;
  const partnerSeat = SEATS[partnerIdx(SEATS.indexOf(seat))]!;
  const priorCalls = bidding.calls;
  const myLastBid = [...priorCalls]
    .reverse()
    .find(entry => entry.seat === seat && entry.call.type === 'bid');

  const partnerLastBid = [...priorCalls]
    .reverse()
    .find(entry => entry.seat === partnerSeat && entry.call.type === 'bid');
  if (
    partnerLastBid?.call.type === 'bid' &&
    myLastBid?.call.type === 'bid' &&
    partnerLastBid.call.strain === myLastBid.call.strain &&
    partnerLastBid.call.strain !== 'notrump'
  ) {
    const suit = partnerLastBid.call.strain as Suit;
    const gameLevel = suit === 'hearts' || suit === 'spades' ? 4 : 5;
    if (bidding.currentBid?.strain === suit && bidding.currentBid.level < gameLevel && hcp >= 14) {
      return { type: 'bid', level: gameLevel as 4 | 5, strain: suit };
    }
    return { type: 'pass' };
  }

  if (partnerLastBid?.call.type === 'bid' && partnerLastBid.call.strain !== 'notrump') {
    const supportSuit = partnerLastBid.call.strain as Suit;
    if (shape[supportSuit] >= 3 && hcp >= 6) {
      const simpleRaiseLevel = minLegalLevelForStrain(supportSuit, bidding.currentBid);
      if (simpleRaiseLevel <= 7) {
        if (hcp >= 10 && shape[supportSuit] >= 4 && simpleRaiseLevel + 1 <= 7) {
          return { type: 'bid', level: (simpleRaiseLevel + 1) as 2 | 3 | 4 | 5 | 6 | 7, strain: supportSuit };
        }
        return { type: 'bid', level: simpleRaiseLevel as 1 | 2 | 3 | 4 | 5 | 6 | 7, strain: supportSuit };
      }
    }
  }

  if (myLastBid?.call.type === 'bid' && myLastBid.call.strain !== 'notrump') {
    const suit = myLastBid.call.strain as Suit;
    if (shape[suit] >= 6 && hcp >= 8) {
      const rebidLevel = minLegalLevelForStrain(suit, bidding.currentBid);
      if (rebidLevel <= 7) {
        return { type: 'bid', level: rebidLevel as 1 | 2 | 3 | 4 | 5 | 6 | 7, strain: suit };
      }
    }
  }

  return { type: 'pass' };
}

function advancerAfterTakeoutDouble(
  eval_: HandEvaluation,
  doubledBid: LevelBid,
  bidding: BiddingState,
): BidCall {
  const { hcp, shape, stoppers } = eval_;
  const oppSuit = doubledBid.strain !== 'notrump' ? (doubledBid.strain as Suit) : null;
  if (!oppSuit) return { type: 'pass' };

  // Penalty conversion: pass partner's takeout double only with real trump length + values.
  if (shape[oppSuit] >= 4 && hcp >= 8) return { type: 'pass' };

  const candidates = (['spades', 'hearts', 'diamonds', 'clubs'] as Suit[])
    .filter(s => s !== oppSuit)
    .sort((a, b) => {
      if (shape[b] !== shape[a]) return shape[b] - shape[a];
      const order: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
      return order.indexOf(a) - order.indexOf(b);
    });

  const bestSuit = candidates[0] ?? null;
  if (bestSuit) {
    const minLevel = minLegalLevelForStrain(bestSuit, bidding.currentBid);
    if (minLevel <= 7) {
      // Jump with invitational values and real suit length.
      if (hcp >= 10 && shape[bestSuit] >= 5 && minLevel + 1 <= 7) {
        return { type: 'bid', level: (minLevel + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7, strain: bestSuit };
      }
      return { type: 'bid', level: minLevel as 1 | 2 | 3 | 4 | 5 | 6 | 7, strain: bestSuit };
    }
  }

  if (hcp >= 8 && hcp <= 11 && stoppers[oppSuit]) {
    const ntLevel = minLegalLevelForStrain('notrump', bidding.currentBid);
    if (ntLevel <= 7) return { type: 'bid', level: ntLevel as 1 | 2 | 3 | 4 | 5 | 6 | 7, strain: 'notrump' };
  }

  return { type: 'pass' };
}

function findPendingTakeoutAdvance(
  seat: Seat,
  bidding: BiddingState,
): LevelBid | null {
  const seatIdx = SEATS.indexOf(seat);
  const partnerSeat = SEATS[partnerIdx(seatIdx)]!;
  const calls = bidding.calls;

  const myLastCallIndex = [...calls]
    .map((c, i) => ({ c, i }))
    .reverse()
    .find(x => x.c.seat === seat)?.i ?? -1;

  const partnerDoubleIndex = [...calls]
    .map((c, i) => ({ c, i }))
    .reverse()
    .find(x => x.i > myLastCallIndex && x.c.seat === partnerSeat && x.c.call.type === 'double')?.i;
  if (partnerDoubleIndex === undefined) return null;

  const doubledBidEntry = [...calls.slice(0, partnerDoubleIndex)].reverse().find(c => c.call.type === 'bid');
  if (!doubledBidEntry || doubledBidEntry.call.type !== 'bid') return null;

  // Only treat as takeout context when partner doubled an opponent's suit bid.
  const doublerOpponents = new Set<Seat>([
    SEATS[(SEATS.indexOf(partnerSeat) + 1) % 4]!,
    SEATS[(SEATS.indexOf(partnerSeat) + 3) % 4]!,
  ]);
  if (!doublerOpponents.has(doubledBidEntry.seat as Seat)) return null;

  return doubledBidEntry.call;
}

function applyAuctionMemoryGuardrails(
  chosen: BidCall,
  eval_: HandEvaluation,
  seat: Seat,
  bidding: BiddingState,
): BidCall {
  // Global guardrail: when partner has made a pending takeout double, don't pass with short trumps.
  if (chosen.type === 'pass') {
    const pendingTakeout = findPendingTakeoutAdvance(seat, bidding);
    if (pendingTakeout && pendingTakeout.strain !== 'notrump') {
      const oppSuit = pendingTakeout.strain as Suit;
      if (eval_.shape[oppSuit] < 4) {
        const forced = advancerAfterTakeoutDouble(eval_, pendingTakeout, bidding);
        if (forced.type !== 'pass') return forced;
      }
    }
  }
  return chosen;
}

// ────────────────────────────────────────────────────────────────────────────
// Entry point
// ────────────────────────────────────────────────────────────────────────────

export function chooseBid(
  hand: Card[],
  seat: Seat,
  bidding: BiddingState,
): BidCall {
  const eval_ = evaluateHand(hand);

  // Blackwood / Gerber answers take priority — partner has just asked.
  if (isPartnerBlackwoodAsk(seat, bidding)) {
    return maybeLegal(answerBlackwood(hand), bidding);
  }
  if (isPartnerBlackwoodKingAsk(seat, bidding)) {
    return maybeLegal(answerKingAsk(hand), bidding);
  }
  if (isPartnerGerberAsk(seat, bidding)) {
    return maybeLegal(answerGerber(hand), bidding);
  }

  const role = classifyRole(seat, bidding);

  let chosen: BidCall;
  switch (role.kind) {
    case 'opening':
      chosen = openingBid(eval_);
      break;
    case 'responder-first':
      chosen = responderFirst(eval_, role.opening.call, role.interference);
      break;
    case 'opener-rebid':
      chosen = openerRebid(eval_, role.opening, role.response, role.interferenceBid);
      break;
    case 'opener-second-rebid':
      chosen = openerSecondRebid(eval_, role.opening, role.response, role.myRebid, role.partnerLatest);
      break;
    case 'responder-rebid':
      chosen = responderRebid(eval_, role.opening, role.response, role.openerRebid);
      break;
    case 'overcaller-first':
      chosen = overcallerFirst(eval_, hand, role.opening, bidding);
      break;
    case 'advancer-after-takeout-double':
      chosen = advancerAfterTakeoutDouble(eval_, role.doubledBid, bidding);
      break;
    case 'advancer-first':
      chosen = advancerFirst(eval_, role.overcall, bidding);
      break;
    case 'competitive-rebid':
      chosen = competitiveRebid(eval_, seat, bidding);
      break;
    default:
      chosen = { type: 'pass' };
  }

  chosen = applyAuctionMemoryGuardrails(chosen, eval_, seat, bidding);

  const validation = validateCall(chosen, bidding, SEATS.indexOf(seat));
  if (!validation.valid) {
    if (chosen.type === 'bid' && bidding.currentBid) {
      const cb = bidding.currentBid;
      const strainIdx = (s: string) => ['clubs', 'diamonds', 'hearts', 'spades', 'notrump'].indexOf(s);
      const higher = chosen.level > cb.level || (chosen.level === cb.level && strainIdx(chosen.strain) > strainIdx(cb.strain));
      if (!higher) return { type: 'pass' };
    }
    return { type: 'pass' };
  }
  return chosen;
}
