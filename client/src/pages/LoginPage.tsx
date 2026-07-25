import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore, setRememberMe } from '../store/authStore.js';
import { initSocket } from '../socket.js';
import api from '../api.js';

const REMEMBERED_LOGIN_KEY = 'goatbridge-remembered-login';
const LEGACY_REMEMBERED_USERNAME_KEY = 'goatbridge-remembered-username';
const LEGACY_REMEMBERED_PASSWORD_KEY = 'goatbridge-remembered-password';

function getRememberedLogin(): { username: string; password: string } | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(REMEMBERED_LOGIN_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { username?: unknown; password?: unknown };
      if (typeof parsed.username === 'string' && typeof parsed.password === 'string') {
        return { username: parsed.username, password: parsed.password };
      }
    } catch {
      // Ignore malformed remembered payload and continue to legacy fallback.
    }
  }

  const legacyUsername = localStorage.getItem(LEGACY_REMEMBERED_USERNAME_KEY);
  const legacyPassword = localStorage.getItem(LEGACY_REMEMBERED_PASSWORD_KEY);
  if (legacyUsername === null || legacyPassword === null) return null;

  const remembered = { username: legacyUsername, password: legacyPassword };
  localStorage.setItem(REMEMBERED_LOGIN_KEY, JSON.stringify(remembered));
  localStorage.removeItem(LEGACY_REMEMBERED_USERNAME_KEY);
  localStorage.removeItem(LEGACY_REMEMBERED_PASSWORD_KEY);
  return remembered;
}

export default function LoginPage() {
  const [username, setUsername] = useState(
    () => getRememberedLogin()?.username ?? '',
  );
  const [password, setPassword] = useState(
    () => getRememberedLogin()?.password ?? '',
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMeState] = useState(
    () => (typeof window !== 'undefined' ? getRememberedLogin() !== null : true),
  );
  const navigate = useNavigate();
  const setAuth = useAuthStore(s => s.setAuth);
  const setSkillPoints = useAuthStore(s => s.setSkillPoints);
  const setHandsPlayed = useAuthStore(s => s.setHandsPlayed);
  const setIsAdmin = useAuthStore(s => s.setIsAdmin);
  const setCanCreateTournament = useAuthStore(s => s.setCanCreateTournament);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/auth/login', { username, password });
      const { token, userId } = res.data as { token: string; userId: string; username: string };
      if (rememberMe) {
        localStorage.setItem(REMEMBERED_LOGIN_KEY, JSON.stringify({ username, password }));
      } else {
        localStorage.removeItem(REMEMBERED_LOGIN_KEY);
      }
      setRememberMe(rememberMe);
      setAuth(token, userId, username);
      initSocket(token);
      // Load profile data on login
      api.get<{ skillPoints: number; handsPlayed: number; isAdmin: boolean; canCreateTournament: boolean }>('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      }).then(me => {
        setSkillPoints(me.data.skillPoints);
        setHandsPlayed(me.data.handsPlayed);
        setIsAdmin(me.data.isAdmin ?? false);
        setCanCreateTournament(me.data.canCreateTournament ?? false);
      }).catch(() => {});
      navigate('/');
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy">
      <div className="bg-navy border border-gold/30 rounded-xl p-8 w-full max-w-sm shadow-2xl">
        <h1 className="text-3xl font-bold text-gold text-center mb-2">🐐 GoatBridge</h1>
        <p className="text-cream/60 text-center text-sm mb-8">Sign in to play</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-cream/80 text-sm mb-1">Username</label>
            <input
              type="text"
              name="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full bg-navy border border-gold/30 text-cream rounded-lg px-3 py-2 focus:outline-none focus:border-gold transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-cream/80 text-sm mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full bg-navy border border-gold/30 text-cream rounded-lg px-3 py-2 pr-10 focus:outline-none focus:border-gold transition-colors"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-cream/40 hover:text-cream/80 transition-colors text-sm"
                tabIndex={-1}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <label className="flex items-center gap-2 text-cream/70 text-sm select-none cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={e => setRememberMeState(e.target.checked)}
              className="accent-gold w-4 h-4"
            />
            Remember me
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold hover:bg-gold-light text-navy font-bold py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-cream/50 text-sm mt-6">
          No account?{' '}
          <Link to="/register" className="text-gold hover:text-gold-light transition-colors">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
