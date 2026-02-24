// Socket.IO event name constants — prevents typos across packages

export const SIGNALING_EVENTS = {
  // Host events
  HOST_REGISTER: 'host:register',
  HOST_REGISTERED: 'host:registered',
  HOST_UNREGISTER: 'host:unregister',

  // Agent events
  AGENT_REGISTER: 'agent:register',
  AGENT_REGISTERED: 'agent:registered',
  AGENT_HEARTBEAT: 'agent:heartbeat',

  // Viewer events
  VIEWER_AUTHENTICATE: 'viewer:authenticate',
  VIEWER_AUTHENTICATED: 'viewer:authenticated',

  // Permission events
  HOST_PERMISSION_REQUEST: 'host:permission_request',
  HOST_PERMISSION_RESPONSE: 'host:permission_response',

  // Viewer control events (multi-viewer)
  VIEWER_REQUEST_CONTROL: 'viewer:request_control',
  VIEWER_RELEASE_CONTROL: 'viewer:release_control',
  VIEWER_CONTROL_GRANTED: 'viewer:control_granted',
  VIEWER_CONTROL_DENIED: 'viewer:control_denied',

  // Host ready (host finished screen capture / WebRTC setup)
  HOST_READY: 'host:ready',

  // Viewer ready (viewer session page loaded, PeerConnection created)
  VIEWER_READY: 'viewer:ready',

  // WebRTC signaling events
  SIGNAL_OFFER: 'signal:offer',
  SIGNAL_ANSWER: 'signal:answer',
  SIGNAL_ICE_CANDIDATE: 'signal:ice_candidate',

  // Session events
  SESSION_STARTED: 'session:started',
  SESSION_ENDED: 'session:ended',
  SESSION_END: 'session:end',

  // Error
  ERROR: 'error',
} as const;

export type SignalingEvent = (typeof SIGNALING_EVENTS)[keyof typeof SIGNALING_EVENTS];
