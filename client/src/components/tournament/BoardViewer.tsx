import { useState } from 'react';
import type { TournamentBoardRecord, PairEntry, Card } from '@goatbridge/shared';

interface BoardViewerProps {
  boards: TournamentBoardRecord[];
  pairs: PairEntry[];
  onClose: () => void;
}

const SUIT_SYMBOLS: Record<string, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const SUIT_ORDER = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
const RANK_ORDER = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const SEAT_LABEL: Record<string, string> = { north: 'N', east: 'E', south: 'S', west: 'W' };
const AUCTION_SEATS: string[] = ['west', 'north', 'east', 'south'];

function sortHand(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const si = SUIT_ORDER.indexOf(a.suit as typeof SUIT_ORDER[number]) - SUIT_ORDER.indexOf(b.suit as typeof SUIT_ORDER[number]);
    if (si !== 0) return si;
    return RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
  });
}

function formatCall(call: { type: string; level?: number; strain?: string }): string {
  if (call.type === 'pass') return 'Pass';
  if (call.type === 'double') return 'Dbl';
  if (call.type === 'redouble') return 'Rdbl';
  if (call.type === 'bid' && call.level != null && call.strain) {
    const strainSym: Record<string, string> = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠', notrump: 'NT' };
    return `${call.level}${strainSym[call.strain] ?? call.strain}`;
  }
  return '?';
}

function callColor(call: { type: string; strain?: string }): string {
  if (call.type === 'pass') return 'text-green-400';
  if (call.type === 'double') return 'text-red-400';
  if (call.type === 'redouble') return 'text-blue-400';
  if (call.strain === 'hearts' || call.strain === 'diamonds') return 'text-red-400';
  return 'text-cream';
}

function formatContract(board: TournamentBoardRecord): string {
  const c = board.contract;
  const strainSym: Record<string, string> = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠', notrump: 'NT' };
  const dbl = c.doubled === 'doubled' ? 'x' : c.doubled === 'redoubled' ? 'xx' : '';
  return `${c.level}${strainSym[c.strain] ?? c.strain}${dbl}`;
}

function formatResult(board: TournamentBoardRecord): { text: string; color: string } {
  const needed = board.contract.level + 6;
  if (board.tricksMade >= needed) {
    const over = board.tricksMade - needed;
    return { text: over > 0 ? `Made +${over}` : 'Made', color: 'text-green-400' };
  }
  const down = needed - board.tricksMade;
  return { text: `Down ${down}`, color: 'text-red-400' };
}

function formatScore(nsRaw: number): string {
  if (nsRaw > 0) return `+${nsRaw}`;
  if (nsRaw < 0) return `${nsRaw}`;
  return '0';
}

function getPairName(pairId: string, pairs: PairEntry[]): string {
  const p = pairs.find(x => x.pairId === pairId);
  if (!p) return pairId;
  return `${p.player1.displayName} / ${p.player2?.displayName ?? 'Bot'}`;
}

