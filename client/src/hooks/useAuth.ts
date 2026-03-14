import { useAuthStore } from '../store/authStore.js';
import { useNavigate } from 'react-router-dom';
import { disconnectSocket } from '../socket.js';

export function useAuth() {
  const { token, userId, username, goatBalance, activeCardBackSkin, setAuth, logout, setGoatBalance, setSkin } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    disconnectSocket();
    navigate('/login');
  };

  return {
    token,
    userId,
    username,
    goatBalance,
    activeCardBackSkin,
    isAuthenticated: !!token,
    setAuth,
    logout: handleLogout,
    setGoatBalance,
    setSkin,
  };
}
