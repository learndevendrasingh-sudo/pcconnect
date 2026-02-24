# SecureDesk Pro — Roles & Skills

**Project:** SecureDesk Pro v2.0
**Team Size:** 5–7 members (some roles can overlap)
**Reference:** See `docs/PROJECT_DOCUMENT.md` for full spec, `docs/IMPLEMENTATION_PLAN.md` for phased plan.

---

## Team Roles

### 1. Project Lead / Full-Stack Architect

**Responsibilities:**
- Owns overall system architecture and technical decisions
- Reviews all pull requests and enforces code standards
- Handles WebRTC integration (the hardest cross-cutting concern)
- Manages phase transitions and integration between web, agent, and signaling server
- Resolves blocking technical issues across any part of the stack
- Defines shared types and signaling protocol (`packages/shared`)

**Phase Involvement:**
- Phase 1–5: Hands-on coding (architecture, WebRTC, signaling protocol)
- Phase 6–12: Code review, architecture guidance, integration testing

**Key Deliverables:**
- `packages/shared/` — shared types, constants, event definitions
- `apps/web/lib/webrtc/peer-connection.ts` — browser WebRTC client
- `apps/agent/src/network/webrtc-host.ts` — agent WebRTC host
- Architecture decision records (ADRs)

---

### 2. Frontend Developer

**Responsibilities:**
- Builds all Next.js 15 pages and React components
- Implements glassmorphism/liquid glass design system
- Creates Framer Motion animations and micro-interactions
- Builds responsive layouts (desktop, tablet, mobile)
- Implements dark/light mode theming
- Integrates shadcn/ui components with custom styling

**Phase Involvement:**
- Phase 1: UI shell, landing page, auth pages, glassmorphism design tokens
- Phase 3: Session viewer page, toolbar, timer
- Phase 6: Chat panel, file panel, quality selector
- Phase 7: Bento grid dashboard, device cards, admin UI
- Phase 8: Animation polish, responsive design, mobile optimization

**Key Deliverables:**
- `apps/web/app/` — all page routes
- `apps/web/components/` — all React components
- `apps/web/app/globals.css` — design system tokens
- `apps/web/components/shared/glass-card.tsx` — glassmorphism base component
- `apps/web/components/dashboard/bento-grid.tsx` — dashboard layout

**Required Skills:**
| Skill | Level |
|-------|-------|
| React 19 | Expert |
| Next.js 15 (App Router) | Expert |
| TypeScript | Expert |
| Tailwind CSS 4 | Expert |
| Framer Motion | Expert |
| shadcn/ui + Radix UI | Advanced |
| CSS (glassmorphism, backdrop-filter, gradients) | Expert |
| Responsive design | Expert |
| Zustand (state management) | Advanced |
| WebRTC (browser APIs) | Intermediate |

---

### 3. Backend Developer

**Responsibilities:**
- Builds Socket.IO signaling server (standalone Node.js service)
- Implements Next.js API routes for CRUD operations
- Designs and maintains Prisma schema and database migrations
- Sets up Redis for rate limiting, sessions, and presence tracking
- Implements authentication (NextAuth.js v5 with OAuth + credentials)
- Builds admin API endpoints

**Phase Involvement:**
- Phase 1: Prisma schema, database setup, NextAuth configuration
- Phase 2: Signaling server, agent registration, ID/password system, rate limiting
- Phase 7: Admin API endpoints, session history queries
- Phase 9: Security hardening, audit logging, input validation

**Key Deliverables:**
- `server/signaling/` — entire signaling server
- `apps/web/prisma/schema.prisma` — database schema
- `apps/web/app/api/` — all API routes
- `apps/web/lib/auth/` — authentication configuration
- `apps/web/lib/db/` — database and Redis clients
- `apps/web/lib/utils/validators.ts` — Zod validation schemas

**Required Skills:**
| Skill | Level |
|-------|-------|
| Node.js | Expert |
| TypeScript | Expert |
| Socket.IO | Expert |
| PostgreSQL | Expert |
| Prisma ORM | Expert |
| Redis | Advanced |
| NextAuth.js v5 (Auth.js) | Advanced |
| Next.js API Routes | Advanced |
| bcrypt / cryptography | Advanced |
| Zod validation | Advanced |
| WebSocket protocols | Advanced |
| Rate limiting patterns | Intermediate |

---

### 4. Desktop Developer (Electron + nut.js)

