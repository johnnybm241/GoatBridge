import type { BidCall, BiddingState } from '@goatbridge/shared';
import type { Card, Suit } from '@goatbridge/shared';
import type { Seat } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';
import { evaluateHand } from './handEvaluator.js';

export function chooseBid(
  hand: Card[],
  seat: Seat,
  bidding: BiddingState,
): BidCall {
  const eval_ = evaluateHand(hand);
  const { hcp, isBalanced, shape, longestSuit, longestSuitLength } = eval_;

  const callCount = bidding.calls.length;
  const seatIdx = SEATS.indexOf(seat);
  const isOpening = callCount < 4 && !bidding.currentBid;
  const partnerSeatIdx = (seatIdx + 2) % 4;
  const partnerSeat = SEATS[partnerSeatIdx]!;

  // Opening bids
  if (isOpening || !bidding.currentBid) {
    if (hcp < 12) return { type: 'pass' };

    if (isBalanced) {
      if (hcp >= 15 && hcp <= 17) return { type: 'bid', level: 1, strain: 'notrump' };
      if (hcp >= 20 && hcp <= 21) return { type: 'bid', level: 2, strain: 'notrump' };
      if (hcp >= 22 && hcp <= 24) return { type: 'bid', level: 2, strain: 'notrump' };
      if (hcp >= 25) return { type: 'bid', level: 2, strain: 'clubs' };
    }

    if (hcp >= 22) return { type: 'bid', level: 2, strain: 'clubs' };

    // Weak twos (6-10 HCP, 6-card suit)
    if (hcp >= 6 && hcp <= 10 && callCount === 0) {
      if (shape.spades >= 6) return { type: 'bid', level: 2, strain: 'spades' };
      if (shape.hearts >= 6) return { type: 'bid', level: 2, strain: 'hearts' };
      if (shape.diamonds >= 6) return { type: 'bid', level: 2, strain: 'diamonds' };
    }

    // 1-level openers
    if (shape.spades >= 5 && shape.spades >= shape.hearts) {
      return { type: 'bid', level: 1, strain: 'spades' };
    }
    if (shape.hearts >= 5) {
      return { type: 'bid', level: 1, strain: 'hearts' };
    }
    if (shape.diamonds >= 4) {
      return { type: 'bid', level: 1, strain: 'diamonds' };
    }
    return { type: 'bid', level: 1, strain: 'clubs' };
  }

  // Responses and subsequent bids — simplified
  // For now, pass if too weak or uncertain
  if (hcp < 6 && callCount > 0) return { type: 'pass' };

  // Very basic response: try to raise partner or bid new suit
  const lastBidCall = [...bidding.calls].reverse().find(c => c.call.type === 'bid');
  if (!lastBidCall) return { type: 'pass' };

  const lastBid = lastBidCall.call as { type: 'bid'; level: number; strain: string };
  const lastBidderIdx = SEATS.indexOf(lastBidCall.seat as Seat);
  const isPartnersBid = (lastBidderIdx + 2) % 4 === seatIdx;

  if (isPartnersBid && hcp >= 6) {
    // Respond to partner's 1NT
    if (lastBid.strain === 'notrump' && lastBid.level === 1) {
      if (hcp >= 8 && hcp <= 9) return { type: 'bid', level: 2, strain: 'notrump' }; // invite
      if (hcp >= 10) return { type: 'bid', level: 3, strain: 'notrump' }; // game
      if (shape.spades >= 5) return { type: 'bid', level: 2, strain: 'spades' };
      if (shape.hearts >= 5) return { type: 'bid', level: 2, strain: 'hearts' };
      return { type: 'pass' };
    }

    // Respond to 1-level suit opening
    if (lastBid.level === 1 && lastBid.strain !== 'notrump') {
      if (hcp >= 13) {
        return { type: 'bid', level: 2, strain: lastBid.strain as Suit };
      }
      if (hcp >= 6 && shape[lastBid.strain as Suit] >= 3) {
        return { type: 'bid', level: 2, strain: lastBid.strain as Suit };
      }
      // Bid a new suit
      if (shape.spades >= 4 && lastBid.strain !== 'spades') {
        return { type: 'bid', level: 1, strain: 'spades' };
      }
      if (shape.hearts >= 4 && lastBid.strain !== 'hearts') {
        return { type: 'bid', level: 1, strain: 'hearts' };
      }
      return { type: 'bid', level: 1, strain: 'notrump' };
    }
  }

  return { type: 'pass' };
}
