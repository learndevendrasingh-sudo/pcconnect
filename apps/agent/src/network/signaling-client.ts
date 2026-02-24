import { io, Socket } from 'socket.io-client';
import { SIGNALING_EVENTS } from '@securedesk/shared';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  AgentInfo,
  PermissionRequest,
  SignalData,
} from '@securedesk/shared';

type AgentSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SignalingCallbacks {
  onConnect: () => void;
  onDisconnect: () => void;
  onRegistered: (data: { connectionId: string; success: boolean }) => void;
  onPermissionRequest: (data: PermissionRequest) => void;
  onSessionStarted: (data: { sessionId: string }) => void;
  onSessionEnded: (data: { sessionId: string; reason: string }) => void;
  onOffer: (data: SignalData) => void;
  onIceCandidate: (data: SignalData) => void;
}

export class SignalingClient {
  private socket: AgentSocket;
  private callbacks: SignalingCallbacks;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private connectionId: string = '';

  constructor(url: string, callbacks: SignalingCallbacks) {
    this.callbacks = callbacks;
    this.socket = io(url, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
    });

    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on('connect', () => {
      this.callbacks.onConnect();
      this.startHeartbeat();
    });

    this.socket.on('disconnect', () => {
      this.callbacks.onDisconnect();
      this.stopHeartbeat();
    });

    this.socket.on(SIGNALING_EVENTS.AGENT_REGISTERED, (data) => {
      this.callbacks.onRegistered(data);
    });

    this.socket.on(SIGNALING_EVENTS.HOST_PERMISSION_REQUEST, (data) => {
      this.callbacks.onPermissionRequest(data);
    });

    this.socket.on(SIGNALING_EVENTS.SESSION_STARTED, (data) => {
      this.callbacks.onSessionStarted(data);
    });

    this.socket.on(SIGNALING_EVENTS.SESSION_ENDED, (data) => {
      this.callbacks.onSessionEnded(data);
    });

    this.socket.on(SIGNALING_EVENTS.SIGNAL_OFFER, (data) => {
      this.callbacks.onOffer(data);
    });

    this.socket.on(SIGNALING_EVENTS.SIGNAL_ICE_CANDIDATE, (data) => {
      this.callbacks.onIceCandidate(data);
    });
  }

  connect() {
    this.socket.connect();
  }

  disconnect() {
    this.stopHeartbeat();
    this.socket.disconnect();
  }

  register(info: AgentInfo) {
    this.connectionId = info.connectionId;
    this.socket.emit(SIGNALING_EVENTS.AGENT_REGISTER, info);
  }

  respondPermission(sessionId: string, granted: boolean) {
    this.socket.emit(SIGNALING_EVENTS.HOST_PERMISSION_RESPONSE, { sessionId, granted });
  }

  sendAnswer(sessionId: string, sdp: RTCSessionDescriptionInit) {
    this.socket.emit(SIGNALING_EVENTS.SIGNAL_ANSWER, { sessionId, sdp });
  }

  sendIceCandidate(sessionId: string, candidate: RTCIceCandidateInit) {
    this.socket.emit(SIGNALING_EVENTS.SIGNAL_ICE_CANDIDATE, { sessionId, candidate });
  }

  sendHostReady(sessionId: string) {
    this.socket.emit(SIGNALING_EVENTS.HOST_READY, { sessionId });
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.connectionId) {
        this.socket.emit(SIGNALING_EVENTS.AGENT_HEARTBEAT, { connectionId: this.connectionId });
      }
    }, 30_000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  get isConnected(): boolean {
    return this.socket.connected;
  }
}
