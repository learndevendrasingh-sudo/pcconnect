// Socket.IO event type definitions — single source of truth
// Simplified for anonymous Google Meet-like flow

export interface HostInfo {
  connectionId: string;
  password: string; // plaintext — server hashes it
}

export interface AgentInfo {
  connectionId: string;
  password: string; // plaintext — server hashes it (same as HostInfo)
  userId: string;
  hostname: string;
  os: string;
  version: string;
}

export interface PermissionRequest {
  sessionId: string;
  viewerIp: string;
  timestamp: number;
}

export interface PermissionResponse {
  sessionId: string;
  granted: boolean;
}

export interface SignalData {
  sessionId: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  viewerSocketId?: string; // For multi-viewer: identifies which viewer
}

export interface ViewerControlRequest {
  sessionId: string;
}

export interface ViewerControlResponse {
  sessionId: string;
  granted: boolean;
  viewerSocketId: string;
}

// Server → Client events
export interface ServerToClientEvents {
  'host:registered': (data: { connectionId: string; success: boolean }) => void;
  'agent:registered': (data: { connectionId: string; success: boolean }) => void;
  'viewer:authenticated': (data: { sessionId: string; success: boolean; error?: string }) => void;
  'host:permission_request': (data: PermissionRequest) => void;
  'host:permission_response': (data: PermissionResponse) => void;
  'viewer:control_granted': (data: ViewerControlResponse) => void;
  'viewer:control_denied': (data: { sessionId: string; reason: string }) => void;
  'host:ready': (data: { sessionId: string }) => void;
  'viewer:ready': (data: { sessionId: string }) => void;
  'signal:offer': (data: SignalData) => void;
  'signal:answer': (data: SignalData) => void;
  'signal:ice_candidate': (data: SignalData) => void;
  'session:started': (data: { sessionId: string }) => void;
  'session:ended': (data: { sessionId: string; reason: string }) => void;
  'error': (data: { code: string; message: string }) => void;
}

// Client → Server events
export interface ClientToServerEvents {
  'host:register': (data: HostInfo) => void;
  'host:unregister': () => void;
  'agent:register': (data: AgentInfo) => void;
  'agent:heartbeat': (data: { connectionId: string }) => void;
  'viewer:authenticate': (data: { connectionId: string; password: string }) => void;
  'viewer:request_control': (data: ViewerControlRequest) => void;
  'viewer:release_control': (data: ViewerControlRequest) => void;
  'host:permission_response': (data: PermissionResponse) => void;
  'host:ready': (data: { sessionId: string }) => void;
  'viewer:ready': (data: { sessionId: string }) => void;
  'signal:offer': (data: SignalData) => void;
  'signal:answer': (data: SignalData) => void;
  'signal:ice_candidate': (data: SignalData) => void;
  'session:end': (data: { sessionId: string }) => void;
}

export interface ConnectedHost {
  connectionId: string;
  socketId: string;
  passwordHash: string;
  connectedAt: number;
  busy: boolean;
}

export interface ActiveSession {
  sessionId: string;
  hostConnectionId: string;
  viewerSocketId: string; // primary viewer (first to connect)
  viewerSocketIds: string[]; // all connected viewers
  controllingViewerSocketId: string | null; // which viewer has control
  startedAt: number;
}
