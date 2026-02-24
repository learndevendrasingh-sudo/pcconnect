import { io, Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SignalData,
  PermissionRequest,
  PermissionResponse,
} from '@securedesk/shared';
import { SIGNALING_EVENTS } from '@securedesk/shared';

type SignalingSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface SignalingEvents {
  // Host events
  onRegistered?: (data: { connectionId: string; success: boolean }) => void;
  onPermissionRequest?: (data: PermissionRequest) => void;

  // Viewer events
  onAuthenticated?: (data: { sessionId: string; success: boolean; error?: string }) => void;
  onPermissionResponse?: (data: PermissionResponse) => void;

  // Shared events
  onHostReady?: (data: { sessionId: string }) => void;
  onViewerReady?: (data: { sessionId: string }) => void;
  onSessionStarted?: (data: { sessionId: string }) => void;
  onSessionEnded?: (data: { sessionId: string; reason: string }) => void;
  onOffer?: (data: SignalData) => void;
  onAnswer?: (data: SignalData) => void;
  onIceCandidate?: (data: SignalData) => void;
  onError?: (data: { code: string; message: string }) => void;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
}

export class SignalingClient {
  private socket: SignalingSocket;
  private events: SignalingEvents;

  constructor(events: SignalingEvents) {
    this.events = events;

    // Auto-detect signaling URL from the current page hostname and protocol
    // so it works across LAN without hardcoding IPs.
    // http://192.168.1.34:3000  → http://192.168.1.34:3001
    // https://192.168.1.34:3000 → https://192.168.1.34:3001  (WSS via Socket.IO)
    const url = typeof window !== 'undefined'
      ? (process.env.NEXT_PUBLIC_SIGNALING_URL || `${window.location.protocol}//${window.location.hostname}:3001`)
      : 'http://localhost:3001';

    this.socket = io(url, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      // Disable Socket.IO's built-in reconnect — the app manages its own
      // reconnection logic in attemptReconnect() with exponential backoff.
      // Having two reconnection systems causes duplicate negotiations.
      reconnection: false,
    });

    this.setupEventHandlers();
  }

  /**
   * Replace event handlers without disconnecting.
   * Since socket listeners reference this.events, updating the object
   * causes all existing listeners to use the new callbacks.
   */
  rebindHandlers(newEvents: Partial<SignalingEvents>): void {
    this.events = { ...this.events, ...newEvents };
  }

  private setupEventHandlers() {
    this.socket.on('connect', () => {
      this.events.onConnect?.();
    });

    this.socket.on('disconnect', (reason) => {
      this.events.onDisconnect?.(reason);
    });

    // Host events
    this.socket.on(SIGNALING_EVENTS.HOST_REGISTERED, (data) => {
      this.events.onRegistered?.(data);
    });

    this.socket.on(SIGNALING_EVENTS.HOST_PERMISSION_REQUEST, (data) => {
      this.events.onPermissionRequest?.(data);
    });

    // Viewer events
    this.socket.on(SIGNALING_EVENTS.VIEWER_AUTHENTICATED, (data) => {
      this.events.onAuthenticated?.(data);
    });

    this.socket.on(SIGNALING_EVENTS.HOST_PERMISSION_RESPONSE, (data) => {
      this.events.onPermissionResponse?.(data);
    });

    // Host ready (screen capture done, WebRTC peer ready)
    this.socket.on(SIGNALING_EVENTS.HOST_READY, (data) => {
      this.events.onHostReady?.(data);
    });

    // Viewer ready (session page loaded, PeerConnection created)
    this.socket.on(SIGNALING_EVENTS.VIEWER_READY, (data) => {
      this.events.onViewerReady?.(data);
    });

    // Session events
    this.socket.on(SIGNALING_EVENTS.SESSION_STARTED, (data) => {
      this.events.onSessionStarted?.(data);
    });

    this.socket.on(SIGNALING_EVENTS.SESSION_ENDED, (data) => {
      this.events.onSessionEnded?.(data);
    });

    // WebRTC signaling
    this.socket.on(SIGNALING_EVENTS.SIGNAL_OFFER, (data) => {
      this.events.onOffer?.(data);
    });

    this.socket.on(SIGNALING_EVENTS.SIGNAL_ANSWER, (data) => {
      this.events.onAnswer?.(data);
    });

    this.socket.on(SIGNALING_EVENTS.SIGNAL_ICE_CANDIDATE, (data) => {
      this.events.onIceCandidate?.(data);
    });

    this.socket.on(SIGNALING_EVENTS.ERROR, (data) => {
      this.events.onError?.(data);
    });
  }

  connect() {
    this.socket.connect();
  }

  disconnect() {
    this.socket.disconnect();
  }

  // Host methods
  registerAsHost(connectionId: string, password: string) {
    this.socket.emit(SIGNALING_EVENTS.HOST_REGISTER, { connectionId, password });
  }

  unregisterHost() {
    this.socket.emit(SIGNALING_EVENTS.HOST_UNREGISTER);
  }

  respondToPermission(sessionId: string, granted: boolean) {
    this.socket.emit(SIGNALING_EVENTS.HOST_PERMISSION_RESPONSE, { sessionId, granted });
  }

  sendHostReady(sessionId: string) {
    this.socket.emit(SIGNALING_EVENTS.HOST_READY, { sessionId });
  }

  sendViewerReady(sessionId: string) {
    this.socket.emit(SIGNALING_EVENTS.VIEWER_READY, { sessionId });
  }

  // Viewer methods
  authenticate(connectionId: string, password: string) {
    this.socket.emit(SIGNALING_EVENTS.VIEWER_AUTHENTICATE, { connectionId, password });
  }

  // WebRTC signaling
  sendOffer(sessionId: string, sdp: RTCSessionDescriptionInit) {
    this.socket.emit(SIGNALING_EVENTS.SIGNAL_OFFER, { sessionId, sdp });
  }

  sendAnswer(sessionId: string, sdp: RTCSessionDescriptionInit) {
    this.socket.emit(SIGNALING_EVENTS.SIGNAL_ANSWER, { sessionId, sdp });
  }

  sendIceCandidate(sessionId: string, candidate: RTCIceCandidateInit) {
    this.socket.emit(SIGNALING_EVENTS.SIGNAL_ICE_CANDIDATE, { sessionId, candidate });
  }

  endSession(sessionId: string) {
    this.socket.emit(SIGNALING_EVENTS.SESSION_END, { sessionId });
  }

  get isConnected(): boolean {
    return this.socket.connected;
  }

  get socketId(): string | undefined {
    return this.socket.id;
  }
}
