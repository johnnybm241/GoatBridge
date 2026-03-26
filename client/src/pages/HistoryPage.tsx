import { useEffect, useState } from 'react';
import api from '../api.js';
import BoardViewer from '../components/tournament/BoardViewer.js';
import type { TournamentBoardRecord } from '@goatbridge/shared';

interface HistoryEntry {
  tournament_code: string;
  tournament_name: string;
  board_count: number;
  played_at: number;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [boardViewer, setBoardViewer] = useState<{ name: string; boards: TournamentBoardRecord[] } | null>(null);
  const [loadingBoards, setLoadingBoards] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ tournaments: HistoryEntry[] }>('/history')
      .then(res => setHistory(res.data.tournaments))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleViewBoards(entry: HistoryEntry) {
    if (loadingBoards) return;
    setLoadingBoards(entry.tournament_code);
    try {
      const res = await api.get<{ boards: TournamentBoardRecord[] }>(`/history/${entry.tournament_code}/boards`);
      setBoardViewer({ name: entry.tournament_name, boards: res.data.boards });
    } catch {
      // silent
    } finally {
      setLoadingBoards(null);
    }
  }

  function formatDate(epochMs: number): string {
    return new Date(epochMs).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (boardViewer) {
    return (
      <BoardViewer
        boards={boardViewer.boards}
        pairs={[]}
        onClose={() => setBoardViewer(null)}
      />
    );
  }

  return (
    <div className="min-h-full bg-navy p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-gold font-bold text-2xl mb-1">📋 Board History</h1>
          <p className="text-cream/50 text-sm">
            All tournaments you've played in — review boards any time.
          </p>
        </div>

        {loading ? (
          <div className="text-cream/40 text-center py-16">Loading…</div>
        ) : history.length === 0 ? (
          <div className="bg-navy border border-gold/20 rounded-xl p-8 text-center">
            <div className="text-4xl mb-3">🃏</div>
            <div className="text-cream/60 text-sm">No tournament boards yet.</div>
            <div className="text-cream/30 text-xs mt-1">
              Play in a tournament to see your board history here.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map(entry => (
              <div
                key={entry.tournament_code}
                className="bg-navy border border-gold/20 rounded-xl p-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="text-cream font-semibold truncate">{entry.tournament_name}</div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-cream/40 text-xs">
                      {entry.board_count} board{entry.board_count !== 1 ? 's' : ''}
                    </span>
                    <span className="text-cream/30 text-xs">·</span>
                    <span className="text-cream/40 text-xs">{formatDate(entry.played_at)}</span>
                  </div>
                  <div className="text-cream/25 text-[10px] font-mono mt-0.5">{entry.tournament_code}</div>
                </div>
                <button
                  onClick={() => handleViewBoards(entry)}
                  disabled={loadingBoards === entry.tournament_code}
                  className="shrink-0 bg-gold/10 hover:bg-gold/20 border border-gold/30 text-gold text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  {loadingBoards === entry.tournament_code ? '…' : '📋 View Boards'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
