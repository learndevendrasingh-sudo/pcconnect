import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain, screen } from 'electron';
import path from 'path';
import { SignalingClient } from '../network/signaling-client';
import { WebRTCHost } from '../network/webrtc-host';
import { AgentDataChannelHandler } from '../network/data-channel';
import { InputHandler } from '../input/input-handler';
import { ConfigStore } from '../utils/config';
import { getSystemInfo } from '../utils/system-info';
import { createLogger } from '../utils/logger';
import type { PermissionRequest, MouseMessage, KeyboardMessage, SignalData } from '@securedesk/shared';

const logger = createLogger('main');
const config = new ConfigStore();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let signalingClient: SignalingClient | null = null;
let webrtcHost: WebRTCHost | null = null;
let inputHandler: InputHandler | null = null;
const dcHandler = new AgentDataChannelHandler();

// Buffer for offers that arrive before WebRTCHost is ready
let pendingOffer: SignalData | null = null;
let currentSessionId: string | null = null;

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ========== Auto-generate credentials on first launch ==========

function ensureCredentials() {
  let connectionId = config.get('connectionId', '');
  let password = config.get('password', '');

  if (!connectionId) {
    // Generate random 9-digit connection ID
    connectionId = Math.floor(100_000_000 + Math.random() * 900_000_000).toString();
    config.set('connectionId', connectionId);
    logger.info(`Generated new connection ID: ${connectionId}`);
  }

  if (!password) {
    // Generate random 16-char alphanumeric password
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    password = '';
    for (let i = 0; i < 16; i++) {
      password += chars[Math.floor(Math.random() * chars.length)];
    }
    config.set('password', password);
    logger.info('Generated new password');
  }

  return { connectionId, password };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 520,
    minWidth: 380,
    minHeight: 480,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0a1a',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, '../../resources/icon.ico'),
    show: false,
  });

  // Load the UI
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, '../../resources/tray-icon.png')
  );
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);

  const connectionId = config.get('connectionId', 'Not registered');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `ID: ${connectionId}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Show Window',
      click: () => mainWindow?.show(),
    },
    {
      label: 'Copy Connection ID',
      click: () => {
        const { clipboard } = require('electron');
        clipboard.writeText(config.get('connectionId', ''));
      },
    },
    {
      label: 'Generate New Password',
      click: () => regeneratePassword(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        mainWindow?.destroy();
        app.quit();
      },
    },
  ]);

  tray.setToolTip('SecureDesk Agent');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => mainWindow?.show());
}

async function regeneratePassword() {
  // Generate a new password locally and reconnect
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  config.set('password', password);
  mainWindow?.webContents.send('password-updated', password);

  // Re-register with signaling server to update the password hash
  if (signalingClient?.isConnected) {
    signalingClient.disconnect();
    connectToSignaling();
  }
}

async function showPermissionDialog(request: PermissionRequest): Promise<boolean> {
  const result = await dialog.showMessageBox(mainWindow || new BrowserWindow({ show: false }), {
    type: 'question',
    buttons: ['Allow', 'Deny'],
    defaultId: 1,
    cancelId: 1,
    title: 'Connection Request',
    message: `Remote Connection Request`,
    detail: `Session: ${request.sessionId}\nIP: ${request.viewerIp}\n\nAllow this user to control your desktop?`,
    icon: nativeImage.createFromPath(path.join(__dirname, '../../resources/icon.ico')),
  });

  return result.response === 0; // 0 = Allow
}

function connectToSignaling() {
  const { connectionId, password } = ensureCredentials();
  const signalingUrl = config.get('signalingUrl', 'http://localhost:3001');

  const systemInfo = getSystemInfo();

  signalingClient = new SignalingClient(signalingUrl, {
    onConnect: () => {
      logger.info('Connected to signaling server');
      signalingClient?.register({
        connectionId,
        password, // Now included — server will hash it
        userId: config.get('userId', ''),
        hostname: systemInfo.hostname,
        os: systemInfo.os,
        version: app.getVersion(),
      });
      mainWindow?.webContents.send('status-update', 'online');
    },
    onDisconnect: () => {
      logger.info('Disconnected from signaling server');
      mainWindow?.webContents.send('status-update', 'offline');
    },
    onRegistered: (data) => {
      logger.info(`Registered with ID: ${data.connectionId}`);
    },
    onPermissionRequest: async (request) => {
      logger.info(`Permission request from: ${request.viewerIp}`);
      mainWindow?.show();

      const granted = await showPermissionDialog(request);

      signalingClient?.respondPermission(request.sessionId, granted);

      if (granted) {
        currentSessionId = request.sessionId;
        pendingOffer = null;
        await startWebRTCHost(request.sessionId);
      }
    },
    onSessionStarted: (data) => {
      logger.info(`Session started: ${data.sessionId}`);
      mainWindow?.webContents.send('session-started', data.sessionId);
    },
    onSessionEnded: (data) => {
      logger.info(`Session ended: ${data.sessionId} - ${data.reason}`);
      webrtcHost?.close();
      webrtcHost = null;
      pendingOffer = null;
      currentSessionId = null;
      mainWindow?.webContents.send('session-ended', data.reason);
      mainWindow?.webContents.send('status-update', 'online');
    },
    onOffer: async (data) => {
      if (!data.sdp) return;

      if (webrtcHost) {
        // WebRTCHost is ready — handle offer immediately
        try {
          const answer = await webrtcHost.handleOffer(data.sdp);
          signalingClient?.sendAnswer(data.sessionId, answer);
        } catch (err) {
          logger.error('Failed to handle offer:', err);
        }
      } else {
        // WebRTCHost not ready yet — buffer the offer
        logger.info('[Agent] Buffering offer — WebRTCHost not ready yet');
        pendingOffer = data;
      }
    },
    onIceCandidate: async (data) => {
      if (data.candidate && webrtcHost) {
        await webrtcHost.addIceCandidate(data.candidate);
      }
    },
  });

  signalingClient.connect();
}

async function startWebRTCHost(sessionId: string) {
  const primaryDisplay = screen.getPrimaryDisplay();

  // Initialize input handler for mouse/keyboard control
  if (!inputHandler) {
    inputHandler = new InputHandler();
  }
  inputHandler.updateScreenSize();

  // Wire data channel handler → input handler
  dcHandler.setInputHandler(async (msg) => {
    if (msg.type === 'mouse') {
      await inputHandler!.handleMouse(msg as MouseMessage);
    } else if (msg.type === 'keyboard') {
      await inputHandler!.handleKeyboard(msg as KeyboardMessage);
    }
  });

  webrtcHost = new WebRTCHost({
    sessionId,
    display: primaryDisplay,
    onIceCandidate: (candidate) => {
      signalingClient?.sendIceCandidate(sessionId, candidate);
    },
    onDataChannelMessage: (channel, data) => {
      // Route data channel messages through the handler
      dcHandler.handleMessage(channel, data);
    },
    onConnectionStateChange: (state) => {
      logger.info(`WebRTC state: ${state}`);
      mainWindow?.webContents.send('webrtc-state', state);
    },
  });

  await webrtcHost.start();
  mainWindow?.webContents.send('status-update', 'busy');

  // Signal to viewer that host is ready
  signalingClient?.sendHostReady(sessionId);
  logger.info('[Agent] Sent HOST_READY signal');

  // Process any buffered offer
  if (pendingOffer && pendingOffer.sdp) {
    logger.info('[Agent] Processing buffered offer');
    try {
      const answer = await webrtcHost.handleOffer(pendingOffer.sdp);
      signalingClient?.sendAnswer(pendingOffer.sessionId, answer);
    } catch (err) {
      logger.error('Failed to handle buffered offer:', err);
    }
    pendingOffer = null;
  }
}

// ========== IPC Handlers ==========

ipcMain.handle('get-config', () => ({
  connectionId: config.get('connectionId', ''),
  password: config.get('password', ''),
  status: signalingClient?.isConnected ? 'online' : 'offline',
  version: app.getVersion(),
  systemInfo: getSystemInfo(),
}));

ipcMain.handle('get-displays', () => {
  return screen.getAllDisplays().map((d) => ({
    id: d.id.toString(),
    name: `Display ${d.id}`,
    width: d.size.width,
    height: d.size.height,
    isPrimary: d.id === screen.getPrimaryDisplay().id,
  }));
});

ipcMain.handle('minimize-window', () => mainWindow?.minimize());
ipcMain.handle('close-window', () => mainWindow?.hide());

// ========== App Lifecycle ==========

app.whenReady().then(() => {
  ensureCredentials();
  createMainWindow();
  createTray();
  connectToSignaling();

  // Heartbeat — reconnect if disconnected
  setInterval(() => {
    if (signalingClient && !signalingClient.isConnected) {
      logger.info('Reconnecting to signaling server...');
      signalingClient.connect();
    }
  }, 30_000);
});

app.on('window-all-closed', (e: Event) => {
  e.preventDefault(); // Keep running in tray
});

app.on('before-quit', () => {
  signalingClient?.disconnect();
  webrtcHost?.close();
  tray?.destroy();
});
