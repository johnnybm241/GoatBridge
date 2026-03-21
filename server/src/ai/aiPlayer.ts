import type { Seat } from '@goatbridge/shared';
import type { Card } from '@goatbridge/shared';
import type { GameRoom } from '../game/stateMachine.js';
import { chooseBid } from './bidding/saycBidder.js';
import { selectDeclarerCard, selectDefenderCard } from './cardPlay/cardSelector.js';
import { logger } from '../logger.js';

export interface AIAction {
  type: 'bid' | 'play';
  seat: Seat;
  data: unknown;
}

function delay(): number {
  // Use minimal delay in test environment to keep test suite fast
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return 10;
  return 800 + Math.random() * 700; // 800-1500ms
}

export function scheduleAIAction(
  room: GameRoom,
  seat: Seat,
  onBid: (seat: Seat, call: ReturnType<typeof chooseBid>) => void,
  onPlay: (seat: Seat, card: Card) => void,
): void {
  const game = room.game!;
  const seatInfo = game.seats[seat];
  if (!seatInfo?.isAI) return;

  setTimeout(() => {
    const currentGame = room.game;
    if (!currentGame) return;

    // AI declarer also plays dummy's cards when it's dummy's turn
    const declarerPlayingDummy =
      currentGame.phase === 'playing' &&
      currentGame.currentTurn === currentGame.dummy &&
      currentGame.declarer === seat;

    if (currentGame.currentTurn !== seat && !declarerPlayingDummy) return;

    if (currentGame.phase === 'bidding') {
      const hand = room.hands[seat];
      const call = chooseBid(hand, seat, currentGame.bidding);
      logger.debug('AI bid', { seat, call });
      onBid(seat, call);
    } else if (currentGame.phase === 'playing') {
      const hand = room.hands[seat];
      const isDeclarer = currentGame.declarer === seat;
      const isDummy = currentGame.dummy === seat;
      const contract = currentGame.contract!;

      let card: Card;
      if (isDeclarer) {
        // Declarer plays their own cards or dummy's cards
        card = selectDeclarerCard(
          hand,
          room.hands[currentGame.dummy!] ?? [],
          currentGame.currentTrick,
          contract.strain,
          declarerPlayingDummy,
          currentGame.completedTricks,
        );
      } else if (isDummy) {
        // Dummy's cards are played by AI declarer — should not reach here in normal flow
        card = selectDeclarerCard(
          room.hands[currentGame.declarer!] ?? [],
          hand,
          currentGame.currentTrick,
          contract.strain,
          true,
          currentGame.completedTricks,
        );
      } else {
        // Defender
        const isOpeningLead = currentGame.completedTricks.length === 0 &&
          (!currentGame.currentTrick || currentGame.currentTrick.cards.length === 0);
        card = selectDefenderCard(
          hand,
          currentGame.currentTrick,
          contract.strain,
          isOpeningLead,
          seat,
          currentGame.declarer,
          currentGame.dummy,
        );
      }
      logger.debug('AI play', { seat, card });
      onPlay(seat, card);
    }
  }, delay());
}

export function scheduleAIActionIfNeeded(
  room: GameRoom,
  onBid: (seat: Seat, call: ReturnType<typeof chooseBid>) => void,
  onPlay: (seat: Seat, card: Card) => void,
): void {
  const game = room.game;
  if (!game || !game.currentTurn) return;

  const seat = game.currentTurn;

  // When it's dummy's turn, the declarer plays — schedule the declarer (AI or not)
  if (seat === game.dummy && game.declarer) {
    const declarerInfo = game.seats[game.declarer];
    if (declarerInfo?.isAI) {
      // AI declarer plays dummy's cards
      scheduleAIAction(room, game.declarer, onBid, onPlay);
    }
    // If declarer is human, they play dummy's cards — nothing to schedule
    return;
  }

  const seatInfo = game.seats[seat];
  if (!seatInfo?.isAI) return;

  scheduleAIAction(room, seat, onBid, onPlay);
}
