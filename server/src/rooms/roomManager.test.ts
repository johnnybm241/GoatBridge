import { describe, it, expect } from 'vitest';
import {
  createRoom,
  deleteRoom,
  joinSeat,
  vacateSeat,
  canJoinTable,
  inviteUser,
  reassignHost,
  isAbandoned,
  listJoinableTables,
} from './roomManager.js';

function makeRoom(visibility: 'public' | 'invite_only' = 'public') {
  return createRoom('host-1', visibility);
}

describe('canJoinTable', () => {
  it('lets anyone into a public table', () => {
    const room = makeRoom('public');
    expect(canJoinTable(room, 'stranger')).toBe(true);
    deleteRoom(room.roomCode);
  });

  it('blocks uninvited users from an invite-only table', () => {
    const room = makeRoom('invite_only');
    expect(canJoinTable(room, 'stranger')).toBe(false);
    expect(canJoinTable(room, 'host-1')).toBe(true);

    inviteUser(room, 'stranger');
    expect(canJoinTable(room, 'stranger')).toBe(true);
    deleteRoom(room.roomCode);
  });
});

describe('reassignHost', () => {
  it('promotes the longest-seated human', () => {
    const room = makeRoom();
    joinSeat(room, 'host-1', 'Host', 'default', 'north');
    joinSeat(room, 'early', 'Early', 'default', 'east');
    room.seats.east.joinedAt = 1000;
    joinSeat(room, 'late', 'Late', 'default', 'west');
    room.seats.west.joinedAt = 2000;

    vacateSeat(room, 'north');
    expect(reassignHost(room)).toEqual({ userId: 'early', displayName: 'Early' });
    expect(room.hostUserId).toBe('early');
    deleteRoom(room.roomCode);
  });

  it('falls back to a spectator when no human is seated', () => {
    const room = makeRoom();
    room.spectators.push({ userId: 'watcher', displayName: 'Watcher' });

    expect(reassignHost(room)?.userId).toBe('watcher');
    expect(room.hostUserId).toBe('watcher');
    deleteRoom(room.roomCode);
  });

  it('returns null for an abandoned table', () => {
    const room = makeRoom();
    expect(reassignHost(room)).toBeNull();
    expect(isAbandoned(room)).toBe(true);
    deleteRoom(room.roomCode);
  });
});

describe('listJoinableTables', () => {
  it('hides invite-only tables from uninvited users', () => {
    const publicRoom = makeRoom('public');
    const privateRoom = makeRoom('invite_only');

    const forStranger = listJoinableTables('stranger').map(t => t.roomCode);
    expect(forStranger).toContain(publicRoom.roomCode);
    expect(forStranger).not.toContain(privateRoom.roomCode);

    inviteUser(privateRoom, 'stranger');
    const afterInvite = listJoinableTables('stranger');
    const entry = afterInvite.find(t => t.roomCode === privateRoom.roomCode);
    expect(entry?.invited).toBe(true);

    deleteRoom(publicRoom.roomCode);
    deleteRoom(privateRoom.roomCode);
  });

  it('reports open seats', () => {
    const room = makeRoom();
    joinSeat(room, 'p1', 'P1', 'default', 'north');

    const entry = listJoinableTables('stranger').find(t => t.roomCode === room.roomCode);
    expect(entry?.openSeats).toBe(3);
    deleteRoom(room.roomCode);
  });
});
