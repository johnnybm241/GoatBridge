import type { BidCall, BiddingState, Card, Seat, Suit, Trick } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';
import { explainBidAt } from '../../../client/src/lib/bidExplainer.js';
import { chooseBid } from '../ai/bidding/saycBidder.js';
import { evaluateHand } from '../ai/bidding/handEvaluator.js';
import { selectDeclarerCard, selectDefenderCard } from '../ai/cardPlay/cardSelector.js';
import { applyCall, createInitialBiddingState, determineDeclarer, validateCall } from '../game/bidding.js';
import {
  determineTrickWinner,
  getTrumpSuit,
  isValidPlay,
  nextSeat,
  removeCardFromHand,
} from '../game/cardPlay.js';
import { createDeck } from '../game/deck.js';

type DealHands = Record<Seat, Card[]>;

type Issue =
  | 'explanation-contradiction'
  | 'illegal-call'
  | 'pass-after-overcall-support'
  | 'junk-overcall'
  | 'unsafe-ace-lead'
  | 'wasted-trump';

interface Finding {
  issue: Issue;
  deal: number;
  seat: Seat;
  auction: string;
  detail: string;
}

interface SimulationSummary {
  deals: number;
  auctionsWithContract: number;
  issueCounts: Record<Issue, number>;
  samples: Finding[];
}

