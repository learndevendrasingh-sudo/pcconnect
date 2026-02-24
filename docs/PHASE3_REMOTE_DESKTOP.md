# Phase 3: Full Remote Desktop — Technical Documentation

## Overview

Phase 3 implements the complete remote desktop experience for SecureDesk Pro: Google Meet-style screen sharing, bidirectional audio, mouse/keyboard control, text chat, file transfer, clipboard sync, auto-reconnect, and multi-viewer support.

---

## Architecture

### Signaling Flow

```
Viewer (Browser)              Signaling Server              Host (Browser/Agent)
     │                              │                              │
     │──── viewer:authenticate ────>│                              │
     │                              │──── host:permission_request ─>│
     │                              │<─── host:permission_response ─│
     │<──── session:started ────────│──── session:started ────────>│
     │                              │                              │
     │──── signal:offer ───────────>│──── signal:offer ───────────>│
     │                              │<─── signal:answer ───────────│
     │<──── signal:answer ──────────│                              │
     │                              │                              │
     │──── signal:ice_candidate ───>│──── signal:ice_candidate ───>│
     │<──── signal:ice_candidate ───│<─── signal:ice_candidate ────│
     │                              │                              │
     │<════════════ P2P WebRTC Connection Established ════════════>│
```

### WebRTC Data Channels

| Channel | Label | Ordered | Purpose |
|---------|-------|---------|---------|
| Input | `input` | Yes | Mouse/keyboard events, clipboard sync |
| File | `file` | No (3 retransmits) | Chunked file transfer |
| Chat | `chat` | Yes | Text chat messages |

### Role-Aware Negotiation

- **Viewer** creates the offer (with data channels) and sends it via signaling
- **Host** receives the offer, adds screen capture tracks, creates answer
- ICE candidates are buffered until remote description is set

---

## Key Components

### Signaling Manager (`apps/web/lib/webrtc/signaling-manager.ts`)

Singleton that preserves the Socket.IO connection across Next.js page navigations. Without this, navigating from the home page to the session page would disconnect the socket and kill the session on the server.

```
signalingManager.createClient(events)  // Create new client
signalingManager.getClient()           // Reuse existing client
signalingManager.rebindEvents(events)  // Swap callbacks without disconnecting
signalingManager.disconnect()          // Full teardown
```

### PeerConnection (`apps/web/lib/webrtc/peer-connection.ts`)

Wrapper around `RTCPeerConnection` with role-aware methods:

- **Viewer methods**: `createOffer()`, `setAnswer()`
- **Host methods**: `handleOffer()`, `addStream()`
- **Shared**: `addIceCandidate()` (with buffering), `sendInput/Chat/File()`

### Session Page (`apps/web/app/session/[id]/page.tsx`)

Orchestrates the entire session based on the `role` query parameter:

- **Host flow**: `getDisplayMedia()` → PeerConnection → wait for offer → answer
- **Viewer flow**: PeerConnection → createOffer → wait for answer → display stream
- Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, 16s)

### Agent WebRTC Host (`apps/agent/src/network/webrtc-host.ts`)

Uses a hidden `BrowserWindow` pattern because `RTCPeerConnection` is only available in Electron's renderer process:

1. Main process gets source ID via `desktopCapturer.getSources()`
2. Creates hidden BrowserWindow with WebRTC preload
3. Renderer captures screen using `chromeMediaSource: 'desktop'`
4. All signaling relayed via IPC: main process <-> hidden renderer

### Agent Input Handler (`apps/agent/src/input/input-handler.ts`)

Uses `@nut-tree/nut-js` for desktop automation:

- Mouse: move, click, dblclick, right-click, drag, scroll
- Keyboard: keydown/keyup with modifier combos (Ctrl+C/V/X, Alt+F4)
- Coordinates: normalized (0-1) from viewer, mapped to screen pixels

---

## Features

### Screen Sharing (Google Meet-style)

The host calls `navigator.mediaDevices.getDisplayMedia()` which shows Chrome's native picker with three options: Chrome Tab, Window, or Entire Screen. The `cursor: 'always'` option ensures the cursor is visible in the stream.

### Bidirectional Audio

- **Host**: System audio via `getDisplayMedia({ audio: true })` + microphone via `getUserMedia({ audio: true })`
- **Viewer**: Microphone via `getUserMedia({ audio: true })`
- Both audio streams are added as tracks to the PeerConnection

### Multi-Viewer Support

The signaling server tracks multiple viewer sockets per session:

