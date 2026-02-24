# SecureDesk Pro — Implementation Plan

## Context

SecureDesk Pro is a **web-based remote desktop platform** with a lightweight desktop agent. The viewer connects via browser (zero install), the host runs a ~15 MB Electron agent. WebRTC handles P2P encrypted streaming, Next.js 15 powers the web app, Socket.IO handles signaling, and Electron + nut.js powers the desktop agent.

**Current state:** The `D:\pcconnect` directory is completely empty — this is a greenfield build.

**Reference:** All implementation decisions must align with `docs/PROJECT_DOCUMENT.md` (the canonical spec).

---

## Critical Architecture Files (Must Get Right First)

| File | Why Critical |
|------|-------------|
| `apps/web/prisma/schema.prisma` | Data model for entire system — every API/dashboard depends on it |
| `packages/shared/src/types/signaling.ts` | Contract between web, signaling server, and agent — single source of truth |
| `server/signaling/src/index.ts` | Central coordination for all real-time communication |
| `apps/agent/src/main/index.ts` | Most complex file — integrates native APIs with web protocols |
| `apps/web/src/lib/webrtc/peer-connection.ts` | Browser-side WebRTC — determines quality of remote desktop experience |

---

## Tech Stack Validation Notes

| Component | Status | Notes |
|-----------|--------|-------|
| Next.js 15 + Tailwind 4 + shadcn/ui | **GO** | Tailwind 4 uses CSS-first config (no tailwind.config.js) |
| NextAuth.js v5 | **GO** | Install `next-auth@beta`, new root-level config pattern |
| Socket.IO (signaling) | **GO** | Fully compatible with Next.js 15 App Router |
| Electron 33 + nut.js | **GO** | Requires `@electron/rebuild` for native modules |
| WebRTC in Electron | **CAUTION** | Use `electron-webrtc` wrapper, NOT raw `wrtc` package |
| Prisma + pnpm workspaces | **GO** | Official support, centralize schema in shared package |
| electron-builder | **GO** | Recommended over electron-forge for cross-platform builds |

---

## Phase 1: Foundation (Week 1–2)

### Goal
Monorepo scaffold, Next.js app, auth system, database, and glassmorphism UI shell.

### Step 1.1 — Monorepo Initialization
```
Files to create:
  D:\pcconnect\package.json              (root workspace config)
  D:\pcconnect\pnpm-workspace.yaml       (workspace definition)
  D:\pcconnect\turbo.json                (Turborepo task pipeline)
  D:\pcconnect\.gitignore                (comprehensive ignore rules)
  D:\pcconnect\.npmrc                    (pnpm config)
  D:\pcconnect\tsconfig.base.json        (shared TS config)
```
- Initialize git repo
- Configure pnpm workspaces: `apps/*`, `packages/*`, `server/*`
- Turborepo pipelines: `build`, `dev`, `lint`, `type-check`, `db:generate`

### Step 1.2 — Shared Package
```
Files to create:
  packages/shared/package.json
  packages/shared/tsconfig.json
  packages/shared/src/types/signaling.ts     (Socket.IO event types)
  packages/shared/src/types/webrtc.ts        (WebRTC message types)
  packages/shared/src/types/api.ts           (API response types)
  packages/shared/src/constants/events.ts    (event name constants)
  packages/shared/src/constants/config.ts    (shared configuration)
  packages/shared/src/index.ts               (barrel export)
```

### Step 1.3 — Next.js 15 Web App Scaffold
```
Files to create:
  apps/web/package.json
  apps/web/next.config.ts
  apps/web/tsconfig.json
  apps/web/postcss.config.mjs
  apps/web/app/layout.tsx                    (root layout + providers)
  apps/web/app/globals.css                   (Tailwind 4 CSS-first config + glassmorphism tokens)
  apps/web/app/page.tsx                      (landing page)
  apps/web/app/(auth)/login/page.tsx
  apps/web/app/(auth)/register/page.tsx
  apps/web/app/(dashboard)/layout.tsx
  apps/web/app/(dashboard)/page.tsx
  apps/web/app/(dashboard)/connect/page.tsx
  apps/web/app/(dashboard)/devices/page.tsx
  apps/web/app/(dashboard)/history/page.tsx
  apps/web/app/(dashboard)/settings/page.tsx
  apps/web/components/ui/                    (shadcn/ui components)
  apps/web/components/shared/glass-card.tsx
  apps/web/components/shared/animated-bg.tsx
  apps/web/components/layout/sidebar.tsx
  apps/web/components/layout/header.tsx
  apps/web/lib/utils.ts                      (cn() helper)
```
- Install: `next@15`, `react@19`, `typescript`, `tailwindcss@4`, `@tailwindcss/postcss`, `framer-motion`, `lucide-react`, `next-themes`, `zustand`
- Add shadcn/ui via `npx shadcn@latest init`
- Implement glassmorphism design tokens in globals.css
- Dark/light mode via `next-themes` + ThemeProvider

