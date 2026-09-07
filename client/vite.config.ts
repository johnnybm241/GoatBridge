import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = 'http://localhost:3001';

// Several API prefixes collide with client-side page routes (/friends,
// /players, /history, ...). Only proxy non-navigation requests so that
// visiting those URLs directly still loads the SPA.
const apiPrefixes = [
  '/auth',
  '/goats',
  '/skins',
  '/conventions',
  '/partnerships',
  '/rooms',
  '/team-matches',
  '/tournaments',
  '/admin',
  '/history',
  '/friends',
  '/players',
  '/health',
];

const proxy = Object.fromEntries(
  apiPrefixes.map(prefix => [
    prefix,
    {
      target: API_TARGET,
      changeOrigin: true,
      bypass(req: { headers: Record<string, string | string[] | undefined> }) {
        const accept = String(req.headers.accept ?? '');
        return accept.includes('text/html') ? '/index.html' : undefined;
      },
    },
  ]),
);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy,
  },
});
