import { useEffect, useState } from 'react';
import api from '../api.js';
import BoardViewer from '../components/tournament/BoardViewer.js';
import type { TournamentBoardRecord } from '@goatbridge/shared';

interface TournamentEntry {
  tournament_code: string;
  tournament_name: string;
  board_count: number;
  played_at: number;
}

interface CasualEntry {
  room_code: string;
  board_count: number;
  played_at: number;
}

interface HistoryData {
  tournaments: TournamentEntry[];
  casual: CasualEntry[];
}

export default function HistoryPage() {
  const [data, setData] = useState<HistoryData>({ tournaments: [], casual: [] });
  const [loading, setLoading] = useState(true);
  const [boardViewer, setBoardViewer] = useState<{ title: string; boards: TournamentBoardRecord[] } | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  useEffect(() => {
    api.get<HistoryData>('/history')
      .then(res => setData(res.data))
      .catch(() => setData({ tournaments: [], casual: [] }))
      .finally(() => setLoading(false));
  }, []);

  async function handleViewTournament(entry: TournamentEntry) {
    const key = `t:${entry.tournament_code}`;
    if (loadingKey) return;
    setLoadingKey(key);
    try {
      const res = await api.get<{ boards: TournamentBoardRecord[] }>(`/history/tournaments/${entry.tournament_code}/boards`);
      setBoardViewer({ title: entry.tournament_name, boards: res.data.boards });
    } catch {
      // silent
    } finally {
      setLoadingKey(null);
    }
  }

  async function handleViewCasual(entry: CasualEntry) {
    const key = `c:${entry.room_code}`;
    if (loadingKey) return;
    setLoadingKey(key);
    try {
      const res = await api.get<{ boards: TournamentBoardRecord[] }>(`/history/casual/${entry.room_code}/boards`);
      setBoardViewer({ title: `Room ${entry.room_code}`, boards: res.data.boards });
    } catch {
      // silent
    } finally {
      setLoadingKey(null);
    }
  }

  function formatDate(epochMs: number): string {
    return new Date(epochMs).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
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

  const hasAnything = data.tournaments.length > 0 || data.casual.length > 0;

  return (
    <div className="min-h-full bg-navy p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-gold font-bold text-2xl mb-1">📋 Board History</h1>
          <p className="text-cream/50 text-sm">
            All games you've played — review any board any time.
          </p>
        </div>

        {loading ? (
          <div className="text-cream/40 text-center py-16">Loading…</div>
        ) : !hasAnything ? (
          <div className="bg-navy border border-gold/20 rounded-xl p-8 text-center">
            <div className="text-4xl mb-3">🃏</div>
            <div className="text-cream/60 text-sm">No board history yet.</div>
            <div className="text-cream/30 text-xs mt-1">
              Play some hands to see them here.
            </div>
          </div>
        ) : (
          <div className="space-y-8">

            {/* Tournaments */}
            {data.tournaments.length > 0 && (
              <section>
                <h2 className="text-gold/70 text-xs font-bold uppercase tracking-widest mb-3">
                  🏆 Tournaments
                </h2>
                <div className="space-y-2">
                  {data.tournaments.map(entry => {
                    const key = `t:${entry.tournament_code}`;
                    return (
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
                          onClick={() => handleViewTournament(entry)}
                          disabled={loadingKey === key}
                          className="shrink-0 bg-gold/10 hover:bg-gold/20 border border-gold/30 text-gold text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {loadingKey === key ? '…' : '📋 View'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Casual tables */}
            {data.casual.length > 0 && (
              <section>
                <h2 className="text-gold/70 text-xs font-bold uppercase tracking-widest mb-3">
                  🃏 Casual Tables
                </h2>
                <div className="space-y-2">
                  {data.casual.map(entry => {
                    const key = `c:${entry.room_code}`;
                    return (
                      <div
                        key={entry.room_code}
                        className="bg-navy border border-gold/20 rounded-xl p-4 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <div className="text-cream font-semibold font-mono">{entry.room_code}</div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-cream/40 text-xs">
                              {entry.board_count} hand{entry.board_count !== 1 ? 's' : ''}
                            </span>
                            <span className="text-cream/30 text-xs">·</span>
                            <span className="text-cream/40 text-xs">{formatDate(entry.played_at)}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleViewCasual(entry)}
                          disabled={loadingKey === key}
                          className="shrink-0 bg-gold/10 hover:bg-gold/20 border border-gold/30 text-gold text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {loadingKey === key ? '…' : '📋 View'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