### Step 1.4 — Database Setup (Prisma + PostgreSQL)
```
Files to create:
  apps/web/prisma/schema.prisma              (full schema: users, accounts, agents, sessions, address_book, audit_log)
  apps/web/lib/db/prisma.ts                  (Prisma client singleton)
  apps/web/lib/db/redis.ts                   (Redis client)
  apps/web/.env.local                        (DATABASE_URL, REDIS_URL, secrets)
```
- Full schema from spec Section 7 (all 6 tables + indexes)
- Run `prisma generate` + `prisma db push` for initial setup
- Docker Compose for local PostgreSQL + Redis

### Step 1.5 — Authentication (NextAuth.js v5)
```
Files to create:
  apps/web/lib/auth/auth-config.ts           (NextAuth v5 root config)
  apps/web/lib/auth/auth-helpers.ts          (session helpers)
  apps/web/app/api/auth/[...nextauth]/route.ts
  apps/web/components/auth/login-form.tsx
  apps/web/components/auth/oauth-buttons.tsx
  apps/web/middleware.ts                      (route protection)
```
- Google + GitHub OAuth providers
- Email/password with bcrypt (credentials provider)
- Prisma adapter for user persistence
- Protected routes via middleware

### Phase 1 Verification
- [ ] `pnpm install` succeeds across all workspaces
- [ ] `pnpm dev` starts Next.js on localhost:3000
- [ ] Landing page renders with glassmorphism design
- [ ] Login/register pages functional with OAuth
- [ ] Database tables created, Prisma Studio shows schema
- [ ] Dark/light mode toggle works

---

## Phase 2: Signaling Server (Week 3)

### Goal
Standalone Socket.IO signaling server, agent registration system, ID/password flow, permission popup protocol.

### Step 2.1 — Signaling Server
```
Files to create:
  server/signaling/package.json
  server/signaling/tsconfig.json
  server/signaling/src/index.ts              (Express + Socket.IO server entry)
  server/signaling/src/socket-handler.ts     (event handlers: register, authenticate, signal)
  server/signaling/src/auth.ts               (agent password verification via bcrypt)
  server/signaling/src/room-manager.ts       (session rooms, busy state tracking)
  server/signaling/src/rate-limiter.ts       (Redis-backed: 5 attempts/min/IP)
  server/signaling/Dockerfile
```

### Step 2.2 — Agent Registration API
```
Files to create:
  apps/web/app/api/agents/route.ts           (CRUD for agents)
  apps/web/app/api/agents/[id]/route.ts      (single agent ops)
  apps/web/lib/utils/crypto.ts               (ID generation, password hashing)
  apps/web/lib/utils/validators.ts           (Zod schemas for all inputs)
```
- 9-digit unique connection ID generation
- Cryptographic random password (crypto.randomBytes)
- bcrypt hashing before storage

### Step 2.3 — Signaling Protocol Implementation
```
Socket.IO Events (defined in packages/shared):
  agent:register        — Agent comes online with connection_id
  agent:heartbeat       — 30s keep-alive
  viewer:authenticate   — Viewer sends ID + password
  host:permission_request  — Server asks host to approve
  host:permission_response — Host accepts/denies
  signal:offer          — WebRTC SDP offer relay
  signal:answer         — WebRTC SDP answer relay
  signal:ice_candidate  — ICE candidate relay
  session:started       — Log session start
  session:ended         — Log session end
```

### Phase 2 Verification
- [ ] Signaling server starts on port 3001
- [ ] Socket.IO client can connect and register
- [ ] Authentication flow validates password against bcrypt hash
- [ ] Rate limiter blocks after 5 failed attempts
- [ ] Permission request/response cycle works end-to-end
- [ ] Room manager tracks online agents and busy state

