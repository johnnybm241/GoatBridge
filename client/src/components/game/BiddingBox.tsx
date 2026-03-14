import { motion, AnimatePresence } from 'framer-motion';
import type { BidCall, BiddingState, Strain } from '@goatbridge/shared';
import { STRAIN_ORDER } from '@goatbridge/shared';

interface BiddingBoxProps {
  biddingState: BiddingState;
  onBid: (call: BidCall) => void;
  disabled?: boolean;
}

const STRAIN_DISPLAY: Record<Strain, { label: string; color: string }> = {
  clubs: { label: '♣', color: 'text-gray-900' },
  diamonds: { label: '♦', color: 'text-red-600' },
  hearts: { label: '♥', color: 'text-red-600' },
  spades: { label: '♠', color: 'text-gray-900' },
  notrump: { label: 'NT', color: 'text-blue-800' },
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

export default function BiddingBox({ biddingState, onBid, disabled = false }: BiddingBoxProps) {
  const canDouble = !disabled &&
    biddingState.currentBid !== null &&
    biddingState.doubleStatus === 'none';

  const canRedouble = !disabled &&
    biddingState.doubleStatus === 'doubled';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-navy/90 border border-gold/40 rounded-xl p-3 shadow-2xl bid-box-enter"
      >
        <div className="text-gold text-xs font-bold text-center mb-2">Your Bid</div>

        {/* Bid grid */}
        <div className="grid grid-cols-5 gap-1 mb-2">
          {/* Header row */}
          {STRAINS.map(strain => (
            <div key={strain} className={`text-center text-sm font-bold ${STRAIN_DISPLAY[strain].color}`}>
              {STRAIN_DISPLAY[strain].label}
            </div>
          ))}

          {/* Bid buttons */}
          {LEVELS.map(level =>
            STRAINS.map(strain => {
              const available = !disabled && isBidAvailable(level, strain, biddingState);
              return (
                <button
                  key={`${level}-${strain}`}
                  onClick={() => available && onBid({ type: 'bid', level, strain })}
                  disabled={!available}
                  className={`
                    w-8 h-8 rounded text-xs font-bold transition-all
                    ${available
                      ? 'bg-felt hover:bg-felt-light text-cream border border-felt-light hover:border-gold/50 hover:scale-105'
                      : 'bg-navy/30 text-cream/20 border border-transparent cursor-not-allowed'}
                  `}
                >
                  {level}
                </button>
              );
            })
          )}
        </div>

        {/* Special buttons */}
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => !disabled && onBid({ type: 'pass' })}
            disabled={disabled}
            className="py-1.5 rounded text-xs font-bold bg-green-800 hover:bg-green-700 text-cream border border-green-600 disabled:opacity-30 transition-colors"
          >
            Pass
          </button>
          <button
            onClick={() => canDouble && onBid({ type: 'double' })}
            disabled={!canDouble}
            className="py-1.5 rounded text-xs font-bold bg-red-900 hover:bg-red-800 text-cream border border-red-700 disabled:opacity-30 transition-colors"
          >
            Dbl
          </button>
          <button
            onClick={() => canRedouble && onBid({ type: 'redouble' })}
            disabled={!canRedouble}
            className="py-1.5 rounded text-xs font-bold bg-blue-900 hover:bg-blue-800 text-cream border border-blue-700 disabled:opacity-30 transition-colors"
          >
            Rdbl
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
