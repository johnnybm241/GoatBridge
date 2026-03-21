import { useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSocket, initSocket } from '../socket.js';
import { useAuthStore } from '../store/authStore.js';
import { useTeamMatchStore } from '../store/teamMatchStore.js';
import type { TeamMatchStartedPayload } from '@goatbridge/shared';

export default function TeamMatchLobbyPage() {
  const { matchCode } = useParams<{ matchCode: string }>();
  const navigate = useNavigate();
  const auth = useAuthStore();
  const { currentMatch, setMatch, clearMatch } = useTeamMatchStore();

  const getOrInitSocket = useCallback(() => {
    try {
      return getSocket();
    } catch {
      return initSocket(auth.token!);
    }
  }, [auth.token]);

  // On mount: join the team match lobby via socket
  useEffect(() => {
    if (!matchCode) return;
    const socket = getOrInitSocket();
    if (!socket.connected) socket.connect();

    socket.emit('join_team_match', { matchCode });

    // Listen for team_match_started in this component specifically
    const onStarted = (payload: TeamMatchStartedPayload) => {
      if (payload.matchCode !== matchCode) return;
      navigate(`/game/${payload.yourRoomCode}`);
    };
    socket.on('team_match_started', onStarted);

    return () => {
      socket.off('team_match_started', onStarted);
      socket.emit('leave_team_match', { matchCode });
      clearMatch();
    };
  }, [matchCode]);

  const handleJoinTeam = (team: 1 | 2) => {
    if (!matchCode) return;
    const socket = getOrInitSocket();
    socket.emit('join_team', { matchCode, team });
  };

  const handleStartMatch = () => {
    if (!matchCode) return;
    const socket = getOrInitSocket();
    socket.emit('start_team_match', { matchCode });
  };

  if (!currentMatch || currentMatch.matchCode !== matchCode) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="text-cream/50">Loading match...</div>
      </div>
    );
  }

  const match = currentMatch;
  const isHost = match.hostUserId === auth.userId;
  const isInTeam1 = match.team1Players.some(p => p.userId === auth.userId);
  const isInTeam2 = match.team2Players.some(p => p.userId === auth.userId);
  const canStart = isHost && match.team1Players.length >= 1 && match.team2Players.length >= 1;

  const renderTeamSlots = (players: Array<{ userId: string; displayName: string }>, maxSlots: number = 4) => {
    const slots = [];
    for (let i = 0; i < maxSlots; i++) {
      const player = players[i];
      slots.push(
        <div
          key={i}
          className={`px-3 py-2 rounded-lg text-sm ${
            player
              ? 'bg-felt/30 border border-felt-light/40 text-cream'
              : 'border border-gold/10 text-cream/20 italic'
          }`}
        >
          {player ? (
            <span className="flex items-center gap-2">
              <span className="text-gold/60 text-xs font-mono">{['N', 'S', 'E', 'W'][i]}</span>
              {player.displayName}
              {player.userId === auth.userId && (
                <span className="text-gold text-xs ml-auto">(you)</span>
              )}
            </span>
          ) : (
            'Open seat'
          )}
        </div>
      );
    }
    return slots;
  };

  const formatSigned = (score: number | null) => {
    if (score === null) return '—';
    return score >= 0 ? `+${score}` : `${score}`;
  };

  const formatImps = (imps: number | null) => {
    if (imps === null) return '—';
    if (imps > 0) return <span className="text-green-400">+{imps}</span>;
    if (imps < 0) return <span className="text-red-400">{imps}</span>;
    return <span className="text-cream/50">0</span>;
  };

  return (
    <div className="min-h-screen bg-navy p-4">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Header */}
        <div className="text-center pt-2">
          <h1 className="text-2xl font-bold text-gold">{match.name}</h1>
          <p className="text-cream/50 text-sm font-mono mt-0.5">{match.matchCode} · {match.boardCount} boards</p>
          <div className="mt-1">
            {match.status === 'lobby' && (
              <span className="text-cream/40 text-xs uppercase tracking-wider">Waiting for players</span>
            )}
            {match.status === 'in_progress' && (
              <span className="text-yellow-400 text-xs uppercase tracking-wider">In Progress</span>
            )}
            {match.status === 'complete' && (
              <span className="text-green-400 text-xs uppercase tracking-wider">Complete</span>
            )}
          </div>
        </div>

        {/* Teams */}
        <div className="grid grid-cols-2 gap-4">
          {/* Team 1 */}
          <div className="bg-navy border border-gold/30 rounded-xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-gold font-bold">{match.team1Name}</h2>
              {match.status === 'lobby' && !isInTeam1 && (
                <button
                  onClick={() => handleJoinTeam(1)}
                  className="bg-gold/20 hover:bg-gold/30 text-gold text-xs font-bold px-3 py-1 rounded-lg transition-colors border border-gold/40"
                >
                  Join
                </button>
              )}
              {isInTeam1 && (
                <span className="text-gold/50 text-xs">Your team</span>
              )}
            </div>
            <div className="space-y-1.5">
              {renderTeamSlots(match.team1Players)}
            </div>
            {match.status !== 'lobby' && (
              <div className="mt-3 text-center">
                <span className="text-2xl font-bold text-cream">{match.totalImpsTeam1}</span>
                <span className="text-cream/40 text-xs ml-1">IMPs</span>
              </div>
            )}
          </div>

          {/* Team 2 */}
          <div className="bg-navy border border-gold/30 rounded-xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-gold font-bold">{match.team2Name}</h2>
              {match.status === 'lobby' && !isInTeam2 && (
                <button
                  onClick={() => handleJoinTeam(2)}
                  className="bg-gold/20 hover:bg-gold/30 text-gold text-xs font-bold px-3 py-1 rounded-lg transition-colors border border-gold/40"
                >
                  Join
                </button>
              )}
              {isInTeam2 && (
                <span className="text-gold/50 text-xs">Your team</span>
              )}
            </div>
            <div className="space-y-1.5">
              {renderTeamSlots(match.team2Players)}
            </div>
            {match.status !== 'lobby' && (
              <div className="mt-3 text-center">
                <span className="text-2xl font-bold text-cream">{match.totalImpsTeam2}</span>
                <span className="text-cream/40 text-xs ml-1">IMPs</span>
              </div>
            )}
          </div>
        </div>

        {/* Start button (host only, lobby status) */}
        {isHost && match.status === 'lobby' && (
          <div className="text-center">
            <button
              onClick={handleStartMatch}
              disabled={!canStart}
              className="bg-gold hover:bg-gold/80 text-navy font-bold px-8 py-3 rounded-xl text-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
            >
              Start Match
            </button>
            {!canStart && (
              <p className="text-cream/40 text-xs mt-2">Both teams need at least 1 player to start</p>
            )}
          </div>
        )}

        {/* Board results table */}
        {(match.status === 'in_progress' || match.status === 'complete') && match.boardResults.length > 0 && (
          <div className="bg-navy border border-gold/30 rounded-xl p-4 shadow-xl">
            <h2 className="text-gold font-bold mb-3">Board Results</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-cream/40 text-xs border-b border-gold/20">
                    <th className="text-left pb-2 font-normal">Board</th>
                    <th className="text-right pb-2 font-normal">T1 NS</th>
                    <th className="text-right pb-2 font-normal">T2 NS</th>
                    <th className="text-right pb-2 font-normal">IMPs</th>
                  </tr>
                </thead>
                <tbody>
                  {[...match.boardResults]
                    .sort((a, b) => a.boardNumber - b.boardNumber)
                    .map(r => (
                      <tr key={r.boardNumber} className="border-b border-gold/10">
                        <td className="py-1.5 text-cream/60 font-mono text-xs">#{r.boardNumber}</td>
                        <td className="py-1.5 text-right text-cream/80">{formatSigned(r.t1NsSigned)}</td>
                        <td className="py-1.5 text-right text-cream/80">{formatSigned(r.t2NsSigned)}</td>
                        <td className="py-1.5 text-right font-bold">{formatImps(r.impsTeam1)}</td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gold/30">
                    <td colSpan={3} className="pt-2 text-cream/60 font-semibold text-xs">Total IMPs</td>
                    <td className="pt-2 text-right font-bold text-cream">
                      {match.totalImpsTeam1} – {match.totalImpsTeam2}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Final result banner */}
        {match.status === 'complete' && (
          <div className="bg-navy border border-gold/50 rounded-xl p-6 shadow-2xl text-center">
            <h2 className="text-2xl font-bold text-gold mb-2">Match Complete!</h2>
            <div className="flex items-center justify-center gap-6 text-xl font-bold text-cream mb-2">
              <span className={match.totalImpsTeam1 > match.totalImpsTeam2 ? 'text-green-400' : ''}>
                {match.team1Name}: {match.totalImpsTeam1}
              </span>
              <span className="text-cream/30">vs</span>
              <span className={match.totalImpsTeam2 > match.totalImpsTeam1 ? 'text-green-400' : ''}>
                {match.team2Name}: {match.totalImpsTeam2}
              </span>
            </div>
            {match.totalImpsTeam1 === match.totalImpsTeam2 ? (
              <p className="text-cream/60">It's a tie!</p>
            ) : (
              <p className="text-green-400 font-semibold">
                {match.totalImpsTeam1 > match.totalImpsTeam2 ? match.team1Name : match.team2Name} wins!
              </p>
            )}
          </div>
        )}

        {/* Info for non-host during lobby */}
        {!isHost && match.status === 'lobby' && (
          <p className="text-center text-cream/30 text-xs">
            Waiting for the host to start the match...
          </p>
        )}
      </div>
    </div>
  );
}