/** One hand displayed as suit columns */
function HandDisplay({ cards, seat }: { cards: Card[]; seat: string }) {
  const sorted = sortHand(cards);
  const bySuit: Record<string, Card[]> = { spades: [], hearts: [], diamonds: [], clubs: [] };
  for (const c of sorted) bySuit[c.suit].push(c);

  return (
    <div className="text-xs">
      <div className="text-cream/40 text-[10px] font-bold mb-0.5">{SEAT_LABEL[seat] ?? seat}</div>
      {SUIT_ORDER.map(suit => {
        const cs = bySuit[suit];
        if (cs.length === 0) return (
          <div key={suit} className="flex items-center gap-1 leading-tight">
            <span className={suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-gray-300'}>{SUIT_SYMBOLS[suit]}</span>
            <span className="text-cream/30">—</span>
          </div>
        );
        return (
          <div key={suit} className="flex items-center gap-0.5 leading-tight flex-wrap">
            <span className={suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-gray-300'}>{SUIT_SYMBOLS[suit]}</span>
            <span className="text-cream">{cs.map(c => c.rank).join(' ')}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Auction grid in WNES column order, padded from dealer */
function AuctionTable({ board }: { board: TournamentBoardRecord }) {
  const dealerIdx = AUCTION_SEATS.indexOf(board.dealer);

  // Build flat list of (seatIndex, call) starting from dealer
  const paddedCalls: Array<{ seatIdx: number; call: { type: string; level?: number; strain?: string } | null }> = [];
  // Add empty pads before dealer
  for (let i = 0; i < dealerIdx; i++) paddedCalls.push({ seatIdx: i, call: null });
  for (const { seat, call } of board.biddingCalls) {
    const idx = AUCTION_SEATS.indexOf(seat);
    paddedCalls.push({ seatIdx: idx, call: call as { type: string; level?: number; strain?: string } });
  }
  // Pad to a full row
  while (paddedCalls.length % 4 !== 0) paddedCalls.push({ seatIdx: paddedCalls.length % 4, call: null });

  const rows: Array<Array<{ call: { type: string; level?: number; strain?: string } | null }>> = [];
  for (let i = 0; i < paddedCalls.length; i += 4) {
    rows.push(paddedCalls.slice(i, i + 4).map(x => ({ call: x.call })));
  }

  return (
    <div className="text-xs">
      <div className="grid grid-cols-4 gap-1 mb-1">
        {AUCTION_SEATS.map(s => (
          <div key={s} className="text-center font-bold text-cream/40 text-[10px]">{SEAT_LABEL[s]}</div>
        ))}
      </div>
      {rows.map((row, ri) => (
        <div key={ri} className="grid grid-cols-4 gap-1">
          {row.map((cell, ci) => (
            <div key={ci} className={`text-center text-xs font-mono ${cell.call ? callColor(cell.call) : 'text-cream/20'}`}>
              {cell.call ? formatCall(cell.call) : ''}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function BoardViewer({ boards, pairs, onClose }: BoardViewerProps) {
  const [idx, setIdx] = useState(0);
  const board = boards[idx];

  if (!board) return null;

  const result = formatResult(board);
  const nsScore = formatScore(board.nsRawScore);
  const ewScore = formatScore(-board.nsRawScore);

  return (
    <div className="fixed inset-0 z-50 bg-navy/95 flex flex-col" onClick={e => e.target === e.currentTarget && onClose()}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gold/20 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-gold font-bold text-lg">📋 Board History</span>
          <span className="text-cream/40 text-sm">{boards.length} board{boards.length !== 1 ? 's' : ''}</span>
        </div>
        <button
          onClick={onClose}
          className="text-cream/60 hover:text-cream text-2xl leading-none px-2 transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Board list sidebar */}
        <div className="w-24 sm:w-32 shrink-0 border-r border-gold/20 overflow-y-auto">
          {boards.map((b, i) => {
            const res = formatResult(b);
            return (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`w-full px-2 py-2.5 text-left border-b border-gold/10 transition-colors ${i === idx ? 'bg-gold/15 text-gold' : 'text-cream/60 hover:bg-white/5 hover:text-cream'}`}
              >
                <div className="font-bold text-sm">#{b.boardNumber}</div>
                <div className="text-[10px] text-cream/40">{formatContract(b)}</div>
                <div className={`text-[10px] ${res.color}`}>{res.text}</div>
              </button>
            );
          })}
        </div>

        {/* Board detail */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Board summary */}
          <div className="bg-navy border border-gold/30 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-gold font-bold text-lg">Board #{board.boardNumber}</span>
                  <span className="text-cream/40 text-xs">Dealer: {SEAT_LABEL[board.dealer]}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${board.vulnerability === 'both' ? 'text-red-400 border-red-400/30' : board.vulnerability === 'none' ? 'text-cream/40 border-white/10' : 'text-red-400 border-red-400/30'}`}>
                    {board.vulnerability === 'none' ? 'None vul' : board.vulnerability === 'both' ? 'All vul' : `${board.vulnerability.toUpperCase()} vul`}
                  </span>
                </div>
                <div className="text-cream/60 text-xs">
                  Round {board.roundNumber} · Table {board.tableIndex + 1}
                </div>
              </div>
              <div className="text-right">
                <div className="text-cream font-bold text-base">{formatContract(board)} by {SEAT_LABEL[board.declarerSeat]}</div>
                <div className={`font-bold text-sm ${result.color}`}>{result.text}</div>
              </div>
            </div>

            {/* Scores */}
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="bg-white/5 rounded-lg px-3 py-2">
                <div className="text-cream/40 text-xs mb-0.5">NS — {getPairName(board.nsPairId, pairs)}</div>
                <div className={`font-bold text-base ${board.nsRawScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>{nsScore}</div>
              </div>
              <div className="bg-white/5 rounded-lg px-3 py-2">
                <div className="text-cream/40 text-xs mb-0.5">EW — {getPairName(board.ewPairId, pairs)}</div>
                <div className={`font-bold text-base ${-board.nsRawScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>{ewScore}</div>
              </div>
            </div>
          </div>

          {/* Deal — compass layout */}
          <div className="bg-navy border border-gold/20 rounded-xl p-4">
            <div className="text-gold/80 text-xs font-bold mb-3">The Deal</div>
            <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto">
              {/* Top row: North */}
              <div />
              <div className="flex justify-center">
                <HandDisplay cards={board.deal.north ?? []} seat="north" />
              </div>
              <div />

              {/* Middle row: West | center | East */}
              <div className="flex justify-end items-center">
                <HandDisplay cards={board.deal.west ?? []} seat="west" />
              </div>
              <div className="flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border border-gold/30 flex items-center justify-center">
                  <div className="text-[8px] text-gold/50 leading-none text-center font-bold">
                    <div>N</div>
                    <div>W·E</div>
                    <div>S</div>
                  </div>
                </div>
              </div>
              <div className="flex justify-start items-center">
                <HandDisplay cards={board.deal.east ?? []} seat="east" />
              </div>

              {/* Bottom row: South */}
              <div />
              <div className="flex justify-center">
                <HandDisplay cards={board.deal.south ?? []} seat="south" />
              </div>
              <div />
            </div>
          </div>

          {/* Auction */}
          <div className="bg-navy border border-gold/20 rounded-xl p-4">
            <div className="text-gold/80 text-xs font-bold mb-3">Auction</div>
            <AuctionTable board={board} />
          </div>

          {/* Play — tricks */}
          {board.completedTricks.length > 0 && (
            <div className="bg-navy border border-gold/20 rounded-xl p-4">
              <div className="text-gold/80 text-xs font-bold mb-3">Play — {board.tricksMade} trick{board.tricksMade !== 1 ? 's' : ''} made</div>
              <div className="space-y-1">
                {board.completedTricks.map((trick, ti) => (
                  <div key={ti} className="flex items-center gap-2 text-xs">
                    <span className="text-cream/30 w-4 text-right shrink-0">{ti + 1}.</span>
                    <div className="flex gap-3 flex-wrap">
                      {(['north', 'east', 'south', 'west'] as const).map(seat => {
                        const card = trick.cards[seat];
                        if (!card) return null;
                        const isWinner = trick.winner === seat;
                        const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
                        return (
                          <span
                            key={seat}
                            className={`${isRed ? 'text-red-400' : 'text-cream'} ${isWinner ? 'font-bold underline underline-offset-2' : ''}`}
                          >
                            {SEAT_LABEL[seat]}:{card.rank}{SUIT_SYMBOLS[card.suit]}
                          </span>
                        );
                      })}
                      {trick.winner && (
                        <span className="text-gold/60 text-[10px]">({SEAT_LABEL[trick.winner]} wins)</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
