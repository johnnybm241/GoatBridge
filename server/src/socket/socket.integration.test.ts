/**
 * Socket integration test — plays a full hand of bridge end-to-end.
 *
 * One human player (north) + 3 AI bots. The human always passes during
 * bidding, and plays a valid card (following suit when possible) on each turn.
 * We assert that `hand_complete` fires within 30 seconds.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { runMigrations } from '../db/migrate.js';
import { createSocketServer } from '../socket/index.js';
import authRoutes from '../auth/routes.js';
import type { Seat, Card, Trick } from '@goatbridge/shared';
import type { GameState, BidCall } from '@goatbridge/shared';
import type {
  GameStartedPayload,
  BidMadePayload,
  AuctionCompletePayload,
  CardPlayedPayload,
  TrickCompletePayload,
  DummyRevealedPayload,
  HandCompletePayload,
} from '@goatbridge/shared';

// ─── Test server setup ───────────────────────────────────────────────────────

let serverUrl: string;
let httpClose: () => Promise<void>;

beforeAll(async () => {
  runMigrations();

  const app = express();
  const httpServer = createServer(app);

  app.use(cors());
  app.use(express.json());
  app.use('/auth', authRoutes);

  createSocketServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address() as { port: number };
      serverUrl = `http://localhost:${addr.port}`;
      resolve();
    });
  });

  httpClose = () =>
    new Promise<void>((resolve) => httpServer.close(() => resolve()));
}, 15_000);

afterAll(() => httpClose?.());

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function registerAndGetToken(
  base: string,
  username: string,
): Promise<string> {
  const res = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      email: `${username}@test.local`,
      password: 'testpassword',
    }),
  });
  const data = (await res.json()) as { token?: string; error?: string };
  if (!data.token) {
    throw new Error(
      `Registration failed (HTTP ${res.status}): ${JSON.stringify(data)}`,
    );
  }
  return data.token;
}

function connectSocket(base: string, token: string): ClientSocket {
  return ioClient(base, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });
}

/** Pick a card that follows the led suit (or any card if void). */
function pickCard(hand: Card[], currentTrick: Trick | null): Card {
  if (!currentTrick || currentTrick.cards.length === 0) {
    return hand[0]!;
  }
  const ledSuit = currentTrick.cards[0]!.card.suit;
  const following = hand.filter((c) => c.suit === ledSuit);
  return following.length > 0 ? following[0]! : hand[0]!;
}

// ─── Test ────────────────────────────────────────────────────────────────────

