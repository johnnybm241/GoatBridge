import type { BidCall, BiddingState, LevelBid } from '@goatbridge/shared';
import type { Card, Suit } from '@goatbridge/shared';
import type { Seat } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';
import { evaluateHand, type HandEvaluation } from './handEvaluator.js';

const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
const MAJORS: Suit[] = ['hearts', 'spades'];
const MINORS: Suit[] = ['clubs', 'diamonds'];

type Role =
  | { kind: 'opening' }
  | { kind: 'overcaller-first'; opening: { seat: Seat; call: LevelBid } }
  | { kind: 'responder-first'; opening: { seat: Seat; call: LevelBid } }
  | { kind: 'advancer-first'; overcall: { seat: Seat; call: LevelBid }; opening: { seat: Seat; call: LevelBid } }
  | {
      kind: 'opener-rebid';
      opening: LevelBid;
      response: LevelBid | null; // null if partner passed
      interference: boolean;
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
    };

function partnerIdx(seatIdx: number): number {
  return (seatIdx + 2) % 4;
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
    if (myPriorBids === 1) return { kind: 'opener-rebid', opening: openingCall, response, interference };
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
    if (myPriorBids === 0) return { kind: 'responder-first', opening: { seat: openerSeat, call: openingCall } };
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
  // Beyond first defensive bid — fall back to a safe pass logic in caller
  return { kind: 'overcaller-first', opening: { seat: openerSeat, call: openingCall } };
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

function responderFirst(eval_: HandEvaluation, opening: LevelBid): BidCall {
  const { hcp, shape, isBalanced, stoppers } = eval_;

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
      // Raises
      if (shape[openerSuit] >= 3) {
        if (hcp >= 13 && hcp <= 15) return { type: 'bid', level: 4, strain: openerSuit }; // game with fit (or use splinter — omitted)
        if (hcp >= 10 && shape[openerSuit] >= 4) return { type: 'bid', level: 3, strain: openerSuit }; // limit raise
        if (hcp >= 6 && hcp <= 9) return { type: 'bid', level: 2, strain: openerSuit }; // simple raise
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
): BidCall {
  const { hcp, totalPoints, shape, isBalanced, stoppers } = eval_;
  const openerSuit = opening.strain !== 'notrump' ? (opening.strain as Suit) : null;

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
  const { hcp, shape } = eval_;
  if (!openerRebid || openerRebid.type !== 'bid') return { type: 'pass' };

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
  const { hcp, shape, isBalanced } = eval_;
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
): BidCall {
  const { hcp, shape } = eval_;
  if (overcall.call.type !== 'bid') return { type: 'pass' };
  const ocSuit = overcall.call.strain !== 'notrump' ? (overcall.call.strain as Suit) : null;
  if (!ocSuit) return { type: 'pass' };
  // Raise partner's overcall with 3+ support
  if (shape[ocSuit] >= 3) {
    if (hcp >= 10) return { type: 'bid', level: overcall.call.level + 1 as 2|3|4, strain: ocSuit };
    if (hcp >= 6) return { type: 'bid', level: overcall.call.level as 1|2|3, strain: ocSuit }; // no-op / preemptive
  }
  return { type: 'pass' };
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
  const role = classifyRole(seat, bidding);

  let chosen: BidCall;
  switch (role.kind) {
    case 'opening':
      chosen = openingBid(eval_);
      break;
    case 'responder-first':
      chosen = responderFirst(eval_, role.opening.call);
      break;
    case 'opener-rebid':
      chosen = openerRebid(eval_, role.opening, role.response);
      break;
    case 'opener-second-rebid':
      chosen = openerSecondRebid(eval_, role.opening, role.response, role.myRebid, role.partnerLatest);
      break;
    case 'responder-rebid':
      chosen = responderRebid(eval_, role.opening, role.response, role.openerRebid);
      break;
    case 'overcaller-first':
      chosen = overcallerFirst(eval_, role.opening, bidding);
      break;
    case 'advancer-first':
      chosen = advancerFirst(eval_, role.overcall);
      break;
    default:
      chosen = { type: 'pass' };
  }

  // Safety net: if the chosen bid isn't legal (too low), fall back to pass.
  if (chosen.type === 'bid' && bidding.currentBid) {
    const cb = bidding.currentBid;
    const strainIdx = (s: string) => ['clubs', 'diamonds', 'hearts', 'spades', 'notrump'].indexOf(s);
    const higher = chosen.level > cb.level || (chosen.level === cb.level && strainIdx(chosen.strain) > strainIdx(cb.strain));
    if (!higher) return { type: 'pass' };
  }
  return chosen;
}
