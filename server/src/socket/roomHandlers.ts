import type { Server, Socket } from 'socket.io';
import type { Seat } from '@goatbridge/shared';
import type { TableVisibility } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';
import type { BidCall } from '@goatbridge/shared';
import type { Card } from '@goatbridge/shared';
import { sqlite } from '../db/index.js';
import { logger } from '../logger.js';
import {
  createRoom,
  getRoom,
  deleteRoom,
  findSeatByUserId,
  joinSeat,
  addBot,
  removeBot,
  isFull,
  canJoinTable,
  inviteUser,
  vacateSeat,
  reassignHost,
  isAbandoned,
} from '../rooms/roomManager.js';
import { emitToRoom, emitToUser, registerSocket, unregisterSocket, getSocketId, emitGameStarted } from './broadcaster.js';
import { startNewHand } from '../game/stateMachine.js';
import { scheduleAIActionIfNeeded } from '../ai/aiPlayer.js';
import type { GameRoom } from '../game/stateMachine.js';

// Track which room each socket is in
const socketRooms = new Map<string, string>(); // socketId -> roomCode
const socketUsers = new Map<string, string>(); // socketId -> userId
// Disconnect timers
const disconnectTimers = new Map<string, NodeJS.Timeout>(); // `${roomCode}:${seat}` -> timer

/**
 * If the departing user was the host, promote the longest-seated remaining
 * human and tell the table. Rooms with nobody human left are deleted.
 */
function hostDisplayName(room: GameRoom): string {
  const seat = findSeatByUserId(room, room.hostUserId);
  if (seat) return room.seats[seat].displayName;
  return room.spectators.find(s => s.userId === room.hostUserId)?.displayName ?? 'Host';
}

function handleHostDeparture(io: Server, room: GameRoom, departingUserId: string): void {
  if (room.hostUserId !== departingUserId) return;

  if (isAbandoned(room)) {
    deleteRoom(room.roomCode);
    logger.info('Room deleted: no humans left', { roomCode: room.roomCode });
    return;
  }

  const newHost = reassignHost(room);
  if (!newHost) return;

  logger.info('Host reassigned', { roomCode: room.roomCode, from: departingUserId, to: newHost.userId });
  emitToRoom(io, room.roomCode, 'host_changed', {
    hostUserId: newHost.userId,
    hostName: newHost.displayName,
  });
}

