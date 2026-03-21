import type { Card, Suit, Trick, Strain, Seat } from '@goatbridge/shared';
import { RANK_ORDER } from '@goatbridge/shared';

const HIGH_HONORS = new Set(['J', 'Q', 'K', 'A']);

function rankValue(rank: string): number {
  return RANK_ORDER.indexOf(rank as typeof RANK_ORDER[number]);
}

export function selectDefenderCard(
  hand: Card[],
  trick: Trick | null,
  trumpStrain: Strain,
  isOpeningLead: boolean,
  seat: Seat,
  declarer: Seat | null,
  dummy: Seat | null,
): Card {
  if (hand.length === 0) throw new Error('Empty hand');

  const trumpSuit = trumpStrain === 'notrump' ? null : (trumpStrain as Suit);
  const declarerSide = new Set<Seat | null>([declarer, dummy]);
  const allSeats: Seat[] = ['north', 'east', 'south', 'west'];
  const partner = allSeats.find(s => s !== seat && !declarerSide.has(s)) ?? null;

  // Opening lead
  if (!trick || trick.cards.length === 0) {
    return openingLead(hand, trumpSuit, trumpStrain === 'notrump');
  }

  const ledSuit = trick.cards[0]!.card.suit;
  const followSuitCards = hand.filter(c => c.suit === ledSuit);

  if (followSuitCards.length > 0) {
    // 2nd seat: cover an honor if declarer/dummy led one
    if (trick.cards.length === 1) {
      const ledBySeat = trick.cards[0]!.seat;
      const ledCard = trick.cards[0]!.card;
      if (declarerSide.has(ledBySeat) && HIGH_HONORS.has(ledCard.rank)) {
        const coverCards = followSuitCards.filter(c => rankValue(c.rank) > rankValue(ledCard.rank));
        if (coverCards.length > 0) return lowestCard(coverCards);
      }
      return lowestCard(followSuitCards);
    }

    // 3rd seat: high only if partner is not already winning
    if (trick.cards.length === 2) {
      const leader = trick.cards[0]!.seat;
      if (leader === partner) {
        const winningSeat = getCurrentWinningSeat(trick, trumpSuit);
        if (winningSeat === partner) {
          // Partner is winning — play low to preserve honors
          return lowestCard(followSuitCards);
        }
      }
      return highestCard(followSuitCards);
    }

    // 4th seat: beat the winner if partner isn't already winning
    if (trick.cards.length === 3) {
      const winningSeat = getCurrentWinningSeat(trick, trumpSuit);
      if (winningSeat === partner) return lowestCard(followSuitCards);
      const winnerCard = getCurrentWinnerCard(trick, trumpSuit);
      const beatingCards = followSuitCards.filter(c => rankValue(c.rank) > rankValue(winnerCard.rank));
      return beatingCards.length > 0 ? lowestCard(beatingCards) : lowestCard(followSuitCards);
    }
  }

  // Can't follow suit - try to trump
  if (trumpSuit) {
    const trumps = hand.filter(c => c.suit === trumpSuit);
    if (trumps.length > 0) return lowestCard(trumps);
  }

  // Discard lowest card
  return lowestCard(hand);
}

export function selectDeclarerCard(
  hand: Card[],
  dummyHand: Card[],
  trick: Trick | null,
  trumpStrain: Strain,
  isPlayingDummy: boolean,
  completedTricks: Trick[] = [],
): Card {
  const activeHand = isPlayingDummy ? dummyHand : hand;
  if (activeHand.length === 0) throw new Error('Empty hand');

  const trumpSuit = trumpStrain === 'notrump' ? null : (trumpStrain as Suit);

  if (!trick || trick.cards.length === 0) {
    // Lead: draw trumps only if opponents still have any
    if (trumpSuit) {
      const myTrumps = hand.filter(c => c.suit === trumpSuit).length;
      const dummyTrumps = dummyHand.filter(c => c.suit === trumpSuit).length;
      const playedTrumps = completedTricks.reduce(
        (n, t) => n + t.cards.filter(tc => tc.card.suit === trumpSuit).length, 0,
      );
      const opponentTrumps = 13 - myTrumps - dummyTrumps - playedTrumps;

      if (opponentTrumps > 0) {
        // Still need to draw trumps — lead highest trump from the longer side
        const activeTrumps = activeHand.filter(c => c.suit === trumpSuit);
        if (activeTrumps.length > 0) return highestCard(activeTrumps);
        // Active hand is void in trumps, lead from the other hand's trumps via a side-suit entry
        // (just lead longest non-trump for now — partner hand will ruff later)
      }
      // Trumps exhausted — fall through to side-suit lead
    }
    // Lead longest non-trump suit
    const nonTrump = trumpSuit ? activeHand.filter(c => c.suit !== trumpSuit) : activeHand;
    const suitToLead = nonTrump.length > 0 ? findLongestSuit(nonTrump) : findLongestSuit(activeHand);
    const leadCards = activeHand.filter(c => c.suit === suitToLead);
    return highestCard(leadCards);
  }

  const ledSuit = trick.cards[0]!.card.suit;
  const followSuitCards = activeHand.filter(c => c.suit === ledSuit);

  if (followSuitCards.length > 0) {
    // Win if possible
    const currentWinner = getCurrentWinnerCard(trick, trumpSuit);
    const beatingCards = followSuitCards.filter(c =>
      c.suit === ledSuit && rankValue(c.rank) > rankValue(currentWinner.rank)
    );
    if (beatingCards.length > 0) return lowestCard(beatingCards);
    return lowestCard(followSuitCards);
  }

  // Discard or trump
  if (trumpSuit && trick.cards[trick.cards.length - 1]?.card.suit !== trumpSuit) {
    const trumps = activeHand.filter(c => c.suit === trumpSuit);
    if (trumps.length > 0) return lowestCard(trumps);
  }
  return lowestCard(activeHand);
}

