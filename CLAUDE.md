# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

SecureDesk Pro is a web-based remote desktop platform (like TeamViewer). Viewers connect via browser (no install), hosts share their screen via `getDisplayMedia`, and all streaming is P2P over WebRTC. Socket.IO handles signaling. An optional Electron agent provides a native host experience.

## Monorepo Layout

- **pnpm workspaces + Turborepo** — pnpm 9.15+, Node >= 20
- `apps/web/` — Next.js 15 App Router (port 3000)
- `apps/agent/` — Electron desktop agent (electron-vite)
- `server/signaling/` — Express + Socket.IO standalone signaling server (port 3001)
- `server/input-proxy/` — WebSocket server using koffi FFI → Windows user32.dll for mouse/keyboard (port 3002)
- `packages/shared/` — Shared TypeScript types and constants (consumed as raw .ts, no build step)
- `infrastructure/` — Docker Compose for PostgreSQL 16 + Redis 7

## Commands

### Root (Turborepo)

```
pnpm dev            # all packages in dev mode
pnpm build          # build all
pnpm lint           # lint all
pnpm type-check     # type-check all
pnpm format         # prettier
pnpm clean          # remove build outputs
```

### Per-package

```
pnpm --filter web dev              # Next.js dev → localhost:3000
pnpm --filter web build            # Next.js build
pnpm --filter web type-check       # tsc --noEmit
pnpm --filter signaling dev        # tsx watch → localhost:3001
pnpm --filter signaling type-check
pnpm --filter input-proxy dev      # tsx watch → localhost:3002
pnpm --filter input-proxy type-check
pnpm --filter agent dev            # electron-vite dev
```

### Database

```
docker-compose -f infrastructure/docker-compose.yml up   # PostgreSQL + Redis
pnpm db:generate    # prisma generate
pnpm db:push        # prisma db push
pnpm db:studio      # prisma studio
```

### Full local dev (remote control testing)

Run in separate terminals: `docker-compose up`, `pnpm --filter signaling dev`, `pnpm --filter web dev`, `pnpm --filter input-proxy dev`.

## Architecture

### WebRTC Roles

**Viewer = offerer** (creates data channels + SDP offer). **Host = answerer**. This means `ondatachannel` only fires on the host. The viewer must manually emit its own channels via the `onDataChannel` callback after creating them.

### Data Channels

Three channels created by the viewer: `input` (ordered — mouse/keyboard/clipboard), `file` (unordered — chunked file transfer, 16KB chunks), `chat` (ordered — text messages).

### Remote Control Flow

Viewer captures mouse/keyboard → WebRTC `input` data channel → Host browser receives → WebSocket to input-proxy (localhost:3002) → koffi FFI calls `user32.dll` (`SetCursorPos`, `mouse_event`, `keybd_event`). Mouse coordinates are normalized 0.0–1.0 by the viewer; the input proxy maps to screen pixels via `GetSystemMetrics`.

### Signaling Manager Singleton

`apps/web/lib/webrtc/signaling-manager.ts` is a module-level singleton that preserves the Socket.IO connection across Next.js page navigations (home → session page). Use `signalingManager.rebindEvents()` to swap callbacks without disconnecting.

### Shared Package

`@securedesk/shared` exposes raw TypeScript (`"main": "./src/index.ts"`). The web app uses `transpilePackages: ['@securedesk/shared']` in `next.config.ts`. No build step needed.

### Signaling Events

All event names are constants in `packages/shared/src/constants/events.ts` (`SIGNALING_EVENTS`). Type contracts in `packages/shared/src/types/signaling.ts`.

### Electron Agent

Uses a hidden `BrowserWindow` for WebRTC (RTCPeerConnection requires Chromium renderer). Main process gets screen source via `desktopCapturer`, relays signaling over IPC to the hidden renderer.

## Gotchas

- **Path alias**: `@/*` in `apps/web` maps to `./` (the `apps/web/` directory), NOT `./src/`. There is no `src/` directory.
- **Tailwind 4**: CSS-first config in `apps/web/app/globals.css` using `@import 'tailwindcss'` + `@theme {}`. No `tailwind.config.js`.
- **Dark mode**: Hardcoded `<html class="dark">` in `apps/web/app/layout.tsx`.
- **Glassmorphism design system**: CSS custom properties (`--glass-bg`, `--glass-blur`, etc.) in `globals.css`. Use `.glass` and `.glass-card` utility classes.
- **NextAuth v5**: Must destructure via intermediate variable (`const result = NextAuth(config)`). Prisma adapter requires `PrismaAdapter(prisma) as any` cast.
- **`@nut-tree/nut-js`**: v4 is commercial/unavailable on npm — listed in `optionalDependencies` in agent. Web-mode uses input-proxy + koffi instead.
- **ICE candidate buffering**: Candidates received before `setRemoteDescription()` are queued in `PeerConnection.pendingCandidates[]` and flushed after.
- **Mouse event deduplication**: Input proxy skips synthetic `click`/`dblclick`/`contextmenu` if a `mouseup` was processed within the last 150ms.
- **Signaling URL auto-detection**: `SignalingClient` uses `http://${window.location.hostname}:3001` by default. Override with `NEXT_PUBLIC_SIGNALING_URL`.
- **Auto-reconnect**: Exponential backoff (1s→16s, max 5 attempts) on WebRTC `connectionState === 'failed'`.

## Build Status

Phases 1–3 (Foundation + Signaling + WebRTC/Remote Control) are complete. `pnpm --filter web build`, `pnpm --filter signaling type-check`, and `pnpm --filter input-proxy type-check` all pass.