---

## Phase 3: Full Remote Desktop (Week 4–5) — IN PROGRESS

### Goal
Complete remote desktop experience: Google Meet-style screen sharing, bidirectional audio, mouse/keyboard control, chat, file transfer, clipboard sync, auto-reconnect, multi-viewer support.

### Step 3.1 — WebRTC Client Library
```
Files to create:
  apps/web/lib/webrtc/peer-connection.ts     (RTCPeerConnection wrapper class)
  apps/web/lib/webrtc/signaling.ts           (Socket.IO signaling client)
  apps/web/lib/webrtc/data-channel.ts        (DataChannel for input/files/chat)
  apps/web/lib/webrtc/ice-config.ts          (STUN/TURN server config)
```
- PeerConnection class: create offer, handle answer, ICE candidates
- Signaling client: Socket.IO integration for SDP/ICE exchange
- DataChannel: ordered channel for mouse/keyboard, unordered for files
- ICE config: Google STUN servers + self-hosted coturn TURN

### Step 3.2 — Session Viewer Page
```
Files to create:
  apps/web/app/(dashboard)/session/[id]/page.tsx   (session viewer)
  apps/web/components/session/remote-viewer.tsx     (WebRTC video element)
  apps/web/components/session/toolbar.tsx            (session toolbar)
  apps/web/components/session/session-timer.tsx      (HH:MM:SS timer)
  apps/web/components/session/quality-selector.tsx
  apps/web/lib/hooks/use-webrtc.ts                   (React hook)
  apps/web/lib/hooks/use-signaling.ts
  apps/web/lib/hooks/use-session-timer.ts
  apps/web/lib/stores/session-store.ts               (Zustand)
  apps/web/lib/stores/connection-store.ts
```

### Step 3.3 — Mouse/Keyboard Capture (Browser Side)
```
Files to create/modify:
  apps/web/components/session/remote-viewer.tsx      (add event listeners)
  apps/web/lib/webrtc/input-capture.ts               (serialize mouse/keyboard events)
```
- Capture mouse events: click, dblclick, contextmenu, mousemove, wheel, mousedown, mouseup
- Capture keyboard events: keydown, keyup with key code mapping
- Serialize events to DataChannel messages (JSON protocol)
- Handle coordinate mapping (viewer viewport → host screen resolution)

### Phase 3 Verification
- [x] WebRTC offer/answer exchange works via signaling
- [x] ICE candidates gathered and exchanged (with buffering)
- [x] Google Meet-style screen picker (Tab, Window, Entire Screen)
- [x] Video element displays incoming MediaStream
- [x] Fullscreen mode fills viewport correctly
- [x] DataChannel opens and can send/receive messages
- [x] Chat messages send/receive in real-time via P2P
- [x] File transfer with progress bars and auto-download
- [x] Clipboard sync via manual button click
- [x] Bidirectional audio (system audio + microphone)
- [x] Multi-viewer support (one controls at a time)
- [x] Auto-reconnect on connection drop (exponential backoff, 5 attempts)
- [x] Signaling persists across Next.js page navigations
- [x] Mouse/keyboard event capture and serialization
- [x] Session timer counts up accurately
- [x] Connection quality indicator shows latency/FPS
- [x] Agent hidden BrowserWindow pattern for WebRTC
- [x] Agent nut.js input handler for mouse/keyboard control

See `docs/PHASE3_REMOTE_DESKTOP.md` for detailed technical documentation.

---

## Phase 4: Desktop Agent Core (Week 6–7)

### Goal
Electron app with screen capture, WebRTC host-side, system tray, and basic UI.

### Step 4.1 — Electron App Scaffold
```
Files to create:
  apps/agent/package.json
  apps/agent/tsconfig.json
  apps/agent/electron-builder.yml
  apps/agent/src/main/index.ts               (main process entry)
  apps/agent/src/main/tray.ts                (system tray icon + menu)
  apps/agent/src/main/auto-launch.ts         (Windows startup registry)
  apps/agent/src/main/ipc-handlers.ts        (IPC bridge)
  apps/agent/src/ui/index.html               (agent window)
  apps/agent/src/ui/styles.css
  apps/agent/src/ui/renderer.ts
  apps/agent/src/utils/config.ts             (electron-store)
  apps/agent/src/utils/logger.ts
  apps/agent/src/utils/system-info.ts
  apps/agent/resources/icon.ico
  apps/agent/resources/tray-icon.png
```
- Install: `electron@33`, `electron-store`, `@electron/rebuild`
- System tray with: Show/Hide, Copy ID, New Password, Quit
- Auto-start with Windows (optional, via registry)
- IPC bridge between main and renderer

