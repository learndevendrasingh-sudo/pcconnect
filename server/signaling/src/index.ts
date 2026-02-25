import express from 'express';
import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync, existsSync } from 'fs';
import { Server } from 'socket.io';
import cors from 'cors';
import { CONFIG } from '@securedesk/shared';
import type { ServerToClientEvents, ClientToServerEvents } from '@securedesk/shared';
import { setupSocketHandlers } from './socket-handler';
import { RoomManager } from './room-manager';
import { RateLimiter } from './rate-limiter';

const app = express();

// TLS/SSL: use HTTPS if cert+key are provided, otherwise fall back to HTTP
const sslCert = process.env.SSL_CERT_PATH;
const sslKey = process.env.SSL_KEY_PATH;
const useTLS = sslCert && sslKey && existsSync(sslCert) && existsSync(sslKey);

const httpServer = useTLS
  ? createHttpsServer(
      {
        cert: readFileSync(sslCert!),
        key: readFileSync(sslKey!),
      },
      app
    )
  : createHttpServer(app);

const isDev = process.env.NODE_ENV !== 'production';
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:3000'];

// In development, accept any origin so LAN access works with any IP
app.use(cors({ origin: isDev ? true : allowedOrigins, credentials: true }));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    connectedHosts: roomManager.getOnlineHostCount(),
    activeSessions: roomManager.getActiveSessionCount(),
  });
});

// Socket.IO server
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: isDev ? true : allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 25000,
  pingTimeout: 60000,
  transports: ['websocket', 'polling'],
});

const roomManager = new RoomManager();
const rateLimiter = new RateLimiter();

// Setup handlers
setupSocketHandlers(io, roomManager, rateLimiter);

const PORT = parseInt(process.env.PORT || String(CONFIG.SIGNALING_PORT), 10);

httpServer.listen(PORT, '0.0.0.0', () => {
  const protocol = useTLS ? 'wss' : 'ws';
  console.log(`[Signaling] Server running on ${protocol}://0.0.0.0:${PORT}`);
  if (useTLS) {
    console.log(`[Signaling] TLS enabled — cert: ${sslCert}, key: ${sslKey}`);
  } else {
    console.log(`[Signaling] TLS disabled — set SSL_CERT_PATH and SSL_KEY_PATH for WSS`);
  }
  console.log(`[Signaling] Allowed origins: ${allowedOrigins.join(', ')}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Signaling] SIGTERM received, shutting down...');
  httpServer.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[Signaling] SIGINT received, shutting down...');
  httpServer.close(() => process.exit(0));
});
