import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script for the hidden WebRTC BrowserWindow.
 * Exposes IPC bridge so the renderer can communicate WebRTC events
 * back to the main process without nodeIntegration.
 */
contextBridge.exposeInMainWorld('webrtcBridge', {
  // Renderer → Main
  sendReady: () => ipcRenderer.send('webrtc:ready'),
  sendIceCandidate: (candidate: RTCIceCandidateInit) => ipcRenderer.send('webrtc:ice-candidate', candidate),
  sendConnectionState: (state: string) => ipcRenderer.send('webrtc:connection-state', state),
  sendDataChannelMessage: (channel: string, message: string) => ipcRenderer.send('webrtc:datachannel-message', { channel, message }),
  sendAnswer: (answer: RTCSessionDescriptionInit) => ipcRenderer.send('webrtc:answer', answer),

  // Main → Renderer
  onInit: (callback: (data: { sourceId: string; sessionId: string; iceServers: RTCIceServer[] }) => void) => {
    ipcRenderer.on('webrtc:init', (_event, data) => callback(data));
  },
  onOffer: (callback: (offer: RTCSessionDescriptionInit) => void) => {
    ipcRenderer.on('webrtc:offer', (_event, offer) => callback(offer));
  },
  onRemoteIceCandidate: (callback: (candidate: RTCIceCandidateInit) => void) => {
    ipcRenderer.on('webrtc:remote-ice-candidate', (_event, candidate) => callback(candidate));
  },
  onClose: (callback: () => void) => {
    ipcRenderer.on('webrtc:close', () => callback());
  },
});