### Step 4.2 — Screen Capture
```
Files to create:
  apps/agent/src/capture/screen-capture.ts   (desktopCapturer wrapper)
  apps/agent/src/capture/audio-capture.ts    (system audio)
  apps/agent/src/capture/monitor-detect.ts   (multi-monitor enumeration)
```
- Use Electron's `desktopCapturer.getSources()` for screen capture
- MediaStream from `getUserMedia()` with screen source
- Multi-monitor detection via `screen.getAllDisplays()`
- Configurable resolution/FPS caps

### Step 4.3 — WebRTC Host Side
```
Files to create:
  apps/agent/src/network/signaling-client.ts  (Socket.IO to signaling server)
  apps/agent/src/network/webrtc-host.ts       (RTCPeerConnection — host side)
  apps/agent/src/network/data-channel.ts      (DataChannel handlers)
```
- **Important**: Use Electron's built-in Chromium WebRTC (BrowserWindow hidden), NOT the `wrtc` npm package
- Alternative: Use `electron-webrtc` wrapper if running in main process
- Register with signaling server on startup (connection_id + online status)
- Handle incoming SDP offers, create answers
- Add screen capture MediaStream as track
- DataChannel for receiving input commands

### Step 4.4 — Permission Dialog
```
Files to create/modify:
  apps/agent/src/main/index.ts               (permission dialog trigger)
  apps/agent/src/ui/permission-dialog.html   (native-feeling dialog)
```
- Native Electron dialog: "User X (IP: x.x.x.x) wants to connect. Allow?"
- Accept → signal `permission_granted`
- Deny → signal `permission_denied`
- Auto-deny if already in session (busy state)

### Phase 4 Verification
- [ ] Electron app launches with system tray icon
- [ ] Agent registers with signaling server and shows as online
- [ ] Screen capture produces MediaStream
- [ ] Multi-monitor detection lists all displays
- [ ] Permission dialog appears on connection request
- [ ] WebRTC peer connection established between browser and agent
- [ ] Screen streams from agent to browser video element
- [ ] DataChannel opens bidirectionally

---

## Phase 5: Full Remote Control (Week 8)

### Goal
Mouse control, keyboard control, clipboard sync, coordinate mapping.

### Step 5.1 — Input Execution (nut.js)
```
Files to create:
  apps/agent/src/input/mouse-handler.ts      (nut.js mouse control)
  apps/agent/src/input/keyboard-handler.ts   (nut.js keyboard control)
  apps/agent/src/input/clipboard-handler.ts  (system clipboard R/W)
```
- **nut.js** for mouse: `mouse.setPosition()`, `mouse.click()`, `mouse.doubleClick()`, `mouse.rightClick()`, `mouse.drag()`, `mouse.scrollDown()/scrollUp()`
- **nut.js** for keyboard: `keyboard.type()`, `keyboard.pressKey()`, `keyboard.releaseKey()`
- Key code mapping: browser KeyboardEvent.code → nut.js Key enum
- Special combos: Ctrl+Alt+Del, Alt+Tab, Win key

### Step 5.2 — Coordinate Mapping
```
Protocol:
  Viewer sends: { x: 0.45, y: 0.62, screenWidth: 1920, screenHeight: 1080 }
  Agent maps:   normalized coordinates → actual host screen pixels
```
- Viewer normalizes coordinates: `x / videoElement.width`, `y / videoElement.height`
- Agent denormalizes: `x * hostScreen.width`, `y * hostScreen.height`
- Handle multi-monitor offset when specific monitor selected

### Step 5.3 — Clipboard Sync
- Viewer: `navigator.clipboard.readText()` / `writeText()` (requires permissions)
- Agent: `clipboard.readText()` / `clipboard.writeText()` (Electron API)
- Sync via DataChannel: periodic check or on-demand with hotkey

