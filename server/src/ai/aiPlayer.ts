import type { Seat } from '@goatbridge/shared';
import type { Card } from '@goatbridge/shared';
import type { GameRoom } from '../game/stateMachine.js';
import { chooseBid } from './bidding/saycBidder.js';
import { selectDeclarerCard, selectDefenderCard } from './cardPlay/cardSelector.js';

export interface AIAction {
  type: 'bid' | 'play';
  seat: Seat;
  data: unknown;
}

function delay(): number {
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
    if (!currentGame || currentGame.currentTurn !== seat) return;

    if (currentGame.phase === 'bidding') {
      const hand = room.hands[seat];
      const call = chooseBid(hand, seat, currentGame.bidding);
      onBid(seat, call);
    } else if (currentGame.phase === 'playing') {
      const hand = room.hands[seat];
      const isDeclarer = currentGame.declarer === seat;
      const isDummy = currentGame.dummy === seat;
      const contract = currentGame.contract!;

      let card: Card;
      if (isDeclarer) {
        // Declarer also plays dummy's cards
        card = selectDeclarerCard(
          hand,
          room.hands[currentGame.dummy!] ?? [],
          currentGame.currentTrick,
          contract.strain,
          false,
        );
      } else if (isDummy) {
        // Dummy's cards are played by declarer — AI declarer plays them
        card = selectDeclarerCard(
          room.hands[currentGame.declarer!] ?? [],
          hand,
          currentGame.currentTrick,
          contract.strain,
          true,
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
        );
      }
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
  const seatInfo = game.seats[seat];
  if (seatInfo?.isAI) {
    scheduleAIAction(room, seat, onBid, onPlay);
  }
}
