import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),

  // Event listeners
  onStatusUpdate: (callback: (status: string) => void) => {
    ipcRenderer.on('status-update', (_event, status) => callback(status));
  },
  onSessionStarted: (callback: (sessionId: string) => void) => {
    ipcRenderer.on('session-started', (_event, sessionId) => callback(sessionId));
  },
  onSessionEnded: (callback: (reason: string) => void) => {
    ipcRenderer.on('session-ended', (_event, reason) => callback(reason));
  },
  onPasswordUpdated: (callback: (password: string) => void) => {
    ipcRenderer.on('password-updated', (_event, password) => callback(password));
  },
});
