import { create } from 'zustand';
import type { ConnectionState } from '@/lib/webrtc/peer-connection';
import type { QualityPreset, MonitorInfo, ChatMessage } from '@securedesk/shared';

export interface RemoteCursor {
  x: number; // normalized 0-1
  y: number; // normalized 0-1
  visible: boolean;
}

interface SessionState {
  // Connection
  sessionId: string | null;
  connectionState: ConnectionState;
  signalingConnected: boolean;

  // Session info
  hostConnectionId: string | null;
  startedAt: number | null;
  elapsedSeconds: number;

  // Quality
  quality: QualityPreset;
  latency: number;
  fps: number;

  // Remote cursor (shown on host when viewer is controlling)
  remoteCursor: RemoteCursor;

  // Input proxy connection
  inputProxyConnected: boolean;

  // Monitors
  monitors: MonitorInfo[];
  selectedMonitor: string | null;

  // Chat
  chatMessages: ChatMessage[];
  chatOpen: boolean;

  // File transfer
  fileTransferProgress: number | null;
  fileTransferName: string | null;
  fileOpen: boolean;

  // Audio
  audioEnabled: boolean; // speaker — hear remote audio
  micEnabled: boolean;   // microphone — send your audio

  // Actions
  setSessionId: (id: string | null) => void;
  setConnectionState: (state: ConnectionState) => void;
  setSignalingConnected: (connected: boolean) => void;
  setHostConnectionId: (id: string | null) => void;
  startTimer: () => void;
  tick: () => void;
  setQuality: (quality: QualityPreset) => void;
  setLatency: (latency: number) => void;
  setFps: (fps: number) => void;
  setRemoteCursor: (cursor: Partial<RemoteCursor>) => void;
  setInputProxyConnected: (connected: boolean) => void;
  setMonitors: (monitors: MonitorInfo[]) => void;
  selectMonitor: (id: string) => void;
  addChatMessage: (msg: ChatMessage) => void;
  toggleChat: () => void;
  setFileTransfer: (name: string | null, progress: number | null) => void;
  toggleFilePanel: () => void;
  toggleAudio: () => void;
  toggleMic: () => void;
  reset: () => void;
}

const initialState = {
  sessionId: null,
  connectionState: 'new' as ConnectionState,
  signalingConnected: false,
  hostConnectionId: null,
  startedAt: null,
  elapsedSeconds: 0,
  quality: 'auto' as QualityPreset,
  latency: 0,
  fps: 0,
  remoteCursor: { x: 0, y: 0, visible: false } as RemoteCursor,
  inputProxyConnected: false,
  monitors: [],
  selectedMonitor: null,
  chatMessages: [],
  chatOpen: false,
  fileTransferProgress: null,
  fileTransferName: null,
  fileOpen: false,
  audioEnabled: false,
  micEnabled: true,
};

export const useSessionStore = create<SessionState>((set) => ({
  ...initialState,

  setSessionId: (id) => set({ sessionId: id }),
  setConnectionState: (state) => set({ connectionState: state }),
  setSignalingConnected: (connected) => set({ signalingConnected: connected }),
  setHostConnectionId: (id) => set({ hostConnectionId: id }),
  startTimer: () => set({ startedAt: Date.now(), elapsedSeconds: 0 }),
  tick: () => set((s) => ({ elapsedSeconds: s.startedAt ? Math.floor((Date.now() - s.startedAt) / 1000) : 0 })),
  setQuality: (quality) => set({ quality }),
  setLatency: (latency) => set({ latency }),
  setFps: (fps) => set({ fps }),
  setRemoteCursor: (cursor) => set((s) => ({ remoteCursor: { ...s.remoteCursor, ...cursor } })),
  setInputProxyConnected: (connected) => set({ inputProxyConnected: connected }),
  setMonitors: (monitors) => set({ monitors }),
  selectMonitor: (id) => set({ selectedMonitor: id }),
  addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
  setFileTransfer: (name, progress) => set({ fileTransferName: name, fileTransferProgress: progress }),
  toggleFilePanel: () => set((s) => ({ fileOpen: !s.fileOpen })),
  toggleAudio: () => set((s) => ({ audioEnabled: !s.audioEnabled })),
  toggleMic: () => set((s) => ({ micEnabled: !s.micEnabled })),
  reset: () => set(initialState),
}));
