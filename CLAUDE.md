# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**GoatBridge** — A Contract Bridge (rubber bridge) web app with real-time multiplayer.

- **Version**: 1.0.0
- **Stack**: React + Vite (client), Node.js + Express (server), Socket.io, SQLite + Drizzle ORM, JWT auth
- **Language**: TypeScript throughout, npm workspaces monorepo

## Project Structure

```
GoatBridge/
├── package.json            # Root workspace (concurrently dev script)
├── tsconfig.base.json      # Shared strict TS config
├── .env.example
├── shared/                 # @goatbridge/shared — shared types + socket events (no runtime deps)
│   └── src/
│       ├── types/          # card, bidding, game, scoring, room, conventions
│       └── events/         # client-to-server, server-to-client socket event interfaces
├── server/
│   └── src/
│       ├── index.ts        # Express + Socket.io entry point
│       ├── config.ts       # Env vars (dotenv)
│       ├── db/             # Drizzle ORM schema + inline migrations
│       ├── auth/           # JWT + bcrypt (routes, middleware, service)
│       ├── rooms/          # In-memory room manager + REST routes
│       ├── game/           # Core game logic (stateMachine, deck, bidding, cardPlay, scoring)
│       ├── ai/             # SAYC bidder + heuristic card selector
│       ├── goats/          # Goat virtual currency service + routes
│       ├── skins/          # Card back skin routes
│       ├── conventions/    # Convention card CRUD routes
│       ├── partnerships/   # Partnership routes
│       └── socket/         # Socket.io handlers (room, game, broadcaster)
└── client/
    └── src/
        ├── App.tsx         # Router + private routes
        ├── socket.ts       # Socket.io client singleton
        ├── api.ts          # Axios with JWT interceptor
        ├── version.ts      # APP_VERSION constant
        ├── store/          # Zustand: authStore, gameStore
        ├── hooks/          # useAuth, useSocket (event wiring), useGameState
        ├── pages/          # Login, Register, Lobby, Game, Profile, Shop, Conventions, Partnerships
        └── components/
            ├── game/       # BridgeTable, Hand, Card, BiddingBox, TrickArea, Scoreboard, etc.
            ├── chat/       # RoomChat
            └── admin/      # HostAdminPanel
```

## Development Commands

```bash
# Install all dependencies (from root)
npm install

# Run server + client concurrently
npm run dev

# Run server only (port 3001)
npm run dev --workspace=server

# Run client only (port 5173)
npm run dev --workspace=client

# Run server unit tests
npm run test --workspace=server

# DB is auto-created at ./data/goatbridge.db on first run
```

## Environment Setup

```bash
cp .env.example .env
# Edit .env:
# JWT_SECRET=<random secret>
# PORT=3001  (default)
# CLIENT_ORIGIN=http://localhost:5173  (default)
# DATABASE_PATH=./data/goatbridge.db  (default)
```

## Architecture Notes

- **Game state** is in-memory (`Map<roomCode, GameRoom>`) in `server/src/rooms/roomManager.ts`
- **Hand privacy**: dealt hands server-only; each player receives only their 13 cards via their personal socket on `game_started`
- **AI bots**: SAYC decision tree for bidding; heuristic card play; actions delayed 800–1500ms
- **Disconnect handling**: 60-second countdown → bot replaces → host can approve human return
- **Undo**: one-level undo snapshot; unanimous human consent required (AI bots auto-approve)
- **Goat economy**: virtual currency earned on hands/rubber, spent on skins

## Key Entry Points

| File | Purpose |
|---|---|
| `server/src/game/stateMachine.ts` | Core FSM: bidding → playing → scoring transitions |
| `server/src/game/scoring.ts` | Full rubber bridge scoring |
| `server/src/socket/gameHandlers.ts` | `make_bid` + `play_card` socket handlers |
| `server/src/socket/roomHandlers.ts` | Room join/create/bot/disconnect handlers |
| `client/src/components/game/BridgeTable.tsx` | Main table layout component |
| `client/src/hooks/useSocket.ts` | Wires socket events → Zustand gameStore |
| `shared/src/events/` | Canonical socket event type contracts |

## Tests (Vitest)

```bash
npm run test --workspace=server
```

Pure game logic tests: `deck.test.ts`, `bidding.test.ts`, `cardPlay.test.ts`, `scoring.test.ts`

## Future: AI Training Mode

Stub hooks are ready:
- Add `server/src/training/` with `POST /training/analyze-hand` → proxies Claude API
- Add `client/src/pages/TrainingPage.tsx` for post-hand chat
- `game_hands` table stores `deal_json`, `bidding_json`, `play_json` for training context