### Phase 5 Verification
- [ ] Mouse click on viewer → click executes at correct position on host
- [ ] Mouse movement tracks correctly across different resolutions
- [ ] Double-click, right-click, scroll all work
- [ ] Keyboard typing appears on host
- [ ] Special key combos (Ctrl+C, Ctrl+V, Alt+Tab) work
- [ ] Clipboard copy on viewer → paste on host
- [ ] Clipboard copy on host → paste on viewer
- [ ] Drag and drop works

---

## Phase 6: Features (Week 9–10)

### Goal
Chat, file transfer, session timer, quality controls, multi-monitor switching, audio.

### Step 6.1 — Real-Time Chat
```
Files to create:
  apps/web/components/session/chat-panel.tsx
```
- Chat via DataChannel (P2P, no server)
- Message format: `{ type: 'chat', text: string, timestamp: number }`
- Slide-out panel with message history

### Step 6.2 — File Transfer
```
Files to create:
  apps/web/components/session/file-panel.tsx
  apps/web/lib/webrtc/file-transfer.ts       (chunked file transfer)
  apps/agent/src/network/file-handler.ts     (receive + save files)
```
- DataChannel chunked transfer (16KB chunks)
- Progress indicator, integrity check
- Bidirectional: viewer → host, host → viewer
- Drag-and-drop UI on viewer side

### Step 6.3 — Quality Controls & Multi-Monitor
```
Files to modify:
  apps/web/components/session/quality-selector.tsx
  apps/web/components/session/toolbar.tsx
```
- Quality presets: Auto, Low (720p/15fps), Medium (1080p/24fps), High (1080p/30fps)
- Adaptive quality based on network RTT
- Monitor selector dropdown in toolbar
- Audio streaming toggle (WebRTC audio track)

### Phase 6 Verification
- [ ] Chat messages send/receive in real-time
- [ ] File transfer completes with correct content
- [ ] Progress bar shows during transfer
- [ ] Quality selector changes stream parameters
- [ ] Multi-monitor selector switches displayed screen
- [ ] Audio streams when enabled

---

## Phase 7: Dashboard & Admin (Week 11)

### Goal
Bento grid dashboard, device management, session history, address book, admin panel.

### Step 7.1 — Dashboard Home
```
Files to create/modify:
  apps/web/app/(dashboard)/page.tsx
  apps/web/components/dashboard/bento-grid.tsx
  apps/web/components/dashboard/device-card.tsx
  apps/web/components/dashboard/session-card.tsx
  apps/web/components/dashboard/stats-card.tsx
  apps/web/components/dashboard/quick-connect.tsx
```
- Bento grid layout with glassmorphism cards
- "Your Device" card: connection ID, password (masked), status
- "Quick Connect" card: ID + password input
- Active sessions panel
- Recent activity + stats cards

### Step 7.2 — Device Management & History
```
Files to create/modify:
  apps/web/app/(dashboard)/devices/page.tsx
  apps/web/app/(dashboard)/history/page.tsx
  apps/web/app/(dashboard)/address-book/page.tsx
  apps/web/app/api/sessions/route.ts
```
- My Devices: list registered agents with online status
- Session History: searchable/filterable table
- Address Book: save connections with nicknames

### Step 7.3 — Admin Dashboard
```
Files to create:
  apps/web/app/(admin)/admin/page.tsx
  apps/web/app/(admin)/admin/users/page.tsx
  apps/web/app/(admin)/admin/sessions/page.tsx
  apps/web/app/(admin)/admin/audit/page.tsx
  apps/web/app/api/admin/route.ts
```
- User management (CRUD, disable)
- Active session monitoring + force disconnect
- Audit log viewer
- Server health display
- Role-based access (admin middleware check)

### Phase 7 Verification
- [ ] Dashboard renders with bento grid layout
- [ ] Device card shows real agent data
- [ ] Quick connect initiates session
- [ ] Session history populates from database
- [ ] Address book save/load works
- [ ] Admin panel accessible only to admin role
- [ ] Force disconnect terminates active session

---

## Phase 8: Design Polish (Week 12)

### Goal
Framer Motion animations, responsive design, mobile optimization, final visual polish.

### Key Work
- Framer Motion: page transitions, staggered list entrance, spring physics on interactive elements
- Animated background: floating glass orbs on landing page
- Responsive: sidebar collapses on mobile, toolbar adapts
- Touch controls: touch-to-click, pinch-to-zoom on tablet/phone
- Loading skeletons, toast notifications, micro-interactions
- Copy button animations, connection status badges with pulse

