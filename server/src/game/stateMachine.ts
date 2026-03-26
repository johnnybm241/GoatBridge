import type { GameState, Seat, Trick } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';
import type { Card, Suit } from '@goatbridge/shared';
import { RANK_ORDER } from '@goatbridge/shared';
import type { BidCall } from '@goatbridge/shared';
import { deal } from './deck.js';
import {
  createInitialBiddingState,
  validateCall,
  applyCall,
  determineDeclarer,
} from './bidding.js';
import {
  isValidPlay,
  determineTrickWinner,
  getTrumpSuit,
  removeCardFromHand,
  nextSeat,
} from './cardPlay.js';
import {
  scoreHand,
  updateRubberScore,
  getNextVulnerability,
  createInitialRubberScore,
} from './scoring.js';
import type { SeatInfo } from '@goatbridge/shared';
import type { Contract } from '@goatbridge/shared';

export interface GameRoom {
  roomCode: string;
  hostUserId: string;
  seats: Record<Seat, SeatInfo>;
  kibitzingAllowed: boolean;
  spectators: Array<{ userId: string; displayName: string }>;
  game: GameState | null;
  hands: Record<Seat, Card[]>; // server-only, not broadcast
  undoStack: Array<{ game: GameState; hands: Record<Seat, Card[]> }>; // for undo
  teamMatchCode?: string | null;   // set when this room is part of a team match
  matchBoardCount?: number | null; // total boards in the team match
  // Swiss pairs tournament fields
  pairsTournamentCode?: string | null;
  pairsRoundNumber?: number | null;
  pairsTableIndex?: number | null;
  pairsBoardCount?: number | null;    // boards to play in this round
  pairsBoardStart?: number | null;    // 1-indexed tournament board number for first board
  pairsNsPairId?: string | null;
  pairsEwPairId?: string | null;
  pairsPreDealtBoards?: Array<Record<Seat, Card[]>> | null;
}

export function initGameState(room: GameRoom, dealer: Seat): GameState {
  const scores = room.game?.scores ?? createInitialRubberScore();
  const handNumber = (room.game?.handNumber ?? 0) + 1;
  const vulnerability = getNextVulnerability(handNumber);

  return {
    phase: 'bidding',
    dealer,
    vulnerability,
    bidding: createInitialBiddingState(),
    contract: null,
    declarer: null,
    dummy: null,
    dummyHand: null,
    currentTrick: null,
    completedTricks: [],
    trickCounts: { ns: 0, ew: 0 },
    scores,
    seats: { ...room.seats },
    currentTurn: dealer,
    hostUserId: room.hostUserId,
    kibitzingAllowed: room.kibitzingAllowed,
    spectators: room.spectators,
    handNumber,
    pendingUndoFrom: null,
    undoApprovals: { north: null, east: null, south: null, west: null },
    pendingClaim: null,
  };
}

export type BidResult =
  | { type: 'invalid'; error: string }
  | { type: 'bid_made'; game: GameState }
  | { type: 'auction_complete'; game: GameState; passedOut: boolean };

export function processBid(room: GameRoom, seat: Seat, call: BidCall): BidResult {
  const game = room.game!;
  if (game.phase !== 'bidding') return { type: 'invalid', error: 'Not in bidding phase' };
  if (game.currentTurn !== seat) return { type: 'invalid', error: 'Not your turn' };

  const seatIdx = SEATS.indexOf(seat);
  const validation = validateCall(call, game.bidding, seatIdx);
  if (!validation.valid) return { type: 'invalid', error: validation.error! };

  // Only save undo snapshot for human bids
  if (!game.seats[seat].isAI) {
    room.undoStack.push({ game: { ...game }, hands: { ...room.hands } });
  }

  const newBidding = applyCall(game.bidding, seat, call);
  const nextTurn = nextSeat(seat);

  const newGame: GameState = {
    ...game,
    bidding: newBidding,
    currentTurn: nextTurn,
  };

  if (newBidding.isComplete) {
    if (newBidding.passedOut) {
      room.game = newGame;   // keep game state consistent even on passout
      return { type: 'auction_complete', game: newGame, passedOut: true };
    }
    const { declarer, dummy } = determineDeclarer(newBidding, newBidding.currentBid!);
    const contract: Contract = {
      level: newBidding.currentBid!.level,
      strain: newBidding.currentBid!.strain,
      doubled: newBidding.doubleStatus,
      declarer,
    };
    const updatedGame: GameState = {
      ...newGame,
      phase: 'playing',
      contract,
      declarer,
      dummy,
      currentTurn: nextSeat(declarer), // opening lead by player to the left of declarer
    };
    room.game = updatedGame;
    return { type: 'auction_complete', game: updatedGame, passedOut: false };
  }

  room.game = newGame;
  return { type: 'bid_made', game: newGame };
}

