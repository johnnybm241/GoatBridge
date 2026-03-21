import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket, initSocket } from '../socket.js';
import { useAuthStore } from '../store/authStore.js';
import { useTeamMatchStore } from '../store/teamMatchStore.js';
import api from '../api.js';
import type { TeamMatchState } from '@goatbridge/shared';

interface OpenMatch {
  matchCode: string;
  name: string;
  boardCount: number;
  team1Name: string;
  team2Name: string;
  team1Players: Array<{ userId: string; displayName: string }>;
  team2Players: Array<{ userId: string; displayName: string }>;
  createdAt: number;
}

export default function TeamMatchPage() {
  const navigate = useNavigate();
  const auth = useAuthStore();
  const teamMatchStore = useTeamMatchStore();

  const [openMatches, setOpenMatches] = useState<OpenMatch[]>([]);
  const [createName, setCreateName] = useState('');
  const [createBoardCount, setCreateBoardCount] = useState<4 | 8 | 12 | 16>(8);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Ensure socket is connected
  useEffect(() => {
    if (!auth.token) return;
    try {
      const s = getSocket();
      if (!s.connected) s.connect();
    } catch {
      initSocket(auth.token);
    }
  }, [auth.token]);

  // Fetch open matches on mount
  useEffect(() => {
    api.get<{ matches: OpenMatch[] }>('/team-matches')
      .then(r => setOpenMatches(r.data.matches))
      .catch(() => {});
  }, []);

  // If we receive a team_match_state event (from create), navigate to lobby
  useEffect(() => {
    const match = teamMatchStore.currentMatch;
    if (match) {
      navigate(`/team-matches/${match.matchCode}`);
    }
  }, [teamMatchStore.currentMatch]);

  const handleCreate = () => {
    if (!createName.trim()) { setError('Match name is required'); return; }
    setError('');
    setLoading(true);

    let socket: ReturnType<typeof getSocket>;
    try {
      socket = getSocket();
    } catch {
      socket = initSocket(auth.token!);
    }

    // Listen for response once
    const onState = (payload: { match: TeamMatchState }) => {
      teamMatchStore.setMatch(payload.match);
      setLoading(false);
      navigate(`/team-matches/${payload.match.matchCode}`);
    };
    const onError = (payload: { message: string }) => {
      setError(payload.message);
      setLoading(false);
      socket.off('team_match_state', onState);
    };

    socket.once('team_match_state', onState);
    socket.once('room_error', onError);

    socket.emit('create_team_match', { name: createName.trim(), boardCount: createBoardCount });
  };

  const handleJoin = (matchCode: string) => {
    navigate(`/team-matches/${matchCode}`);
  };

  return (
    <div className="min-h-screen bg-navy p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center pt-4">
          <h1 className="text-3xl font-bold text-gold mb-1">Team Matches</h1>
          <p className="text-cream/60 text-sm">IMP-scored head-to-head team competition</p>
        </div>

        {/* Create match */}
        <div className="bg-navy border border-gold/30 rounded-xl p-6 shadow-2xl">
          <h2 className="text-gold font-bold text-lg mb-4">Create a Team Match</h2>
          <div className="space-y-3">
            <input
              type="text"
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="Match name (e.g. Tuesday League)"
              maxLength={60}
              className="w-full bg-navy border border-gold/30 text-cream rounded-lg px-3 py-2 focus:outline-none focus:border-gold transition-colors"
            />
            <div className="flex items-center gap-3">
              <label className="text-cream/70 text-sm whitespace-nowrap">Boards:</label>
              <div className="flex gap-2">
                {([4, 8, 12, 16] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => setCreateBoardCount(n)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                      createBoardCount === n
                        ? 'bg-gold text-navy'
                        : 'bg-navy border border-gold/30 text-cream/70 hover:text-cream hover:border-gold/60'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full bg-gold hover:bg-gold/80 text-navy font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Match'}
            </button>
          </div>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </div>

        {/* Open matches */}
        <div className="bg-navy border border-gold/30 rounded-xl p-6 shadow-2xl">
          <h2 className="text-gold font-bold text-lg mb-4">Open Matches</h2>
          {openMatches.length === 0 ? (
            <p className="text-cream/40 text-sm text-center py-4">No open matches — create one above!</p>
          ) : (
            <div className="space-y-3">
              {openMatches.map(m => (
                <div
                  key={m.matchCode}
                  className="flex items-center justify-between bg-navy/60 border border-gold/20 rounded-lg px-4 py-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-gold font-bold">{m.name}</span>
                      <span className="text-cream/40 font-mono text-xs">{m.matchCode}</span>
                    </div>
                    <div className="text-cream/50 text-xs mt-0.5">
                      {m.boardCount} boards ·{' '}
                      <span className="text-cream/70">{m.team1Name}</span>
                      {' '}({m.team1Players.length}/4){' '}
                      vs{' '}
                      <span className="text-cream/70">{m.team2Name}</span>
                      {' '}({m.team2Players.length}/4)
                    </div>
                  </div>
                  <button
                    onClick={() => handleJoin(m.matchCode)}
                    className="bg-felt hover:bg-felt-light text-cream font-bold px-4 py-1.5 rounded-lg text-sm transition-colors border border-felt-light"
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
