import type { Server, Socket } from 'socket.io';
import { SEATS } from '@goatbridge/shared';
import {
  createTeamMatch,
  getTeamMatch,
  joinTeamMatchLobby,
  leaveTeamMatchLobby,
  preGenerateBoards,
  registerMatchRooms,
} from '../teamMatches/teamMatchManager.js';
import type { TeamMatch } from '../teamMatches/teamMatchManager.js';
import { createRoom, joinSeat, addBot } from '../rooms/roomManager.js';
import { getSocketId } from './broadcaster.js';
import { logger } from '../logger.js';

function toClientMatch(m: TeamMatch) {
  const { preDealtBoards, ...rest } = m;
  return rest;
}

export function setupTeamMatchHandlers(
  io: Server,
  socket: Socket & { data: { userId: string; username: string } },
  startRoomBoard: (roomCode: string, boardIndex: number) => void,
): void {
  const { userId, username } = socket.data;

  socket.on('create_team_match', (payload: { name: string; boardCount: 4 | 8 | 12 | 16 }) => {
    if (!payload.name?.trim()) {
      socket.emit('room_error', { message: 'Match name is required' });
      return;
    }
    if (![4, 8, 12, 16].includes(payload.boardCount)) {
      socket.emit('room_error', { message: 'boardCount must be 4, 8, 12, or 16' });
      return;
    }
    const match = createTeamMatch(userId, payload.name.trim(), payload.boardCount);
    socket.join(`team_match:${match.matchCode}`);
    logger.info('Team match created', { matchCode: match.matchCode, userId, name: match.name });
    socket.emit('team_match_state', { match: toClientMatch(match) });
  });

  socket.on('join_team_match', (payload: { matchCode: string }) => {
    const match = getTeamMatch(payload.matchCode);
    if (!match) {
      socket.emit('room_error', { message: 'Team match not found' });
      return;
    }
    socket.join(`team_match:${match.matchCode}`);
    socket.emit('team_match_state', { match: toClientMatch(match) });
  });

  socket.on('join_team', (payload: { matchCode: string; team: 1 | 2 }) => {
    const match = getTeamMatch(payload.matchCode);
    if (!match) {
      socket.emit('room_error', { message: 'Team match not found' });
      return;
    }
    if (match.status !== 'lobby') {
      socket.emit('room_error', { message: 'Match has already started' });
      return;
    }
    const result = joinTeamMatchLobby(match, userId, username, payload.team);
    if (result.error) {
      socket.emit('room_error', { message: result.error });
      return;
    }
    logger.info('Player joined team match team', { matchCode: match.matchCode, userId, team: payload.team });
    io.to(`team_match:${match.matchCode}`).emit('team_match_updated', { match: toClientMatch(match) });
  });

  socket.on('leave_team_match', (payload: { matchCode: string }) => {
    const match = getTeamMatch(payload.matchCode);
    if (!match) return;
    leaveTeamMatchLobby(match, userId);
    socket.leave(`team_match:${match.matchCode}`);
    io.to(`team_match:${match.matchCode}`).emit('team_match_updated', { match: toClientMatch(match) });
  });

  socket.on('start_team_match', (payload: { matchCode: string }) => {
    const match = getTeamMatch(payload.matchCode);
    if (!match) {
      socket.emit('room_error', { message: 'Team match not found' });
      return;
    }
    if (match.hostUserId !== userId) {
      socket.emit('room_error', { message: 'Only the host can start the match' });
      return;
    }
    if (match.status !== 'lobby') {
      socket.emit('room_error', { message: 'Match has already started' });
      return;
    }
    if (match.team1Players.length === 0 || match.team2Players.length === 0) {
      socket.emit('room_error', { message: 'Both teams need at least 1 player' });
      return;
    }

    // Pre-generate all boards
    preGenerateBoards(match);

    // Create two rooms
    const room1 = createRoom(userId);
    const room2 = createRoom(userId);

    // Set team match metadata on rooms
    room1.teamMatchCode = match.matchCode;
    room1.matchBoardCount = match.boardCount;
    room2.teamMatchCode = match.matchCode;
    room2.matchBoardCount = match.boardCount;

    registerMatchRooms(match, room1.roomCode, room2.roomCode);
    match.status = 'in_progress';

    // Seat assignment (each player goes to exactly ONE room, bots fill the rest):
    // Table 1: Team1[0]=N, Team1[1]=S, Team2[0]=E, Team2[1]=W
    // Table 2: Team2[2]=N, Team2[3]=S, Team1[2]=E, Team1[3]=W
    // If a player slot doesn't exist (team has fewer players), a bot fills that seat.

    // Track which room each human player is assigned to
    const playerRoomMap = new Map<string, string>();

    type Seat = typeof SEATS[number];

    const seatOrBot = (
      room: ReturnType<typeof createRoom>,
      seat: Seat,
      team: typeof match.team1Players,
      idx: number,
    ) => {
      const player = team[idx];
      if (player) {
        joinSeat(room, player.userId, player.displayName, 'classic', seat);
        playerRoomMap.set(player.userId, room.roomCode);
      } else {
        addBot(room, seat);
      }
    };

    // Table 1 seating
    seatOrBot(room1, 'north', match.team1Players, 0);
    seatOrBot(room1, 'south', match.team1Players, 1);
    seatOrBot(room1, 'east',  match.team2Players, 0);
    seatOrBot(room1, 'west',  match.team2Players, 1);

    // Table 2 seating
    seatOrBot(room2, 'north', match.team2Players, 2);
    seatOrBot(room2, 'south', match.team2Players, 3);
    seatOrBot(room2, 'east',  match.team1Players, 2);
    seatOrBot(room2, 'west',  match.team1Players, 3);

    // Fill any remaining empty seats with bots
    for (const seat of SEATS) {
      if (!room1.seats[seat].userId && !room1.seats[seat].isAI) {
        addBot(room1, seat);
      }
      if (!room2.seats[seat].userId && !room2.seats[seat].isAI) {
        addBot(room2, seat);
      }
    }

    logger.info('Team match started', {
      matchCode: match.matchCode,
      table1: room1.roomCode,
      table2: room2.roomCode,
    });

    // Broadcast updated match state to lobby
    io.to(`team_match:${match.matchCode}`).emit('team_match_updated', { match: toClientMatch(match) });

    // Start board 1 at both tables
    startRoomBoard(room1.roomCode, 0);
    startRoomBoard(room2.roomCode, 0);

    // Emit personalized team_match_started to each player
    const allPlayers = [...match.team1Players, ...match.team2Players];
    for (const player of allPlayers) {
      const socketId = getSocketId(player.userId);
      if (!socketId) continue;

      // Look up the room this player was explicitly assigned to
      const yourRoomCode = playerRoomMap.get(player.userId) ?? room1.roomCode;

      io.to(socketId).emit('team_match_started', {
        matchCode: match.matchCode,
        yourRoomCode,
        table1RoomCode: room1.roomCode,
        table2RoomCode: room2.roomCode,
      });
    }

  });
}
