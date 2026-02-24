import { create } from 'zustand';

export type HostState = 'idle' | 'sharing' | 'ready' | 'permission_prompt' | 'connected';
export type ViewerState = 'idle' | 'authenticating' | 'waiting_approval' | 'connected' | 'denied';

interface AppStore {
  // Mode
  mode: 'idle' | 'host' | 'viewer';

  // Host state
  hostState: HostState;
  connectionId: string;
  password: string;
  locked: boolean;
  allowRemoteControl: boolean;
  pendingViewer: { sessionId: string; viewerIp: string } | null;
  sessionId: string | null;

  // Viewer state
  viewerState: ViewerState;
  targetId: string;
  targetPassword: string;
  viewerSessionId: string | null;
  error: string | null;

  // Host actions
  setMode: (mode: AppStore['mode']) => void;
  setHostState: (state: HostState) => void;
  setHostCredentials: (connectionId: string, password: string) => void;
  setPendingViewer: (viewer: AppStore['pendingViewer']) => void;
  setSessionId: (id: string | null) => void;
  setLocked: (locked: boolean) => void;
  setAllowRemoteControl: (allow: boolean) => void;

  // Viewer actions
  setViewerState: (state: ViewerState) => void;
  setTargetId: (id: string) => void;
  setTargetPassword: (password: string) => void;
  setViewerSessionId: (id: string | null) => void;
  setError: (error: string | null) => void;

  // Reset
  reset: () => void;
  resetViewer: () => void;
}

const initialState = {
  mode: 'idle' as const,
  hostState: 'idle' as const,
  connectionId: '',
  password: '',
  locked: false,
  allowRemoteControl: true,
  pendingViewer: null,
  sessionId: null,
  viewerState: 'idle' as const,
  targetId: '',
  targetPassword: '',
  viewerSessionId: null,
  error: null,
};

export const useAppStore = create<AppStore>((set) => ({
  ...initialState,

  setMode: (mode) => set({ mode }),
  setHostState: (hostState) => set({ hostState }),
  setHostCredentials: (connectionId, password) => set({ connectionId, password }),
  setPendingViewer: (pendingViewer) => set({ pendingViewer }),
  setSessionId: (sessionId) => set({ sessionId }),
  setLocked: (locked) => set({ locked }),
  setAllowRemoteControl: (allowRemoteControl) => set({ allowRemoteControl }),

  setViewerState: (viewerState) => set({ viewerState }),
  setTargetId: (targetId) => set({ targetId: targetId.replace(/\D/g, '').slice(0, 9) }),
  setTargetPassword: (targetPassword) => set({ targetPassword }),
  setViewerSessionId: (viewerSessionId) => set({ viewerSessionId }),
  setError: (error) => set({ error }),

  reset: () => set(initialState),
  resetViewer: () => set({
    viewerState: 'idle',
    targetId: '',
    targetPassword: '',
    viewerSessionId: null,
    error: null,
  }),
}));
