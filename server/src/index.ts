import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { config } from './config.js';
import { runMigrations } from './db/migrate.js';
import { createSocketServer } from './socket/index.js';
import authRoutes from './auth/routes.js';
import goatRoutes from './goats/routes.js';
import skinRoutes from './skins/routes.js';
import conventionRoutes from './conventions/routes.js';
import partnershipRoutes from './partnerships/routes.js';
import roomRoutes from './rooms/routes.js';

// Run DB migrations on startup
runMigrations();

const app = express();
const httpServer = createServer(app);

const corsOrigin = config.nodeEnv === 'production'
  ? config.clientOrigin
  : /^http:\/\/localhost(:\d+)?$/;
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

// REST routes
app.use('/auth', authRoutes);
app.use('/goats', goatRoutes);
app.use('/skins', skinRoutes);
app.use('/conventions', conventionRoutes);
app.use('/partnerships', partnershipRoutes);
app.use('/rooms', roomRoutes);

app.get('/health', (_req, res) => res.json({ ok: true }));

// Socket.io
createSocketServer(httpServer);

httpServer.listen(config.port, () => {
  console.log(`GoatBridge server running on port ${config.port}`);
});
