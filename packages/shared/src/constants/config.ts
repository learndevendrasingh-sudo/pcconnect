// Shared configuration constants

export const CONFIG = {
  // Signaling server
  SIGNALING_PORT: parseInt(process.env.SIGNALING_PORT || '3001', 10),
  SIGNALING_URL: process.env.NEXT_PUBLIC_SIGNALING_URL || 'http://localhost:3001',

  // Heartbeat
  HEARTBEAT_INTERVAL: 30_000, // 30 seconds
  HEARTBEAT_TIMEOUT: 90_000, // 3 missed heartbeats = offline

  // Rate limiting
  MAX_AUTH_ATTEMPTS: 5,
  AUTH_WINDOW_MS: 60_000, // 1 minute window

  // Connection ID
  CONNECTION_ID_LENGTH: 9,
  CONNECTION_ID_PATTERN: /^\d{9}$/,

  // Password
  PASSWORD_LENGTH: 16,
  BCRYPT_SALT_ROUNDS: 12,

  // WebRTC
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ] as { urls: string }[],

  // File transfer
  FILE_CHUNK_SIZE: 16 * 1024, // 16KB
  MAX_FILE_SIZE: 500 * 1024 * 1024, // 500MB

  // DataChannel
  DATA_CHANNEL_INPUT: 'input',
  DATA_CHANNEL_FILE: 'file',
  DATA_CHANNEL_CHAT: 'chat',

  // Session
  MAX_SESSION_DURATION: 24 * 60 * 60 * 1000, // 24 hours
} as const;

// Environment detection
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
