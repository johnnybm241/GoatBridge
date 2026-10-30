import { SEATS } from '@goatbridge/shared';
import { sqlite } from '../db/index.js';
import type { GameRoom } from '../game/stateMachine.js';
import { listRooms, restoreRoom } from './roomManager.js';

const SAVE_INTERVAL_MS = 2000;
const MAX_SNAPSHOT_AGE_MS = 24 * 60 * 60 * 1000;

/** Casual tables only; tournament and team-match rooms are managed by their own flows. */
function isPersistable(room: GameRoom): boolean {
  return !room.teamMatchCode && !room.pairsTournamentCode;
}

export function serializeRoom(room: GameRoom): string {
  return JSON.stringify(room);
}

/** Rebuilds a room from a snapshot; humans are marked offline until they rejoin. */
export function deserializeRoom(json: string): GameRoom {
  const room = JSON.parse(json) as GameRoom;
  for (const seat of SEATS) {
    const info = room.seats[seat];
    if (info.userId && !info.isAI) {
      info.isConnected = false;
      info.disconnected = false;
      info.disconnectedAt = null;
    }
    if (room.game) room.game.seats[seat] = info;
  }
  // Spectators had live sockets that no longer exist.
  room.spectators = [];
  if (room.game) room.game.spectators = room.spectators;
  return room;
}

let lastSaved = new Map<string, string>();

export function saveAllRooms(): void {
  try {
    const live = new Set<string>();
    for (const room of listRooms()) {
      if (!isPersistable(room)) continue;
      live.add(room.roomCode);
      const json = serializeRoom(room);
      if (lastSaved.get(room.roomCode) === json) continue;
      sqlite.run(
        'INSERT OR REPLACE INTO table_snapshots (room_code, state_json, updated_at) VALUES (?, ?, ?)',
        [room.roomCode, json, Date.now()],
      );
      lastSaved.set(room.roomCode, json);
    }
    for (const code of [...lastSaved.keys()]) {
      if (!live.has(code)) {
        sqlite.run('DELETE FROM table_snapshots WHERE room_code = ?', [code]);
        lastSaved.delete(code);
      }
    }
  } catch { /* non-fatal */ }
}

/** Loads saved tables into memory and returns them. Call after migrations. */
export function restoreAllRooms(): GameRoom[] {
  const restored: GameRoom[] = [];
  try {
    const rows = sqlite.all<{ room_code: string; state_json: string }>(
      'SELECT room_code, state_json FROM table_snapshots WHERE updated_at >= ?',
      [Date.now() - MAX_SNAPSHOT_AGE_MS],
    );
    sqlite.run('DELETE FROM table_snapshots WHERE updated_at < ?', [Date.now() - MAX_SNAPSHOT_AGE_MS]);
    for (const row of rows) {
      try {
        const room = deserializeRoom(row.state_json);
        restoreRoom(room);
        lastSaved.set(room.roomCode, row.state_json);
        restored.push(room);
      } catch {
        sqlite.run('DELETE FROM table_snapshots WHERE room_code = ?', [row.room_code]);
      }
    }
  } catch { /* non-fatal */ }
  return restored;
}

export function startSnapshotLoop(): void {
  setInterval(saveAllRooms, SAVE_INTERVAL_MS).unref();
  const flush = () => { saveAllRooms(); process.exit(0); };
  process.once('SIGINT', flush);
  process.once('SIGTERM', flush);
}
