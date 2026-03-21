import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:3001',
      '/goats': 'http://localhost:3001',
      '/skins': 'http://localhost:3001',
      '/conventions': 'http://localhost:3001',
      '/partnerships': 'http://localhost:3001',
      '/rooms': 'http://localhost:3001',
      '/team-matches': 'http://localhost:3001',
      '/tournaments': 'http://localhost:3001',
      '/admin': 'http://localhost:3001',
      '/health': 'http://localhost:3001',
    },
  },
});
