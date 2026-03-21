import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useTournamentStore } from '../store/tournamentStore.js';
import { getSocket } from '../socket.js';
import api from '../api.js';
import type { TournamentState, PairEntry, SwissRound } from '@goatbridge/shared';

interface SearchUser {
  id: string;
  username: string;
}

export default function TournamentLobbyPage() {
  const { tournamentCode } = useParams<{ tournamentCode: string }>();
  const navigate = useNavigate();
  const userId = useAuthStore(s => s.userId);
  const tournament = useTournamentStore(s => s.currentTournament);
  const setTournament = useTournamentStore(s => s.setTournament);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Pair add form
  const [p1Search, setP1Search] = useState('');
  const [p1Results, setP1Results] = useState<SearchUser[]>([]);
  const [p1Selected, setP1Selected] = useState<SearchUser | null>(null);
  const [p2Search, setP2Search] = useState('');
  const [p2Results, setP2Results] = useState<SearchUser[]>([]);
  const [p2Selected, setP2Selected] = useState<SearchUser | null>(null);

  const p1DebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const p2DebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!tournamentCode) return;
    api.get<{ tournament: TournamentState }>(`/tournaments/${tournamentCode}`)
      .then(res => {
        setTournament(res.data.tournament);
        setLoading(false);
        const socket = getSocket();
        socket.emit('join_tournament_lobby', { tournamentCode });
      })
      .catch(() => {
        setError('Tournament not found');
        setLoading(false);
      });

    const socket = getSocket();
    const onUpdated = (payload: { tournament: TournamentState }) => setTournament(payload.tournament);
    const onState = (payload: { tournament: TournamentState }) => setTournament(payload.tournament);
    socket.on('tournament_updated', onUpdated);
    socket.on('tournament_state', onState);

    return () => {
      socket.off('tournament_updated', onUpdated);
      socket.off('tournament_state', onState);
      try { socket.emit('leave_tournament_lobby', { tournamentCode }); } catch { /* not connected */ }
    };
  }, [tournamentCode]);

  const t = tournament;
  const isOrganizer = t?.organizerUserId === userId;

  const searchUsers = (val: string, debounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>, setResults: (r: SearchUser[]) => void) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(() => {
      api.get<{ users: SearchUser[] }>(`/tournaments/users/search?q=${encodeURIComponent(val.trim())}`)
        .then(res => setResults(res.data.users))
        .catch(() => {});
    }, 300);
  };

  const handleAddPair = () => {
    if (!t || !p1Selected) return;
    const socket = getSocket();
    socket.emit('add_pair_entry', {
      tournamentCode: t.tournamentCode,
      player1UserId: p1Selected.id,
      player1DisplayName: p1Selected.username,
      player2UserId: p2Selected?.id,
      player2DisplayName: p2Selected?.username,
    });
    setP1Selected(null);
    setP1Search('');
    setP2Selected(null);
    setP2Search('');
    setP1Results([]);
    setP2Results([]);
  };

  const handleRemovePair = (pairId: string) => {
    if (!t) return;
    const socket = getSocket();
    socket.emit('remove_pair_entry', { tournamentCode: t.tournamentCode, pairId });
  };

  const handleStartTournament = () => {
    if (!t) return;
    const socket = getSocket();
    socket.emit('start_tournament', { tournamentCode: t.tournamentCode });
  };

  const getMyRoomCode = (): string | null => {
    if (!t || !userId) return null;
    for (const round of t.rounds) {
      for (const table of round.tables) {
        const pair1 = t.pairs.find(p => p.pairId === table.pair1Id);
        const pair2 = t.pairs.find(p => p.pairId === table.pair2Id);
        const inPair1 = pair1?.player1.userId === userId || pair1?.player2?.userId === userId;
        const inPair2 = pair2?.player1.userId === userId || pair2?.player2?.userId === userId;
        if ((inPair1 || inPair2) && table.roomCode && !table.complete) {
          return table.roomCode;
        }
      }
    }
    return null;
  };

  const estimatedRounds = (tt: TournamentState) => Math.ceil(tt.totalBoards / tt.boardsPerRound);

  const getPairName = (pair: PairEntry) => {
    const p2 = pair.player2?.displayName ?? 'Bot';
    return `${pair.player1.displayName} / ${p2}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-cream/40 text-sm">Loading tournament…</div>
      </div>
    );
  }

  if (error || !t) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <div className="bg-navy border border-red-500/30 rounded-xl p-6 text-center">
          <p className="text-red-400">{error || 'Tournament not found'}</p>
          <button onClick={() => navigate('/tournaments')} className="mt-4 text-gold text-sm hover:underline">
            Back to Tournaments
          </button>
        </div>
      </div>
    );
  }

  const myRoomCode = getMyRoomCode();
  const totalRounds = estimatedRounds(t);

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => navigate('/tournaments')} className="text-cream/40 hover:text-cream text-xs mb-1 transition-colors">
            ← Tournaments
          </button>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏆</span>
            <div>
              <h1 className="text-2xl font-bold text-gold">{t.name}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${
                  t.status === 'setup' ? 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10'
                  : t.status === 'in_progress' ? 'text-green-400 border-green-400/30 bg-green-400/10'
                  : 'text-cream/30 border-white/10 bg-white/5'
                }`}>
                  {t.status === 'setup' ? 'Setup' : t.status === 'in_progress' ? 'In Progress' : 'Complete'}
                </span>
                <span className="text-cream/40 text-xs">Swiss Pairs</span>
                {t.status === 'in_progress' && (
                  <span className="text-cream/50 text-xs">
                    Round {t.currentRound} / {totalRounds}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        {myRoomCode && (
          <button
            onClick={() => navigate(`/game/${myRoomCode}`)}
            className="bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
          >
            Go to My Table
          </button>
        )}
      </div>

      {/* Tournament info strip */}
      <div className="bg-navy border border-gold/20 rounded-lg px-4 py-2.5 mb-5 flex flex-wrap gap-4 text-sm text-cream/60">
        <span>{t.totalBoards} total boards</span>
        <span>{t.boardsPerRound} boards/round</span>
        <span>{totalRounds} rounds</span>
        <span>{t.pairs.length} pairs</span>
      </div>

      {/* ── SETUP PHASE ── */}
      {t.status === 'setup' && isOrganizer && (
        <div className="space-y-5">
          {/* Add pair */}
          <div className="bg-navy border border-gold/30 rounded-xl p-5">
            <h2 className="text-gold font-bold mb-3">Add Pair</h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {/* Player 1 */}
              <div>
                <label className="block text-cream/60 text-xs mb-1">Player 1 (required)</label>
                {p1Selected ? (
                  <div className="flex items-center gap-2 bg-gold/10 border border-gold/30 rounded-lg px-3 py-2">
                    <span className="text-sm text-cream flex-1">{p1Selected.username}</span>
                    <button onClick={() => { setP1Selected(null); setP1Search(''); }} className="text-red-400/60 hover:text-red-400 text-xs">✕</button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={p1Search}
                      onChange={e => { setP1Search(e.target.value); searchUsers(e.target.value, p1DebounceRef, setP1Results); }}
                      placeholder="Search username…"
                      className="w-full bg-navy border border-gold/30 text-cream rounded-lg px-3 py-2 focus:outline-none focus:border-gold transition-colors text-sm"
                    />
                    {p1Results.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-navy border border-gold/30 rounded-lg overflow-hidden z-10 shadow-xl">
                        {p1Results.map(u => (
                          <button
                            key={u.id}
                            onClick={() => { setP1Selected(u); setP1Search(''); setP1Results([]); }}
                            disabled={t.pairs.some(p => p.player1.userId === u.id || p.player2?.userId === u.id)}
                            className="w-full text-left px-4 py-2 text-sm text-cream hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {u.username}
                            {t.pairs.some(p => p.player1.userId === u.id || p.player2?.userId === u.id) && ' (already in a pair)'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Player 2 */}
              <div>
                <label className="block text-cream/60 text-xs mb-1">Player 2 (optional – Bot if empty)</label>
                {p2Selected ? (
                  <div className="flex items-center gap-2 bg-gold/10 border border-gold/30 rounded-lg px-3 py-2">
                    <span className="text-sm text-cream flex-1">{p2Selected.username}</span>
                    <button onClick={() => { setP2Selected(null); setP2Search(''); }} className="text-red-400/60 hover:text-red-400 text-xs">✕</button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={p2Search}
                      onChange={e => { setP2Search(e.target.value); searchUsers(e.target.value, p2DebounceRef, setP2Results); }}
                      placeholder="Search username… or leave empty for Bot"
                      className="w-full bg-navy border border-gold/30 text-cream rounded-lg px-3 py-2 focus:outline-none focus:border-gold transition-colors text-sm"
                    />
                    {p2Results.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-navy border border-gold/30 rounded-lg overflow-hidden z-10 shadow-xl">
                        {p2Results.map(u => (
                          <button
                            key={u.id}
                            onClick={() => { setP2Selected(u); setP2Search(''); setP2Results([]); }}
                            disabled={t.pairs.some(p => p.player1.userId === u.id || p.player2?.userId === u.id) || u.id === p1Selected?.id}
                            className="w-full text-left px-4 py-2 text-sm text-cream hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {u.username}
                            {(t.pairs.some(p => p.player1.userId === u.id || p.player2?.userId === u.id) || u.id === p1Selected?.id) && ' (unavailable)'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleAddPair}
              disabled={!p1Selected}
              className="bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 rounded-lg px-4 py-1.5 text-sm transition-colors disabled:opacity-40"
            >
              + Add Pair
            </button>
          </div>

          {/* Pairs list */}
          <div className="bg-navy border border-gold/30 rounded-xl p-5">
            <h2 className="text-gold font-bold mb-3">Pairs ({t.pairs.length})</h2>
            {t.pairs.length === 0 ? (
              <p className="text-cream/40 text-xs">No pairs yet. Add pairs above.</p>
            ) : (
              <div className="space-y-2">
                {t.pairs.map((pair, i) => (
                  <div key={pair.pairId} className="flex items-center gap-3 py-1.5 border-b border-gold/10">
                    <span className="text-cream/30 text-xs w-5">{i + 1}</span>
                    <span className="flex-1 text-sm text-cream">{getPairName(pair)}</span>
                    {!pair.player2 && (
                      <span className="text-cream/30 text-xs italic">Bot partner</span>
                    )}
                    <button
                      onClick={() => handleRemovePair(pair.pairId)}
                      className="text-red-400/60 hover:text-red-400 text-xs transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Start button */}
          <div className="flex items-center justify-between">
            <div>
              {t.pairs.length < 2 && (
                <p className="text-cream/40 text-xs">Need at least 2 pairs to start.</p>
              )}
            </div>
            <button
              onClick={handleStartTournament}
              disabled={t.pairs.length < 2}
              className="bg-gold hover:bg-gold-light text-navy font-bold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Start Tournament
            </button>
          </div>
        </div>
      )}

      {/* Setup phase — non-organizer view */}
      {t.status === 'setup' && !isOrganizer && (
        <div className="bg-navy border border-gold/30 rounded-xl p-6 text-center">
          <div className="text-4xl mb-3">⏳</div>
          <p className="text-cream/70">Waiting for the organizer to set up the tournament…</p>
          <div className="mt-4 text-sm text-cream/50">
            {t.pairs.length} pair{t.pairs.length !== 1 ? 's' : ''} registered
          </div>
        </div>
      )}

      {/* ── IN PROGRESS / COMPLETE ── */}
      {(t.status === 'in_progress' || t.status === 'complete') && (
        <div className="space-y-5">
          {/* Standings */}
          {t.standings.length > 0 && (
            <div className="bg-navy border border-gold/30 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gold/20">
                <h2 className="text-gold font-bold">Standings</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/5 border-b border-gold/20">
                      <th className="text-left px-4 py-2 text-gold/80 font-semibold">#</th>
                      <th className="text-left px-4 py-2 text-gold/80 font-semibold">Pair</th>
                      <th className="text-center px-3 py-2 text-gold/80 font-semibold">MPs</th>
                      <th className="text-center px-3 py-2 text-gold/80 font-semibold">Rounds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.standings.map((s, i) => (
                      <tr key={s.pairId} className={`border-b border-gold/10 ${i === 0 && t.status === 'complete' ? 'bg-gold/5' : ''}`}>
                        <td className="px-4 py-2 text-cream/50">{i + 1}</td>
                        <td className="px-4 py-2 text-cream font-medium">
                          {i === 0 && t.status === 'complete' && <span className="mr-1">🥇</span>}
                          {s.player1Name} / {s.player2Name}
                        </td>
                        <td className="px-3 py-2 text-center text-gold font-semibold">{s.totalMatchpoints}</td>
                        <td className="px-3 py-2 text-center text-cream/50">{s.roundsPlayed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Rounds */}
          {t.rounds.map((round: SwissRound) => {
            const isCurrentRound = round.roundNumber === t.currentRound;
            return (
              <div key={round.roundNumber} className="bg-navy border border-gold/30 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gold/20 flex items-center justify-between">
                  <h2 className="text-gold font-bold">
                    Round {round.roundNumber}
                    <span className="text-cream/40 font-normal text-sm ml-2">
                      Boards {round.boardStart}–{round.boardEnd}
                    </span>
                  </h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    round.complete ? 'text-cream/40 border-white/10'
                    : isCurrentRound ? 'text-green-400 border-green-400/30 bg-green-400/10'
                    : 'text-yellow-400/60 border-yellow-400/20'
                  }`}>
                    {round.complete ? 'Complete' : isCurrentRound ? 'In Progress' : 'Pending'}
                  </span>
                </div>
                <div className="divide-y divide-gold/10">
                  {round.tables.map(table => {
                    const pair1 = t.pairs.find(p => p.pairId === table.pair1Id);
                    const pair2 = t.pairs.find(p => p.pairId === table.pair2Id);
                    const boardsThisRound = round.boardEnd - round.boardStart + 1;
                    const myTable = pair1 && pair2 && (
                      pair1.player1.userId === userId || pair1.player2?.userId === userId ||
                      pair2.player1.userId === userId || pair2.player2?.userId === userId
                    );
                    return (
                      <div key={table.tableIndex} className={`px-4 py-3 flex items-center justify-between gap-4 ${myTable ? 'bg-gold/5' : ''}`}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-cream/40 text-xs">Table {table.tableIndex + 1}</span>
                            <span className="text-cream font-medium">
                              {pair1 ? getPairName(pair1) : '?'}
                            </span>
                            <span className="text-cream/30 text-xs">NS</span>
                            <span className="text-cream/40">vs</span>
                            <span className="text-cream font-medium">
                              {pair2 ? getPairName(pair2) : '?'}
                            </span>
                            <span className="text-cream/30 text-xs">EW</span>
                          </div>
                          {!table.complete && (
                            <div className="text-xs text-cream/40 mt-0.5">
                              Board {table.boardsComplete + 1} of {boardsThisRound}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${
                            table.complete ? 'text-cream/40 border-white/10'
                            : 'text-green-400 border-green-400/30 bg-green-400/10'
                          }`}>
                            {table.complete ? 'Done' : 'Live'}
                          </span>
                          {myTable && !table.complete && table.roomCode && (
                            <button
                              onClick={() => navigate(`/game/${table.roomCode}`)}
                              className="text-gold text-xs hover:underline"
                            >
                              Go
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {t.status === 'complete' && (
            <div className="bg-navy border border-gold/30 rounded-xl p-6 text-center">
              <div className="text-4xl mb-2">🏆</div>
              <p className="text-gold font-bold text-lg">Tournament Complete!</p>
              {t.standings[0] && (
                <p className="text-cream/70 text-sm mt-1">
                  Winner: {t.standings[0].player1Name} / {t.standings[0].player2Name}
                  {' '}with {t.standings[0].totalMatchpoints} matchpoints
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