- `ActiveSession.viewerSocketIds: string[]` — all connected viewers
- `ActiveSession.controllingViewerSocketId: string | null` — who has control
- Only one viewer can control at a time (others are view-only)
- Events: `viewer:request_control`, `viewer:release_control`, `viewer:control_granted`

### File Transfer

Chunked file transfer over the `file` data channel:

1. **Sender**: `FileTransfer` class splits file into chunks, computes SHA-256 checksum
2. **Receiver**: `FileReceiver` class reassembles chunks, verifies integrity
3. **UI**: Drag-and-drop zone + file list with progress bars

### Clipboard Sync

Manual sync via toolbar button:

1. Click "Clipboard Sync" button
2. `navigator.clipboard.readText()` reads local clipboard
3. Sends `ClipboardMessage` via input data channel
4. Remote side writes to clipboard with `navigator.clipboard.writeText()`

### Auto-Reconnect

On `connectionState === 'failed'` or `'disconnected'`:

1. Show "Reconnecting..." overlay with spinner
2. Exponential backoff: 1s, 2s, 4s, 8s, 16s
3. Max 5 attempts before showing "Connection Lost"
4. User can click "Disconnect" at any time during reconnection

---

## New Signaling Events

| Event | Direction | Purpose |
|-------|-----------|---------|
| `agent:register` | Agent -> Server | Agent comes online |
| `agent:registered` | Server -> Agent | Registration confirmed |
| `agent:heartbeat` | Agent -> Server | 30s keep-alive |
| `viewer:request_control` | Viewer -> Server | Request mouse/keyboard control |
| `viewer:release_control` | Viewer -> Server | Release control |
| `viewer:control_granted` | Server -> Viewer/Host | Control granted |
| `viewer:control_denied` | Server -> Viewer | Control denied (another viewer has it) |

---

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `apps/web/lib/webrtc/signaling-manager.ts` | Singleton signaling client manager |
| `apps/web/components/session/file-panel.tsx` | File transfer UI panel |
| `apps/agent/src/input/input-handler.ts` | nut.js desktop input handler |
| `apps/agent/src/preload/webrtc-preload.ts` | IPC bridge for hidden WebRTC window |
| `apps/agent/src/renderer/webrtc-host.html` | Hidden renderer HTML |
| `apps/agent/src/renderer/webrtc-host-renderer.ts` | WebRTC + screen capture in renderer |

### Modified Files

| File | Changes |
|------|---------|
| `packages/shared/src/types/signaling.ts` | Added AgentInfo, multi-viewer types, control events |
| `packages/shared/src/constants/events.ts` | Added agent + control event constants |
| `server/signaling/src/socket-handler.ts` | Agent handlers, multi-viewer, control routing |
| `server/signaling/src/room-manager.ts` | Multi-viewer sessions, control state |
| `apps/web/lib/webrtc/signaling.ts` | Added `rebindHandlers()` method |
| `apps/web/lib/webrtc/peer-connection.ts` | Added `handleOffer()`, `addStream()`, ICE buffering |
| `apps/web/app/page.tsx` | Use signaling manager, remove disconnect cleanup |
| `apps/web/app/session/[id]/page.tsx` | Complete rewrite: role-aware WebRTC, audio, reconnect |
| `apps/web/components/session/remote-viewer.tsx` | `isFullscreen` prop, fullscreen CSS |
| `apps/web/components/session/toolbar.tsx` | Wired file transfer, clipboard sync, audio controls |
| `apps/web/lib/stores/session-store.ts` | Added `fileOpen`, `toggleFilePanel` |
| `apps/agent/src/network/webrtc-host.ts` | Complete rewrite for hidden BrowserWindow |
| `apps/agent/src/main/index.ts` | Wire input handler, fix PermissionRequest fields |
| `apps/agent/package.json` | Added `@nut-tree/nut-js` |

---

## Known Limitations

1. **Audio in tab sharing**: System audio only works when sharing a Chrome tab or entire screen (browser limitation)
2. **Clipboard sync**: Requires browser clipboard permission (user must grant)
3. **Key combos**: Only basic combos supported (Ctrl+C/V/X, Alt+F4). Ctrl+Alt+Del and Alt+Tab require OS-level hooks
4. **File transfer size**: Max 500 MB per file (limited by data channel reliability)
5. **Multi-monitor**: Agent captures primary display by default; monitor switching UI not yet wired
6. **Mobile viewer**: Touch-to-click works but no pinch-to-zoom yet
