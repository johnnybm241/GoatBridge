import type { Server, Socket } from 'socket.io';
import type { Seat } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';
import type { BidCall } from '@goatbridge/shared';
import type { Card } from '@goatbridge/shared';
import { getRoom, findSeatByUserId } from '../rooms/roomManager.js';
import { emitToRoom, getSocketId } from './broadcaster.js';
import { processBid, processCardPlay, startNewHand, validateClaimAllTricks, settleClaim } from '../game/stateMachine.js';
import type { GameRoom } from '../game/stateMachine.js';
import { scheduleAIActionIfNeeded } from '../ai/aiPlayer.js';
import { sqlite } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger.js';
import { getTeamMatchByRoom, recordBoardResult } from '../teamMatches/teamMatchManager.js';
import type { HandScore, Contract } from '@goatbridge/shared';
import { scoreHand } from '../game/scoring.js';
import {
  getTournamentByRoom,
  getTournament,
  toClientTournament,
  recordBoardResult as recordPairsBoardResult,
  recalcMatchpoints,
  markTableComplete,
  callStartRoundFn,
} from '../tournaments/tournamentManager.js';

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
      logger.warn('Invalid bid', { roomCode: payload.roomCode, seat, call: payload.call, error: result.error });
      socket.emit('invalid_bid', { message: result.error });
      return;
    }

    logger.info('Bid made', { roomCode: payload.roomCode, seat, call: payload.call, type: result.type });

    emitToRoom(io, payload.roomCode, 'bid_made', {
      seat,
      call: payload.call,
      bidding: result.game.bidding,
      currentTurn: result.game.currentTurn!,
    });

    if (result.type === 'auction_complete') {
      if (result.passedOut) {
        logger.info('Auction passed out — dealing next hand', { roomCode: payload.roomCode });
      } else {
        logger.info('Auction complete', { roomCode: payload.roomCode, contract: result.game.contract, declarer: result.game.declarer });
      }
      emitToRoom(io, payload.roomCode, 'auction_complete', {
        contract: result.game.contract,
        declarer: result.game.declarer,
        dummy: result.game.dummy,
        passedOut: result.passedOut,
      });

      if (result.passedOut) {
        dealNextHand(io, room.roomCode);
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
      logger.warn('Invalid card play', { roomCode: payload.roomCode, seat, card: payload.card, error: result.error });
      socket.emit('invalid_card', { message: result.error });
      return;
    }

    logger.debug('Card played', { roomCode: payload.roomCode, seat, card: payload.card, result: result.type });

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
      logger.debug('Trick complete', { roomCode: payload.roomCode, winner: result.winner, trickCounts: result.game.trickCounts });
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
      logger.info('Hand complete', { roomCode: payload.roomCode, contract: result.contract, tricksMade: result.tricksMade });
      emitToRoom(io, payload.roomCode, 'card_played', {
        seat,
        card: payload.card,
        currentTrick: result.game.completedTricks[result.game.completedTricks.length - 1]!,
        currentTurn: null,
      });

      const declarerSide: 'ns' | 'ew' =
        (result.contract.declarer === 'north' || result.contract.declarer === 'south') ? 'ns' : 'ew';

      const handScore: HandScore = {
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
      };

      emitToRoom(io, payload.roomCode, 'hand_complete', {
        handScore,
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
      recordHandPlayed(room);
      handleTeamMatchBoardResult(io, room, handScore, result.game.handNumber, result.contract, result.tricksMade);
      handlePairsBoardResult(io, room, result.game.handNumber, result.contract, result.tricksMade);

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
    // Requester and AI players auto-approve
    room.game.undoApprovals[seat] = true;
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

  socket.on('request_claim', (payload: { roomCode: string }) => {
    const room = getRoom(payload.roomCode);
    if (!room?.game) return;
    const seat = findSeatByUserId(room, userId);
    if (!seat) return;

    const game = room.game;
    // Only allow during playing phase, only declarer side, no bots claiming
    if (game.phase !== 'playing') return;
    if (room.seats[seat].isAI) return;
    if (seat !== game.declarer && seat !== game.dummy) return;
    if (game.pendingClaim) return; // already pending

    // Server-side validation — reject false claims immediately
    if (!validateClaimAllTricks(room)) {
      logger.info('Claim rejected (invalid)', { roomCode: payload.roomCode, seat });
      socket.emit('claim_result', { accepted: false });
      return;
    }

    // Determine if any human opponents exist
    const declarer = game.declarer!;
    const dummy = game.dummy!;
    const oppSeats = SEATS.filter(s => s !== declarer && s !== dummy);
    const humanOpps = oppSeats.filter(s => !game.seats[s].isAI && game.seats[s].userId);

    if (humanOpps.length === 0) {
      // All opponents are bots — settle immediately
      logger.info('Claim auto-settled (bot opponents)', { roomCode: payload.roomCode, seat });
      finishClaim(io, payload.roomCode, room);
      return;
    }

    // Ask human opponents
    game.pendingClaim = {
      fromSeat: seat,
      approvals: { north: null, east: null, south: null, west: null },
    };
    // Bots auto-accept (claim was already validated as correct)
    for (const s of oppSeats) {
      if (game.seats[s].isAI) game.pendingClaim.approvals[s] = true;
    }
    logger.info('Claim requested', { roomCode: payload.roomCode, fromSeat: seat });
    emitToRoom(io, payload.roomCode, 'claim_requested', { fromSeat: seat });
  });

  socket.on('respond_claim', (payload: { roomCode: string; accept: boolean }) => {
    const room = getRoom(payload.roomCode);
    if (!room?.game?.pendingClaim) return;
    const seat = findSeatByUserId(room, userId);
    if (!seat) return;

    // Only opponents respond
    const { declarer, dummy } = room.game;
    if (seat === declarer || seat === dummy) return;

    room.game.pendingClaim.approvals[seat] = payload.accept;

    if (!payload.accept) {
      // Any rejection kills the claim
      room.game.pendingClaim = null;
      logger.info('Claim rejected by opponent', { roomCode: payload.roomCode, seat });
      emitToRoom(io, payload.roomCode, 'claim_result', { accepted: false });
      return;
    }

    checkClaimComplete(io, payload.roomCode, room);
  });
}

function checkClaimComplete(io: Server, roomCode: string, room: NonNullable<ReturnType<typeof getRoom>>): void {
  if (!room.game?.pendingClaim) return;
  const { declarer, dummy } = room.game;
  const oppSeats = SEATS.filter(s => s !== declarer && s !== dummy);
  const allApproved = oppSeats.every(s => room.game!.pendingClaim!.approvals[s] === true);
  if (!allApproved) return;
  finishClaim(io, roomCode, room);
}

function finishClaim(io: Server, roomCode: string, room: NonNullable<ReturnType<typeof getRoom>>): void {
  const result = settleClaim(room);
  logger.info('Claim settled', { roomCode, contract: result.contract, tricksMade: result.tricksMade });

  emitToRoom(io, roomCode, 'claim_result', { accepted: true, gameState: result.game });

  const handScore: HandScore = {
    nsTricks: result.game.trickCounts.ns,
    ewTricks: result.game.trickCounts.ew,
    contractMade: result.tricksMade >= result.contract.level + 6,
    tricksOverUnder: result.tricksMade - (result.contract.level + 6),
    nsScoreBelow: 0,
    nsScoreAbove: 0,
    ewScoreBelow: 0,
    ewScoreAbove: 0,
    vulnerability: result.game.vulnerability,
  };

  emitToRoom(io, roomCode, 'hand_complete', {
    handScore,
    tricksMade: result.tricksMade,
    contract: result.contract,
    declarer: result.contract.declarer,
  });
  emitToRoom(io, roomCode, 'score_update', {
    scores: result.game.scores,
    vulnerability: result.game.vulnerability,
  });
  persistHand(roomCode, result.game, result.contract, result.tricksMade);
  recordHandPlayed(room);
  handleTeamMatchBoardResult(io, room, handScore, result.game.handNumber, result.contract, result.tricksMade);
  handlePairsBoardResult(io, room, result.game.handNumber, result.contract, result.tricksMade);
  if (result.game.scores.isComplete) {
    emitToRoom(io, roomCode, 'rubber_complete', {
      scores: result.game.scores,
      winner: result.game.scores.winner!,
    });
  }
}

function checkUndoComplete(io: Server, roomCode: string, room: ReturnType<typeof getRoom>): void {
  if (!room?.game?.pendingUndoFrom) return;
  const approvals = room.game.undoApprovals;
  const humanSeats = SEATS.filter(s => !room.game!.seats[s].isAI && room.game!.seats[s].userId);
  const allResponded = humanSeats.every(s => approvals[s] !== null);
  if (!allResponded) return;

  const approved = humanSeats.every(s => approvals[s] === true);
  room.game.pendingUndoFrom = null;

  const snapshot = room.undoStack.pop();
  if (approved && snapshot) {
    room.game = snapshot.game;
    room.hands = snapshot.hands;
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

  let result = processBid(room, seat, call);
  if (result.type === 'invalid') {
    // Fallback to pass — prevents the AI chain from deadlocking on bad bids
    result = processBid(room, seat, { type: 'pass' });
    if (result.type === 'invalid') return;
  }

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

    if (result.passedOut) {
      dealNextHand(io, roomCode);
      return;
    }
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

    const handScore: HandScore = {
      nsTricks: result.game.trickCounts.ns,
      ewTricks: result.game.trickCounts.ew,
      contractMade: result.tricksMade >= result.contract.level + 6,
      tricksOverUnder: result.tricksMade - (result.contract.level + 6),
      nsScoreBelow: 0,
      nsScoreAbove: 0,
      ewScoreBelow: 0,
      ewScoreAbove: 0,
      vulnerability: result.game.vulnerability,
    };

    emitToRoom(io, roomCode, 'hand_complete', {
      handScore,
      tricksMade: result.tricksMade,
      contract: result.contract,
      declarer: result.contract.declarer,
    });
    emitToRoom(io, roomCode, 'score_update', {
      scores: result.game.scores,
      vulnerability: result.game.vulnerability,
    });
    persistHand(room.roomCode, result.game, result.contract, result.tricksMade);
    recordHandPlayed(room);
    handleTeamMatchBoardResult(io, room, handScore, result.game.handNumber, result.contract, result.tricksMade);
    handlePairsBoardResult(io, room, result.game.handNumber, result.contract, result.tricksMade);
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

/** Auto-deal a new hand after a passed-out board (1.5 s delay so UI can show the passout). */
function dealNextHand(io: Server, roomCode: string): void {
  setTimeout(() => {
    const room = getRoom(roomCode);
    if (!room) return;
    const { game, hands } = startNewHand(room);
    for (const s of SEATS) {
      const seatInfo = game.seats[s];
      if (!seatInfo.isAI && seatInfo.userId) {
        const socketId = getSocketId(seatInfo.userId);
        if (socketId) io.to(socketId).emit('game_started', { gameState: game, yourHand: hands[s] });
      }
    }
    scheduleAIActionIfNeeded(
      room,
      (seat, call) => handleAIBid(io, roomCode, seat, call),
      (seat, card) => handleAIPlay(io, roomCode, seat, card),
    );
  }, 1500);
}

function recordHandPlayed(room: NonNullable<ReturnType<typeof getRoom>>): void {
  if (!room.game) return;
  for (const seat of SEATS) {
    const info = room.game.seats[seat];
    if (info.isAI || !info.userId) continue;
    try {
      sqlite.run('UPDATE users SET hands_played = hands_played + 1 WHERE id = ?', [info.userId]);
    } catch { /* non-fatal */ }
  }
}

function handleTeamMatchBoardResult(
  io: Server,
  room: NonNullable<ReturnType<typeof getRoom>>,
  _handScore: HandScore,
  boardNumber: number,
  contract: Contract,
  tricksMade: number,
): void {
  if (!room.teamMatchCode) return;
  const match = getTeamMatchByRoom(room.roomCode);
  if (!match) return;

  // Compute the actual duplicate-style board score for IMP calculation.
  // We use scoreHand() directly rather than the rubber handScore which has
  // partial rubber context mixed in.
  const declarerSide: 'ns' | 'ew' =
    (contract.declarer === 'north' || contract.declarer === 'south') ? 'ns' : 'ew';
  const vulnerability = room.game?.vulnerability ?? 'none';
  const boardScore = scoreHand(contract, tricksMade, vulnerability, declarerSide);
  // NS signed score: positive = NS won, negative = EW won
  const nsSigned = (boardScore.nsScoreBelow + boardScore.nsScoreAbove) - (boardScore.ewScoreBelow + boardScore.ewScoreAbove);
  const completedResult = recordBoardResult(match, room.roomCode, boardNumber, nsSigned);

  // Emit board result update to the team match lobby socket room
  if (completedResult && completedResult.impsTeam1 !== null) {
    io.to(`team_match:${match.matchCode}`).emit('team_match_board_result', {
      matchCode: match.matchCode,
      boardNumber: completedResult.boardNumber,
      t1NsSigned: completedResult.t1NsSigned,
      t2NsSigned: completedResult.t2NsSigned,
      impsTeam1: completedResult.impsTeam1,
      totalImpsTeam1: match.totalImpsTeam1,
      totalImpsTeam2: match.totalImpsTeam2,
    });
  }

  // Check if this table is done with this board and needs to start the next
  const tableHandsPlayed = (room.roomCode === match.table1RoomCode)
    ? match.t1HandsPlayed
    : match.t2HandsPlayed;

  if (tableHandsPlayed < match.boardCount) {
    // Auto-start next board after 6 seconds (time to see scoring)
    const nextBoardIndex = boardNumber; // 0-indexed = boardNumber (since boardNumber is 1-indexed)
    setTimeout(() => {
      const currentRoom = getRoom(room.roomCode);
      if (!currentRoom) return;
      const preDealt = match.preDealtBoards[nextBoardIndex];
      if (!preDealt) return;
      const { game, hands } = startNewHand(currentRoom, preDealt);
      for (const seat of SEATS) {
        const info = game.seats[seat];
        if (!info.isAI && info.userId) {
          const socketId = getSocketId(info.userId);
          if (socketId) io.to(socketId).emit('game_started', { gameState: game, yourHand: hands[seat] });
        }
      }
      io.to(room.roomCode).emit('game_started', { gameState: game, yourHand: [] }); // for spectators
      scheduleAIActionIfNeeded(currentRoom,
        (s, call) => handleAIBid(io, room.roomCode, s, call),
        (s, card) => handleAIPlay(io, room.roomCode, s, card),
      );
    }, 6000);
  }

  // Check if BOTH tables are done
  if (match.t1HandsPlayed >= match.boardCount && match.t2HandsPlayed >= match.boardCount && match.status !== 'complete') {
    match.status = 'complete';
    const winner: 'team1' | 'team2' | 'tie' = match.totalImpsTeam1 > match.totalImpsTeam2 ? 'team1'
      : match.totalImpsTeam2 > match.totalImpsTeam1 ? 'team2' : 'tie';

    // Award bleats based on team match result
    const winnerTeamPlayers = winner === 'team1' ? match.team1Players
      : winner === 'team2' ? match.team2Players : null;
    const loserTeamPlayers = winner === 'team1' ? match.team2Players
      : winner === 'team2' ? match.team1Players : null;

    const allPlayers = [...match.team1Players, ...match.team2Players];
    for (const player of allPlayers) {
      const isWinner = winnerTeamPlayers?.some(p => p.userId === player.userId) ?? false;
      const isLoser = loserTeamPlayers?.some(p => p.userId === player.userId) ?? false;
      const winnerImps = winner === 'team1' ? match.totalImpsTeam1 : match.totalImpsTeam2;
      const bleats = winner === 'tie' ? 25 : isWinner ? 50 + winnerImps : isLoser ? 15 : 15;
      const reason = winner === 'tie' ? 'Team match draw!' : isWinner ? 'Team match win!' : 'Team match played';
      try {
        sqlite.run('UPDATE users SET bleats = bleats + ? WHERE id = ?', [bleats, player.userId]);
        const row = sqlite.get<{ bleats: number; hands_played: number }>('SELECT bleats, hands_played FROM users WHERE id = ?', [player.userId]);
        const socketId = getSocketId(player.userId);
        if (socketId && row) {
          io.to(socketId).emit('bleats_awarded', { amount: bleats, bleats: row.bleats, handsPlayed: row.hands_played, reason });
        }
      } catch { /* non-fatal */ }
    }

    io.to(`team_match:${match.matchCode}`).emit('team_match_complete', {
      matchCode: match.matchCode,
      team1Imps: match.totalImpsTeam1,
      team2Imps: match.totalImpsTeam2,
      team1Name: match.team1Name,
      team2Name: match.team2Name,
      winner,
    });

  }
}

function handlePairsBoardResult(
  io: Server,
  room: NonNullable<ReturnType<typeof getRoom>>,
  boardNumber: number,
  contract: Contract,
  tricksMade: number,
): void {
  if (!room.pairsTournamentCode) return;

  const tournamentLink = getTournamentByRoom(room.roomCode);
  if (!tournamentLink) return;

  const tournament = getTournament(tournamentLink.tournamentCode);
  if (!tournament) return;

  const round = tournament.rounds.find(r => r.roundNumber === tournamentLink.roundNumber);
  if (!round) return;
  const table = round.tables[tournamentLink.tableIndex];
  if (!table) return;

  const nsPairId = room.pairsNsPairId!;
  const ewPairId = room.pairsEwPairId!;

  // Compute NS signed score
  const declarerSide: 'ns' | 'ew' =
    (contract.declarer === 'north' || contract.declarer === 'south') ? 'ns' : 'ew';
  const vulnerability = room.game?.vulnerability ?? 'none';
  const boardScore = scoreHand(contract, tricksMade, vulnerability, declarerSide);
  const nsSigned = (boardScore.nsScoreBelow + boardScore.nsScoreAbove) - (boardScore.ewScoreBelow + boardScore.ewScoreAbove);

  // boardNumber from hand is 1-indexed within rubber; translate to tournament board number
  const boardStart = room.pairsBoardStart!;
  const tournamentBoardNumber = boardStart + table.boardsComplete;

  recordPairsBoardResult(tournament, tournamentBoardNumber, nsSigned, nsPairId, ewPairId);
  recalcMatchpoints(tournament, tournamentBoardNumber);

  io.to(`tournament:${tournament.tournamentCode}`).emit('tournament_updated', { tournament: toClientTournament(tournament) });

  table.boardsComplete++;

  const totalBoardsThisRound = round.boardEnd - round.boardStart + 1;

  if (table.boardsComplete < totalBoardsThisRound) {
    // Auto-advance to next pre-dealt board after 6 seconds
    const nextBoardIndex = table.boardsComplete;
    setTimeout(() => {
      const currentRoom = getRoom(room.roomCode);
      if (!currentRoom) return;
      const preDealtBoards = currentRoom.pairsPreDealtBoards;
      if (!preDealtBoards) return;
      const preDealt = preDealtBoards[nextBoardIndex];
      if (!preDealt) return;
      const { game, hands } = startNewHand(currentRoom, preDealt);
      for (const seat of SEATS) {
        const info = game.seats[seat];
        if (!info.isAI && info.userId) {
          const socketId = getSocketId(info.userId);
          if (socketId) io.to(socketId).emit('game_started', { gameState: game, yourHand: hands[seat] });
        }
      }
      io.to(room.roomCode).emit('game_started', { gameState: game, yourHand: [] });
      scheduleAIActionIfNeeded(currentRoom,
        (s, call) => handleAIBid(io, room.roomCode, s, call),
        (s, card) => handleAIPlay(io, room.roomCode, s, card),
      );
    }, 6000);
  } else {
    // All boards in this round at this table done — mark table complete
    markTableComplete(tournament, tournamentLink.roundNumber, tournamentLink.tableIndex, (t) => {
      // onRoundComplete: emit update and start next round if generated
      io.to(`tournament:${t.tournamentCode}`).emit('tournament_updated', { tournament: toClientTournament(t) });
      if (t.status === 'complete') {
        io.to(`tournament:${t.tournamentCode}`).emit('tournament_complete', { tournamentCode: t.tournamentCode });
      } else {
        // Start the newly generated round
        callStartRoundFn(t, t.currentRound);
      }
    });
  }
}

function persistHand(
  roomCode: string,
  game: NonNullable<GameRoom['game']>,
  contract: NonNullable<NonNullable<GameRoom['game']>['contract']>,
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