export function setupRoomHandlers(
  io: Server,
  socket: Socket & { data: { userId: string; username: string } },
  onBid: (room: GameRoom, seat: Seat, call: BidCall) => void,
  onPlay: (room: GameRoom, seat: Seat, card: Card) => void,
): void {
  const { userId, username } = socket.data;

  const userRecord = sqlite.get<{ active_card_back_skin: string }>('SELECT active_card_back_skin FROM users WHERE id = ?', [userId]);
  const skin = userRecord?.active_card_back_skin ?? 'classic';

  registerSocket(userId, socket.id);
  socketUsers.set(socket.id, userId);

  // Create room
  socket.on('create_room', (...args: unknown[]) => {
    // Clients may emit with a payload, an ack callback, both, or neither.
    const payload = args.find(a => typeof a === 'object' && a !== null) as
      | { visibility?: TableVisibility }
      | undefined;
    const callback = args.find(a => typeof a === 'function') as
      | ((result: { roomCode: string } | { error: string }) => void)
      | undefined;

    const visibility: TableVisibility = payload?.visibility === 'invite_only' ? 'invite_only' : 'public';
    const room = createRoom(userId, visibility);
    const result = joinSeat(room, userId, username, skin);
    if ('error' in result) {
      callback?.({ error: result.error });
      return;
    }
    socket.join(room.roomCode);
    socketRooms.set(socket.id, room.roomCode);

    logger.info('Room created', { roomCode: room.roomCode, userId, username, visibility });
    callback?.({ roomCode: room.roomCode });

    emitToRoom(io, room.roomCode, 'room_joined', {
      roomCode: room.roomCode,
      seats: room.seats,
      kibitzingAllowed: room.kibitzingAllowed,
      spectators: room.spectators,
      hostUserId: room.hostUserId,
      isSpectator: false,
      visibility: room.visibility,
    });
  });

  // Join room
  socket.on('join_room', (payload: { roomCode: string; spectate?: boolean }) => {
    const room = getRoom(payload.roomCode);
    if (!room) {
      socket.emit('room_error', { message: 'Room not found' });
      return;
    }

    if (payload.spectate) {
      if (!room.kibitzingAllowed) {
        socket.emit('room_error', { message: 'Kibitzing is disabled for this room' });
        return;
      }
      if (!room.spectators.find(s => s.userId === userId)) {
        room.spectators.push({ userId, displayName: username });
      }
      socket.join(payload.roomCode);
      socketRooms.set(socket.id, payload.roomCode);

      socket.emit('room_joined', {
        roomCode: room.roomCode,
        seats: room.seats,
        kibitzingAllowed: room.kibitzingAllowed,
        spectators: room.spectators,
        hostUserId: room.hostUserId,
        isSpectator: true,
        visibility: room.visibility,
      });

      if (room.game) {
        // Kibitzers see every hand, so send the current (already-played-down) hands.
        socket.emit('game_started', { gameState: room.game, yourHand: [], allHands: room.hands });
        if (room.game.dummyHand && room.game.dummy) {
          socket.emit('dummy_revealed', { dummy: room.game.dummy, dummyHand: room.game.dummyHand });
        }
      }

      emitToRoom(io, payload.roomCode, 'spectator_joined', {
        spectator: { userId, displayName: username },
      });
      return;
    }

    // Check if reconnecting
    const reconnectingSeat = findSeatByUserId(room, userId);
    if (reconnectingSeat && room.seats[reconnectingSeat].disconnected) {
      logger.info('Player reconnecting', { roomCode: payload.roomCode, userId, username, seat: reconnectingSeat });
      // Cancel the pending bot-replacement timer immediately
      const timerKey = `${payload.roomCode}:${reconnectingSeat}`;
      const existingTimer = disconnectTimers.get(timerKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
        disconnectTimers.delete(timerKey);
      }
      room.seats[reconnectingSeat].disconnected = false;
      room.seats[reconnectingSeat].disconnectedAt = null;

      // Non-host players need host approval to reclaim their seat
      if (room.hostUserId !== userId) {
        socket.join(payload.roomCode);
        socketRooms.set(socket.id, payload.roomCode);
        const hostSocketId = getSocketId(room.hostUserId);
        if (hostSocketId) {
          io.to(hostSocketId).emit('player_return_request', {
            seat: reconnectingSeat,
            displayName: username,
          });
        }
        return;
      }
      // Host falls through to joinSeat (disconnected already cleared above)
    }

    // Invite-only tables: only the host and invited/approved users may take a seat.
    // Players already seated (including reconnects) are unaffected.
    if (!findSeatByUserId(room, userId) && !canJoinTable(room, userId)) {
      socket.emit('room_error', { message: 'This table is invite-only. Ask the host for an invite.' });
      return;
    }

    const result = joinSeat(room, userId, username, skin);
    if ('error' in result) {
      logger.warn('join_room failed', { roomCode: payload.roomCode, userId, username, error: result.error });
      socket.emit('room_error', { message: result.error });
      return;
    }

    logger.info('Player joined room', { roomCode: payload.roomCode, userId, username, seat: result.seat });
    socket.join(payload.roomCode);
    socketRooms.set(socket.id, payload.roomCode);

    socket.emit('room_joined', {
      roomCode: room.roomCode,
      seats: room.seats,
      kibitzingAllowed: room.kibitzingAllowed,
      spectators: room.spectators,
      hostUserId: room.hostUserId,
      isSpectator: false,
      visibility: room.visibility,
    });

    // If game in progress, send hand
    if (room.game) {
      const hand = room.hands[result.seat] ?? [];
      socket.emit('game_started', { gameState: room.game, yourHand: hand });
      if (room.game.dummyHand && room.game.dummy) {
        socket.emit('dummy_revealed', { dummy: room.game.dummy, dummyHand: room.game.dummyHand });
      }
    }

    emitToRoom(io, payload.roomCode, 'room_updated', {
      seats: room.seats,
      status: room.game ? 'playing' : 'waiting',
      kibitzingAllowed: room.kibitzingAllowed,
      spectators: room.spectators,
    });
  });

  // Add bot
  socket.on('add_bot', (payload: { roomCode: string; seat: Seat }) => {
    const room = getRoom(payload.roomCode);
    if (!room || room.hostUserId !== userId) {
      socket.emit('room_error', { message: 'Not authorized' });
      return;
    }
    if (!addBot(room, payload.seat)) {
      socket.emit('room_error', { message: 'Cannot add bot to that seat' });
      return;
    }
    logger.info('Bot added', { roomCode: payload.roomCode, seat: payload.seat });
    emitToRoom(io, payload.roomCode, 'room_updated', {
      seats: room.seats,
      status: 'waiting',
      kibitzingAllowed: room.kibitzingAllowed,
      spectators: room.spectators,
    });
  });

  // Remove bot
  socket.on('remove_bot', (payload: { roomCode: string; seat: Seat }) => {
    const room = getRoom(payload.roomCode);
    if (!room || room.hostUserId !== userId) {
      socket.emit('room_error', { message: 'Not authorized' });
      return;
    }
    removeBot(room, payload.seat);
    emitToRoom(io, payload.roomCode, 'room_updated', {
      seats: room.seats,
      status: 'waiting',
      kibitzingAllowed: room.kibitzingAllowed,
      spectators: room.spectators,
    });
  });

  // Start game
  socket.on('start_game', (payload: { roomCode: string }) => {
    const room = getRoom(payload.roomCode);
    if (!room || room.hostUserId !== userId) {
      socket.emit('room_error', { message: 'Not authorized' });
      return;
    }
    if (!isFull(room)) {
      socket.emit('room_error', { message: 'Room is not full' });
      return;
    }
    if (room.game && room.game.phase !== 'scoring' && room.game.phase !== 'complete') {
      socket.emit('room_error', { message: 'Game already in progress' });
      return;
    }

    const { game, hands } = startNewHand(room);
    logger.info('Game started', { roomCode: payload.roomCode, dealer: game.dealer, handNumber: game.handNumber });

    // Each player gets only their own hand; spectators get all four.
    emitGameStarted(io, room, game, hands);
    emitToRoom(io, payload.roomCode, 'deal_complete', { dealer: game.dealer });

    // Schedule AI if first turn is AI
    scheduleAIActionIfNeeded(
      room,
      (seat, call) => onBid(room, seat, call),
      (seat, card) => onPlay(room, seat, card),
    );
  });

  // Set kibitzing
  socket.on('set_kibitzing', (payload: { roomCode: string; allowed: boolean }) => {
    const room = getRoom(payload.roomCode);
    if (!room || room.hostUserId !== userId) {
      socket.emit('room_error', { message: 'Not authorized' });
      return;
    }
    room.kibitzingAllowed = payload.allowed;
    if (!payload.allowed) {
      // Kick all spectators
      for (const spec of room.spectators) {
        emitToUser(io, spec.userId, 'kicked', undefined);
      }
      room.spectators = [];
    }
    emitToRoom(io, payload.roomCode, 'kibitzing_changed', { allowed: payload.allowed });
  });

  // Kick spectator
  socket.on('kick_spectator', (payload: { roomCode: string; userId: string }) => {
    const room = getRoom(payload.roomCode);
    if (!room || room.hostUserId !== userId) {
      socket.emit('room_error', { message: 'Not authorized' });
      return;
    }
    emitToUser(io, payload.userId, 'kicked', undefined);
    room.spectators = room.spectators.filter(s => s.userId !== payload.userId);
    emitToRoom(io, payload.roomCode, 'spectator_left', { userId: payload.userId });
  });

  // Host invites a player to the table
  socket.on('invite_to_table', (payload: { roomCode: string; userId: string }) => {
    const room = getRoom(payload.roomCode);
    if (!room || room.hostUserId !== userId) {
      socket.emit('room_error', { message: 'Only the host can invite players' });
      return;
    }
    inviteUser(room, payload.userId);
    emitToUser(io, payload.userId, 'table_invite_received', {
      invite: {
        roomCode: room.roomCode,
        fromUserId: userId,
        fromUsername: username,
        visibility: room.visibility,
        createdAt: Date.now(),
      },
    });
    logger.info('Table invite sent', { roomCode: room.roomCode, from: userId, to: payload.userId });
  });

  // A player asks the host to let them in
  socket.on('request_join_table', (payload: { roomCode: string }) => {
    const room = getRoom(payload.roomCode);
    if (!room) {
      socket.emit('room_error', { message: 'Table not found' });
      return;
    }
    if (canJoinTable(room, userId)) {
      // Already allowed — nothing to ask for.
      socket.emit('join_request_resolved', {
        roomCode: room.roomCode,
        approved: true,
        hostName: hostDisplayName(room),
      });
      return;
    }
    emitToUser(io, room.hostUserId, 'join_request_received', {
      request: { roomCode: room.roomCode, userId, username, createdAt: Date.now() },
    });
  });

  // Host approves or denies a join request
  socket.on('respond_join_request', (payload: { roomCode: string; userId: string; approve: boolean }) => {
    const room = getRoom(payload.roomCode);
    if (!room || room.hostUserId !== userId) {
      socket.emit('room_error', { message: 'Only the host can respond to join requests' });
      return;
    }
    if (payload.approve) inviteUser(room, payload.userId);
    emitToUser(io, payload.userId, 'join_request_resolved', {
      roomCode: room.roomCode,
      approved: payload.approve,
      hostName: username,
    });
  });

  // Host removes a seated player
  socket.on('kick_player', (payload: { roomCode: string; seat: Seat }) => {
    const room = getRoom(payload.roomCode);
    if (!room || room.hostUserId !== userId) {
      socket.emit('room_error', { message: 'Only the host can remove players' });
      return;
    }
    const seatInfo = room.seats[payload.seat];
    const targetUserId = seatInfo.userId;
    if (!targetUserId || seatInfo.isAI) return;
    if (targetUserId === room.hostUserId) return; // host can't kick themselves

    // Revoke the invite too, so they can't immediately walk back into an
    // invite-only table after being removed.
    room.invitedUserIds = room.invitedUserIds.filter(id => id !== targetUserId);
    vacateSeat(room, payload.seat);

    emitToUser(io, targetUserId, 'kicked', undefined);
    emitToRoom(io, payload.roomCode, 'room_updated', {
      seats: room.seats,
      status: room.game?.phase ?? 'waiting',
      kibitzingAllowed: room.kibitzingAllowed,
      spectators: room.spectators,
    });
    logger.info('Player kicked', { roomCode: room.roomCode, seat: payload.seat, by: userId });
  });

  // Host changes who may join
  socket.on('set_table_visibility', (payload: { roomCode: string; visibility: TableVisibility }) => {
    const room = getRoom(payload.roomCode);
    if (!room || room.hostUserId !== userId) {
      socket.emit('room_error', { message: 'Only the host can change table settings' });
      return;
    }
    if (payload.visibility !== 'public' && payload.visibility !== 'invite_only') return;
    room.visibility = payload.visibility;
    emitToRoom(io, payload.roomCode, 'table_visibility_changed', { visibility: room.visibility });
  });

  // Approve player return
  socket.on('approve_player_return', (payload: { roomCode: string; seat: Seat }) => {
    const room = getRoom(payload.roomCode);
    if (!room || room.hostUserId !== userId) return;

    const seatInfo = room.seats[payload.seat];
    if (!seatInfo.disconnected || !seatInfo.originalUserId) return;

    // Cancel disconnect timer
    const timerKey = `${payload.roomCode}:${payload.seat}`;
    const timer = disconnectTimers.get(timerKey);
    if (timer) {
      clearTimeout(timer);
      disconnectTimers.delete(timerKey);
    }

    // Restore player
    seatInfo.disconnected = false;
    seatInfo.disconnectedAt = null;
    seatInfo.isAI = false;
    seatInfo.isConnected = true;
    const originalUserId = seatInfo.originalUserId;
    seatInfo.userId = originalUserId;
    seatInfo.originalUserId = null;

    const hand = room.hands[payload.seat] ?? [];
    emitToUser(io, originalUserId, 'player_returned', { seat: payload.seat, yourHand: hand });
    emitToRoom(io, payload.roomCode, 'player_returned', { seat: payload.seat });
  });

  // Deny player return
  socket.on('deny_player_return', (payload: { roomCode: string; seat: Seat }) => {
    const room = getRoom(payload.roomCode);
    if (!room || room.hostUserId !== userId) return;

    const seatInfo = room.seats[payload.seat];
    const rejectedUserId = seatInfo.originalUserId ?? seatInfo.userId;
    if (rejectedUserId) {
      room.spectators.push({ userId: rejectedUserId, displayName: seatInfo.displayName });
      emitToRoom(io, payload.roomCode, 'spectator_joined', {
        spectator: { userId: rejectedUserId, displayName: seatInfo.displayName },
      });
    }
  });

  // Chat
  socket.on('chat_message', (payload: { roomCode: string; text: string }) => {
    const room = getRoom(payload.roomCode);
    if (!room) return;

    const seat = findSeatByUserId(room, userId);
    const text = payload.text.trim().slice(0, 500);
    if (!text) return;

    emitToRoom(io, payload.roomCode, 'chat_message', {
      seat,
      displayName: username,
      text,
      timestamp: Date.now(),
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    unregisterSocket(userId);
    socketUsers.delete(socket.id);
    const roomCode = socketRooms.get(socket.id);
    socketRooms.delete(socket.id);

    if (!roomCode) return;
    const room = getRoom(roomCode);
    if (!room) return;

    const seat = findSeatByUserId(room, userId);
    if (!seat) {
      // Was spectator
      room.spectators = room.spectators.filter(s => s.userId !== userId);
      emitToRoom(io, roomCode, 'spectator_left', { userId });
      handleHostDeparture(io, room, userId);
      return;
    }

    if (!room.game || room.game.phase === 'waiting') {
      // Not in game, just remove from seat
      vacateSeat(room, seat);
      handleHostDeparture(io, room, userId);
      emitToRoom(io, roomCode, 'room_updated', {
        seats: room.seats,
        status: 'waiting',
        kibitzingAllowed: room.kibitzingAllowed,
        spectators: room.spectators,
      });
      return;
    }

    // Mid-game disconnect
    logger.warn('Player disconnected mid-game', { roomCode, seat, userId });
    room.seats[seat].disconnected = true;
    room.seats[seat].disconnectedAt = Date.now();
    room.seats[seat].isConnected = false;

    let secondsRemaining = 60;
    emitToRoom(io, roomCode, 'player_disconnected', { seat, secondsRemaining });

    const timerKey = `${roomCode}:${seat}`;
    const timer = setTimeout(() => {
      disconnectTimers.delete(timerKey);
      const currentRoom = getRoom(roomCode);
      if (!currentRoom) return;
      const seatInfo = currentRoom.seats[seat];
      if (!seatInfo.disconnected) return; // player reconnected

      // Replace with bot
      logger.info('Bot replacing disconnected player', { roomCode, seat });
      seatInfo.originalUserId = seatInfo.userId;
      seatInfo.userId = `bot-${seat}-${Date.now()}`;
      seatInfo.isAI = true;
      seatInfo.displayName = `${seatInfo.displayName} (Bot)`;
      seatInfo.disconnected = false;
      seatInfo.joinedAt = null;

      emitToRoom(io, roomCode, 'bot_replacing_player', { seat });
      // The seat is a bot now, so the host effectively left the table.
      handleHostDeparture(io, currentRoom, userId);

      scheduleAIActionIfNeeded(
        currentRoom,
        (s, call) => onBid(currentRoom, s, call),
        (s, card) => onPlay(currentRoom, s, card),
      );
    }, 60000);

    disconnectTimers.set(timerKey, timer);
  });
}
