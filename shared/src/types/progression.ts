export interface GoatRank {
  id: string;
  name: string;
  minBleats: number;
  icon: string;
  color: string; // CSS colour for UI
}

export const GOAT_RANKS: GoatRank[] = [
  { id: 'kid',           name: 'Kid',           minBleats: 0,    icon: '🐐',    color: '#9ca3af' },
  { id: 'young-buck',    name: 'Young Buck',    minBleats: 100,  icon: '🐐',    color: '#6ee7b7' },
  { id: 'billy-goat',    name: 'Billy Goat',    minBleats: 300,  icon: '🐐',    color: '#93c5fd' },
  { id: 'nanny',         name: 'Nanny',         minBleats: 750,  icon: '🐐',    color: '#c084fc' },
  { id: 'mountain-goat', name: 'Mountain Goat', minBleats: 1500, icon: '⛰️🐐', color: '#fbbf24' },
  { id: 'summit-goat',   name: 'Summit Goat',   minBleats: 3500, icon: '🏔️🐐', color: '#f97316' },
  { id: 'goat',          name: 'GOAT',          minBleats: 7000, icon: '👑🐐',  color: '#ffd700' },
];

/** Returns the current rank for the given bleat total. */
export function getRank(bleats: number): GoatRank {
  let rank = GOAT_RANKS[0];
  for (const r of GOAT_RANKS) {
    if (bleats >= r.minBleats) rank = r;
  }
  return rank;
}

/** Returns the next rank above the current one, or null at max rank. */
export function getNextRank(bleats: number): GoatRank | null {
  const current = getRank(bleats);
  const idx = GOAT_RANKS.findIndex(r => r.id === current.id);
  return idx < GOAT_RANKS.length - 1 ? GOAT_RANKS[idx + 1] : null;
}

/**
 * Returns a 0–1 progress value towards the next rank.
 * Returns 1 at max rank.
 */
export function getRankProgress(bleats: number): number {
  const next = getNextRank(bleats);
  if (!next) return 1;
  const current = getRank(bleats);
  const range = next.minBleats - current.minBleats;
  const earned = bleats - current.minBleats;
  return Math.min(1, earned / range);
}
