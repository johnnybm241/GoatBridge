import { describe, it, expect } from 'vitest';
import { isBidHigher, validateCall, applyCall, createInitialBiddingState } from './bidding.js';

describe('bidding', () => {
  it('isBidHigher: level matters', () => {
    expect(isBidHigher({ type: 'bid', level: 2, strain: 'clubs' }, { type: 'bid', level: 1, strain: 'spades' })).toBe(true);
    expect(isBidHigher({ type: 'bid', level: 1, strain: 'spades' }, { type: 'bid', level: 2, strain: 'clubs' })).toBe(false);
  });

  it('isBidHigher: same level, strain order', () => {
    expect(isBidHigher({ type: 'bid', level: 1, strain: 'diamonds' }, { type: 'bid', level: 1, strain: 'clubs' })).toBe(true);
    expect(isBidHigher({ type: 'bid', level: 1, strain: 'notrump' }, { type: 'bid', level: 1, strain: 'spades' })).toBe(true);
    expect(isBidHigher({ type: 'bid', level: 1, strain: 'clubs' }, { type: 'bid', level: 1, strain: 'clubs' })).toBe(false);
  });

  it('pass is always valid', () => {
    const state = createInitialBiddingState();
    const r = validateCall({ type: 'pass' }, state, 0);
    expect(r.valid).toBe(true);
  });

  it('double requires opponent bid', () => {
    let state = createInitialBiddingState();
    state = applyCall(state, 'north', { type: 'bid', level: 1, strain: 'spades' });
    // East (opp of north) can double
    const r = validateCall({ type: 'double' }, state, 1);
    expect(r.valid).toBe(true);
    // South (partner of north) cannot double
    const r2 = validateCall({ type: 'double' }, state, 2);
    expect(r2.valid).toBe(false);
  });

  it('auction ends after 3 passes following a bid', () => {
    let state = createInitialBiddingState();
    state = applyCall(state, 'north', { type: 'bid', level: 1, strain: 'notrump' });
    state = applyCall(state, 'east', { type: 'pass' });
    state = applyCall(state, 'south', { type: 'pass' });
    expect(state.isComplete).toBe(false);
    state = applyCall(state, 'west', { type: 'pass' });
    expect(state.isComplete).toBe(true);
    expect(state.passedOut).toBe(false);
  });

  it('passed-out hand: 4 passes opening', () => {
    let state = createInitialBiddingState();
    state = applyCall(state, 'north', { type: 'pass' });
    state = applyCall(state, 'east', { type: 'pass' });
    state = applyCall(state, 'south', { type: 'pass' });
    state = applyCall(state, 'west', { type: 'pass' });
    expect(state.isComplete).toBe(true);
    expect(state.passedOut).toBe(true);
  });
});
