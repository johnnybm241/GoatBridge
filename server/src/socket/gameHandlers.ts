import type { Server, Socket } from 'socket.io';
import type { Seat } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';
import type { BidCall } from '@goatbridge/shared';
import type { Card } from '@goatbridge/shared';
import { getRoom, findSeatByUserId } from '../rooms/roomManager.js';
import { emitToRoom, emitToUser, getSocketId } from './broadcaster.js';
import { processBid, processCardPlay } from '../game/stateMachine.js';
import { scheduleAIActionIfNeeded } from '../ai/aiPlayer.js';
import { sqlite } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';

export function setupGameHandlers(
  io: Server,
  socket: Socket & { data: { userId: string; username: string } },
): void {
  const { userId } = socket.data;

  socket.on('make_bid', (payload: { roomCode: string; call: BidCall }) => {
    const room = getRoom(payload.roomCode);
    if (!room?.game) { socket.emit('invalid_bid', { message: 'No active game' }); return; }

    const seat = findSeatByUserId(room, userId);
    if (!seat) { socket.emit('invalid_bid', { message: 'Not in this room' }); return; }

    const result = processBid(room, seat, payload.call);
    if (result.type === 'invalid') {
      socket.emit('invalid_bid', { message: result.error });
      return;
    }

    emitToRoom(io, payload.roomCode, 'bid_made', {
      seat,
      call: payload.call,
      bidding: result.game.bidding,
      currentTurn: result.game.currentTurn!,
    });

    if (result.type === 'auction_complete') {
      emitToRoom(io, payload.roomCode, 'auction_complete', {
        contract: result.game.contract,
        declarer: result.game.declarer,
        dummy: result.game.dummy,
        passedOut: result.passedOut,
      });

      if (result.passedOut) {
        // Start new hand
        return;
      }
    }

    scheduleAIActionIfNeeded(
      room,
      (seat, call) => handleAIBid(io, room.roomCode, seat, call),
      (seat, card) => handleAIPlay(io, room.roomCode, seat, card),
    );
  });

  socket.on('play_card', (payload: { roomCode: string; card: Card }) => {
    const room = getRoom(payload.roomCode);
    if (!room?.game) { socket.emit('invalid_card', { message: 'No active game' }); return; }

    const seat = findSeatByUserId(room, userId);
    if (!seat) { socket.emit('invalid_card', { message: 'Not in this room' }); return; }

    const result = processCardPlay(room, seat, payload.card);
    if (result.type === 'invalid') {
      socket.emit('invalid_card', { message: result.error });
      return;
    }

    if (result.type === 'dummy_revealed') {
      emitToRoom(io, payload.roomCode, 'card_played', {
        seat,  // the opening lead player, not dummy
        card: payload.card,
        currentTrick: result.game.currentTrick!,
        currentTurn: result.game.currentTurn,
      });
      emitToRoom(io, payload.roomCode, 'dummy_revealed', {
        dummy: room.game!.dummy!,
        dummyHand: result.dummyHand,
      });
    } else if (result.type === 'card_played') {
      emitToRoom(io, payload.roomCode, 'card_played', {
        seat,
        card: payload.card,
        currentTrick: result.game.currentTrick!,
        currentTurn: result.game.currentTurn,
      });
    } else if (result.type === 'trick_complete') {
      emitToRoom(io, payload.roomCode, 'card_played', {
        seat,
        card: payload.card,
        currentTrick: result.trick,
        currentTurn: result.game.currentTurn,
      });
      emitToRoom(io, payload.roomCode, 'trick_complete', {
        trick: result.trick,
        winner: result.winner,
        trickCounts: result.game.trickCounts,
        nextLead: result.winner,
      });
    } else if (result.type === 'hand_complete') {
      emitToRoom(io, payload.roomCode, 'card_played', {
        seat,
        card: payload.card,
        currentTrick: result.game.completedTricks[result.game.completedTricks.length - 1]!,
        currentTurn: null,
      });

      const declarerSide: 'ns' | 'ew' =
        (result.contract.declarer === 'north' || result.contract.declarer === 'south') ? 'ns' : 'ew';

      emitToRoom(io, payload.roomCode, 'hand_complete', {
        handScore: {
          nsTricks: result.game.trickCounts.ns,
          ewTricks: result.game.trickCounts.ew,
          contractMade: result.tricksMade >= result.contract.level + 6,
          tricksOverUnder: result.tricksMade - (result.contract.level + 6),
          nsScoreBelow: declarerSide === 'ns' && result.tricksMade >= result.contract.level + 6
            ? result.game.scores.nsBelowPartial : 0,
          nsScoreAbove: 0,
          ewScoreBelow: declarerSide === 'ew' && result.tricksMade >= result.contract.level + 6
            ? result.game.scores.ewBelowPartial : 0,
          ewScoreAbove: 0,
          vulnerability: result.game.vulnerability,
        },
        tricksMade: result.tricksMade,
        contract: result.contract,
        declarer: result.contract.declarer,
      });

      emitToRoom(io, payload.roomCode, 'score_update', {
        scores: result.game.scores,
        vulnerability: result.game.vulnerability,
      });

      // Persist hand to DB
      persistHand(room.roomCode, result.game, result.contract, result.tricksMade);

      if (result.game.scores.isComplete) {
        emitToRoom(io, payload.roomCode, 'rubber_complete', {
          scores: result.game.scores,
          winner: result.game.scores.winner!,
        });
      }
      return;
    }

    scheduleAIActionIfNeeded(
      room,
      (seat, call) => handleAIBid(io, room.roomCode, seat, call),
      (seat, card) => handleAIPlay(io, room.roomCode, seat, card),
    );
  });

  // Undo
  socket.on('request_undo', (payload: { roomCode: string }) => {
    const room = getRoom(payload.roomCode);
    if (!room?.game) return;
    const seat = findSeatByUserId(room, userId);
    if (!seat || room.game.pendingUndoFrom) return;

    room.game.pendingUndoFrom = seat;
    room.game.undoApprovals = { north: null, east: null, south: null, west: null };
    // AI players auto-approve
    for (const s of SEATS) {
      if (room.game.seats[s].isAI) {
        room.game.undoApprovals[s] = true;
      }
    }
    emitToRoom(io, payload.roomCode, 'undo_requested', { fromSeat: seat });
    checkUndoComplete(io, payload.roomCode, room);
  });

  socket.on('respond_undo', (payload: { roomCode: string; approve: boolean }) => {
    const room = getRoom(payload.roomCode);
    if (!room?.game?.pendingUndoFrom) return;
    const seat = findSeatByUserId(room, userId);
    if (!seat) return;

    room.game.undoApprovals[seat] = payload.approve;
    checkUndoComplete(io, payload.roomCode, room);
  });
}