export type CardPlayResult =
  | { type: 'invalid'; error: string }
  | { type: 'card_played'; game: GameState }
  | { type: 'trick_complete'; game: GameState; winner: Seat; trick: Trick }
  | { type: 'hand_complete'; game: GameState; tricksMade: number; contract: Contract }
  | { type: 'dummy_revealed'; game: GameState; dummyHand: Card[] };

export function processCardPlay(room: GameRoom, seat: Seat, card: Card): CardPlayResult {
  const game = room.game!;
  if (game.phase !== 'playing') return { type: 'invalid', error: 'Not in playing phase' };

  // Declarer plays dummy's cards
  const effectiveSeat = (game.currentTurn === game.dummy && seat === game.declarer)
    ? game.dummy!
    : seat;

  if (game.currentTurn !== effectiveSeat) {
    return { type: 'invalid', error: 'Not your turn' };
  }

  const hand = room.hands[effectiveSeat];
  const validation = isValidPlay(card, hand, game.currentTrick);
  if (!validation.valid) return { type: 'invalid', error: validation.error! };

  // Only save undo snapshot for human plays so that undo reverts the human's last action,
  // not a subsequent bot action that overwrote the snapshot.
  if (!game.seats[seat].isAI) {
    room.undoStack.push({
      game: JSON.parse(JSON.stringify(game)) as GameState,
      hands: JSON.parse(JSON.stringify(room.hands)) as Record<Seat, Card[]>,
    });
  }

  // Remove card from hand
  room.hands[effectiveSeat] = removeCardFromHand(hand, card);

  // Keep game.dummyHand in sync with room.hands[dummy] so undo snapshots are accurate.
  // Without this, the snapshot always contains the full original dummy hand, causing
  // ghost cards to appear after an undo (previously played dummy cards shown as still present).
  const updatedDummyHand = (effectiveSeat === game.dummy && game.dummyHand)
    ? removeCardFromHand(game.dummyHand, card)
    : game.dummyHand;

  const trickCard = { seat: effectiveSeat, card };
  let currentTrick: Trick;

  if (!game.currentTrick || game.currentTrick.cards.length === 0) {
    currentTrick = { cards: [trickCard], leader: effectiveSeat, winner: null };
  } else {
    currentTrick = { ...game.currentTrick, cards: [...game.currentTrick.cards, trickCard] };
  }

  // Check if dummy reveal happens (first card led to first trick)
  const isDummyReveal = game.dummyHand === null && currentTrick.cards.length === 1 && game.completedTricks.length === 0;

  if (isDummyReveal) {
    const dummyHand = [...room.hands[game.dummy!]];
    const newGame: GameState = {
      ...game,
      currentTrick,
      dummyHand,
      currentTurn: nextSeat(effectiveSeat),
    };
    room.game = newGame;
    return { type: 'dummy_revealed', game: newGame, dummyHand };
  }

  if (currentTrick.cards.length < 4) {
    const nextPlayer = nextSeat(effectiveSeat);
    const newGame: GameState = {
      ...game,
      currentTrick,
      dummyHand: updatedDummyHand,
      currentTurn: nextPlayer,
    };
    room.game = newGame;
    return { type: 'card_played', game: newGame };
  }

  // Trick complete
  const trumpSuit = getTrumpSuit(game.contract!.strain);
  const winner = determineTrickWinner(currentTrick, trumpSuit);
  const completedTrick: Trick = { ...currentTrick, winner };

  const winnerSide: 'ns' | 'ew' = (winner === 'north' || winner === 'south') ? 'ns' : 'ew';
  const newTrickCounts = {
    ns: game.trickCounts.ns + (winnerSide === 'ns' ? 1 : 0),
    ew: game.trickCounts.ew + (winnerSide === 'ew' ? 1 : 0),
  };

  const completedTricks = [...game.completedTricks, completedTrick];

  if (completedTricks.length === 13) {
    // Hand complete
    const declarerSide: 'ns' | 'ew' = (game.declarer === 'north' || game.declarer === 'south') ? 'ns' : 'ew';
    const tricksMade = newTrickCounts[declarerSide];
    const handScore = scoreHand(game.contract!, tricksMade, game.vulnerability, declarerSide);
    const newScores = updateRubberScore(game.scores, handScore);

    const newGame: GameState = {
      ...game,
      phase: newScores.isComplete ? 'complete' : 'scoring',
      completedTricks,
      trickCounts: newTrickCounts,
      currentTrick: null,
      currentTurn: null,
      scores: newScores,
      dummyHand: updatedDummyHand,
    };
    room.game = newGame;
    return { type: 'hand_complete', game: newGame, tricksMade, contract: game.contract! };
  }

  // Continue playing
  const newGame: GameState = {
    ...game,
    currentTrick: { cards: [], leader: winner, winner: null },
    completedTricks,
    trickCounts: newTrickCounts,
    currentTurn: winner,
    dummyHand: updatedDummyHand,
  };
  room.game = newGame;
  return { type: 'trick_complete', game: newGame, winner, trick: completedTrick };
}

