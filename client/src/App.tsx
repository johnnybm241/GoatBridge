import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore.js';
import LoginPage from './pages/LoginPage.js';
import RegisterPage from './pages/RegisterPage.js';
import LobbyPage from './pages/LobbyPage.js';
import GamePage from './pages/GamePage.js';
import ProfilePage from './pages/ProfilePage.js';
import ShopPage from './pages/ShopPage.js';
import ConventionsPage from './pages/ConventionsPage.js';
import ConventionEditorPage from './pages/ConventionEditorPage.js';
import PartnershipsPage from './pages/PartnershipsPage.js';
import NavBar from './components/NavBar.js';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  const token = useAuthStore(s => s.token);

  return (
    <BrowserRouter>
      {token && <NavBar />}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<PrivateRoute><LobbyPage /></PrivateRoute>} />
        <Route path="/game/:roomCode" element={<PrivateRoute><GamePage /></PrivateRoute>} />
        <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
        <Route path="/shop" element={<PrivateRoute><ShopPage /></PrivateRoute>} />
        <Route path="/conventions" element={<PrivateRoute><ConventionsPage /></PrivateRoute>} />
        <Route path="/conventions/:id" element={<PrivateRoute><ConventionEditorPage /></PrivateRoute>} />
        <Route path="/partnerships" element={<PrivateRoute><PartnershipsPage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