const STRAIN_LABEL: Record<Suit | 'notrump', string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
  notrump: 'NT',
};

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWith(rng: () => number): Card[] {
  const deck = [...createDeck()];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

function dealWith(rng: () => number): DealHands {
  const deck = shuffleWith(rng);
  const hands: DealHands = { north: [], east: [], south: [], west: [] };
  for (let i = 0; i < 52; i++) {
    hands[SEATS[i % 4]!]!.push(deck[i]!);
  }
  return hands;
}

function callText(call: BidCall): string {
  if (call.type === 'pass') return 'P';
  if (call.type === 'double') return 'X';
  if (call.type === 'redouble') return 'XX';
  return `${call.level}${STRAIN_LABEL[call.strain]}`;
}

function auctionText(calls: Array<{ seat: Seat; call: BidCall }>): string {
  return calls.map(({ seat, call }) => `${seat[0]!.toUpperCase()}:${callText(call)}`).join(' ');
}

function getSide(seat: Seat): 'ns' | 'ew' {
  return seat === 'north' || seat === 'south' ? 'ns' : 'ew';
}

function suitQuality(hand: Card[], suit: Suit): number {
  return hand
    .filter(card => card.suit === suit)
    .reduce((score, card) => {
      if (card.rank === 'A') return score + 4;
      if (card.rank === 'K') return score + 3;
      if (card.rank === 'Q') return score + 2;
      if (card.rank === 'J') return score + 1;
      if (card.rank === '10') return score + 0.5;
      return score;
    }, 0);
}

function hasUnsupportedAceLeadRisk(hand: Card[], card: Card): boolean {
  if (card.rank !== 'A') return false;
  const suitCards = hand.filter(c => c.suit === card.suit);
  const hasSupportingHonor = suitCards.some(c => c.rank === 'K' || c.rank === 'Q');
  return suitCards.length <= 3 && !hasSupportingHonor;
}

function extractHcpRange(text: string): [number, number] | null {
  const normalized = text.replace(/–/g, '-');
  const range = normalized.match(/(\d+)\s*-\s*(\d+)\s*HCP/i);
  if (range) return [Number(range[1]), Number(range[2])];
  const lower = normalized.match(/(\d+)\+\s*HCP/i);
  if (lower) return [Number(lower[1]), 40];
  const under = normalized.match(/0\s*-\s*(\d+)\s*HCP/i);
  if (under) return [0, Number(under[1])];
  const weak = normalized.match(/fewer than\s+(\d+)\s*HCP/i);
  if (weak) return [0, Number(weak[1]) - 1];
  return null;
}

function priorShownHcpRange(
  calls: Array<{ seat: Seat; call: BidCall }>,
  seat: Seat,
  index: number,
): [number, number] | null {
  for (let i = index - 1; i >= 0; i--) {
    const entry = calls[i];
    if (!entry || entry.seat !== seat) continue;
    const call = entry.call;
    if (call.type !== 'bid') continue;
    if (call.strain === 'notrump' && call.level === 1) return [15, 17];
    if (call.strain === 'notrump' && call.level === 2) return [20, 21];
    if (call.level === 2 && call.strain === 'clubs') return [22, 40];
    if (call.level === 2 && call.strain !== 'notrump' && call.strain !== 'clubs') return [6, 10];
    if (call.level === 3) return [5, 10];
    if (call.level === 1) return [12, 40];
  }
  return null;
}

function shouldFlagExplanation(
  calls: Array<{ seat: Seat; call: BidCall }>,
  seat: Seat,
  index: number,
  explanation: string,
): string | null {
  const currentRange = extractHcpRange(explanation);
  const priorRange = priorShownHcpRange(calls, seat, index);
  if (currentRange && priorRange) {
    const overlapLow = Math.max(currentRange[0], priorRange[0]);
    const overlapHigh = Math.min(currentRange[1], priorRange[1]);
    if (overlapLow > overlapHigh) {
      return `Explanation range ${currentRange[0]}-${currentRange[1]} HCP contradicts earlier shown ${priorRange[0]}-${priorRange[1]} HCP.`;
    }
  }

  const priorNonPass = calls.slice(0, index).some(entry => entry.seat === seat && entry.call.type !== 'pass');
  if (priorNonPass && /0-5 HCP|fewer than 12 HCP/i.test(explanation)) {
    return `Explanation "${explanation}" ignores the player's earlier action.`;
  }

  const previousEntries = calls.slice(0, index);
  const partnerSeat = SEATS[(SEATS.indexOf(seat) + 2) % 4]!;
  const partnerLastNonPass = [...previousEntries]
    .reverse()
    .find(entry => entry.seat === partnerSeat && entry.call.type !== 'pass');
  if (!priorNonPass && partnerLastNonPass?.call.type === 'double') {
    const doubledBid = [...previousEntries.slice(0, previousEntries.indexOf(partnerLastNonPass))]
      .reverse()
      .find(entry => entry.call.type === 'bid');
    if (
      doubledBid &&
      calls[index]!.call.type === 'pass' &&
      !/penalt|convert/i.test(explanation)
    ) {
      return `Pass explanation does not acknowledge partner's takeout double.`;
    }
  }

  const partnerOpenedStrongTwoClubs = previousEntries.some(entry =>
    entry.seat === partnerSeat &&
    entry.call.type === 'bid' &&
    entry.call.level === 2 &&
    entry.call.strain === 'clubs',
  );
  if (
    partnerOpenedStrongTwoClubs &&
    calls[index]!.call.type === 'pass' &&
    /0-5 HCP|no bid available/i.test(explanation)
  ) {
    return 'Pass explanation ignores the forcing 2♣ opening context.';
  }

  return null;
}

function runAuction(hands: DealHands): {
  state: BiddingState;
  findings: Finding[];
} {
  let state = createInitialBiddingState();
  let seatIndex = 0;
  const findings: Finding[] = [];

  while (!state.isComplete && state.calls.length < 40) {
    const seat = SEATS[seatIndex % 4]!;
    const proposedCall = chooseBid(hands[seat], seat, state);
    const validation = validateCall(proposedCall, state, seatIndex % 4);
    const call = validation.valid ? proposedCall : ({ type: 'pass' } as const);
    if (!validation.valid) {
      findings.push({
        issue: 'illegal-call',
        deal: -1,
        seat,
        auction: auctionText([...state.calls, { seat, call: proposedCall }] as Array<{ seat: Seat; call: BidCall }>),
        detail: `AI proposed illegal ${callText(proposedCall)}: ${validation.error}.`,
      });
    }
    const nextState = applyCall(state, seat, call);
    const explanation = explainBidAt(nextState.calls.length - 1, nextState, seat);
    const contradiction = shouldFlagExplanation(nextState.calls, seat, nextState.calls.length - 1, explanation);
    if (contradiction) {
      findings.push({
        issue: 'explanation-contradiction',
        deal: -1,
        seat,
        auction: auctionText(nextState.calls as Array<{ seat: Seat; call: BidCall }>),
        detail: `${callText(call)} — ${contradiction} Explanation: ${explanation}`,
      });
    }

    const priorCalls = state.calls;
    const partnerSeat = SEATS[(SEATS.indexOf(seat) + 2) % 4]!;
    const partnerLastBid = [...priorCalls].reverse().find(entry => entry.seat === partnerSeat && entry.call.type === 'bid');
    if (call.type === 'pass' && partnerLastBid?.call.type === 'bid') {
      const eval_ = evaluateHand(hands[seat]);
      const myPriorNonPass = priorCalls.some(entry => entry.seat === seat && entry.call.type !== 'pass');
      const partnerBidCount = priorCalls.filter(entry => entry.seat === partnerSeat && entry.call.type === 'bid').length;
      const firstBid = priorCalls.find(entry => entry.call.type === 'bid');
      if (
        !myPriorNonPass &&
        partnerBidCount === 1 &&
        firstBid?.seat !== partnerSeat &&
        eval_.hcp >= 6 &&
        partnerLastBid.call.strain !== 'notrump' &&
        eval_.shape[partnerLastBid.call.strain as Suit] >= 3
      ) {
        findings.push({
          issue: 'pass-after-overcall-support',
          deal: -1,
          seat,
          auction: auctionText(nextState.calls as Array<{ seat: Seat; call: BidCall }>),
          detail: `Passed with ${eval_.hcp} HCP and ${eval_.shape[partnerLastBid.call.strain as Suit]}-card support for partner's ${callText(partnerLastBid.call)}.`,
        });
      }
    }
    if (call.type === 'bid' && priorCalls.length > 0) {
      const firstBid = priorCalls.find(entry => entry.call.type === 'bid');
      const hasPartnerBid = priorCalls.some(entry => entry.seat === partnerSeat && entry.call.type === 'bid');
      if (
        firstBid &&
        firstBid.seat !== seat &&
        !hasPartnerBid &&
        call.strain !== 'notrump'
      ) {
        const eval_ = evaluateHand(hands[seat]);
        if (eval_.shape[call.strain] === 5 && suitQuality(hands[seat], call.strain) < 3) {
          findings.push({
            issue: 'junk-overcall',
            deal: -1,
            seat,
            auction: auctionText(nextState.calls as Array<{ seat: Seat; call: BidCall }>),
            detail: `Overcalled ${callText(call)} with only a weak 5-card suit.`,
          });
        }
      }
    }

    state = nextState;
    seatIndex++;
  }

  return { state, findings };
}

function pickCardForSeat(
  hands: DealHands,
  seat: Seat,
  currentTrick: Trick | null,
  completedTricks: Trick[],
  declarer: Seat,
  dummy: Seat,
  strain: Suit | 'notrump',
  bidding: BiddingState,
): Card {
  const isDummyTurn = seat === dummy;
  if (seat === declarer || isDummyTurn) {
    return selectDeclarerCard(
      hands[declarer],
      hands[dummy],
      currentTrick,
      strain,
      isDummyTurn,
      completedTricks,
      declarer,
      dummy,
    );
  }

  const isOpeningLead = completedTricks.length === 0 && (!currentTrick || currentTrick.cards.length === 0);
  return selectDefenderCard(
    hands[seat],
    currentTrick,
    strain,
    isOpeningLead,
    seat,
    declarer,
    dummy,
    bidding,
  );
}

function currentWinner(trick: Trick, trumpSuit: Suit | null): Seat {
  return determineTrickWinner(trick, trumpSuit);
}

function simulatePlay(
  hands: DealHands,
  bidding: BiddingState,
  dealNo: number,
): Finding[] {
  if (!bidding.currentBid) return [];
  const { declarer, dummy } = determineDeclarer(bidding, bidding.currentBid);
  const trumpSuit = getTrumpSuit(bidding.currentBid.strain);
  const findings: Finding[] = [];
  const completedTricks: Trick[] = [];
  let currentTrick: Trick | null = null;
  let turn = SEATS[(SEATS.indexOf(declarer) + 1) % 4]!;

  while (Object.values(hands).some(hand => hand.length > 0)) {
    if (!currentTrick) currentTrick = { leader: turn, winner: null, cards: [] };
    const actualSeat = turn === dummy ? declarer : turn;
    const card = pickCardForSeat(hands, turn, currentTrick, completedTricks, declarer, dummy, bidding.currentBid.strain, bidding);

    const actingHand = turn === dummy ? hands[dummy] : hands[turn];
    const validity = isValidPlay(card, actingHand, currentTrick);
    if (!validity.valid) {
      throw new Error(`Invalid simulated play by ${turn}: ${validity.error}`);
    }

    if (currentTrick.cards.length > 0) {
      const ledSuit = currentTrick.cards[0]!.card.suit;
      const canFollow = actingHand.some(c => c.suit === ledSuit);
      const winningSeat = currentWinner(currentTrick, trumpSuit);
      const sameSideWinning = getSide(winningSeat) === getSide(actualSeat);
      const hasTrump = trumpSuit ? actingHand.some(c => c.suit === trumpSuit) : false;
      const hasSideDiscard = trumpSuit ? actingHand.some(c => c.suit !== trumpSuit) : true;
      const isTrumpPlay = trumpSuit ? card.suit === trumpSuit : false;
      if (!canFollow && hasTrump && hasSideDiscard && isTrumpPlay && sameSideWinning) {
        findings.push({
          issue: 'wasted-trump',
          deal: dealNo,
          seat: turn,
          auction: auctionText(bidding.calls as Array<{ seat: Seat; call: BidCall }>),
          detail: `${turn} ruffed partner/own winner with ${card.rank}${STRAIN_LABEL[card.suit]} instead of discarding.`,
        });
      }
    } else if (completedTricks.length === 0 && trumpSuit && hasUnsupportedAceLeadRisk(actingHand, card)) {
      findings.push({
        issue: 'unsafe-ace-lead',
        deal: dealNo,
        seat: turn,
        auction: auctionText(bidding.calls as Array<{ seat: Seat; call: BidCall }>),
        detail: `${turn} led unsupported ace ${card.rank}${STRAIN_LABEL[card.suit]} against a suit contract.`,
      });
    }

    if (turn === dummy) hands[dummy] = removeCardFromHand(hands[dummy], card);
    else hands[turn] = removeCardFromHand(hands[turn], card);

    currentTrick.cards.push({ seat: turn, card });
    if (currentTrick.cards.length === 4) {
      currentTrick.winner = determineTrickWinner(currentTrick, trumpSuit);
      completedTricks.push(currentTrick);
      turn = currentTrick.winner;
      currentTrick = null;
    } else {
      turn = nextSeat(turn);
    }
  }

  return findings;
}

function cloneHands(hands: DealHands): DealHands {
  return {
    north: [...hands.north],
    east: [...hands.east],
    south: [...hands.south],
    west: [...hands.west],
  };
}

function simulate(deals: number, seed: number): SimulationSummary {
  const rng = mulberry32(seed);
  const summary: SimulationSummary = {
    deals,
    auctionsWithContract: 0,
    issueCounts: {
      'explanation-contradiction': 0,
      'illegal-call': 0,
      'pass-after-overcall-support': 0,
      'junk-overcall': 0,
      'unsafe-ace-lead': 0,
      'wasted-trump': 0,
    },
    samples: [],
  };

  for (let dealNo = 1; dealNo <= deals; dealNo++) {
    const hands = dealWith(rng);
    const { state, findings: biddingFindings } = runAuction(cloneHands(hands));
    for (const finding of biddingFindings) {
      finding.deal = dealNo;
      summary.issueCounts[finding.issue]++;
      if (summary.samples.length < 25) summary.samples.push(finding);
    }
    if (!state.currentBid) continue;

    summary.auctionsWithContract++;
    const playFindings = simulatePlay(cloneHands(hands), state, dealNo);
    for (const finding of playFindings) {
      summary.issueCounts[finding.issue]++;
      if (summary.samples.length < 25) summary.samples.push(finding);
    }
  }

  return summary;
}

const dealsArg = process.argv.find(arg => arg.startsWith('--deals='));
const seedArg = process.argv.find(arg => arg.startsWith('--seed='));
const deals = dealsArg ? Number(dealsArg.split('=')[1]) : 250;
const seed = seedArg ? Number(seedArg.split('=')[1]) : 20260906;
const summary = simulate(deals, seed);

console.log(JSON.stringify(summary, null, 2));
