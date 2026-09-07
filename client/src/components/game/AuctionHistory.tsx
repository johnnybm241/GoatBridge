import type { BiddingState, BidCall, Vulnerability, SeatInfo } from '@goatbridge/shared';
import { SUIT_SYMBOLS } from '@goatbridge/shared';
import type { Seat } from '@goatbridge/shared';
import { explainBidAt } from '../../lib/bidExplainer.js';

interface AuctionHistoryProps {
  bidding: BiddingState;
  dealer: Seat;
  vulnerability: Vulnerability;
  seats?: Record<Seat, SeatInfo>;
}

function formatCall(call: BidCall): React.ReactNode {
  if (call.type === 'pass') return <span className="text-green-400">Pass</span>;
  if (call.type === 'double') return <span className="text-red-400">Dbl</span>;
  if (call.type === 'redouble') return <span className="text-blue-400">Rdbl</span>;

  const { level, strain } = call;
  const isRed = strain === 'hearts' || strain === 'diamonds';
  const symbol = strain === 'notrump' ? 'NT' : SUIT_SYMBOLS[strain];

  return (
    <span>
      {level}
      <span className={isRed ? 'text-red-500' : strain === 'notrump' ? 'text-blue-400' : 'text-cream'}>
        {symbol}
      </span>
    </span>
  );
}

// Column order: E S W N
const COLUMN_SEATS: Seat[] = ['east', 'south', 'west', 'north'];
const COLUMN_LABELS = ['E', 'S', 'W', 'N'];

function isVul(seat: Seat, vulnerability: Vulnerability): boolean {
  if (vulnerability === 'both') return true;
  if (vulnerability === 'ns') return seat === 'north' || seat === 'south';
  if (vulnerability === 'ew') return seat === 'east' || seat === 'west';
  return false;
}

export default function AuctionHistory({ bidding, dealer, vulnerability, seats }: AuctionHistoryProps) {
  const dealerCol = COLUMN_SEATS.indexOf(dealer);

  // Build rows: pad the start so dealer lands in their column, and remember each cell's call index
  const cells: Array<{ call: BidCall; seat: Seat; index: number } | null> = [];
  for (let i = 0; i < dealerCol; i++) cells.push(null);
  for (let i = 0; i < bidding.calls.length; i++) {
    const c = bidding.calls[i]!;
    cells.push({ call: c.call, seat: c.seat as Seat, index: i });
  }

  const rows: Array<Array<{ call: BidCall; seat: Seat; index: number } | null>> = [];
  for (let i = 0; i < cells.length; i += 4) {
    rows.push(cells.slice(i, i + 4));
  }

  return (
    <div className="bg-navy/80 border border-gold/20 rounded-lg p-3 sm:p-5 2xl:p-7 w-full max-w-[280px] 2xl:max-w-[360px] mx-auto">
      <div className="text-gold text-base sm:text-lg 2xl:text-2xl font-bold text-center mb-3">Auction</div>
      <table className="w-full table-fixed text-center text-base sm:text-lg 2xl:text-2xl">
        <thead>
          <tr>
            {COLUMN_LABELS.map((h, ci) => (
              <th key={h} className={`font-bold w-1/4 pb-2 text-base sm:text-lg 2xl:text-2xl ${isVul(COLUMN_SEATS[ci]!, vulnerability) ? 'text-red-500' : 'text-cream/50'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {[0,1,2,3].map(ci => {
                const cell = row[ci];
                if (!cell) return <td key={ci} className="py-1.5 px-2 sm:py-2 sm:px-4 2xl:py-3 2xl:px-5 text-cream/90" />;
                const title = explainBidAt(cell.index, bidding, cell.seat);
                return (
                  <td
                    key={ci}
                    title={title}
                    className="py-1.5 px-2 sm:py-2 sm:px-4 2xl:py-3 2xl:px-5 text-cream/90 cursor-help underline decoration-dotted decoration-gold/40 underline-offset-4"
                  >
                    {formatCall(cell.call)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-cream/40 text-[10px] 2xl:text-xs mt-2 text-center">Hover any bid for its SAYC meaning</div>
    </div>
  );
}
