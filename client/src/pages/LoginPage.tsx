import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/authStore.js';
import { initSocket } from '../socket.js';
import api from '../api.js';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-navy border border-gold/30 text-cream rounded-lg px-3 py-2 focus:outline-none focus:border-gold transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-cream/80 text-sm mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
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
