import { describe, it, expect, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ sqlite: { run: vi.fn(), all: vi.fn(() => []), get: vi.fn() } }));

import { createRoom, joinSeat, addBot } from './roomManager.js';
import { startNewHand } from '../game/stateMachine.js';
import { serializeRoom, deserializeRoom } from './persistence.js';

describe('table persistence', () => {
  it('round-trips a live hand and marks humans offline', () => {
    const room = createRoom('host', 'invite_only');
    joinSeat(room, 'host', 'Host', 'classic', 'south');
    addBot(room, 'north');
    addBot(room, 'east');
    addBot(room, 'west');
    startNewHand(room);

    const restored = deserializeRoom(serializeRoom(room));

    expect(restored.roomCode).toBe(room.roomCode);
    expect(restored.visibility).toBe('invite_only');
    expect(restored.hands.south).toHaveLength(13);
    expect(restored.game?.handNumber).toBe(1);
    expect(restored.seats.south.userId).toBe('host');
    expect(restored.seats.south.isConnected).toBe(false);
    expect(restored.seats.north.isAI).toBe(true);
    expect(restored.game?.seats.south).toBe(restored.seats.south);
    expect(restored.spectators).toEqual([]);
  });
});
