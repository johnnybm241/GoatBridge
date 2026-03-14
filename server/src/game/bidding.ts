import type { BidCall, BiddingState, LevelBid, Strain } from '@goatbridge/shared';
import { STRAIN_ORDER } from '@goatbridge/shared';
import type { Seat } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';

export function isBidHigher(newBid: LevelBid, currentBid: LevelBid | null): boolean {
  if (!currentBid) return true;
  if (newBid.level > currentBid.level) return true;
  if (newBid.level === currentBid.level) {
    return STRAIN_ORDER.indexOf(newBid.strain) > STRAIN_ORDER.indexOf(currentBid.strain);
  }
  return false;
}

export function validateCall(
  call: BidCall,
  state: BiddingState,
  seatIndex: number,
): { valid: boolean; error?: string } {
  const callNumber = state.calls.length;
  const callerSide = seatIndex % 2; // 0 = N/S, 1 = E/W

  if (call.type === 'bid') {
    if (!isBidHigher(call, state.currentBid)) {
      return { valid: false, error: 'Bid must be higher than current bid' };
    }
    return { valid: true };
  }

  if (call.type === 'double') {
    if (!state.currentBid) return { valid: false, error: 'Nothing to double' };
    if (state.doubleStatus !== 'none') return { valid: false, error: 'Already doubled or redoubled' };
    // Find who made the current bid
    const lastBidCallIdx = [...state.calls].reverse().findIndex(c => c.call.type === 'bid');
    if (lastBidCallIdx === -1) return { valid: false, error: 'No bid to double' };
    const lastBidCall = state.calls[state.calls.length - 1 - lastBidCallIdx]!;
    const bidderSeatIdx = SEATS.indexOf(lastBidCall.seat as Seat);
    const bidderSide = bidderSeatIdx % 2;
    if (bidderSide === callerSide) return { valid: false, error: 'Can only double opponent\'s bid' };
    return { valid: true };
  }

  if (call.type === 'redouble') {
    if (state.doubleStatus !== 'doubled') return { valid: false, error: 'Can only redouble a doubled contract' };
    // Find who doubled
    const lastDoubleIdx = [...state.calls].reverse().findIndex(c => c.call.type === 'double');
    if (lastDoubleIdx === -1) return { valid: false, error: 'No double found' };
    const lastDouble = state.calls[state.calls.length - 1 - lastDoubleIdx]!;
    const doublerSeatIdx = SEATS.indexOf(lastDouble.seat as Seat);
    const doublerSide = doublerSeatIdx % 2;
    if (doublerSide === callerSide) return { valid: false, error: 'Can only redouble opponent\'s double' };
    return { valid: true };
  }

  // pass is always valid
  return { valid: true };
}

export function applyCall(state: BiddingState, seat: Seat, call: BidCall): BiddingState {
  const newCalls = [...state.calls, { seat, call }];
  let currentBid = state.currentBid;
  let doubleStatus = state.doubleStatus;
  let passCount = state.passCount;

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
  } else if (call.type === 'pass') {
    passCount++;
  }

  // Auction ends: 3 consecutive passes after any bid, or 4 passes opening
  const isComplete = currentBid
    ? passCount >= 3
    : passCount >= 4;

  const passedOut = !currentBid && passCount >= 4;

  return {
    calls: newCalls,
    currentBid,
    doubleStatus,
    passCount,
    isComplete,
    passedOut,
  };
}

export function determineDeclarer(
  state: BiddingState,
  finalBid: LevelBid,
): { declarer: Seat; dummy: Seat } {
  const declaringSide = (() => {
    const lastBidder = [...state.calls].reverse().find(c => c.call.type === 'bid');
    if (!lastBidder) throw new Error('No bid found');
    return SEATS.indexOf(lastBidder.seat as Seat) % 2; // 0=N/S, 1=E/W
  })();

  const strain = finalBid.strain;
  // Find first player on declaring side who bid this strain
  const firstBidder = state.calls.find(c => {
    if (c.call.type !== 'bid') return false;
    if (c.call.strain !== strain) return false;
    return SEATS.indexOf(c.seat as Seat) % 2 === declaringSide;
  });

  if (!firstBidder) throw new Error('Cannot determine declarer');

  const declarerSeat = firstBidder.seat as Seat;
  const declarerIdx = SEATS.indexOf(declarerSeat);
  const dummyIdx = (declarerIdx + 2) % 4;
  const dummy = SEATS[dummyIdx]!;

  return { declarer: declarerSeat, dummy };
}

export function createInitialBiddingState(): BiddingState {
  return {
    calls: [],
    currentBid: null,
    doubleStatus: 'none',
    passCount: 0,
    isComplete: false,
    passedOut: false,
  };
}
