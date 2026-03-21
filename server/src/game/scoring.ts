import type { Contract, Vulnerability, HandScore, RubberScore } from '@goatbridge/shared';

export function scoreHand(
  contract: Contract,
  tricksMade: number,
  vulnerability: Vulnerability,
  declarerSide: 'ns' | 'ew',
): HandScore {
  const isVul = vulnerability === 'both' ||
    (declarerSide === 'ns' && vulnerability === 'ns') ||
    (declarerSide === 'ew' && vulnerability === 'ew');

  const tricksNeeded = contract.level + 6;
  const contractMade = tricksMade >= tricksNeeded;
  const tricksOverUnder = tricksMade - tricksNeeded;

  let belowLine = 0;
  let aboveLine = 0;

  if (contractMade) {
    const overtricks = tricksOverUnder;

    // Below the line score
    if (contract.doubled === 'none') {
      if (contract.strain === 'notrump') {
        belowLine = 40 + (contract.level - 1) * 30;
      } else if (contract.strain === 'hearts' || contract.strain === 'spades') {
        belowLine = contract.level * 30;
      } else {
        belowLine = contract.level * 20;
      }
    } else if (contract.doubled === 'doubled') {
      if (contract.strain === 'notrump') {
        belowLine = (40 + (contract.level - 1) * 30) * 2;
      } else if (contract.strain === 'hearts' || contract.strain === 'spades') {
        belowLine = contract.level * 30 * 2;
      } else {
        belowLine = contract.level * 20 * 2;
      }
    } else {
      // redoubled
      if (contract.strain === 'notrump') {
        belowLine = (40 + (contract.level - 1) * 30) * 4;
      } else if (contract.strain === 'hearts' || contract.strain === 'spades') {
        belowLine = contract.level * 30 * 4;
      } else {
        belowLine = contract.level * 20 * 4;
      }
    }

    // Above the line: overtricks
    if (contract.doubled === 'none') {
      if (contract.strain === 'notrump') {
        aboveLine += overtricks * 30;
      } else if (contract.strain === 'hearts' || contract.strain === 'spades') {
        aboveLine += overtricks * 30;
      } else {
        aboveLine += overtricks * 20;
      }
    } else if (contract.doubled === 'doubled') {
      aboveLine += overtricks * (isVul ? 200 : 100);
      aboveLine += 50; // insult bonus
    } else {
      aboveLine += overtricks * (isVul ? 400 : 200);
      aboveLine += 100; // insult bonus
    }

    // Slam bonuses
    if (contract.level === 6) {
      aboveLine += isVul ? 750 : 500;
    } else if (contract.level === 7) {
      aboveLine += isVul ? 1500 : 1000;
    }
  } else {
    // Undertricks
    const undertricks = Math.abs(tricksOverUnder);

    if (contract.doubled === 'none') {
      aboveLine -= undertricks * (isVul ? 100 : 50);
    } else if (contract.doubled === 'doubled') {
      if (isVul) {
        aboveLine -= 200 * undertricks + (undertricks > 1 ? 100 * (undertricks - 1) : 0);
        // More precisely: 200 first, 300 each subsequent
        aboveLine = 0;
        for (let i = 1; i <= undertricks; i++) {
          aboveLine -= i === 1 ? 200 : 300;
        }
      } else {
        aboveLine = 0;
        for (let i = 1; i <= undertricks; i++) {
          if (i === 1) aboveLine -= 100;
          else if (i <= 3) aboveLine -= 200;
          else aboveLine -= 300;
        }
      }
    } else {
      // redoubled
      if (isVul) {
        aboveLine = 0;
        for (let i = 1; i <= undertricks; i++) {
          aboveLine -= i === 1 ? 400 : 600;
        }
      } else {
        aboveLine = 0;
        for (let i = 1; i <= undertricks; i++) {
          if (i === 1) aboveLine -= 200;
          else if (i <= 3) aboveLine -= 400;
          else aboveLine -= 600;
        }
      }
    }
  }

  const nsScoreBelow = declarerSide === 'ns' ? belowLine : 0;
  const nsScoreAbove = declarerSide === 'ns' ? aboveLine : (contractMade ? 0 : aboveLine);
  const ewScoreBelow = declarerSide === 'ew' ? belowLine : 0;
  const ewScoreAbove = declarerSide === 'ew' ? aboveLine : (contractMade ? 0 : -aboveLine < 0 ? Math.abs(aboveLine) : 0);

  // If defenders score, opponents get the above points
  const nsTricks = declarerSide === 'ns' ? tricksMade : 13 - tricksMade;
  const ewTricks = declarerSide === 'ew' ? tricksMade : 13 - tricksMade;

  return {
    nsTricks,
    ewTricks,
    contractMade,
    tricksOverUnder,
    nsScoreBelow: declarerSide === 'ns' && contractMade ? belowLine : 0,
    nsScoreAbove: declarerSide === 'ns' && contractMade ? aboveLine : (declarerSide === 'ew' && !contractMade ? Math.abs(aboveLine) : 0),
    ewScoreBelow: declarerSide === 'ew' && contractMade ? belowLine : 0,
    ewScoreAbove: declarerSide === 'ew' && contractMade ? aboveLine : (declarerSide === 'ns' && !contractMade ? Math.abs(aboveLine) : 0),
    vulnerability,
  };
}