**Responsibilities:**
- Builds the Electron desktop agent application
- Implements screen capture via `desktopCapturer`
- Implements mouse/keyboard control via `nut.js`
- Handles system tray integration, auto-start, auto-update
- Manages WebRTC host-side peer connection within Electron
- Handles clipboard synchronization
- Builds native permission dialog

**Phase Involvement:**
- Phase 4: Electron scaffold, screen capture, WebRTC host, system tray
- Phase 5: nut.js mouse/keyboard, coordinate mapping, clipboard sync
- Phase 6: Multi-monitor switching, audio capture, file receive
- Phase 10: electron-builder packaging, NSIS installer, auto-update

**Key Deliverables:**
- `apps/agent/` — entire Electron application
- `apps/agent/src/main/index.ts` — main process orchestration
- `apps/agent/src/capture/` — screen and audio capture
- `apps/agent/src/input/` — mouse, keyboard, clipboard handlers
- `apps/agent/src/network/` — signaling client, WebRTC host
- `apps/agent/electron-builder.yml` — build configuration

**Required Skills:**
| Skill | Level |
|-------|-------|
| Electron 33 | Expert |
| TypeScript | Expert |
| nut.js (desktop automation) | Expert |
| desktopCapturer API | Expert |
| WebRTC (peer connections, DataChannel) | Advanced |
| Socket.IO (client) | Advanced |
| Windows native APIs | Advanced |
| IPC (inter-process communication) | Advanced |
| electron-builder / packaging | Advanced |
| electron-store | Intermediate |
| electron-updater | Intermediate |
| System tray programming | Intermediate |

---

### 5. DevOps Engineer

**Responsibilities:**
- Sets up Docker Compose for local development (PostgreSQL, Redis, signaling)
- Configures coturn STUN/TURN server
- Sets up Nginx reverse proxy with SSL
- Manages Vercel deployment for web app
- Configures CI/CD pipeline (GitHub Actions)
- Sets up monitoring (Sentry) and logging
- Manages domain, DNS, and SSL certificates

**Phase Involvement:**
- Phase 1: Docker Compose for local dev (PostgreSQL + Redis)
- Phase 9: coturn setup, Nginx config, CSP/HSTS headers
- Phase 10: Vercel deploy, Docker production configs, deployment scripts
- Phase 12: Production deployment, monitoring, SSL

**Key Deliverables:**
- `infrastructure/docker-compose.yml` — all service containers
- `infrastructure/coturn/turnserver.conf` — TURN server config
- `infrastructure/nginx/nginx.conf` — reverse proxy config
- `infrastructure/scripts/` — setup and deployment scripts
- `.github/workflows/` — CI/CD pipeline

**Required Skills:**
| Skill | Level |
|-------|-------|
| Docker / Docker Compose | Expert |
| Linux (Ubuntu) administration | Expert |
| Nginx | Expert |
| SSL / Let's Encrypt | Expert |
| coturn (STUN/TURN) | Advanced |
| Vercel deployment | Advanced |
| GitHub Actions (CI/CD) | Advanced |
| Cloudflare (CDN/DDoS) | Advanced |
| DNS / domain management | Advanced |
| Sentry (monitoring) | Intermediate |
| Firewall (UFW) | Intermediate |
| WebRTC networking (NAT/STUN/TURN) | Intermediate |

---

### 6. QA Engineer

**Responsibilities:**
- Cross-browser testing (Chrome, Firefox, Safari, Edge — desktop + mobile)
- Long-session stability testing (1h, 4h, 24h)
- Input testing (all mouse/keyboard combinations)
- Network condition testing (P2P, TURN relay, reconnection)
- Security testing (penetration testing checklist)
- Performance profiling (latency, FPS, memory leaks)
- Regression testing after each phase

**Phase Involvement:**
- Phase 5+: Continuous testing as features complete
- Phase 11: Full QA sprint — all test cases from spec Section 14
- Phase 12: Final acceptance testing

**Key Deliverables:**
- Test plan and test case documentation
- Bug reports with reproduction steps
- Performance benchmarks (latency, FPS, memory)
- Security audit report
- Cross-browser compatibility matrix