function openingLead(hand: Card[], trumpSuit: Suit | null, isNT: boolean): Card {
  // vs NT: 4th best from longest and strongest
  // vs suit: top of sequence or singleton for ruff
  const suitCounts: Record<Suit, Card[]> = { clubs: [], diamonds: [], hearts: [], spades: [] };
  for (const card of hand) {
    if (card.suit !== trumpSuit) {
      suitCounts[card.suit].push(card);
    }
  }

  // Find longest non-trump suit
  let bestSuit: Suit = 'clubs';
  let bestCount = -1;
  let bestHCP = -1;
  for (const [suit, cards] of Object.entries(suitCounts) as [Suit, Card[]][]) {
    const hcp = cards.reduce((acc, c) => acc + (['A', 'K', 'Q', 'J'].indexOf(c.rank) >= 0 ? 4 - ['A', 'K', 'Q', 'J'].indexOf(c.rank) : 0), 0);
    if (cards.length > bestCount || (cards.length === bestCount && hcp > bestHCP)) {
      bestCount = cards.length;
      bestSuit = suit;
      bestHCP = hcp;
    }
  }

  const suitCards = suitCounts[bestSuit].sort((a, b) => rankValue(b.rank) - rankValue(a.rank));

  if (isNT && suitCards.length >= 4) {
    // 4th best
    return suitCards[3]!;
  }

  // Top of sequence
  if (suitCards.length >= 2) {
    if (rankValue(suitCards[0]!.rank) - rankValue(suitCards[1]!.rank) === 1) {
      return suitCards[0]!;
    }
  }

  return suitCards[0] ?? lowestCard(hand);
}

function getCurrentWinningSeat(trick: Trick, trumpSuit: Suit | null): Seat {
  if (trick.cards.length === 0) throw new Error('Empty trick');
  const ledSuit = trick.cards[0]!.card.suit;
  let winningSeat = trick.cards[0]!.seat;
  let winningCard = trick.cards[0]!.card;
  for (const tc of trick.cards.slice(1)) {
    if (trumpSuit && tc.card.suit === trumpSuit) {
      if (winningCard.suit !== trumpSuit || rankValue(tc.card.rank) > rankValue(winningCard.rank)) {
        winningSeat = tc.seat;
        winningCard = tc.card;
      }
    } else if (tc.card.suit === ledSuit) {
      if (winningCard.suit !== trumpSuit && rankValue(tc.card.rank) > rankValue(winningCard.rank)) {
        winningSeat = tc.seat;
        winningCard = tc.card;
      }
    }
  }
  return winningSeat;
}

function getCurrentWinnerCard(trick: Trick, trumpSuit: Suit | null): Card {
  if (trick.cards.length === 0) throw new Error('Empty trick');
  const ledSuit = trick.cards[0]!.card.suit;
  let winner = trick.cards[0]!.card;
  for (const tc of trick.cards.slice(1)) {
    if (trumpSuit && tc.card.suit === trumpSuit) {
      if (winner.suit !== trumpSuit || rankValue(tc.card.rank) > rankValue(winner.rank)) {
        winner = tc.card;
      }
    } else if (tc.card.suit === ledSuit) {
      if (winner.suit !== trumpSuit && rankValue(tc.card.rank) > rankValue(winner.rank)) {
        winner = tc.card;
      }
    }
  }
  return winner;
}

function findLongestSuit(hand: Card[]): Suit {
  const counts: Record<Suit, number> = { clubs: 0, diamonds: 0, hearts: 0, spades: 0 };
  for (const c of hand) counts[c.suit]++;
  return (Object.entries(counts) as [Suit, number][]).sort((a, b) => b[1] - a[1])[0]![0];
}

function highestCard(cards: Card[]): Card {
  return cards.reduce((best, c) => rankValue(c.rank) > rankValue(best.rank) ? c : best);
}

function lowestCard(cards: Card[]): Card {
  return cards.reduce((best, c) => rankValue(c.rank) < rankValue(best.rank) ? c : best);
}
