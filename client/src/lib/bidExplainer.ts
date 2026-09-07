import type { BidCall, BiddingState, LevelBid, Seat, Strain } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';

const STRAIN_NAME: Record<Strain, string> = {
  clubs: 'clubs',
  diamonds: 'diamonds',
  hearts: 'hearts',
  spades: 'spades',
  notrump: 'notrump',
};

const partnerOf = (seat: Seat): Seat => {
  const i = SEATS.indexOf(seat);
  return SEATS[(i + 2) % 4]!;
};

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
      response: LevelBid | null;
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

function createStateForCalls(calls: Array<{ seat: string; call: BidCall }>): BiddingState {
  let currentBid: LevelBid | null = null;
  let doubleStatus: BiddingState['doubleStatus'] = 'none';
  let passCount = 0;
  for (const { call } of calls) {
    if (call.type === 'bid') {
      currentBid = call;
      doubleStatus = 'none';
      passCount = 0;
    } else if (call.type === 'double') {
      doubleStatus = 'doubled';
      passCount = 0;
    } else if (call.type === 'redouble') {
      doubleStatus = 'redoubled';
      passCount = 0;
    } else {
      passCount++;
    }
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

function classifyRole(seat: Seat, bidding: BiddingState): Role {
  const seatIdx = SEATS.indexOf(seat);
  const partnerSeat = SEATS[partnerIdx(seatIdx)]!;
  const calls = bidding.calls;

  const firstBidIdx = calls.findIndex(c => c.call.type === 'bid');
  if (firstBidIdx === -1) return { kind: 'opening' };

  const opener = calls[firstBidIdx]!;
  const openingCall = opener.call as LevelBid;
  const openerSeat = opener.seat as Seat;
  const iOpened = openerSeat === seat;
  const partnerOpened = openerSeat === partnerSeat;

  const myPriorBids = calls.filter(c => c.seat === seat && c.call.type === 'bid').length;
  const partnersPriorBids = calls
    .filter(c => c.seat === partnerSeat && c.call.type === 'bid')
    .map(c => c.call as LevelBid);

  if (iOpened) {
    const response = partnersPriorBids[0] ?? null;
    const interference =
      response
        ? calls.slice(firstBidIdx + 1).findIndex(c => c.seat === partnerSeat && c.call.type === 'bid') > 0
        : false;
    if (myPriorBids === 1) {
      const callsAfterOpen = calls.slice(firstBidIdx + 1);
      const oppBidBeforeMe = callsAfterOpen
        .filter(c => c.seat !== seat && c.seat !== partnerSeat && c.call.type === 'bid')
        .map(c => c.call as LevelBid);
      const interferenceBid = oppBidBeforeMe.length > 0 ? oppBidBeforeMe[oppBidBeforeMe.length - 1]! : null;
      return { kind: 'opener-rebid', opening: openingCall, response, interference, interferenceBid };
    }
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
      const interferenceEntry = calls
        .slice(firstBidIdx + 1)
        .find(c => c.seat !== seat && c.seat !== partnerSeat && c.call.type === 'bid');
      const interference = interferenceEntry ? (interferenceEntry.call as LevelBid) : null;
      return { kind: 'responder-first', opening: { seat: openerSeat, call: openingCall }, interference };
    }
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

function explainOpening(call: BidCall): string {
  if (call.type !== 'bid') return '';
  const { level, strain } = call;
  if (level === 1) {
    if (strain === 'notrump') return '15–17 HCP, balanced hand (no 5-card major, no singleton).';
    if (strain === 'spades' || strain === 'hearts')
      return `Opening 1${strain === 'spades' ? '♠' : '♥'}: 12+ HCP, 5+ ${STRAIN_NAME[strain]}.`;
    if (strain === 'diamonds')
      return 'Opening 1♦: 12+ HCP, usually 4+ diamonds (may be 3 in a 4-4-3-2 shape).';
    if (strain === 'clubs')
      return 'Opening 1♣: 12+ HCP, 3+ clubs (default when no other suit qualifies).';
  }
  if (level === 2) {
    if (strain === 'clubs') return 'Strong 2♣: 22+ HCP or game-forcing. Artificial and forcing.';
    if (strain === 'notrump') return '20–21 HCP, balanced.';
    return `Weak 2${strain === 'diamonds' ? '♦' : strain === 'hearts' ? '♥' : '♠'}: 6–10 HCP, good 6-card ${STRAIN_NAME[strain]} suit.`;
  }
  if (level === 3) return `Preempt: 7-card ${STRAIN_NAME[strain]} suit, weak hand (6–10 HCP).`;
  if (level === 4 && (strain === 'hearts' || strain === 'spades'))
    return `Preemptive game bid: long ${STRAIN_NAME[strain]} (8+), weak in HCP but many playing tricks.`;
  return `Opening ${level}${strain === 'notrump' ? 'NT' : STRAIN_NAME[strain]}: preemptive/unusual.`;
}

function explainResponse(call: BidCall, opening: LevelBid, byPartner: boolean): string {
  if (call.type === 'pass') {
    return byPartner ? 'Pass: 0–5 HCP, no fit and no forcing bid available.' : 'Pass.';
  }
  if (call.type === 'double')
    return 'Takeout double: opening values with support for the unbid suits.';
  if (call.type === 'redouble')
    return 'Redouble: 10+ HCP; typically no fit yet — asks partner to bid.';
  if (!byPartner) return `Overcall: roughly 8+ HCP with a good 5+ card suit.`;

  const { level, strain } = call;
  const openStrain = opening.strain;

  if (openStrain === 'notrump' && opening.level === 1) {
    if (strain === 'clubs' && level === 2) return 'Stayman: asks opener for a 4-card major.';
    if (strain === 'diamonds' && level === 2) return 'Jacoby transfer: shows 5+ hearts.';
    if (strain === 'hearts' && level === 2) return 'Jacoby transfer: shows 5+ spades.';
    if (strain === 'spades' && level === 2) return 'Minor-suit transfer: shows 6+ clubs (or a 2-suited minor hand).';
    if (strain === 'notrump' && level === 2) return 'Invitational: 8–9 HCP, balanced.';
    if (strain === 'notrump' && level === 3) return 'Game: 10–15 HCP, balanced.';
    if ((strain === 'hearts' || strain === 'spades') && level >= 3)
      return `Game force with a long ${STRAIN_NAME[strain]} suit.`;
  }

  if (strain === openStrain && openStrain !== 'notrump') {
    if (level === 2) return `Simple raise: 6–10 HCP, 3+ card support in ${STRAIN_NAME[strain]}.`;
    if (level === 3) return `Limit raise: 10–12 HCP, 4+ card support in ${STRAIN_NAME[strain]}.`;
    if (level === 4) return `Preemptive game raise: 5+ card support, under 10 HCP with distributional values. (Strong game-forcing raises use Jacoby 2NT.)`;
  }
  if (strain === 'notrump') {
    if (level === 1) return '1NT response: 6–10 HCP, no fit; forcing one round over 1♥/1♠.';
    if (level === 2 && (openStrain === 'hearts' || openStrain === 'spades'))
      return `Jacoby 2NT: game-forcing raise, 4+ ${STRAIN_NAME[openStrain]} support, 13+ HCP. Asks partner to describe (shortness, side suit, or strength).`;
    if (level === 2) return '2NT: 13–15 HCP, balanced, invitational-to-game.';
    if (level === 3) return '3NT: 15–17 HCP, balanced, denies a fit with partner.';
  }
  if (level === 1) return `New suit at the 1-level: 6+ HCP, 4+ cards in ${STRAIN_NAME[strain]}, forcing one round.`;
  if (level === 2 && opening.level === 1)
    return `Two-over-one: 11+ HCP (game-forcing in modern SAYC), 5+ ${STRAIN_NAME[strain]}.`;

  return `Bid ${level}${strain === 'notrump' ? 'NT' : STRAIN_NAME[strain]} in response to partner’s opening.`;
}

function explainResponderFirst(
  call: BidCall,
  opening: LevelBid,
  interference: LevelBid | null,
): string {
  if (call.type === 'pass') {
    if (opening.level === 2 && opening.strain === 'clubs') {
      return 'Pass after partner’s strong 2♣ opening is not standard; responder is normally expected to bid 2♦ waiting or make a positive response.';
    }
    if (interference) {
      return 'Pass: no suitable negative double, raise, or natural call over the interference.';
    }
    return explainResponse(call, opening, true);
  }
  if (call.type === 'double' && interference) {
    const openSuit = opening.strain;
    const oppSuit = interference.strain;
    const unbidMajors = (['hearts', 'spades'] as const).filter(m => m !== openSuit && m !== oppSuit);
    const shape = unbidMajors.length === 2
      ? 'both majors'
      : `the unbid major (${STRAIN_NAME[unbidMajors[0] ?? 'hearts']})`;
    return `Negative double: takeout, showing 6+ HCP (usually 8+ at the 2-level) and ${shape}.`;
  }
  return explainResponse(call, opening, true);
}

function explainJacoby2NTAnswer(call: BidCall, opening: LevelBid): string | null {
  if (call.type !== 'bid') return null;
  if (opening.strain !== 'hearts' && opening.strain !== 'spades') return null;
  const { level, strain } = call;
  const major = opening.strain;
  const majorName = STRAIN_NAME[major];
  if (level === 3 && strain !== major && strain !== 'notrump') {
    return `Jacoby 2NT answer: singleton or void in ${STRAIN_NAME[strain]}. No slam interest denied.`;
  }
  if (level === 4 && strain !== major && strain !== 'notrump') {
    return `Jacoby 2NT answer: 5-card side suit in ${STRAIN_NAME[strain]}, no shortness.`;
  }
  if (level === 3 && strain === major) {
    return `Jacoby 2NT answer: 15+ HCP, no shortness, no side 5-card suit — extras with slam interest.`;
  }
  if (level === 3 && strain === 'notrump') {
    return `Jacoby 2NT answer: 12–14 balanced, no shortness — minimum with no slam interest.`;
  }
  if (level === 4 && strain === major) {
    return `Jacoby 2NT answer: minimum 12–14, no shortness, no side suit — fast arrival to game.`;
  }
  return null;
}

function explainOpenerRebid(
  call: BidCall,
  opening: LevelBid,
  responseByPartner: LevelBid | null,
): string {
  if (call.type === 'pass') return 'Pass: minimum opening, no game interest.';
  if (call.type !== 'bid') return 'Opener’s rebid.';
  const { level, strain } = call;

  const isWeakOrPreemptiveSuitOpening =
    opening.strain !== 'notrump' &&
    ((opening.level === 2 && opening.strain !== 'clubs') || opening.level >= 3);
  if (isWeakOrPreemptiveSuitOpening) {
    if (strain === opening.strain) {
      return `Further bid in opener’s preemptive suit: competing on extra length/tricks, not redefining the original weak range already shown.`;
    }
    if (strain === 'notrump') {
      return 'Notrump by the preemptive opener: cooperating after a feature ask or showing a stopper, consistent with the original preempt.';
    }
    return `Further action by the preemptive opener: based on fit or playability, not a fresh opening-strength description.`;
  }

  if (opening.level === 2 && opening.strain === 'clubs') {
    return 'Strong 2♣ opener continuing the game-forcing auction, clarifying suit or notrump direction.';
  }

  // Jacoby 2NT answer
  if (responseByPartner && responseByPartner.strain === 'notrump' && responseByPartner.level === 2
      && (opening.strain === 'hearts' || opening.strain === 'spades')) {
    const answer = explainJacoby2NTAnswer(call, opening);
    if (answer) return answer;
  }

  // Stayman response (1NT–2♣ or 2NT–3♣): opener answers his major holding, no extras implied
  if (opening.strain === 'notrump' && responseByPartner
      && responseByPartner.strain === 'clubs'
      && responseByPartner.level === opening.level + 1) {
    if (strain === 'diamonds' && level === opening.level + 1)
      return 'Stayman response: no 4-card major.';
    if (strain === 'hearts' && level === opening.level + 1)
      return 'Stayman response: exactly 4 hearts (says nothing about strength beyond the opening).';
    if (strain === 'spades' && level === opening.level + 1)
      return 'Stayman response: exactly 4 spades (says nothing about strength beyond the opening).';
  }

  // Jump rebids
  if (opening.strain !== 'notrump') {
    if (strain === opening.strain && level === opening.level + 1)
      return `Opener’s simple rebid of ${STRAIN_NAME[strain]}: minimum (12–14 HCP), 6+ card suit.`;
    if (strain === opening.strain && level === opening.level + 2)
      return `Jump rebid in ${STRAIN_NAME[strain]}: 16–18 HCP, 6+ card suit, invitational.`;
    if (strain === 'notrump' && level === 1)
      return '1NT rebid: 12–14 HCP balanced, denies 4-card support for partner.';
    if (strain === 'notrump' && level === 2)
      return '2NT rebid: 18–19 HCP balanced with stoppers in unbid suits.';
    if (strain === 'notrump' && level === 3) {
      // After 1M–1NT, jumping straight to 3NT is unusual: it shows a solid running suit
      if (responseByPartner && responseByPartner.strain === 'notrump' && responseByPartner.level === 1)
        return `3NT rebid over 1NT response: a solid 7-card running ${STRAIN_NAME[opening.strain]} suit (e.g. AKQxxxx). 18–19 balanced hands rebid 2NT instead so responder can use NMF/CBS.`;
      return '3NT rebid: strong hand with a source of tricks, denies a fit.';
    }
  }
  if (responseByPartner && responseByPartner.strain === opening.strain && strain === opening.strain) {
    if (level === 4 && (strain === 'hearts' || strain === 'spades'))
      return `Game raise: accepting partner’s support with extra values.`;
    if (level === 3) return 'Invitational raise on top of partner’s raise: extras but not forcing.';
  }
  return `Opener’s rebid ${level}${strain === 'notrump' ? 'NT' : STRAIN_NAME[strain]} — showing shape and strength beyond the opening.`;
}

function explainResponderRebid(call: BidCall, opening?: LevelBid, response?: LevelBid, openerRebid?: BidCall): string {
  if (call.type === 'pass') return 'Responder passes: minimum, no game interest.';
  if (call.type !== 'bid') return 'Responder’s rebid.';
  // NMF ask
  if (opening && response && openerRebid) {
    const nmf = detectNMFTriggerClient(opening, response, openerRebid);
    if (nmf && call.strain === nmf.askStrain && call.level === nmf.askLevel) {
      const majorSym = nmf.responderMajor === 'hearts' ? '♥' : '♠';
      return `New Minor Forcing (NMF): artificial and forcing, invitational+. Asks partner for 3-card support in ${majorSym} or a 4-card other major; otherwise partner clarifies with a NT rebid.`;
    }
  }
  return `Responder’s rebid ${call.level}${call.strain === 'notrump' ? 'NT' : STRAIN_NAME[call.strain]}: further describes strength/shape based on opener’s rebid.`;
}

/**
 * NMF trigger detection — mirrors the server bidder's `detectNMFTrigger`.
 */
function detectNMFTriggerClient(
  opening: LevelBid,
  response: LevelBid,
  openerRebid: BidCall,
): { askStrain: 'clubs' | 'diamonds'; askLevel: 2 | 3; responderMajor: 'hearts' | 'spades' } | null {
  if (openerRebid.type !== 'bid') return null;
  if (openerRebid.strain !== 'notrump') return null;
  if (openerRebid.level !== 1 && openerRebid.level !== 2) return null;
  if (opening.strain !== 'clubs' && opening.strain !== 'diamonds') return null;
  if (response.level !== 1) return null;
  if (response.strain !== 'hearts' && response.strain !== 'spades') return null;
  const askStrain: 'clubs' | 'diamonds' = opening.strain === 'clubs' ? 'diamonds' : 'clubs';
  return {
    askStrain,
    askLevel: openerRebid.level === 1 ? 2 : 3,
    responderMajor: response.strain as 'hearts' | 'spades',
  };
}

function explainNMFAnswer(
  call: BidCall,
  nmf: { askStrain: 'clubs' | 'diamonds'; askLevel: 2 | 3; responderMajor: 'hearts' | 'spades' },
): string {
  if (call.type === 'pass') return 'Pass in response to NMF is not standard — treat as showing nothing extra.';
  if (call.type !== 'bid') return 'Answer to NMF.';
  const other: 'hearts' | 'spades' = nmf.responderMajor === 'hearts' ? 'spades' : 'hearts';
  const majorSym = nmf.responderMajor === 'hearts' ? '♥' : '♠';
  const otherSym = other === 'hearts' ? '♥' : '♠';
  const baseLevel = nmf.askLevel; // 2 or 3
  if (call.strain === nmf.responderMajor) {
    if (call.level === baseLevel) return `Shows 3-card support for ${majorSym} (minimum for the NT rebid).`;
    if (call.level > baseLevel) return `Shows 3-card support for ${majorSym} with maximum values (jump-shift).`;
  }
  if (call.strain === other) {
    if (call.level === baseLevel) return `Denies 3-card support for ${majorSym}, shows a 4-card ${otherSym} suit.`;
    if (call.level > baseLevel) return `4-card ${otherSym} with maximum values (jump).`;
  }
  if (call.strain === 'notrump') {
    if (call.level === 2) return `Minimum NT rebidder with no 3-card support and no 4-card ${otherSym}.`;
    if (call.level === 3) return `Maximum NT rebidder with no 3-card support and no 4-card ${otherSym}.`;
  }
  return `Answer to NMF: shows ${call.level}${STRAIN_NAME[call.strain]}, further describing shape.`;
}

function explainOvercall(call: BidCall, opening: LevelBid): string {
  if (call.type === 'pass') return 'Pass: does not have overcall values.';
  if (call.type === 'double')
    return opening.strain === 'notrump'
      ? 'Double of 1NT: penalty, 15+ HCP.'
      : 'Takeout double: opening strength with support for the unbid suits, shortness in the opponent’s suit.';
  if (call.type === 'redouble') return 'Redouble: 10+ HCP, generally strength-showing.';
  const { level, strain } = call;
  if (strain === 'notrump' && level === 1) return '1NT overcall: 15–18 HCP with a stopper in the opener’s suit.';
  if (level === 1) return `1-level overcall in ${STRAIN_NAME[strain]}: 8+ HCP, good 5+ card suit.`;
  if (level === 2 && strain !== opening.strain) return `2-level overcall in ${STRAIN_NAME[strain]}: opening values, 5+ (usually 6+) card suit.`;
  if (level >= 3) return `Jump overcall in ${STRAIN_NAME[strain]}: preemptive, weak hand with a long suit.`;
  return `Overcall ${level}${strain === 'notrump' ? 'NT' : STRAIN_NAME[strain]}.`;
}

function explainAdvancerAfterTakeoutDouble(call: BidCall, doubledBid: LevelBid): string {
  if (call.type === 'pass') {
    return `Pass over partner’s takeout double: converts the double to penalties, showing defense against ${callTextFromBid(doubledBid)}.`;
  }
  if (call.type === 'bid') {
    if (call.strain === 'notrump') {
      return `Notrump advance of partner’s takeout double: shows a stopper in ${STRAIN_NAME[doubledBid.strain]} and constructive values.`;
    }
    if (call.level >= 2 && call.level > doubledBid.level) {
      return `Jump advance after partner’s takeout double: invitational+ values with a real suit.`;
    }
    return `Cheapest advance of partner’s takeout double: choose the longest unbid suit, even with modest values.`;
  }
  return 'Response to partner’s takeout double.';
}

function explainAdvancerFirst(call: BidCall, overcall: LevelBid): string {
  if (call.type === 'pass') return 'Pass: no suitable raise or constructive advance of partner’s overcall.';
  if (call.type === 'bid' && call.strain === overcall.strain) {
    if (call.level === overcall.level + 1) {
      return `Simple raise of partner’s overcall: 3+ card support, competitive values.`;
    }
    if (call.level >= overcall.level + 2) {
      return `Jump raise of partner’s overcall: 4+ card support and invitational or better values.`;
    }
  }
  return `Constructive advance of partner’s overcall in ${call.type === 'bid' ? (call.strain === 'notrump' ? 'NT' : STRAIN_NAME[call.strain]) : 'the chosen strain'}.`;
}

function explainCompetitiveRebid(
  call: BidCall,
  calls: BiddingState['calls'],
  seat: Seat,
  index: number,
): string {
  if (call.type === 'pass') return 'Pass: already described the hand and has nothing further to add competitively.';
  if (call.type === 'double') return 'Competitive double: extra values consistent with the hand already shown earlier in the auction.';
  if (call.type === 'redouble') return 'Competitive redouble: extra values consistent with earlier action.';
  const partnerSeat = partnerOf(seat);
  const partnerLastBid = [...calls.slice(0, index)]
    .reverse()
    .find(entry => entry.seat === partnerSeat && entry.call.type === 'bid');
  if (partnerLastBid?.call.type === 'bid' && call.strain === partnerLastBid.call.strain) {
    return `Further raise of partner’s suit: competitive support, building on the partnership’s earlier fit.`;
  }
  const myLastBid = [...calls.slice(0, index)]
    .reverse()
    .find(entry => entry.seat === seat && entry.call.type === 'bid');
  if (myLastBid?.call.type === 'bid' && call.strain === myLastBid.call.strain) {
    return `Further rebid in ${call.strain === 'notrump' ? 'NT' : STRAIN_NAME[call.strain]}: competing on known length rather than redefining the hand.`;
  }
  return `Competitive action in ${call.strain === 'notrump' ? 'NT' : STRAIN_NAME[call.strain]}: consistent with the hand already described earlier.`;
}

function callTextFromBid(call: LevelBid): string {
  return `${call.level}${call.strain === 'notrump' ? 'NT' : STRAIN_NAME[call.strain]}`;
}

function explainOvercallerRebid(
  call: BidCall,
  calls: BiddingState['calls'],
  seat: Seat,
  index: number,
): string {
  if (call.type === 'pass') return 'Overcaller passes: nothing more to add.';
  if (call.type === 'double') return 'Competitive/responsive double: extra values, willing to compete or defend.';
  if (call.type === 'redouble') return 'Redouble in competition: strength-showing.';
  const { level, strain } = call;
  // Find overcaller's previous bid(s)
  const priorOwnBids = calls
    .slice(0, index)
    .filter(c => c.seat === seat && c.call.type === 'bid')
    .map(c => c.call as { type: 'bid'; level: number; strain: string });
  const firstOwnBid = priorOwnBids[0];

  if (firstOwnBid && strain === firstOwnBid.strain) {
    if (level === firstOwnBid.level + 1)
      return `Rebidding ${STRAIN_NAME[strain as keyof typeof STRAIN_NAME] ?? strain} competitively: 6+ card suit, showing extra length rather than extra strength.`;
    if (level >= firstOwnBid.level + 2)
      return `Jump rebid in ${STRAIN_NAME[strain as keyof typeof STRAIN_NAME] ?? strain}: strong overcall (typically 16+ HCP) with a long suit.`;
  }
  if (strain === 'notrump')
    return `${level}NT by the overcaller: shows a stopper in opener's suit and extra values.`;
  return `Overcaller's rebid ${level}${STRAIN_NAME[strain as keyof typeof STRAIN_NAME]}: competing further based on the auction.`;
}

/**
 * Explain a bid at position `index` in the auction using SAYC conventions.
 * Explanations are heuristic and mirror the server's saycBidder logic —
 * they are best-effort descriptions, not a guaranteed 1:1 with the bot's internals.
 */
export function explainBidAt(
  index: number,
  bidding: BiddingState,
  seat: Seat,
): string {
  const calls = bidding.calls;
  const call = calls[index]?.call;
  if (!call) return '';

  const openingIdx = calls.findIndex(c => c.call.type === 'bid');
  const openingEntry = openingIdx >= 0 ? calls[openingIdx]! : null;
  const opening = openingEntry?.call.type === 'bid' ? openingEntry.call : null;
  const openerSeat = openingEntry ? (openingEntry.seat as Seat) : null;
  const openerPartner = openerSeat ? partnerOf(openerSeat) : null;
  const priorState = createStateForCalls(calls.slice(0, index));
  const role = classifyRole(seat, priorState);

  // Classify sides
  const isOpener = openerSeat && seat === openerSeat;
  const isResponder = openerPartner && seat === openerPartner;
  const isDefensive = !isOpener && !isResponder;

  // Count how many level bids this seat has already made before `index`
  const priorBidsBySeatBefore = calls
    .slice(0, index)
    .filter(c => c.seat === seat && c.call.type === 'bid').length;
  const priorNonPassCallsBySeatBefore = calls
    .slice(0, index)
    .filter(c => c.seat === seat && c.call.type !== 'pass').length;

  // Pre-opening / early passes
  if (call.type === 'pass') {
    if (openingIdx < 0 || index < openingIdx) return 'Pass: fewer than 12 HCP (or no biddable hand).';
    if (index === calls.length - 1 && bidding.passCount >= 3) return 'Pass: ends the auction.';
    // Passing partner's takeout double converts it to penalty.
    const priorCalls = calls.slice(0, index);
    const lastNonPassIdx = [...priorCalls]
      .map((entry, i) => ({ entry, i }))
      .reverse()
      .find(x => x.entry.call.type !== 'pass');
    if (lastNonPassIdx && lastNonPassIdx.entry.call.type === 'double') {
      const doubler = lastNonPassIdx.entry.seat as Seat;
      const doublerPartner = partnerOf(doubler);
      const beforeDouble = priorCalls.slice(0, lastNonPassIdx.i);
      const doubledBidEntry = [...beforeDouble].reverse().find(c => c.call.type === 'bid');
      if (
        seat === doublerPartner &&
        doubledBidEntry &&
        doubledBidEntry.seat !== doubler &&
        doubledBidEntry.seat !== doublerPartner
      ) {
        const doubledBid = doubledBidEntry.call as LevelBid;
        const doubledSuit = doubledBid.strain === 'notrump'
          ? 'notrump'
          : STRAIN_NAME[doubledBid.strain];
        if (doubledBid.strain === 'spades' || doubledBid.strain === 'hearts') {
          return `Pass over partner's takeout double: converts to penalties, typically 4–5+ good ${doubledSuit} and defensive values.`;
        }
        return `Pass over partner's takeout double: converts to penalties, showing strong defense against ${doubledSuit}.`;
      }
    }
    // Seat has already bid — pass now means "nothing more to say", not a weak hand
    if (priorNonPassCallsBySeatBefore > 0) {
      if (role.kind === 'competitive-rebid') {
        return 'Pass: earlier action already described the hand; nothing further to say competitively.';
      }
      if (isOpener) return 'Opener passes: minimum opening, nothing more to describe.';
      if (isResponder) return 'Responder passes: has already limited the hand; no reason to bid again.';
      return 'Pass: has already described the hand; no reason to bid again.';
    }
    if (isOpener) return 'Opener passes: minimum, no more to say.';
    if (isResponder) return 'Responder passes: 0–5 HCP, no fit and no bid available.';
    return 'Defensive pass.';
  }

  // First bid of the auction
  if (openingIdx === index) return explainOpening(call);

  // Doubles / redoubles have their own SAYC rules
  if (call.type === 'double') {
    if (role.kind === 'competitive-rebid' || priorNonPassCallsBySeatBefore > 0) {
      return 'Competitive double: extra values consistent with the hand already shown earlier in the auction.';
    }
    const lastBid = [...calls.slice(0, index)].reverse().find(c => c.call.type === 'bid');
    // Negative double: partner opened 1X, RHO overcalled, I doubled.
    if (openingIdx >= 0 && isResponder && priorBidsBySeatBefore === 0 && lastBid) {
      const lb = lastBid.call.type === 'bid' ? lastBid.call : null;
      if (lb && lb.strain !== 'notrump' && lb.level <= 3 && opening && opening.level === 1) {
        const openSuit = opening.strain;
        const oppSuit = lb.strain;
        const unbidMajors = (['hearts', 'spades'] as const).filter(m => m !== openSuit && m !== oppSuit);
        const shape = unbidMajors.length === 2
          ? '4-4 in the majors'
          : `4+ ${STRAIN_NAME[unbidMajors[0] ?? 'hearts']}`;
        return `Negative double: 6+ HCP (8+ at the 2-level), takeout showing ${shape}. Not penalty.`;
      }
    }
    // Support double: opener's 2nd call is Dbl after 1X-P-1Y-(overcall).
    if (openingIdx >= 0 && isOpener && priorBidsBySeatBefore === 1 && opening) {
      const responderBid = calls
        .slice(openingIdx + 1, index)
        .find(c => c.seat === partnerOf(seat) && c.call.type === 'bid');
      const respCall = responderBid && responderBid.call.type === 'bid' ? responderBid.call : null;
      if (respCall && respCall.level === 1 && respCall.strain !== 'notrump') {
        return `Support double: shows EXACTLY 3-card support for ${STRAIN_NAME[respCall.strain]}. With 4+ support, opener raises directly instead.`;
      }
    }
    // Responsive double: (1X) - Dbl (partner's takeout) - (2X raise) - Dbl.
    if (isDefensive && priorBidsBySeatBefore === 0 && opening) {
      const partnerDbl = calls.slice(openingIdx + 1, index)
        .some(c => c.seat === partnerOf(seat) && c.call.type === 'double');
      const oppRaise = calls.slice(openingIdx + 1, index)
        .filter(c => c.call.type === 'bid')
        .some(c => c.call.type === 'bid' && c.call.strain === opening.strain && c.call.level >= 2);
      if (partnerDbl && oppRaise) {
        return `Responsive double: 6+ HCP takeout; no clear suit to bid. Asks partner to pick from the unbid suits (typically the unbid majors).`;
      }
    }
    if (lastBid && lastBid.call.type === 'bid' && (lastBid.call.strain === 'notrump' || lastBid.call.level >= 4)) {
      return 'Penalty double: expects to defeat the contract.';
    }
    if (isDefensive)
      return 'Takeout double: opening strength (12+ HCP) with support for the unbid suits, shortness in the opponent’s suit.';
    return 'Cooperative/informative double: shows extra values, asks partner to describe further.';
  }
  if (call.type === 'redouble') return 'Redouble: 10+ HCP, generally strength-showing (or SOS depending on context).';

  // 4th Suit Forcing: responder's 2-of-4th-suit after 1X-1Y-1Z is artificial GF.
  {
    const priorLevelBids = calls.slice(0, index).filter(c => c.call.type === 'bid');
    if (priorLevelBids.length === 3 && call.type === 'bid' && call.level === 2 && call.strain !== 'notrump') {
      const [b1, b2, b3] = priorLevelBids.map(c => c.call as LevelBid);
      if (b1 && b2 && b3 && b1.level === 1 && b2.level === 1 && b3.level === 1
          && b1.strain !== 'notrump' && b2.strain !== 'notrump' && b3.strain !== 'notrump') {
        const bidSuits = new Set([b1.strain, b2.strain, b3.strain]);
        if (!bidSuits.has(call.strain)) {
          return `4th suit forcing: artificial, game-forcing (12+ HCP). Asks partner to describe further — bid NT with a stopper in ${STRAIN_NAME[call.strain]}, rebid a 6-card suit, or raise responder's suit with 3-card support.`;
        }
      }
    }
  }

  if (!opening) {
    return `Bid ${call.level}${call.strain === 'notrump' ? 'NT' : STRAIN_NAME[call.strain]}.`;
  }

  // Blackwood / Gerber: partner asked and this call is an ace/king count response.
  {
    const priorBids = calls.slice(0, index).filter(c => c.call.type === 'bid');
    const partnerLastBid = [...calls.slice(0, index)]
      .reverse()
      .find(c => c.seat === partnerOf(seat) && c.call.type === 'bid');
    const partnerLast = partnerLastBid && partnerLastBid.call.type === 'bid' ? partnerLastBid.call : null;
    if (partnerLast && call.type === 'bid') {
      const prevBid = priorBids.length >= 2 ? (priorBids[priorBids.length - 2]!.call as LevelBid) : null;
      // Blackwood ask by partner: partner just bid 4NT after a suit auction (prev bid is a suit at level >= 2)
      if (partnerLast.level === 4 && partnerLast.strain === 'notrump'
          && prevBid && prevBid.strain !== 'notrump' && prevBid.level >= 2
          && call.level === 5) {
        const aceMap: Record<string, string> = { clubs: '0 or 4 aces', diamonds: '1 ace', hearts: '2 aces', spades: '3 aces' };
        const aces = aceMap[call.strain];
        if (aces) return `Blackwood response: ${aces}.`;
      }
      // Blackwood king-ask: partner just bid 5NT, following our own 5-of-a-suit response
      if (partnerLast.level === 5 && partnerLast.strain === 'notrump' && call.level === 6) {
        const kingMap: Record<string, string> = { clubs: '0 or 4 kings', diamonds: '1 king', hearts: '2 kings', spades: '3 kings' };
        const kings = kingMap[call.strain];
        if (kings) return `Blackwood king-ask response: ${kings}.`;
      }
      // Gerber ask: partner just bid 4♣ over a natural NT bid
      if (partnerLast.level === 4 && partnerLast.strain === 'clubs'
          && prevBid && prevBid.strain === 'notrump' && call.level === 4) {
        const gMap: Record<string, string> = { diamonds: '0 or 4 aces', hearts: '1 ace', spades: '2 aces', notrump: '3 aces' };
        const aces = gMap[call.strain];
        if (aces) return `Gerber response: ${aces}.`;
      }
    }
    // Blackwood/Gerber ASK explanations (from the asker's side)
    if (call.type === 'bid') {
      const partnerLastB = partnerLast;
      if (call.level === 4 && call.strain === 'notrump' && partnerLastB && partnerLastB.strain !== 'notrump' && partnerLastB.level >= 2) {
        return 'Blackwood 4NT: ace-ask. Partner responds 5♣=0/4, 5♦=1, 5♥=2, 5♠=3 aces.';
      }
      if (call.level === 4 && call.strain === 'clubs' && partnerLastB && partnerLastB.strain === 'notrump') {
        return 'Gerber 4♣: ace-ask over NT. Partner responds 4♦=0/4, 4♥=1, 4♠=2, 4NT=3 aces.';
      }
      if (call.level === 5 && call.strain === 'notrump' && partnerLastB && partnerLastB.level === 5) {
        return 'Blackwood 5NT: king-ask. Also confirms all 4 aces are present, so slam is safe.';
      }
    }
  }

  // Alias earlier count for downstream logic
  const priorBidsBySeat = priorBidsBySeatBefore;

  if (isDefensive) {
    if (role.kind === 'overcaller-first') return explainOvercall(call, opening);
    if (role.kind === 'advancer-after-takeout-double') {
      return explainAdvancerAfterTakeoutDouble(call, role.doubledBid);
    }
    if (role.kind === 'advancer-first') {
      return explainAdvancerFirst(call, role.overcall.call);
    }
    if (role.kind === 'competitive-rebid') {
      return explainCompetitiveRebid(call, calls, seat, index);
    }
    return explainOvercallerRebid(call, calls, seat, index);
  }

  if (isOpener) {
    if (priorBidsBySeat === 1) {
      const responsePartner = calls
        .slice(0, index)
        .find(c => c.seat === openerPartner && c.call.type === 'bid');
      const responseBid = responsePartner && responsePartner.call.type === 'bid' ? responsePartner.call : null;
      return explainOpenerRebid(call, opening, responseBid);
    }
    // Opener's 3rd+ bid — may be answering NMF
    const myBids = calls.slice(0, index).filter(c => c.seat === seat && c.call.type === 'bid');
    const myFirstRebid = myBids[1] ? myBids[1]!.call : null;
    const partnerBids = calls.slice(0, index).filter(c => c.seat === openerPartner && c.call.type === 'bid');
    const responseBid = partnerBids[0] && partnerBids[0]!.call.type === 'bid' ? (partnerBids[0]!.call as LevelBid) : null;
    const partnerLatest = partnerBids[partnerBids.length - 1]?.call ?? null;
    if (responseBid && myFirstRebid && partnerLatest) {
      const nmf = detectNMFTriggerClient(opening, responseBid, myFirstRebid);
      if (nmf && partnerLatest.type === 'bid' && partnerLatest.strain === nmf.askStrain && partnerLatest.level === nmf.askLevel) {
        return explainNMFAnswer(call, nmf);
      }
    }
    return `Opener’s further bid ${call.type === 'bid' ? call.level : ''}${call.type === 'bid' ? (call.strain === 'notrump' ? 'NT' : STRAIN_NAME[call.strain]) : ''}: refining the auction based on partner’s responses.`;
  }

  // Responder
  if (role.kind === 'responder-first') {
    return explainResponderFirst(call, role.opening.call, role.interference);
  }
  if (priorBidsBySeat === 0) return explainResponse(call, opening, true);
  // Responder rebid — pass opener rebid context for NMF detection
  const myResponseEntry = calls.slice(0, index).find(c => c.seat === seat && c.call.type === 'bid');
  const responseBid = myResponseEntry && myResponseEntry.call.type === 'bid' ? myResponseEntry.call : null;
  const openerRebidEntry = calls
    .slice(myResponseEntry ? calls.indexOf(myResponseEntry) + 1 : 0, index)
    .find(c => c.seat === openerPartner && c.call.type === 'bid');
  const openerRebidCall = openerRebidEntry ? openerRebidEntry.call : null;
  return explainResponderRebid(call, opening, responseBid ?? undefined, openerRebidCall ?? undefined);
}