describe('socket integration', () => {
  it(
    'plays a full hand end-to-end (human + 3 bots)',
    async () => {
      // Use last 8 hex chars of timestamp (unique enough for tests)
      const suffix = Date.now().toString(16).slice(-8);
      const token = await registerAndGetToken(
        serverUrl,
        `tp${suffix}`,
      );

      const socket = connectSocket(serverUrl, token);

      // State tracked inside event handlers
      let ourSeat: Seat | null = null;
      let ourHand: Card[] = [];
      let currentTurn: Seat | null = null;
      let phase: string = 'waiting';
      let declarer: Seat | null = null;
      let dummy: Seat | null = null;
      let currentTrick: Trick | null = null;
      let roomCode = '';

      // Resolve / reject the hand-complete promise from outside handlers
      let resolveHandComplete!: (v: HandCompletePayload) => void;
      let rejectHandComplete!: (e: Error) => void;
      const handCompletePromise = new Promise<HandCompletePayload>(
        (res, rej) => {
          resolveHandComplete = res;
          rejectHandComplete = rej;
        },
      );

      /** Called whenever state changes — sends the next action if it's our turn. */
      function maybeAct() {
        if (!ourSeat || currentTurn !== ourSeat) return;

        if (phase === 'bidding') {
          const call: BidCall = { type: 'pass' };
          socket.emit('make_bid', { roomCode, call });
        } else if (phase === 'playing') {
          if (ourHand.length === 0) return;

          // Declarer plays dummy's cards too — but in this test the human
          // only plays their own seat's cards; dummy is handled by AI bots
          // or the human if ourSeat === declarer. For simplicity, skip when
          // it's dummy's physical turn but we're not the declarer.
          const card = pickCard(ourHand, currentTrick);
          socket.emit('play_card', { roomCode, card });
        }
      }

      // ── Socket event handlers ──────────────────────────────────────────────

      socket.on('connect_error', (err) => rejectHandComplete(err as Error));

      socket.on('room_joined', (payload) => {
        roomCode = payload.roomCode;
        // Add 3 bots to the remaining seats
        socket.emit('add_bot', { roomCode, seat: 'east' });
        socket.emit('add_bot', { roomCode, seat: 'south' });
        socket.emit('add_bot', { roomCode, seat: 'west' });
      });

      socket.on('room_updated', (payload) => {
        // When all 4 seats are filled, start the game (host = north = us)
        const seats = payload.seats as Record<Seat, { userId: string | null; isAI: boolean }>;
        const filled = Object.values(seats).filter(
          (s) => s.userId !== null || s.isAI,
        ).length;
        if (filled === 4) {
          socket.emit('start_game', { roomCode });
        }
      });

      socket.on('game_started', (payload: GameStartedPayload) => {
        ourHand = [...payload.yourHand];
        currentTurn = payload.gameState.currentTurn;
        phase = payload.gameState.phase;
        declarer = payload.gameState.declarer;
        dummy = payload.gameState.dummy;
        currentTrick = payload.gameState.currentTrick;

        // Determine our seat from the game state
        const gs = payload.gameState;
        for (const s of ['north', 'east', 'south', 'west'] as Seat[]) {
          if (gs.seats[s].isAI === false && gs.seats[s].userId !== null) {
            ourSeat = s;
            break;
          }
        }
        maybeAct();
      });

      socket.on('bid_made', (payload: BidMadePayload) => {
        currentTurn = payload.currentTurn;
        maybeAct();
      });

      socket.on('auction_complete', (payload: AuctionCompletePayload) => {
        phase = 'playing';
        declarer = payload.declarer;
        dummy = payload.dummy;
        // currentTurn will be updated via the next card_played event
      });

      socket.on('dummy_revealed', (_payload: DummyRevealedPayload) => {
        // No extra action needed
      });

      socket.on('card_played', (payload: CardPlayedPayload) => {
        currentTrick = payload.currentTrick;
        currentTurn = payload.currentTurn;

        // Remove card from our hand if we played it
        if (payload.seat === ourSeat) {
          ourHand = ourHand.filter(
            (c) =>
              !(c.suit === payload.card.suit && c.rank === payload.card.rank),
          );
        }
        // If declarer is us and dummy played, don't remove from ourHand
        maybeAct();
      });

      socket.on('trick_complete', (payload: TrickCompletePayload) => {
        // currentTurn is already set from the preceding card_played event;
        // just reset the trick. Don't call maybeAct() here — card_played
        // already triggered it, and calling it again would cause a double-play
        // when the human wins a trick.
        currentTurn = payload.nextLead;
        currentTrick = { cards: [], leader: payload.nextLead, winner: null };
      });

      socket.on('hand_complete', (payload: HandCompletePayload) => {
        resolveHandComplete(payload);
        socket.disconnect();
      });

      socket.on('invalid_bid', (payload) => {
        rejectHandComplete(
          new Error(`invalid_bid: ${JSON.stringify(payload)}`),
        );
      });

      socket.on('invalid_card', (payload) => {
        rejectHandComplete(
          new Error(`invalid_card: ${JSON.stringify(payload)}`),
        );
      });

      socket.on('room_error', (payload) => {
        rejectHandComplete(
          new Error(`room_error: ${JSON.stringify(payload)}`),
        );
      });

      // ── Join / create room ─────────────────────────────────────────────────

      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => resolve());
        socket.on('connect_error', reject);
        setTimeout(() => reject(new Error('connect timeout')), 5000);
      });

      socket.emit('create_room');

      // AI bots use 10ms delays in test mode (NODE_ENV=test), so this
      // completes in well under 5 seconds.
      const result = await handCompletePromise;

      expect(result.tricksMade).toBeGreaterThanOrEqual(0);
      expect(result.contract).toBeTruthy();
      expect(result.contract.level).toBeGreaterThanOrEqual(1);
    },
    15_000,
  );
});