### Phase 8 Verification
- [ ] All page transitions animate smoothly (60fps)
- [ ] Mobile layout works on 375px width
- [ ] Touch controls functional on iPad
- [ ] Dark/light mode transition is smooth
- [ ] No layout shifts during loading

---

## Phase 9: Security Hardening (Week 13)

### Goal
Rate limiting, TURN server, CSP headers, audit logging, security review.

### Key Work
```
Files to create:
  infrastructure/coturn/turnserver.conf
  infrastructure/nginx/nginx.conf
  apps/web/middleware.ts                      (add CSP, HSTS headers)
  server/signaling/src/rate-limiter.ts       (finalize Redis-backed limiter)
```
- coturn STUN/TURN server config with TLS
- Nginx reverse proxy with SSL termination
- CSP headers: restrict script sources, frame ancestors
- HSTS, X-Frame-Options, X-Content-Type-Options
- Redis rate limiter: 5 failed auth attempts/min/IP
- Audit log: record all auth events, connections, disconnections
- Input validation: Zod schemas on every API endpoint

### Phase 9 Verification
- [ ] TURN relay works when P2P blocked (simulated)
- [ ] CSP headers present in all responses
- [ ] Rate limiter blocks brute force attempts
- [ ] Audit log records all events
- [ ] No XSS/SQL injection vectors (manual review)

---

## Phase 10: Build & Deploy (Week 14)

### Goal
Package Electron agent, deploy web app, Docker Compose for server infrastructure.

### Key Work
```
Files to create:
  apps/agent/electron-builder.yml            (finalize build config)
  infrastructure/docker-compose.yml          (PostgreSQL + Redis + Signaling)
  infrastructure/scripts/setup-server.sh
  infrastructure/scripts/deploy.sh
```
- electron-builder: Windows NSIS installer (~15MB target)
- Vercel deployment for Next.js web app
- Docker Compose: PostgreSQL 16 + Redis 7 + signaling server
- Environment variable management
- Auto-update: electron-updater pointing to releases endpoint

### Phase 10 Verification
- [ ] Windows installer builds successfully
- [ ] Installed agent runs and connects
- [ ] Web app deploys to Vercel
- [ ] Docker Compose starts all services
- [ ] Auto-update mechanism works

---

## Phase 11: Testing (Week 15)

### Goal
Full QA, long-session testing, cross-browser verification, performance optimization.

### Test Matrix
- Cross-browser: Chrome, Firefox, Safari, Edge (desktop + mobile)
- Long sessions: 1h, 4h, 24h stability tests
- Network: P2P, TURN relay, reconnection after drops
- Input: all mouse/keyboard combinations
- Security: penetration testing checklist from spec

---

## Phase 12: Launch (Week 16)

### Goal
Production deployment, monitoring, final documentation.

### Key Work
- Sentry error monitoring integration
- Final documentation: SETUP.md, API.md, SECURITY.md
- Performance profiling and optimization
- Public deployment

---

## Verification Strategy (End-to-End)

After each phase, run this integration check:

1. **Start infrastructure**: `docker-compose up` (PostgreSQL + Redis)
2. **Start signaling**: `pnpm --filter signaling dev`
3. **Start web app**: `pnpm --filter web dev`
4. **Start agent**: `pnpm --filter agent dev`
5. **Test flow**: Open browser → enter agent ID/password → approve on agent → see remote screen → control mouse/keyboard
6. **Check logs**: Signaling server logs, browser console, Electron dev tools

---

## Key Dependencies Between Phases

```
Phase 1 (Foundation) ──→ Phase 2 (Signaling) ──→ Phase 3 (WebRTC Web)
                                    │                      │
                                    ▼                      ▼
                         Phase 4 (Agent Core) ──→ Phase 5 (Full Control)
                                                           │
                                                           ▼
                                                Phase 6 (Features)
                                                           │
                                                           ▼
                                                Phase 7 (Dashboard)
                                                           │
                                                           ▼
                                    Phase 8 (Polish) + Phase 9 (Security)
                                                           │
                                                           ▼
                                    Phase 10 (Build) → Phase 11 (Test) → Phase 12 (Launch)
```

**Phases 3 and 4 can be partially parallelized** (web WebRTC and agent WebRTC are independent until integration testing).
