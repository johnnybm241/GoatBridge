import { motion, AnimatePresence } from 'framer-motion';
import type { Trick, Seat } from '@goatbridge/shared';
import Card from './Card.js';

interface TrickAreaProps {
  currentTrick: Trick | null;
  yourSeat: Seat | null;
  isStatic?: boolean; // when true (viewing last trick), suppress exit animation
}

const CLOCKWISE: Record<Seat, Seat> = { north: 'east', east: 'south', south: 'west', west: 'north' };
const CCW: Record<Seat, Seat> = { north: 'west', west: 'south', south: 'east', east: 'north' };

type VisualPos = 'bottom' | 'top' | 'left' | 'right';

function getVisualPos(seat: Seat, yourSeat: Seat | null): VisualPos {
  const bottom = yourSeat ?? 'south';
  if (seat === bottom) return 'bottom';
  if (seat === CLOCKWISE[bottom]) return 'left';
  if (seat === CLOCKWISE[CLOCKWISE[bottom]]) return 'top';
  return 'right';
}

const CARD_POSITIONS: Record<VisualPos, React.CSSProperties> = {
  bottom: { bottom: '5%',  left: '50%', transform: 'translateX(-50%)' },
  top:    { top: '5%',     left: '50%', transform: 'translateX(-50%)' },
  left:   { top: '35%',    left: '5%' },
  right:  { top: '35%',    right: '5%' },
};

const EXIT_BY_POS: Record<VisualPos, { x?: number; y?: number }> = {
  bottom: { y:  80 },
  top:    { y: -80 },
  left:   { x: -80 },
  right:  { x:  80 },
};

export default function TrickArea({ currentTrick, yourSeat, isStatic = false }: TrickAreaProps) {
  if (!currentTrick || currentTrick.cards.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-16 h-16 rounded-full border-2 border-felt-light/20 pointer-events-none" />
      </div>
    );
  }

  const winnerPos = currentTrick.winner
    ? getVisualPos(currentTrick.winner, yourSeat)
    : null;

  // When a winner is set, all cards exit toward the winner's corner (unless viewing statically)
  const exitDir = isStatic ? {} : (winnerPos ? EXIT_BY_POS[winnerPos] : { scale: 0 });

  return (
    <div className="absolute inset-0">
      {winnerPos && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={isStatic ? {} : { scale: 0, opacity: 0 }}
            className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              winnerPos === 'bottom' || winnerPos === 'top' ? 'bg-gold/40 text-gold' : 'bg-blue-400/30 text-blue-200'
            }`}
          >
            {isStatic ? 'Last trick: ' : '▲ '}{currentTrick.winner}
          </motion.div>
        </div>
      )}
      <AnimatePresence>
        {currentTrick.cards.map((tc) => {
          const vpos = getVisualPos(tc.seat, yourSeat);
          const pos = CARD_POSITIONS[vpos];
          return (
            <motion.div
              key={`${tc.card.suit}-${tc.card.rank}-${tc.seat}`}
              initial={isStatic ? { scale: 1, opacity: 1 } : { scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ ...exitDir, opacity: 0, transition: { duration: 0.35, ease: 'easeIn' } }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="absolute"
              style={pos}
            >
              <Card card={tc.card} size="md" />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
