import type { GameState, Seat, Trick } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';
import type { Card } from '@goatbridge/shared';
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
  previousState: { game: GameState; hands: Record<Seat, Card[]> } | null; // for undo
}

export function initGameState(room: GameRoom, dealer: Seat): GameState {
  const scores = room.game?.scores ?? createInitialRubberScore();
  const handNumber = (room.game?.handNumber ?? 0) + 1;
  const vulnerability = getNextVulnerability(
    room.game?.vulnerability ?? 'none',
    scores.nsGamesWon,
    scores.ewGamesWon,
  );

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

  // Save undo snapshot
  room.previousState = { game: { ...game }, hands: { ...room.hands } };

  const newBidding = applyCall(game.bidding, seat, call);
  const nextTurn = nextSeat(seat);

  const newGame: GameState = {
    ...game,
    bidding: newBidding,
    currentTurn: nextTurn,
  };

  if (newBidding.isComplete) {
    if (newBidding.passedOut) {
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
      currentTurn: nextSeat(dummy), // player to the left of dummy leads first
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

  // Save undo snapshot
  room.previousState = {
    game: JSON.parse(JSON.stringify(game)) as GameState,
    hands: JSON.parse(JSON.stringify(room.hands)) as Record<Seat, Card[]>,
  };

  // Remove card from hand
  room.hands[effectiveSeat] = removeCardFromHand(hand, card);

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
  };
  room.game = newGame;
  return { type: 'trick_complete', game: newGame, winner, trick: completedTrick };
}

export function startNewHand(room: GameRoom): { game: GameState; hands: Record<Seat, Card[]> } {
  const seats = SEATS;
  const currentDealer = room.game?.dealer;
  const dealerIdx = currentDealer ? seats.indexOf(currentDealer) : 0;
  const nextDealer = seats[(dealerIdx + 1) % 4]!;

  const newHands = deal();
  room.hands = newHands;

  const newGame = initGameState(room, nextDealer);
  room.game = newGame;

  return { game: newGame, hands: newHands };
}