**Required Skills:**
| Skill | Level |
|-------|-------|
| Manual testing | Expert |
| Cross-browser testing | Expert |
| Performance testing | Advanced |
| Security testing (OWASP) | Advanced |
| Network analysis (Wireshark) | Advanced |
| WebRTC debugging (chrome://webrtc-internals) | Advanced |
| Automated testing (Playwright/Cypress) | Intermediate |
| Load testing | Intermediate |

---

### 7. UI/UX Designer

**Responsibilities:**
- Creates Figma mockups for all pages and states
- Defines glassmorphism design system with tokens
- Specifies all Framer Motion animation parameters
- Designs responsive breakpoints and mobile layouts
- Creates icon set selections and visual assets
- Validates implemented UI against design specs

**Phase Involvement:**
- Pre-Phase 1: Design system, Figma mockups for all pages
- Phase 1: Design token handoff, component specs
- Phase 7: Dashboard layout refinement
- Phase 8: Animation specs, responsive review, polish feedback

**Key Deliverables:**
- Figma design file with all pages, components, and states
- Design tokens document (colors, spacing, typography, shadows)
- Animation specification (easing curves, durations, spring configs)
- Responsive breakpoint definitions
- Icon and asset exports

**Required Skills:**
| Skill | Level |
|-------|-------|
| Figma | Expert |
| Glassmorphism / Liquid Glass design | Expert |
| Design systems | Expert |
| Responsive design | Expert |
| Motion design (animation specs) | Advanced |
| Tailwind CSS (token mapping) | Intermediate |
| Accessibility (WCAG) | Intermediate |

---

## Full Skills Matrix

| Skill | Lead | Frontend | Backend | Desktop | DevOps | QA | Designer |
|-------|:----:|:--------:|:-------:|:-------:|:------:|:--:|:--------:|
| TypeScript | Expert | Expert | Expert | Expert | Mid | Mid | — |
| Next.js 15 | Expert | Expert | Expert | — | Mid | — | — |
| React 19 | Expert | Expert | Mid | — | — | — | — |
| Tailwind CSS 4 | Mid | Expert | — | — | — | — | Mid |
| Framer Motion | Mid | Expert | — | — | — | — | Advanced |
| shadcn/ui + Radix | Mid | Expert | — | — | — | — | — |
| WebRTC | Expert | Mid | Mid | Expert | — | Mid | — |
| Socket.IO | Expert | Mid | Expert | Expert | — | — | — |
| Electron 33 | Mid | — | — | Expert | — | — | — |
| nut.js | Mid | — | — | Expert | — | — | — |
| Prisma / PostgreSQL | Mid | — | Expert | — | Mid | — | — |
| Redis | Mid | — | Expert | — | Mid | — | — |
| Docker / Nginx | Mid | — | Mid | — | Expert | — | — |
| coturn (STUN/TURN) | Mid | — | — | — | Expert | — | — |
| Security (OWASP) | Expert | Mid | Expert | Mid | Expert | Expert | — |
| CI/CD (GitHub Actions) | Mid | — | Mid | — | Expert | — | — |
| Figma | — | Mid | — | — | — | — | Expert |
| Testing (manual) | Mid | — | — | — | — | Expert | — |

---

## Recommended Team Configurations

### Minimum Viable Team (3 people)
| Person | Roles Combined |
|--------|---------------|
| Person 1 | Lead + Backend + DevOps |
| Person 2 | Frontend + Designer |
| Person 3 | Desktop Developer + QA |

### Standard Team (5 people)
| Person | Role |
|--------|------|
| Person 1 | Lead / Full-Stack Architect |
| Person 2 | Frontend Developer |
| Person 3 | Backend Developer |
| Person 4 | Desktop Developer |
| Person 5 | DevOps + QA |

### Full Team (7 people)
All 7 roles filled individually. Best for the 16-week timeline.

---

## Onboarding Checklist

For any new team member joining the project:

- [ ] Read `docs/PROJECT_DOCUMENT.md` (full product specification)
- [ ] Read `docs/IMPLEMENTATION_PLAN.md` (phased build plan)
- [ ] Read this document (`docs/ROLES_AND_SKILLS.md`)
- [ ] Set up local dev environment: Node.js 20+, pnpm, Docker Desktop
- [ ] Clone repo and run `pnpm install`
- [ ] Start local services: `docker-compose up` (PostgreSQL + Redis)
- [ ] Run web app: `pnpm --filter web dev`
- [ ] Review `packages/shared/` for type definitions and event contracts
- [ ] Understand the WebRTC connection flow (see spec Section 6.2)
