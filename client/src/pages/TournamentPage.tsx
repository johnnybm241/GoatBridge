import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api.js';
import { useAuthStore } from '../store/authStore.js';
import { useTournamentStore } from '../store/tournamentStore.js';
import { getSocket } from '../socket.js';
import type { TournamentState } from '@goatbridge/shared';

export default function TournamentPage() {
  const navigate = useNavigate();
  const canCreate = useAuthStore(s => s.canCreateTournament);
  const [tournaments, setTournaments] = useState<TournamentState[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [totalBoards, setTotalBoards] = useState(16);
  const [boardsPerRound, setBoardsPerRound] = useState(4);
  const [entryFee, setEntryFee] = useState(0);
  const [error, setError] = useState('');
  const setTournament = useTournamentStore(s => s.setTournament);

  useEffect(() => {
    api.get<{ tournaments: TournamentState[] }>('/tournaments')
      .then(res => setTournaments(res.data.tournaments))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (totalBoards < 2 || totalBoards > 100) { setError('Total boards must be between 2 and 100'); return; }
    if (boardsPerRound < 2 || boardsPerRound > totalBoards) { setError('Boards per round must be between 2 and total boards'); return; }
    setCreating(true);
    setError('');
    try {
      const socket = getSocket();
      socket.once('tournament_state', (payload) => {
        setTournament(payload.tournament);
        setCreating(false);
        navigate(`/tournaments/${payload.tournament.tournamentCode}`);
      });
      socket.emit('create_tournament', { name: name.trim(), totalBoards, boardsPerRound, entryFee });
      setTimeout(() => setCreating(false), 5000);
    } catch {
      setError('Not connected. Please refresh.');
      setCreating(false);
    }
  };

  const handleJoin = (code: string) => {
    navigate(`/tournaments/${code}`);
  };

  const estimatedRounds = (t: TournamentState) =>
    Math.ceil(t.totalBoards / t.boardsPerRound);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🏆</span>
          <h1 className="text-2xl font-bold text-gold">Tournaments</h1>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowForm(f => !f)}
            className="bg-gold hover:bg-gold-light text-navy font-bold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            {showForm ? 'Cancel' : '+ New Tournament'}
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && canCreate && (
        <div className="bg-navy border border-gold/30 rounded-xl p-5 mb-6">
          <h2 className="text-gold font-bold mb-4">Create Swiss Pairs Tournament</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-cream/80 text-sm mb-1">Tournament Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Spring Open 2026"
                className="w-full bg-navy border border-gold/30 text-cream rounded-lg px-3 py-2 focus:outline-none focus:border-gold transition-colors text-sm"
                maxLength={60}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-cream/80 text-sm mb-1">Total Boards</label>
                <input
                  type="number"
                  min={2}
                  max={100}
                  value={totalBoards}
                  onChange={e => setTotalBoards(Math.max(2, Math.min(100, Number(e.target.value) || 2)))}
                  className="w-full bg-navy border border-gold/30 text-cream rounded-lg px-3 py-2 focus:outline-none focus:border-gold transition-colors text-sm"
                />
              </div>
              <div>
                <label className="block text-cream/80 text-sm mb-1">Boards per Round</label>
                <input
                  type="number"
                  min={2}
                  max={16}
                  value={boardsPerRound}
                  onChange={e => setBoardsPerRound(Math.max(2, Math.min(16, Number(e.target.value) || 2)))}
                  className="w-full bg-navy border border-gold/30 text-cream rounded-lg px-3 py-2 focus:outline-none focus:border-gold transition-colors text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-cream/80 text-sm mb-1">Entry Fee 🐐 <span className="text-cream/40 font-normal">(0 = free)</span></label>
              <input
                type="number"
                min={0}
                max={10000}
                value={entryFee}
                onChange={e => setEntryFee(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                className="w-full bg-navy border border-gold/30 text-cream rounded-lg px-3 py-2 focus:outline-none focus:border-gold transition-colors text-sm"
              />
              {entryFee > 0 && (
                <p className="text-cream/40 text-xs mt-1">Players will be charged {entryFee} Goats to enter. Refunded automatically if the tournament is cancelled.</p>
              )}
            </div>
            {totalBoards >= 2 && boardsPerRound >= 2 && (
              <p className="text-cream/40 text-xs">
                {Math.ceil(totalBoards / boardsPerRound)} round{Math.ceil(totalBoards / boardsPerRound) !== 1 ? 's' : ''} estimated
              </p>
            )}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={handleCreate}
              disabled={creating}
              className="bg-gold hover:bg-gold-light text-navy font-bold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create Tournament'}
            </button>
          </div>
        </div>
      )}

      {/* Tournament list */}
      {loading ? (
        <div className="text-cream/40 text-sm text-center py-8">Loading tournaments…</div>
      ) : tournaments.length === 0 ? (
        <div className="bg-navy border border-gold/30 rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">🏆</div>
          <p className="text-cream/60 text-sm">No open tournaments yet.</p>
          {canCreate && <p className="text-cream/40 text-xs mt-1">Click "New Tournament" to create one.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {tournaments.map(t => (
            <div key={t.tournamentCode} className="bg-navy border border-gold/30 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-cream font-semibold">{t.name}</div>
                <div className="text-cream/50 text-xs mt-0.5">
                  Swiss Pairs &middot; {t.totalBoards} boards &middot; {t.boardsPerRound}/round ({estimatedRounds(t)} rounds) &middot; {t.pairs?.length ?? 0} pairs
                  {t.entryFee > 0 && <span className="text-gold"> &middot; {t.entryFee} 🐐 entry</span>}
                  {' '}&middot; <span className={
                    t.status === 'setup' ? 'text-yellow-400'
                    : t.status === 'in_progress' ? 'text-green-400'
                    : 'text-cream/30'
                  }>{t.status === 'setup' ? 'Setup' : t.status === 'in_progress' ? 'In Progress' : 'Complete'}</span>
                </div>
              </div>
              <button
                onClick={() => handleJoin(t.tournamentCode)}
                className="bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors"
              >
                View
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