function checkUndoComplete(io: Server, roomCode: string, room: ReturnType<typeof getRoom>): void {
  if (!room?.game?.pendingUndoFrom) return;
  const approvals = room.game.undoApprovals;
  const humanSeats = SEATS.filter(s => !room.game!.seats[s].isAI && room.game!.seats[s].userId);
  const allResponded = humanSeats.every(s => approvals[s] !== null);
  if (!allResponded) return;

  const approved = humanSeats.every(s => approvals[s] === true);
  room.game.pendingUndoFrom = null;

  if (approved && room.previousState) {
    room.game = room.previousState.game;
    room.hands = room.previousState.hands;
    room.previousState = null;
    emitToRoom(io, roomCode, 'undo_result', { approved: true, gameState: room.game });
    // Re-send hands
    for (const seat of SEATS) {
      const seatInfo = room.game.seats[seat];
      if (!seatInfo.isAI && seatInfo.userId) {
        const socketId = getSocketId(seatInfo.userId);
        if (socketId) {
          io.to(socketId).emit('game_started', { gameState: room.game, yourHand: room.hands[seat] });
        }
      }
    }
  } else {
    emitToRoom(io, roomCode, 'undo_result', { approved: false });
  }
}

export function handleAIBid(io: Server, roomCode: string, seat: Seat, call: BidCall): void {
  const room = getRoom(roomCode);
  if (!room?.game) return;

  const result = processBid(room, seat, call);
  if (result.type === 'invalid') return;

  emitToRoom(io, roomCode, 'bid_made', {
    seat,
    call,
    bidding: result.game.bidding,
    currentTurn: result.game.currentTurn!,
  });

  if (result.type === 'auction_complete') {
    emitToRoom(io, roomCode, 'auction_complete', {
      contract: result.game.contract,
      declarer: result.game.declarer,
      dummy: result.game.dummy,
      passedOut: result.passedOut,
    });
  }

  scheduleAIActionIfNeeded(
    room,
    (s, c) => handleAIBid(io, roomCode, s, c),
    (s, card) => handleAIPlay(io, roomCode, s, card),
  );
}

