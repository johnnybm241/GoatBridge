import { describe, it, expect } from 'vitest';
import { scoreHand, updateRubberScore, createInitialRubberScore } from './scoring.js';
import type { Contract } from '@goatbridge/shared';

const makeContract = (level: number, strain: Contract['strain'], doubled: Contract['doubled'] = 'none'): Contract => ({
  level: level as Contract['level'],
  strain,
  doubled,
  declarer: 'south',
});

describe('scoring', () => {
  it('3NT made exactly: 100 below', () => {
    const score = scoreHand(makeContract(3, 'notrump'), 9, 'none', 'ns');
    expect(score.nsScoreBelow).toBe(100);
    expect(score.contractMade).toBe(true);
  });

  it('4♠ made exactly: 120 below', () => {
    const score = scoreHand(makeContract(4, 'spades'), 10, 'none', 'ns');
    expect(score.nsScoreBelow).toBe(120);
  });

  it('undertricks penalize defenders side above line', () => {
    const score = scoreHand(makeContract(3, 'notrump'), 7, 'none', 'ns'); // 2 down
    expect(score.ewScoreAbove).toBe(100); // 2 × 50
    expect(score.nsScoreBelow).toBe(0);
  });

  it('rubber completes after 2 games', () => {
    let scores = createInitialRubberScore();
    // NS makes two games
    const hand1 = scoreHand(makeContract(3, 'notrump'), 9, 'none', 'ns');
    scores = updateRubberScore(scores, hand1);
    expect(scores.nsGamesWon).toBe(1);

    const hand2 = scoreHand(makeContract(4, 'spades'), 10, 'none', 'ns');
    scores = updateRubberScore(scores, hand2);
    expect(scores.nsGamesWon).toBe(2);
    expect(scores.isComplete).toBe(true);
    expect(scores.winner).toBe('ns');
  });
});
