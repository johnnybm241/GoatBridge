import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api.js';
import { getSocket, initSocket } from '../socket.js';
import { useAuthStore } from '../store/authStore.js';
import { getRank } from '@goatbridge/shared';
import type { PlayerProfile } from '@goatbridge/shared';

export default function PlayerProfilePage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const auth = useAuthStore();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!username) return;
    setLoading(true);
    api.get<PlayerProfile>(`/players/${encodeURIComponent(username)}`)
      .then(r => { setProfile(r.data); setError(''); })
      .catch(() => setError('Player not found'))
      .finally(() => setLoading(false));
  }, [username]);

  useEffect(() => { load(); }, [load]);

  const sendRequest = () => {
    if (!username || busy) return;
    setBusy(true);
    api.post('/friends/request', { username })
      .then(load)
      .catch(err => setError(err.response?.data?.error ?? 'Failed to send request'))
      .finally(() => setBusy(false));
  };

  const respondRequest = (accept: boolean) => {
    if (!profile?.friendRequestId || busy) return;
    setBusy(true);
    api.post(`/friends/${profile.friendRequestId}/${accept ? 'accept' : 'decline'}`)
      .then(load)
      .finally(() => setBusy(false));
  };

  const cancelRequest = () => {
    if (!profile?.friendRequestId || busy) return;
    setBusy(true);
    api.delete(`/friends/requests/${profile.friendRequestId}`)
      .then(load)
      .finally(() => setBusy(false));
  };

  const removeFriend = () => {
    if (!profile || busy) return;
    setBusy(true);
    api.delete(`/friends/${profile.userId}`)
      .then(load)
      .finally(() => setBusy(false));
  };

  const watchTable = () => {
    if (!profile?.presence || busy) return;
    const roomCode = profile.presence.roomCode;
    setBusy(true);
    let socket: ReturnType<typeof getSocket>;
    try {
      socket = getSocket();
      if (!socket.connected) socket.connect();
    } catch {
      socket = initSocket(auth.token!);
    }
    const onJoined = (payload: { roomCode: string }) => {
      socket.off('room_error', onError);
      setBusy(false);
      navigate(`/game/${payload.roomCode}`);
    };
    const onError = (payload: { message: string }) => {
      socket.off('room_joined', onJoined);
      setBusy(false);
      setError(payload.message);
    };
    socket.once('room_joined', onJoined);
    socket.once('room_error', onError);
    socket.emit('join_room', { roomCode, spectate: true });
  };

  if (loading) return <div className="max-w-2xl mx-auto p-6 text-cream/50">Loading…</div>;
  if (!profile) return <div className="max-w-2xl mx-auto p-6 text-red-400">{error || 'Player not found'}</div>;

  const rank = getRank(profile.bleats);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gold mb-6">Player Profile</h1>

      <div className="bg-navy border border-gold/30 rounded-xl p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-felt flex items-center justify-center text-3xl shrink-0">
            {rank.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xl font-bold text-cream">{profile.username}</div>
            <div className="font-bold text-lg" style={{ color: rank.color }}>{rank.name}</div>
            <div className="text-cream/60 text-sm">{profile.handsPlayed} boards played</div>
            <div className="text-gold/80 text-sm mt-1">{profile.bleats.toLocaleString()} Bleats</div>
          </div>

          <div className="shrink-0">
            {profile.friendshipStatus === 'self' && (
              <span className="text-cream/40 text-sm">This is you</span>
            )}
            {profile.friendshipStatus === 'none' && (
              <button
                onClick={sendRequest}
                disabled={busy}
                className="bg-gold text-navy font-semibold text-sm px-3 py-1.5 rounded-lg hover:bg-gold/90 transition-colors disabled:opacity-50"
              >
                Add Friend
              </button>
            )}
            {profile.friendshipStatus === 'pending_sent' && (
              <button
                onClick={cancelRequest}
                disabled={busy}
                className="bg-white/10 text-cream/70 text-sm px-3 py-1.5 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
              >
                Cancel Request
              </button>
            )}
            {profile.friendshipStatus === 'pending_received' && (
              <div className="flex gap-2">
                <button
                  onClick={() => respondRequest(true)}
                  disabled={busy}
                  className="bg-green-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-green-500 transition-colors disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  onClick={() => respondRequest(false)}
                  disabled={busy}
                  className="bg-white/10 text-cream/70 text-sm px-3 py-1.5 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            )}
            {profile.friendshipStatus === 'friends' && (
              <div className="flex flex-col items-end gap-1">
                <span className="text-green-400 text-sm font-semibold">✓ Friends</span>
                <button
                  onClick={removeFriend}
                  disabled={busy}
                  className="text-cream/40 hover:text-red-400 text-xs transition-colors disabled:opacity-50"
                >
                  Remove Friend
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-navy border border-gold/30 rounded-xl p-6">
        <h2 className="text-gold font-bold mb-4">Currently Playing</h2>
        {profile.presence ? (
          <div>
            <div className="text-cream mb-2">
              Table <span className="font-mono font-bold text-gold">{profile.presence.roomCode}</span>
              {profile.presence.isSpectator ? ' (spectating)' : profile.presence.seat ? ` — seated ${profile.presence.seat}` : ''}
              <span className="text-cream/50"> · {profile.presence.phase}</span>
            </div>
            {profile.presence.occupants.length > 0 && (
              <div className="text-cream/70 text-sm mb-3">
                With: {profile.presence.occupants.map(o => `${o.displayName || o.seat}${o.isAI ? ' (Bot)' : ''}`).join(', ')}
              </div>
            )}
            {!profile.presence.isSpectator && profile.presence.kibitzingAllowed && (
              <button
                onClick={watchTable}
                disabled={busy}
                className="bg-gold text-navy font-semibold text-sm px-4 py-2 rounded-lg hover:bg-gold/90 transition-colors disabled:opacity-50"
              >
                Watch Table
              </button>
            )}
            {!profile.presence.isSpectator && !profile.presence.kibitzingAllowed && (
              <div className="text-cream/40 text-sm">Spectating is disabled for this table.</div>
            )}
          </div>
        ) : (
          <div className="text-cream/50 text-sm">Not currently at a table.</div>
        )}
      </div>

      {error && <div className="text-red-400 text-sm mt-4">{error}</div>}

      <Link to="/friends" className="inline-block mt-6 text-cream/50 hover:text-cream text-sm transition-colors">
        ← Back to Friends
      </Link>
    </div>
  );
}
