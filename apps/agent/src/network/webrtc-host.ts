import { BrowserWindow, desktopCapturer, ipcMain, type Display } from 'electron';
import path from 'path';
import { CONFIG } from '@securedesk/shared';

interface WebRTCHostOptions {
  sessionId: string;
  display: Display;
  onIceCandidate: (candidate: RTCIceCandidateInit) => void;
  onDataChannelMessage: (channel: string, data: string) => void;
  onConnectionStateChange: (state: string) => void;
}

/**
 * WebRTC Host — uses a hidden BrowserWindow's renderer process for
 * Chromium's full WebRTC stack (RTCPeerConnection is not available
 * in Electron's main process).
 *
 * Flow:
 *  1. Main process gets desktop source ID via desktopCapturer
 *  2. Sends source ID to hidden renderer via IPC
 *  3. Hidden renderer captures screen using getUserMedia + chromeMediaSource
 *  4. Hidden renderer creates RTCPeerConnection, adds tracks, handles offer/answer
 *  5. All signaling relayed via IPC: main ↔ hidden renderer
 */
export class WebRTCHost {
  private options: WebRTCHostOptions;
  private hiddenWindow: BrowserWindow | null = null;
  private ipcHandlersBound = false;

  constructor(options: WebRTCHostOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    // Get screen capture source ID from main process
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
    });

    const source = sources.find(
      (s) => s.display_id === this.options.display.id.toString()
    ) || sources[0];

    if (!source) {
      throw new Error('No screen capture source available');
    }

    // Create hidden BrowserWindow for WebRTC
    this.hiddenWindow = new BrowserWindow({
      show: false,
      width: 1,
      height: 1,
      webPreferences: {
        preload: path.join(__dirname, '../preload/webrtc-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    // Load the WebRTC renderer HTML
    this.hiddenWindow.loadFile(path.join(__dirname, '../renderer/webrtc-host.html'));

    // Bind IPC handlers for this session
    this.bindIpcHandlers();

    // Wait for renderer to be ready, then initialize
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Hidden renderer timed out')), 10000);

      ipcMain.once('webrtc:ready', () => {
        clearTimeout(timeout);
        // Send initialization data to renderer
        this.hiddenWindow?.webContents.send('webrtc:init', {
          sourceId: source.id,
          sessionId: this.options.sessionId,
          iceServers: CONFIG.ICE_SERVERS,
        });
        resolve();
      });
    });
  }

  private bindIpcHandlers() {
    if (this.ipcHandlersBound) return;
    this.ipcHandlersBound = true;

    // Renderer → Main: ICE candidate generated
    ipcMain.on('webrtc:ice-candidate', (_event, candidate: RTCIceCandidateInit) => {
      this.options.onIceCandidate(candidate);
    });

    // Renderer → Main: connection state changed
    ipcMain.on('webrtc:connection-state', (_event, state: string) => {
      this.options.onConnectionStateChange(state);
    });

    // Renderer → Main: data channel message received
    ipcMain.on('webrtc:datachannel-message', (_event, data: { channel: string; message: string }) => {
      this.options.onDataChannelMessage(data.channel, data.message);
    });
  }

  private unbindIpcHandlers() {
    if (!this.ipcHandlersBound) return;
    ipcMain.removeAllListeners('webrtc:ice-candidate');
    ipcMain.removeAllListeners('webrtc:connection-state');
    ipcMain.removeAllListeners('webrtc:datachannel-message');
    this.ipcHandlersBound = false;
  }

  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.hiddenWindow) throw new Error('Hidden window not initialized');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Answer generation timed out')), 15000);

      ipcMain.once('webrtc:answer', (_event, answer: RTCSessionDescriptionInit) => {
        clearTimeout(timeout);
        resolve(answer);
      });

      // Forward offer to hidden renderer
      this.hiddenWindow!.webContents.send('webrtc:offer', offer);
    });
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.hiddenWindow) return;
    this.hiddenWindow.webContents.send('webrtc:remote-ice-candidate', candidate);
  }

  close() {
    this.unbindIpcHandlers();
    if (this.hiddenWindow) {
      this.hiddenWindow.webContents.send('webrtc:close');
      this.hiddenWindow.destroy();
      this.hiddenWindow = null;
    }
  }
}