export function handleAIPlay(io: Server, roomCode: string, seat: Seat, card: Card): void {
  const room = getRoom(roomCode);
  if (!room?.game) return;

  const result = processCardPlay(room, seat, card);
  if (result.type === 'invalid') return;

  if (result.type === 'dummy_revealed') {
    emitToRoom(io, roomCode, 'card_played', {
      seat,
      card,
      currentTrick: result.game.currentTrick!,
      currentTurn: result.game.currentTurn,
    });
    emitToRoom(io, roomCode, 'dummy_revealed', {
      dummy: room.game!.dummy!,
      dummyHand: result.dummyHand,
    });
  } else if (result.type === 'card_played') {
    emitToRoom(io, roomCode, 'card_played', { seat, card, currentTrick: result.game.currentTrick!, currentTurn: result.game.currentTurn });
  } else if (result.type === 'trick_complete') {
    emitToRoom(io, roomCode, 'card_played', { seat, card, currentTrick: result.trick, currentTurn: result.game.currentTurn });
    emitToRoom(io, roomCode, 'trick_complete', {
      trick: result.trick,
      winner: result.winner,
      trickCounts: result.game.trickCounts,
      nextLead: result.winner,
    });
  } else if (result.type === 'hand_complete') {
    emitToRoom(io, roomCode, 'card_played', {
      seat,
      card,
      currentTrick: result.game.completedTricks[result.game.completedTricks.length - 1]!,
      currentTurn: null,
    });
    emitToRoom(io, roomCode, 'hand_complete', {
      handScore: {
        nsTricks: result.game.trickCounts.ns,
        ewTricks: result.game.trickCounts.ew,
        contractMade: result.tricksMade >= result.contract.level + 6,
        tricksOverUnder: result.tricksMade - (result.contract.level + 6),
        nsScoreBelow: 0,
        nsScoreAbove: 0,
        ewScoreBelow: 0,
        ewScoreAbove: 0,
        vulnerability: result.game.vulnerability,
      },
      tricksMade: result.tricksMade,
      contract: result.contract,
      declarer: result.contract.declarer,
    });
    emitToRoom(io, roomCode, 'score_update', {
      scores: result.game.scores,
      vulnerability: result.game.vulnerability,
    });
    persistHand(room.roomCode, result.game, result.contract, result.tricksMade);
    if (result.game.scores.isComplete) {
      emitToRoom(io, roomCode, 'rubber_complete', {
        scores: result.game.scores,
        winner: result.game.scores.winner!,
      });
      return;
    }
  }

  scheduleAIActionIfNeeded(
    room,
    (s, c) => handleAIBid(io, roomCode, s, c),
    (s, card_) => handleAIPlay(io, roomCode, s, card_),
  );
}

function persistHand(
  roomCode: string,
  game: NonNullable<ReturnType<typeof getRoom>['game']>,
  contract: NonNullable<NonNullable<ReturnType<typeof getRoom>['game']>['contract']>,
  tricksMade: number,
): void {
  try {
    const roomRecord = sqlite.get<{ id: string }>('SELECT id FROM rooms WHERE room_code = ?', [roomCode]);
    if (!roomRecord) return;
    sqlite.run(
      `INSERT INTO game_hands (id, room_id, hand_number, dealer, vulnerability, contract_json, declarer_seat, tricks_made, score_ns, score_ew, played_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(), roomRecord.id, game.handNumber, game.dealer, game.vulnerability,
        JSON.stringify(contract), contract.declarer, tricksMade,
        game.scores.nsBelowTotal + game.scores.nsAboveTotal,
        game.scores.ewBelowTotal + game.scores.ewAboveTotal,
        Date.now(),
      ],
    );
  } catch {
    // Non-fatal
  }
}