export function updateRubberScore(
  current: RubberScore,
  handScore: HandScore,
): RubberScore {
  const updated = { ...current };

  updated.nsAboveTotal += handScore.nsScoreAbove;
  updated.ewAboveTotal += handScore.ewScoreAbove;

  const nsBelowNew = current.nsBelowPartial + handScore.nsScoreBelow;
  const ewBelowNew = current.ewBelowPartial + handScore.ewScoreBelow;

  let nsGamesWon = current.nsGamesWon;
  let ewGamesWon = current.ewGamesWon;
  let nsBelowPartial = nsBelowNew;
  let ewBelowPartial = ewBelowNew;
  let nsBelowTotal = current.nsBelowTotal + handScore.nsScoreBelow;
  let ewBelowTotal = current.ewBelowTotal + handScore.ewScoreBelow;

  if (nsBelowNew >= 100) {
    nsGamesWon++;
    nsBelowPartial = 0; // reset partial after game
    ewBelowPartial = 0; // opponent's partial resets too (rubber bridge rule)
  }
  if (ewBelowNew >= 100) {
    ewGamesWon++;
    ewBelowPartial = 0;
    nsBelowPartial = 0;
  }

  let isComplete = false;
  let winner: 'ns' | 'ew' | null = null;
  let finalNsScore = 0;
  let finalEwScore = 0;

  if (nsGamesWon >= 2 || ewGamesWon >= 2) {
    isComplete = true;
    winner = nsGamesWon >= 2 ? 'ns' : 'ew';

    // Rubber bonus
    const rubberBonus = nsGamesWon === 2 && ewGamesWon === 0 ? 700
      : nsGamesWon === 2 && ewGamesWon === 1 ? 500
      : ewGamesWon === 2 && nsGamesWon === 0 ? 700
      : 500;

    if (winner === 'ns') {
      finalNsScore = nsBelowTotal + updated.nsAboveTotal + rubberBonus;
      finalEwScore = ewBelowTotal + updated.ewAboveTotal;
    } else {
      finalEwScore = ewBelowTotal + updated.ewAboveTotal + rubberBonus;
      finalNsScore = nsBelowTotal + updated.nsAboveTotal;
    }
  }

  return {
    nsGamesWon,
    ewGamesWon,
    nsBelowTotal,
    ewBelowTotal,
    nsAboveTotal: updated.nsAboveTotal,
    ewAboveTotal: updated.ewAboveTotal,
    nsBelowPartial,
    ewBelowPartial,
    isComplete,
    winner,
    finalNsScore,
    finalEwScore,
  };
}

// Standard 16-board duplicate vulnerability cycle
const VUL_CYCLE: Vulnerability[] = [
  'none', 'ns',   'ew',  'both',  // boards 1–4
  'ns',   'ew',   'both','none',  // boards 5–8
  'ew',   'both', 'none','ns',    // boards 9–12
  'both', 'none', 'ns',  'ew',    // boards 13–16
];

export function getNextVulnerability(handNumber: number): Vulnerability {
  return VUL_CYCLE[(handNumber - 1) % 16]!;
}

export function createInitialRubberScore(): RubberScore {
  return {
    nsGamesWon: 0,
    ewGamesWon: 0,
    nsBelowTotal: 0,
    ewBelowTotal: 0,
    nsAboveTotal: 0,
    ewAboveTotal: 0,
    nsBelowPartial: 0,
    ewBelowPartial: 0,
    isComplete: false,
    winner: null,
    finalNsScore: 0,
    finalEwScore: 0,
  };
}

export type { Vulnerability };
