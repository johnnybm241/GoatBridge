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
    if (level === 4) return `Game raise: 5+ card support, distributional or 13+ HCP with fit.`;
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

  // Jacoby 2NT answer
  if (responseByPartner && responseByPartner.strain === 'notrump' && responseByPartner.level === 2
      && (opening.strain === 'hearts' || opening.strain === 'spades')) {
    const answer = explainJacoby2NTAnswer(call, opening);
    if (answer) return answer;
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

  // Classify sides
  const isOpener = openerSeat && seat === openerSeat;
  const isResponder = openerPartner && seat === openerPartner;
  const isDefensive = !isOpener && !isResponder;

  // Count how many level bids this seat has already made before `index`
  const priorBidsBySeatBefore = calls
    .slice(0, index)
    .filter(c => c.seat === seat && c.call.type === 'bid').length;

  // Pre-opening / early passes
  if (call.type === 'pass') {
    if (openingIdx < 0 || index < openingIdx) return 'Pass: fewer than 12 HCP (or no biddable hand).';
    if (index === calls.length - 1 && bidding.passCount >= 3) return 'Pass: ends the auction.';
    // Seat has already bid — pass now means "nothing more to say", not a weak hand
    if (priorBidsBySeatBefore > 0) {
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
    const lastBid = [...calls.slice(0, index)].reverse().find(c => c.call.type === 'bid');
    if (lastBid && lastBid.call.type === 'bid' && (lastBid.call.strain === 'notrump' || lastBid.call.level >= 4)) {
      return 'Penalty double: expects to defeat the contract.';
    }
    if (isDefensive)
      return 'Takeout double: opening strength (12+ HCP) with support for the unbid suits, shortness in the opponent’s suit.';
    return 'Cooperative/informative double: shows extra values, asks partner to describe further.';
  }
  if (call.type === 'redouble') return 'Redouble: 10+ HCP, generally strength-showing (or SOS depending on context).';

  if (!opening) {
    return `Bid ${call.level}${call.strain === 'notrump' ? 'NT' : STRAIN_NAME[call.strain]}.`;
  }

  // Alias earlier count for downstream logic
  const priorBidsBySeat = priorBidsBySeatBefore;

  if (isDefensive) {
    const partnerSeat = partnerOf(seat);
    const partnerAlreadyBid = calls
      .slice(0, index)
      .some(c => c.seat === partnerSeat && c.call.type === 'bid');
    if (priorBidsBySeat === 0 && !partnerAlreadyBid) return explainOvercall(call, opening);
    if (priorBidsBySeat === 0 && partnerAlreadyBid) {
      const partnerBid = calls
        .slice(0, index)
        .filter(c => c.seat === partnerSeat && c.call.type === 'bid')
        .pop();
      const pb = partnerBid && partnerBid.call.type === 'bid' ? partnerBid.call : null;
      if (call.type === 'bid' && pb && call.strain === pb.strain) {
        if (call.level === pb.level + 1)
          return `Raising partner's overcall in ${STRAIN_NAME[call.strain as keyof typeof STRAIN_NAME] ?? call.strain}: 3+ card support, competitive (6–9 HCP).`;
        if (call.level >= pb.level + 2)
          return `Jump raise of partner's overcall: 10+ HCP with support, invitational.`;
      }
      if (call.type === 'bid')
        return `Advance in ${call.strain === 'notrump' ? 'NT' : STRAIN_NAME[call.strain as keyof typeof STRAIN_NAME]}: new suit response to partner's overcall (constructive, not forcing).`;
      return 'Advancer pass: no fit and no bid available.';
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
