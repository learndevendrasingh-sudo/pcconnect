import { Server, Socket } from 'socket.io';
import bcrypt from 'bcryptjs';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  HostInfo,
  AgentInfo,
  ConnectedHost,
  ViewerControlRequest,
} from '@securedesk/shared';
import { SIGNALING_EVENTS, CONFIG } from '@securedesk/shared';
import { RoomManager } from './room-manager';
import { RateLimiter } from './rate-limiter';

type IOServer = Server<ClientToServerEvents, ServerToClientEvents>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function setupSocketHandlers(
  io: IOServer,
  roomManager: RoomManager,
  rateLimiter: RateLimiter
) {
  io.on('connection', (socket: IOSocket) => {
    const clientIp =
      (socket.handshake.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      socket.handshake.address;

    console.log(`[Socket] Connected: ${socket.id} from ${clientIp}`);

    // ========== Host Events ==========

    socket.on(SIGNALING_EVENTS.HOST_REGISTER, async (data: HostInfo) => {
      console.log(`[Host] Register: ${data.connectionId}`);

      // Hash the password server-side
      const passwordHash = await bcrypt.hash(data.password, CONFIG.BCRYPT_SALT_ROUNDS);

      const host: ConnectedHost = {
        connectionId: data.connectionId,
        socketId: socket.id,
        passwordHash,
        connectedAt: Date.now(),
        busy: false,
      };

      roomManager.registerHost(host);
      socket.join(`host:${data.connectionId}`);

      socket.emit(SIGNALING_EVENTS.HOST_REGISTERED, {
        connectionId: data.connectionId,
        success: true,
      });
    });

    socket.on(SIGNALING_EVENTS.HOST_UNREGISTER, () => {
      const host = roomManager.getHostBySocketId(socket.id);
      if (host) {
        const sessions = roomManager.getSessionsByHost(host.connectionId);
        for (const session of sessions) {
          endSession(io, roomManager, session.sessionId, 'Host stopped sharing.');
        }
        roomManager.removeHost(host.connectionId);
        socket.leave(`host:${host.connectionId}`);
        console.log(`[Host] Unregistered: ${host.connectionId}`);
      }
    });

    // ========== Agent Events ==========

    socket.on(SIGNALING_EVENTS.AGENT_REGISTER, async (data: AgentInfo) => {
      console.log(`[Agent] Register: ${data.connectionId} (${data.hostname}, ${data.os})`);

      // Hash the agent's password (same as host registration)
      const passwordHash = data.password
        ? await bcrypt.hash(data.password, CONFIG.BCRYPT_SALT_ROUNDS)
        : '';

      const host: ConnectedHost = {
        connectionId: data.connectionId,
        socketId: socket.id,
        passwordHash,
        connectedAt: Date.now(),
        busy: false,
      };

      roomManager.registerHost(host);
      socket.join(`host:${data.connectionId}`);

      socket.emit(SIGNALING_EVENTS.AGENT_REGISTERED, {
        connectionId: data.connectionId,
        success: true,
      });
    });

    socket.on(SIGNALING_EVENTS.AGENT_HEARTBEAT, (data: { connectionId: string }) => {
      const host = roomManager.getHost(data.connectionId);
      if (host) {
        host.connectedAt = Date.now();
      }
    });

    // ========== Viewer Events ==========

    socket.on(SIGNALING_EVENTS.VIEWER_AUTHENTICATE, async (data) => {
      const { connectionId, password } = data;
      console.log(`[Viewer] Authenticate request for host ${connectionId} from ${clientIp}`);

      // Rate limiting
      if (rateLimiter.isBlocked(clientIp)) {
        socket.emit(SIGNALING_EVENTS.VIEWER_AUTHENTICATED, {
          sessionId: '',
          success: false,
          error: 'Too many attempts. Please try again later.',
        });
        return;
      }

      // Check if host exists
      const host = roomManager.getHost(connectionId);
      if (!host) {
        rateLimiter.recordAttempt(clientIp);
        socket.emit(SIGNALING_EVENTS.VIEWER_AUTHENTICATED, {
          sessionId: '',
          success: false,
          error: 'Host not found or offline.',
        });
        return;
      }

      // Verify password against in-memory hash
      const isValid = await bcrypt.compare(password, host.passwordHash);
      if (!isValid) {
        rateLimiter.recordAttempt(clientIp);
        socket.emit(SIGNALING_EVENTS.VIEWER_AUTHENTICATED, {
          sessionId: '',
          success: false,
          error: 'Invalid password.',
        });
        return;
      }

      // Password valid — send permission request to host
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      roomManager.createPendingSession(sessionId, connectionId, socket.id);

      // Ask the host for permission
      io.to(`host:${connectionId}`).emit(SIGNALING_EVENTS.HOST_PERMISSION_REQUEST, {
        sessionId,
        viewerIp: clientIp,
        timestamp: Date.now(),
      });

      // Notify viewer that authentication passed, waiting for host approval
      socket.emit(SIGNALING_EVENTS.VIEWER_AUTHENTICATED, {
        sessionId,
        success: true,
      });
    });

    // ========== Host Permission Response ==========

    socket.on(SIGNALING_EVENTS.HOST_PERMISSION_RESPONSE, (data) => {
      const { sessionId, granted } = data;
      console.log(`[Host] Permission response for ${sessionId}: ${granted ? 'GRANTED' : 'DENIED'}`);
      const pendingSession = roomManager.getPendingSession(sessionId);

      if (!pendingSession) return;

      if (granted) {
        // Activate session
        roomManager.activateSession(sessionId);
        const host = roomManager.getHost(pendingSession.hostConnectionId);
        if (host) {
          host.busy = true;
          io.to(host.socketId).emit(SIGNALING_EVENTS.SESSION_STARTED, { sessionId });
        }
        io.to(pendingSession.viewerSocketId).emit(SIGNALING_EVENTS.SESSION_STARTED, { sessionId });
      } else {
        // Denied
        roomManager.removePendingSession(sessionId);
        io.to(pendingSession.viewerSocketId).emit(SIGNALING_EVENTS.SESSION_ENDED, {
          sessionId,
          reason: 'Host denied the connection request.',
        });
      }
    });

    // ========== Viewer Control ==========

    socket.on(SIGNALING_EVENTS.VIEWER_REQUEST_CONTROL, (data: ViewerControlRequest) => {
      const session = roomManager.getActiveSession(data.sessionId);
      if (!session) return;

      // Only grant if no one else is controlling
      if (session.controllingViewerSocketId === null) {
        roomManager.setControllingViewer(data.sessionId, socket.id);
        socket.emit(SIGNALING_EVENTS.VIEWER_CONTROL_GRANTED, {
          sessionId: data.sessionId,
          granted: true,
          viewerSocketId: socket.id,
        });
        // Notify host who has control
        const host = roomManager.getHost(session.hostConnectionId);
        if (host) {
          io.to(host.socketId).emit(SIGNALING_EVENTS.VIEWER_CONTROL_GRANTED, {
            sessionId: data.sessionId,
            granted: true,
            viewerSocketId: socket.id,
          });
        }
      } else {
        socket.emit(SIGNALING_EVENTS.VIEWER_CONTROL_DENIED, {
          sessionId: data.sessionId,
          reason: 'Another viewer is currently in control.',
        });
      }
    });

    socket.on(SIGNALING_EVENTS.VIEWER_RELEASE_CONTROL, (data: ViewerControlRequest) => {
      const session = roomManager.getActiveSession(data.sessionId);
      if (!session) return;

      if (session.controllingViewerSocketId === socket.id) {
        roomManager.setControllingViewer(data.sessionId, null);
      }
    });

    // ========== Host Ready (screen capture done, peer ready) ==========

    socket.on(SIGNALING_EVENTS.HOST_READY, (data) => {
      console.log(`[WebRTC] HOST_READY for session ${data.sessionId}`);
      const session = roomManager.getActiveSession(data.sessionId);
      if (!session) {
        console.warn(`[WebRTC] HOST_READY — session not found: ${data.sessionId}`);
        return;
      }

      // Forward to all viewers in the session
      for (const viewerSocketId of session.viewerSocketIds) {
        console.log(`[WebRTC] Forwarding HOST_READY to viewer ${viewerSocketId}`);
        io.to(viewerSocketId).emit(SIGNALING_EVENTS.HOST_READY, { sessionId: data.sessionId });
      }
    });

    // ========== Viewer Ready (session page loaded, peer ready) ==========

    socket.on(SIGNALING_EVENTS.VIEWER_READY, (data: { sessionId: string }) => {
      console.log(`[WebRTC] VIEWER_READY for session ${data.sessionId}`);
      const session = roomManager.getActiveSession(data.sessionId);
      if (!session) return;

      // Forward to host so it can re-send HOST_READY
      const host = roomManager.getHost(session.hostConnectionId);
      if (host) {
        console.log(`[WebRTC] Forwarding VIEWER_READY to host ${host.socketId}`);
        io.to(host.socketId).emit(SIGNALING_EVENTS.VIEWER_READY, { sessionId: data.sessionId });
      }
    });

    // ========== WebRTC Signaling ==========

    socket.on(SIGNALING_EVENTS.SIGNAL_OFFER, (data) => {
      console.log(`[WebRTC] OFFER received from ${socket.id} for session ${data.sessionId}`);
      const session = roomManager.getActiveSession(data.sessionId);
      if (!session) {
        console.warn(`[WebRTC] OFFER — session not found: ${data.sessionId}`);
        return;
      }

      const host = roomManager.getHost(session.hostConnectionId);
      if (host) {
        console.log(`[WebRTC] Forwarding OFFER to host ${host.socketId}`);
        // Include viewer socket ID so host knows which viewer sent the offer
        io.to(host.socketId).emit(SIGNALING_EVENTS.SIGNAL_OFFER, {
          ...data,
          viewerSocketId: socket.id,
        });
      }
    });

    socket.on(SIGNALING_EVENTS.SIGNAL_ANSWER, (data) => {
      console.log(`[WebRTC] ANSWER received from ${socket.id} for session ${data.sessionId}`);
      const session = roomManager.getActiveSession(data.sessionId);
      if (!session) {
        console.warn(`[WebRTC] ANSWER — session not found: ${data.sessionId}`);
        return;
      }

      // Answer goes to the specific viewer or primary viewer
      const targetViewer = data.viewerSocketId || session.viewerSocketId;
      console.log(`[WebRTC] Forwarding ANSWER to viewer ${targetViewer}`);
      io.to(targetViewer).emit(SIGNALING_EVENTS.SIGNAL_ANSWER, data);
    });

    socket.on(SIGNALING_EVENTS.SIGNAL_ICE_CANDIDATE, (data) => {
      const session = roomManager.getActiveSession(data.sessionId);
      if (!session) return;

      const host = roomManager.getHost(session.hostConnectionId);
      if (host && socket.id === host.socketId) {
        // From host → to viewer(s)
        const targetViewer = data.viewerSocketId || session.viewerSocketId;
        console.log(`[WebRTC] ICE candidate: host → viewer ${targetViewer}`);
        io.to(targetViewer).emit(SIGNALING_EVENTS.SIGNAL_ICE_CANDIDATE, data);
      } else if (host) {
        // From viewer → to host
        console.log(`[WebRTC] ICE candidate: viewer ${socket.id} → host ${host.socketId}`);
        io.to(host.socketId).emit(SIGNALING_EVENTS.SIGNAL_ICE_CANDIDATE, {
          ...data,
          viewerSocketId: socket.id,
        });
      }
    });

    // ========== Session End ==========

    socket.on(SIGNALING_EVENTS.SESSION_END, (data) => {
      const session = roomManager.getActiveSession(data.sessionId);
      if (!session) return;

      endSession(io, roomManager, data.sessionId, 'Session ended by user.');
    });

    // ========== Disconnect ==========

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected: ${socket.id} (${reason})`);

      // Check if disconnected socket was a host
      const host = roomManager.getHostBySocketId(socket.id);
      if (host) {
        const sessions = roomManager.getSessionsByHost(host.connectionId);
        for (const session of sessions) {
          endSession(io, roomManager, session.sessionId, 'Host disconnected.');
        }
        roomManager.removeHost(host.connectionId);
      }

      // Check if disconnected socket was a viewer
      const viewerSessions = roomManager.getSessionsByViewer(socket.id);
      for (const session of viewerSessions) {
        roomManager.removeViewerFromSession(session.sessionId, socket.id);
        // If no viewers left, end the session
        if (session.viewerSocketIds.length === 0) {
          endSession(io, roomManager, session.sessionId, 'All viewers disconnected.');
        }
      }
    });
  });
}

function endSession(
  io: IOServer,
  roomManager: RoomManager,
  sessionId: string,
  reason: string
) {
  const session = roomManager.getActiveSession(sessionId);
  if (!session) return;

  const host = roomManager.getHost(session.hostConnectionId);
  if (host) {
    io.to(host.socketId).emit(SIGNALING_EVENTS.SESSION_ENDED, { sessionId, reason });
    host.busy = false;
  }

  // Notify all connected viewers
  for (const viewerSocketId of session.viewerSocketIds) {
    io.to(viewerSocketId).emit(SIGNALING_EVENTS.SESSION_ENDED, { sessionId, reason });
  }

  roomManager.removeActiveSession(sessionId);
}
