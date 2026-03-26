import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { config } from '../config.js';
import { verifyToken } from '../auth/service.js';
import { setupRoomHandlers } from './roomHandlers.js';
import { setupGameHandlers, handleAIBid, handleAIPlay } from './gameHandlers.js';
import { setupTeamMatchHandlers } from './teamMatchHandlers.js';
import { setupTournamentHandlers } from './tournamentHandlers.js';
import type { Seat } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';
import type { BidCall } from '@goatbridge/shared';
import type { Card } from '@goatbridge/shared';
import type { SwissRound } from '@goatbridge/shared';
import type { GameRoom } from '../game/stateMachine.js';
import { getRoom } from '../rooms/roomManager.js';
import { createRoom, joinSeat, addBot } from '../rooms/roomManager.js';
import { getTeamMatchByRoom, createTeamMatch, preGenerateBoards, registerMatchRooms } from '../teamMatches/teamMatchManager.js';
import { getSocketId } from './broadcaster.js';
import { startNewHand } from '../game/stateMachine.js';
import { scheduleAIActionIfNeeded } from '../ai/aiPlayer.js';
import type { Tournament } from '../tournaments/tournamentManager.js';
import { registerStartRoundFn, linkTableToTournament, toClientTournament } from '../tournaments/tournamentManager.js';
import { startScheduler } from '../tournaments/tournamentScheduler.js';

