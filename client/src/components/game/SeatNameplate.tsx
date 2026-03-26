import type { SeatInfo, Seat } from '@goatbridge/shared';
import { SUIT_SYMBOLS } from '@goatbridge/shared';

interface SeatNameplateProps {
  seat: Seat;
  info: SeatInfo;
  isCurrentTurn?: boolean;
  isDeclarer?: boolean;
  isDummy?: boolean;
  trickCount?: number;
}

const SEAT_LABELS: Record<Seat, string> = { north: 'N', east: 'E', south: 'S', west: 'W' };

export default function SeatNameplate({
  seat,
  info,
  isCurrentTurn = false,
  isDeclarer = false,
  isDummy = false,
  trickCount = 0,
}: SeatNameplateProps) {
  const isEmpty = !info.userId && !info.isAI;

  return (
    <div className={`
      flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs sm:text-sm sm:px-3 sm:py-1.5
      ${isCurrentTurn
        ? 'bg-gold/20 border-gold text-gold shadow-lg shadow-gold/20 animate-pulse'
        : 'bg-navy/60 border-gold/20 text-cream/80'}
      ${isEmpty ? 'opacity-40' : ''}
    `}>
      <div className={`
        w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
        ${isEmpty ? 'bg-navy border border-cream/20 text-cream/20' : 'bg-felt text-cream border border-felt-light'}
      `}>
        {SEAT_LABELS[seat]}
      </div>

      <div className="flex flex-col leading-tight min-w-0">
        <span className="truncate max-w-[72px] sm:max-w-[100px] font-medium">
          {isEmpty ? 'Empty' : info.displayName}
        </span>
        <div className="flex items-center gap-1 text-[10px] sm:text-xs text-cream/50">
          {info.isAI && <span>🤖</span>}
          {isDeclarer && <span className="text-gold">Decl</span>}
          {isDummy && <span className="text-blue-300">Dummy</span>}
          {info.disconnected && <span className="text-red-400">⚡</span>}
          {trickCount > 0 && <span>▲{trickCount}</span>}
        </div>
      </div>
    </div>
  );
}
