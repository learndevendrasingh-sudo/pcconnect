import type { ConnectedHost, ActiveSession } from '@securedesk/shared';

interface PendingSession {
  sessionId: string;
  hostConnectionId: string;
  viewerSocketId: string;
  createdAt: number;
}

export class RoomManager {
  private hosts = new Map<string, ConnectedHost>(); // connectionId → host
  private socketToHost = new Map<string, string>(); // socketId → connectionId
  private activeSessions = new Map<string, ActiveSession>();
  private pendingSessions = new Map<string, PendingSession>();

  // ========== Host Management ==========

  registerHost(host: ConnectedHost) {
    this.hosts.set(host.connectionId, host);
    this.socketToHost.set(host.socketId, host.connectionId);
  }

  removeHost(connectionId: string) {
    const host = this.hosts.get(connectionId);
    if (host) {
      this.socketToHost.delete(host.socketId);
      this.hosts.delete(connectionId);
    }
  }

  getHost(connectionId: string): ConnectedHost | undefined {
    return this.hosts.get(connectionId);
  }

  getHostBySocketId(socketId: string): ConnectedHost | undefined {
    const connectionId = this.socketToHost.get(socketId);
    if (!connectionId) return undefined;
    return this.hosts.get(connectionId);
  }

  getOnlineHostCount(): number {
    return this.hosts.size;
  }

  // ========== Session Management ==========

  createPendingSession(
    sessionId: string,
    hostConnectionId: string,
    viewerSocketId: string,
  ) {
    this.pendingSessions.set(sessionId, {
      sessionId,
      hostConnectionId,
      viewerSocketId,
      createdAt: Date.now(),
    });

    // Auto-expire pending sessions after 30 seconds
    setTimeout(() => {
      if (this.pendingSessions.has(sessionId)) {
        this.pendingSessions.delete(sessionId);
      }
    }, 30_000);
  }

  getPendingSession(sessionId: string): PendingSession | undefined {
    return this.pendingSessions.get(sessionId);
  }

  removePendingSession(sessionId: string) {
    this.pendingSessions.delete(sessionId);
  }

  activateSession(sessionId: string) {
    const pending = this.pendingSessions.get(sessionId);
    if (!pending) return;

    this.activeSessions.set(sessionId, {
      sessionId,
      hostConnectionId: pending.hostConnectionId,
      viewerSocketId: pending.viewerSocketId,
      viewerSocketIds: [pending.viewerSocketId],
      controllingViewerSocketId: null,
      startedAt: Date.now(),
    });

    this.pendingSessions.delete(sessionId);
  }

  getActiveSession(sessionId: string): ActiveSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  removeActiveSession(sessionId: string) {
    this.activeSessions.delete(sessionId);
  }

  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  getSessionsByHost(connectionId: string): ActiveSession[] {
    return Array.from(this.activeSessions.values()).filter(
      (s) => s.hostConnectionId === connectionId
    );
  }

  getSessionsByViewer(socketId: string): ActiveSession[] {
    return Array.from(this.activeSessions.values()).filter(
      (s) => s.viewerSocketIds.includes(socketId)
    );
  }

  // ========== Multi-Viewer ==========

  addViewerToSession(sessionId: string, viewerSocketId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;
    if (!session.viewerSocketIds.includes(viewerSocketId)) {
      session.viewerSocketIds.push(viewerSocketId);
    }
    return true;
  }

  removeViewerFromSession(sessionId: string, viewerSocketId: string) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    session.viewerSocketIds = session.viewerSocketIds.filter((id) => id !== viewerSocketId);
    if (session.controllingViewerSocketId === viewerSocketId) {
      session.controllingViewerSocketId = null;
    }
  }

  setControllingViewer(sessionId: string, viewerSocketId: string | null): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;
    if (viewerSocketId && !session.viewerSocketIds.includes(viewerSocketId)) return false;
    session.controllingViewerSocketId = viewerSocketId;
    return true;
  }

  getControllingViewer(sessionId: string): string | null {
    return this.activeSessions.get(sessionId)?.controllingViewerSocketId ?? null;
  }
}