/**
 * Returns true if the declarer side is guaranteed to win all remaining tricks.
 * Conservative: validates top-card ownership or void+trump for each suit opponents hold.
 */
export function validateClaimAllTricks(room: GameRoom): boolean {
  const game = room.game!;
  if (!game.contract || !game.declarer || !game.dummy) return false;

  const trump = getTrumpSuit(game.contract.strain) as Suit | null;
  const declarerSide: Seat[] = [game.declarer, game.dummy];
  const oppSide = SEATS.filter(s => !declarerSide.includes(s));

  const myCards = declarerSide.flatMap(s => room.hands[s] ?? []);
  const oppCards = oppSide.flatMap(s => room.hands[s] ?? []);

  if (oppCards.length === 0) return true; // no tricks left to lose

  const rankVal = (r: string) => RANK_ORDER.indexOf(r as (typeof RANK_ORDER)[number]);
  const myTrumps = trump ? myCards.filter(c => c.suit === trump) : [];

  for (const suit of ['spades', 'hearts', 'diamonds', 'clubs'] as Suit[]) {
    const oppInSuit = oppCards.filter(c => c.suit === suit);
    if (oppInSuit.length === 0) continue;

    const myInSuit = myCards.filter(c => c.suit === suit);
    if (myInSuit.length === 0) {
      // Void — can ruff only if we have trump and it's not a NT contract
      if (!trump || myTrumps.length === 0) return false;
      continue;
    }

    // We have cards in this suit — we must hold the highest
    const maxOpp = Math.max(...oppInSuit.map(c => rankVal(c.rank)));
    const maxMine = Math.max(...myInSuit.map(c => rankVal(c.rank)));
    if (maxMine <= maxOpp) return false;
  }
  return true;
}

/** Settle a claim: award all remaining tricks to declarer side and resolve the hand. */
export function settleClaim(room: GameRoom): { type: 'hand_complete'; game: GameState; tricksMade: number; contract: Contract } {
  const game = room.game!;
  const declarerSide: 'ns' | 'ew' = (game.declarer === 'north' || game.declarer === 'south') ? 'ns' : 'ew';
  const remaining = room.hands[game.declarer!]?.length ?? 0;
  const newTrickCounts = {
    ns: game.trickCounts.ns + (declarerSide === 'ns' ? remaining : 0),
    ew: game.trickCounts.ew + (declarerSide === 'ew' ? remaining : 0),
  };
  const tricksMade = newTrickCounts[declarerSide];
  const handScore = scoreHand(game.contract!, tricksMade, game.vulnerability, declarerSide);
  const newScores = updateRubberScore(game.scores, handScore);

  const newGame: GameState = {
    ...game,
    phase: newScores.isComplete ? 'complete' : 'scoring',
    trickCounts: newTrickCounts,
    currentTrick: null,
    currentTurn: null,
    scores: newScores,
    pendingClaim: null,
  };
  room.game = newGame;
  return { type: 'hand_complete', game: newGame, tricksMade, contract: game.contract! };
}

export function startNewHand(room: GameRoom, preDealt?: Record<Seat, Card[]>): { game: GameState; hands: Record<Seat, Card[]> } {
  // Dealer cycles N→E→S→W based on hand number (1-indexed)
  const nextHandNumber = (room.game?.handNumber ?? 0) + 1;
  const nextDealer = SEATS[(nextHandNumber - 1) % 4]!;

  const newHands = preDealt ?? deal();
  room.hands = newHands;
  room.undoStack = []; // clear undo history between hands

  const newGame = initGameState(room, nextDealer);
  room.game = newGame;

  return { game: newGame, hands: newHands };
}
