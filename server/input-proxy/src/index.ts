import { randomBytes } from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { InputExecutor } from './input-executor';
import type { DataChannelMessage, MouseMessage, KeyboardMessage } from '@securedesk/shared';

const PORT = Number(process.env.INPUT_PROXY_PORT || 3002);
const AUTH_TIMEOUT_MS = 5000;

function main() {
  const executor = new InputExecutor();

  // Generate or use provided auth token
  const authToken = process.env.INPUT_PROXY_TOKEN || randomBytes(32).toString('hex');
  const authenticatedClients = new WeakSet<WebSocket>();

  const wss = new WebSocketServer({
    port: PORT,
    // Omit host to listen on both IPv4 and IPv6 (dual-stack)
  });

  console.log(`\n  SecureDesk Input Proxy`);
  console.log(`  =====================`);
  console.log(`  Listening on ws://localhost:${PORT}`);
  console.log(`  Auth token: ${authToken}`);
  console.log(`  Ready to receive mouse/keyboard commands from web host.\n`);
  console.log(`  Set NEXT_PUBLIC_INPUT_PROXY_TOKEN=${authToken} in apps/web/.env.local`);
  console.log(`  The web host page will auto-connect to this proxy.`);
  console.log(`  Make sure the web app is running on the SAME machine.\n`);

  wss.on('connection', (ws: WebSocket, req) => {
    const origin = req.headers.origin || 'unknown';
    console.log(`[InputProxy] Client connected from ${origin}`);

    // Require authentication within timeout
    const authTimer = setTimeout(() => {
      if (!authenticatedClients.has(ws)) {
        console.warn('[InputProxy] Auth timeout — closing unauthenticated connection');
        ws.close(4001, 'Authentication timeout');
      }
    }, AUTH_TIMEOUT_MS);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // First message must be auth
        if (!authenticatedClients.has(ws)) {
          if (msg.type === 'auth' && msg.token === authToken) {
            authenticatedClients.add(ws);
            clearTimeout(authTimer);
            console.log('[InputProxy] Client authenticated successfully');
            ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));
          } else {
            console.warn('[InputProxy] Authentication failed — invalid token');
            ws.close(4003, 'Authentication failed');
          }
          return;
        }

        // Authenticated — process input messages
        const inputMsg = msg as DataChannelMessage;
        switch (inputMsg.type) {
          case 'mouse':
            executor.handleMouse(inputMsg as MouseMessage);
            break;
          case 'keyboard':
            executor.handleKeyboard(inputMsg as KeyboardMessage);
            break;
          case 'release_keys':
            executor.handleReleaseKeys();
            break;
        }
      } catch (err) {
        console.error('[InputProxy] Error processing message:', err);
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      console.log('[InputProxy] Client disconnected');
    });

    ws.on('error', (err) => {
      clearTimeout(authTimer);
      console.error('[InputProxy] WebSocket error:', err);
    });
  });

  wss.on('error', (err) => {
    console.error('[InputProxy] Server error:', err);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[InputProxy] Shutting down...');
    wss.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    wss.close();
    process.exit(0);
  });
}

main();