// In development allow any localhost port (Vite may pick 5174, 5175, etc.)
// In production restrict to the explicit CLIENT_ORIGIN
const corsOrigin = config.nodeEnv === 'production'
  ? config.clientOrigin
  : /^http:\/\/localhost(:\d+)?$/;

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error('Authentication required'));
      return;
    }
    try {
      const payload = verifyToken(token);
      socket.data.userId = payload.userId;
      socket.data.username = payload.username;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // startTournamentMatch: creates a single pairs table room for one Swiss round table
  const startTournamentMatch = (tournament: Tournament, round: SwissRound, tableIndex: number) => {
    const table = round.tables[tableIndex];
    if (!table) return;

    const pair1 = tournament.pairs.find(p => p.pairId === table.pair1Id);
    const pair2 = tournament.pairs.find(p => p.pairId === table.pair2Id);
    if (!pair1 || !pair2) return;

    // Create ONE room for this pairs table
    const room = createRoom(tournament.organizerUserId);

    // Set pairs tournament metadata on the room
    room.pairsTournamentCode = tournament.tournamentCode;
    room.pairsRoundNumber = round.roundNumber;
    room.pairsTableIndex = tableIndex;
    room.pairsBoardCount = round.boardEnd - round.boardStart + 1;
    room.pairsNsPairId = pair1.pairId;
    room.pairsEwPairId = pair2.pairId;
    room.pairsBoardStart = round.boardStart; // 1-indexed

    // Pre-dealt boards for this round (slice from tournament's pre-dealt boards)
    room.pairsPreDealtBoards = tournament.preDealtBoards.slice(round.boardStart - 1, round.boardEnd);

    // Seat assignment: pair1 = NS, pair2 = EW
    const seatOrBot = (seat: Seat, player: { userId: string; displayName: string } | null) => {
      if (player) {
        joinSeat(room, player.userId, player.displayName, 'classic', seat);
      } else {
        addBot(room, seat);
      }
    };

    seatOrBot('north', pair1.player1);
    seatOrBot('south', pair1.player2);
    seatOrBot('east', pair2.player1);
    seatOrBot('west', pair2.player2);

    // Fill any remaining empty seats with bots
    for (const seat of SEATS) {
      if (!room.seats[seat].userId && !room.seats[seat].isAI) addBot(room, seat);
    }

    // Link room to tournament table
    linkTableToTournament(room.roomCode, tournament.tournamentCode, round.roundNumber, tableIndex);
    table.roomCode = room.roomCode;

    // Start board 0 (= boardStart in tournament)
    startPairsRoomBoard(room.roomCode, 0);

    // Emit pairs_table_started to each human player
    const allPlayers = [pair1.player1, pair1.player2, pair2.player1, pair2.player2].filter(Boolean) as Array<{ userId: string; displayName: string }>;
    for (const player of allPlayers) {
      const socketId = getSocketId(player.userId);
      if (socketId) {
        io.to(socketId).emit('pairs_table_started', {
          tournamentCode: tournament.tournamentCode,
          yourRoomCode: room.roomCode,
          roundNumber: round.roundNumber,
          boardStart: round.boardStart,
          boardEnd: round.boardEnd,
        });
      }
    }
  };

  // startPairsRoomBoard: kick off a board in a pairs tournament room
  const startPairsRoomBoard = (roomCode: string, boardIndex: number) => {
    const room = getRoom(roomCode);
    if (!room) return;
    const preDealtBoards = room.pairsPreDealtBoards;
    if (!preDealtBoards) return;
    const preDealt = preDealtBoards[boardIndex];
    if (!preDealt) return;
    const { game, hands } = startNewHand(room, preDealt);
    for (const seat of SEATS) {
      const info = game.seats[seat];
      if (!info.isAI && info.userId) {
        const socketId = getSocketId(info.userId);
        if (socketId) io.to(socketId).emit('game_started', { gameState: game, yourHand: hands[seat] });
      }
    }
    io.to(roomCode).emit('game_started', { gameState: game, yourHand: [] }); // for spectators
    scheduleAIActionIfNeeded(room,
      (s, call) => handleAIBid(io, roomCode, s, call),
      (s, card) => handleAIPlay(io, roomCode, s, card),
    );
  };

  // Register the startRoundFn so tournamentManager can call it when a round completes
  const startTournamentRound = (tournament: Tournament, roundNumber: number) => {
    const round = tournament.rounds.find(r => r.roundNumber === roundNumber);
    if (!round) return;
    for (let i = 0; i < round.tables.length; i++) {
      startTournamentMatch(tournament, round, i);
    }
    io.to(`tournament:${tournament.tournamentCode}`).emit('tournament_updated', { tournament: toClientTournament(tournament) });
    if (tournament.status === 'complete') {
      io.to(`tournament:${tournament.tournamentCode}`).emit('tournament_complete', { tournamentCode: tournament.tournamentCode });
    }
  };
  registerStartRoundFn(startTournamentRound);

  // Background scheduler: auto-starts tournaments when their scheduledStartAt time arrives
  startScheduler(io, startTournamentMatch);

  io.on('connection', (socket) => {
    const typedSocket = socket as typeof socket & { data: { userId: string; username: string } };

    // AI action callbacks wired to gameHandlers
    const aiBid = (_room: GameRoom, seat: Seat, call: BidCall) =>
      handleAIBid(io, _room.roomCode, seat, call);
    const aiPlay = (_room: GameRoom, seat: Seat, card: Card) =>
      handleAIPlay(io, _room.roomCode, seat, card);

    // startRoomBoard: used by teamMatchHandlers to kick off a board in a team match room
    const startRoomBoard = (roomCode: string, boardIndex: number) => {
      const room = getRoom(roomCode);
      if (!room) return;
      const match = getTeamMatchByRoom(roomCode);
      if (!match) return;
      const preDealt = match.preDealtBoards[boardIndex];
      if (!preDealt) return;
      const { game, hands } = startNewHand(room, preDealt);
      for (const seat of SEATS) {
        const info = game.seats[seat];
        if (!info.isAI && info.userId) {
          const socketId = getSocketId(info.userId);
          if (socketId) io.to(socketId).emit('game_started', { gameState: game, yourHand: hands[seat] });
        }
      }
      // Spectators get the game state without hands
      io.to(roomCode).emit('game_started', { gameState: game, yourHand: [] });
      scheduleAIActionIfNeeded(room,
        (s, call) => handleAIBid(io, roomCode, s, call),
        (s, card) => handleAIPlay(io, roomCode, s, card),
      );
    };

    setupRoomHandlers(io, typedSocket, aiBid, aiPlay);
    setupGameHandlers(io, typedSocket);
    setupTeamMatchHandlers(io, typedSocket, startRoomBoard);
    setupTournamentHandlers(io, typedSocket, startTournamentMatch);
  });

  return io;
}
