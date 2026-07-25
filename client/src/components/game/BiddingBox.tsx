import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { BidCall, BiddingState, Strain, Seat } from '@goatbridge/shared';
import { STRAIN_ORDER } from '@goatbridge/shared';
import { explainBidAt } from '../../lib/bidExplainer.js';

interface BiddingBoxProps {
  biddingState: BiddingState;
  onBid: (call: BidCall) => void;
  disabled?: boolean;
  yourSeat?: Seat | null;
}

const STRAIN_DISPLAY: Record<Strain, { label: string; color: string }> = {
  clubs: { label: '♣', color: 'text-slate-900' },
  diamonds: { label: '♦', color: 'text-red-600' },
  hearts: { label: '♥', color: 'text-red-600' },
  spades: { label: '♠', color: 'text-slate-900' },
  notrump: { label: 'NT', color: 'text-blue-700' },
};

const LEVELS = [1, 2, 3, 4, 5, 6, 7] as const;
const STRAINS: Strain[] = ['clubs', 'diamonds', 'hearts', 'spades', 'notrump'];

function isBidAvailable(level: number, strain: Strain, state: BiddingState): boolean {
  if (!state.currentBid) return true;
  if (level > state.currentBid.level) return true;
  if (level === state.currentBid.level) {
    return STRAIN_ORDER.indexOf(strain) > STRAIN_ORDER.indexOf(state.currentBid.strain);
  }
  return false;
}

function isLevelAvailable(level: number, state: BiddingState): boolean {
  return STRAINS.some(s => isBidAvailable(level, s, state));
}

export default function BiddingBox({ biddingState, onBid, disabled = false, yourSeat = null }: BiddingBoxProps) {
  const [selectedLevel, setSelectedLevel] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7 | null>(null);

  // Reset selection when the auction advances (a new bid came in) or box is disabled
  useEffect(() => {
    setSelectedLevel(null);
  }, [biddingState.calls.length, disabled]);

  const canDouble = !disabled && biddingState.currentBid !== null && biddingState.doubleStatus === 'none';
  const canRedouble = !disabled && biddingState.doubleStatus === 'doubled';

  const preview = (call: BidCall): string | undefined => {
    if (!yourSeat) return undefined;
    const hypothetical: BiddingState = {
      ...biddingState,
      calls: [...biddingState.calls, { seat: yourSeat, call }],
    };
    return explainBidAt(hypothetical.calls.length - 1, hypothetical, yourSeat);
  };

  const submitBid = (strain: Strain) => {
    if (selectedLevel === null) return;
    if (!isBidAvailable(selectedLevel, strain, biddingState)) return;
    onBid({ type: 'bid', level: selectedLevel, strain });
    setSelectedLevel(null);
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="bidding-box"
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 12, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="inline-flex flex-col gap-1.5 bg-gradient-to-b from-slate-100 to-slate-200 border border-slate-400 rounded-lg p-2 shadow-xl"
      >
        {/* Level row */}
        <div className="flex gap-1">
          {LEVELS.map(level => {
            const avail = !disabled && isLevelAvailable(level, biddingState);
            const selected = selectedLevel === level;
            return (
              <button
                key={level}
                onClick={() => avail && setSelectedLevel(selected ? null : level)}
                disabled={!avail}
                className={`w-8 h-9 rounded-md text-sm font-bold transition-all ${
                  selected
                    ? 'bg-amber-500 text-white shadow-inner ring-2 ring-amber-600 scale-105'
                    : avail
                    ? 'bg-white text-slate-800 hover:bg-amber-100 border border-slate-300 shadow-sm active:scale-95'
                    : 'bg-slate-200 text-slate-400 border border-slate-200 cursor-not-allowed opacity-50'
                }`}
              >
                {level}
              </button>
            );
          })}
        </div>

        {/* Strain row (only enabled when a level is selected) */}
        <div className="flex gap-1">
          {STRAINS.map(strain => {
            const avail =
              !disabled && selectedLevel !== null && isBidAvailable(selectedLevel, strain, biddingState);
            const d = STRAIN_DISPLAY[strain];
            return (
              <button
                key={strain}
                onClick={() => submitBid(strain)}
                disabled={!avail}
                title={
                  avail && selectedLevel !== null
                    ? preview({ type: 'bid', level: selectedLevel, strain })
                    : undefined
                }
                className={`w-8 h-9 rounded-md text-lg font-bold flex items-center justify-center transition-all ${
                  avail
                    ? `bg-white ${d.color} hover:bg-amber-100 border border-slate-300 shadow-sm active:scale-95 cursor-help`
                    : 'bg-slate-200 text-slate-300 border border-slate-200 cursor-not-allowed opacity-50'
                }`}
              >
                <span className={strain === 'notrump' ? 'text-xs font-bold' : ''}>{d.label}</span>
              </button>
            );
          })}
        </div>

        {/* Action row: Pass / Dbl / Rdbl */}
        <div className="flex gap-1 mt-0.5">
          <button
            onClick={() => !disabled && onBid({ type: 'pass' })}
            disabled={disabled}
            title={!disabled ? preview({ type: 'pass' }) : undefined}
            className="flex-1 h-8 rounded-md text-xs font-bold bg-green-600 hover:bg-green-500 text-white shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-help"
          >
            Pass
          </button>
          <button
            onClick={() => canDouble && onBid({ type: 'double' })}
            disabled={!canDouble}
            title={canDouble ? preview({ type: 'double' }) : undefined}
            className="flex-1 h-8 rounded-md text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-help"
          >
            X
          </button>
          <button
            onClick={() => canRedouble && onBid({ type: 'redouble' })}
            disabled={!canRedouble}
            title={canRedouble ? preview({ type: 'redouble' }) : undefined}
            className="flex-1 h-8 rounded-md text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-help"
          >
            XX
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
