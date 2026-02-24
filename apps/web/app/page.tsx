'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Monitor, Wifi, Copy, Check, RefreshCw, X, Loader2, Lock, Unlock, RotateCcw, MousePointer } from 'lucide-react';
import { AnimatedBackground } from '@/components/shared/animated-bg';
import { useAppStore } from '@/lib/stores/connection-store';
import { signalingManager } from '@/lib/webrtc/signaling-manager';
import { generateConnectionId } from '@/lib/utils';
import { setHostDisplayStream, clearHostDisplayStream } from '@/lib/webrtc/media-store';

function generatePassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export default function HomePage() {
  const router = useRouter();
  const store = useAppStore();
  const [copied, setCopied] = useState<'id' | 'password' | null>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [hostError, setHostError] = useState<string | null>(null);

  const registerSignaling = useCallback((connId: string, pass: string) => {
    const signaling = signalingManager.createClient({
      onConnect: () => {
        signaling.registerAsHost(connId, pass);
      },
      onRegistered: (data) => {
        if (data.success) {
          store.setHostState('ready');
        }
      },
      onPermissionRequest: (data) => {
        store.setHostState('permission_prompt');
        store.setPendingViewer({ sessionId: data.sessionId, viewerIp: data.viewerIp });
      },
      onSessionStarted: (data) => {
        store.setSessionId(data.sessionId);
        store.setHostState('connected');
        const control = useAppStore.getState().allowRemoteControl ? '1' : '0';
        router.push(`/session/${data.sessionId}?role=host&control=${control}`);
      },
      onSessionEnded: () => {
        clearHostDisplayStream();
        setPreviewStream(null);
        store.reset();
      },
    });
    signaling.connect();
  }, [store, router]);

  const startSharing = useCallback(async () => {
    store.setMode('host');
    store.setHostState('sharing');
    setHostError(null);

    let displayStream: MediaStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 60 },
          cursor: 'always',
        } as MediaTrackConstraints,
        audio: {
          channelCount: 2,
          sampleRate: 48000,
          autoGainControl: false,
          noiseSuppression: false,
          echoCancellation: false,
        } as MediaTrackConstraints,
      });
    } catch (err) {
      console.error('[Host] Screen capture failed:', err);
      const isNotAllowed = err instanceof Error && err.name === 'NotAllowedError';
      const isNotFound = err instanceof Error && err.name === 'NotFoundError';
      const isAbort = err instanceof Error && err.name === 'AbortError';
      setHostError(
        isNotAllowed || isAbort
          ? 'Screen sharing was cancelled. Click Start Sharing to try again.'
          : isNotFound
            ? 'No screen or window was found to share.'
            : 'Screen sharing is not available. If using a network IP, try opening localhost:3000 instead (HTTPS required for non-localhost).'
      );
      store.reset();
      return;
    }

    setHostDisplayStream(displayStream);
    setPreviewStream(displayStream);

    displayStream.getVideoTracks()[0].onended = () => {
      console.log('[Host] Screen sharing stopped by user via browser UI');
      clearHostDisplayStream();
      setPreviewStream(null);
      const signaling = signalingManager.getClient();
      signaling?.unregisterHost();
      signalingManager.disconnect();
      store.reset();
    };

    const connId = generateConnectionId();
    const pass = generatePassword();
    store.setHostCredentials(connId, pass);
    registerSignaling(connId, pass);
  }, [store, registerSignaling]);

  const handlePermission = useCallback((granted: boolean) => {
    const pending = store.pendingViewer;
    const signaling = signalingManager.getClient();
    if (!pending || !signaling) return;

    signaling.respondToPermission(pending.sessionId, granted);

    if (granted) {
      store.setHostState('connected');
    } else {
      store.setPendingViewer(null);
      store.setHostState('ready');
    }
  }, [store]);

  const stopSharing = useCallback(() => {
    clearHostDisplayStream();
    setPreviewStream(null);
    const signaling = signalingManager.getClient();
    signaling?.unregisterHost();
    signalingManager.disconnect();
    store.reset();
  }, [store]);

  const resetHost = useCallback(() => {
    const signaling = signalingManager.getClient();
    signaling?.unregisterHost();
    signalingManager.disconnect();

    const connId = generateConnectionId();
    const pass = generatePassword();

    store.setHostCredentials(connId, pass);
    store.setHostState('sharing');
    registerSignaling(connId, pass);
  }, [store, registerSignaling]);

  const connectToHost = useCallback(() => {
    const { targetId, targetPassword } = useAppStore.getState();
    if (!targetId || !targetPassword) return;

    store.setMode('viewer');
    store.setViewerState('authenticating');
    store.setError(null);

    const signaling = signalingManager.createClient({
      onConnect: () => {
        signaling.authenticate(targetId, targetPassword);
      },
      onAuthenticated: (data) => {
        if (data.success) {
          store.setViewerSessionId(data.sessionId);
          store.setViewerState('waiting_approval');
        } else {
          store.setError(data.error || 'Connection failed.');
          store.setViewerState('idle');
        }
      },
      onSessionStarted: (data) => {
        store.setViewerState('connected');
        router.push(`/session/${data.sessionId}?role=viewer`);
      },
      onSessionEnded: (data) => {
        store.setError(data.reason);
        store.setViewerState('idle');
      },
    });

    signaling.connect();
  }, [store, router]);

  const cancelConnect = useCallback(() => {
    signalingManager.disconnect();
    store.resetViewer();
    store.setMode('idle');
  }, [store]);

  const copyToClipboard = useCallback((text: string, type: 'id' | 'password') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0c1a30]">
      <AnimatedBackground />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-4">
        <div className="w-16 sm:w-20" />
        <div className="flex items-center gap-2.5">
          <Shield className="h-7 w-7 sm:h-8 sm:w-8 text-[#5b87f7]" />
          <span className="text-lg sm:text-xl font-bold text-[#edf2fc] tracking-tight">SecureDesk</span>
        </div>
        <div className="w-16 sm:w-20 flex justify-end">
          <button
            onClick={() => {
              signalingManager.disconnect();
              store.reset();
              window.location.reload();
            }}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#1c3860] text-[#90acd0] hover:bg-[#1e3f68] hover:text-[#b0c4e8] transition-colors text-xs"
            title="Refresh & Reset"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </nav>

      {/* Main */}
      <main className="relative z-10 flex flex-col items-center px-4 pt-4 sm:pt-8 pb-16">
        <p className="text-[#5e80a8] text-xs sm:text-sm mb-6 sm:mb-8 text-center tracking-wide">
          Secure peer-to-peer remote desktop. No accounts. No installs.
        </p>

        {/* Two-panel layout */}
        <div className="w-full max-w-4xl grid gap-4 sm:gap-6 md:grid-cols-2">

          {/* ===== LEFT: Share Your Screen ===== */}
          <div className="glass-card p-4 sm:p-6 flex flex-col min-h-[340px] sm:min-h-[380px]">
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
              <div className="w-10 h-10 rounded-xl bg-[#1e3f68] flex items-center justify-center">
                <Monitor className="h-5 w-5 text-[#5b87f7]" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-[#edf2fc]">Share Your Screen</h2>
                <p className="text-xs text-[#5e80a8]">Let someone connect to your PC</p>
              </div>
            </div>

            {store.hostState === 'idle' || store.mode !== 'host' ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 py-6 sm:py-8">
                {hostError && (
                  <div className="bg-[#2a1520] border border-[#5c2035] rounded-lg px-4 py-2 text-sm text-[#f87171] w-full">
                    {hostError}
                  </div>
                )}
                <p className="text-sm text-[#7094be] text-center">
                  Click below to share your screen and get a Connection ID
                </p>
                <button
                  onClick={startSharing}
                  className="w-full py-3 rounded-xl bg-[#2b5ddb] text-[#edf2fc] font-semibold hover:bg-[#3b6cf5] transition-all shadow-lg shadow-[#2b5ddb]/20"
                >
                  Start Sharing
                </button>
              </div>
            ) : store.hostState === 'sharing' ? (
              <div className="flex-1 flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 text-[#5b87f7] animate-spin" />
                <span className="ml-2 text-[#90acd0]">Setting up...</span>
              </div>
            ) : store.hostState === 'ready' ? (
              <div className="flex-1 flex flex-col gap-3 sm:gap-4">
                <div>
                  <label className="text-[10px] sm:text-xs text-[#5e80a8] uppercase tracking-wider font-medium">Your ID</label>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 bg-[#0c1a30] border border-[#1e3f68] rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 font-mono text-lg sm:text-xl tracking-widest text-[#5b87f7] text-center">
                      {store.connectionId.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}
                    </div>
                    <button
                      onClick={() => copyToClipboard(store.connectionId, 'id')}
                      className="p-2.5 sm:p-3 rounded-lg bg-[#1c3860] hover:bg-[#1e3f68] transition-colors"
                    >
                      {copied === 'id' ? <Check className="h-4 w-4 text-[#34d399]" /> : <Copy className="h-4 w-4 text-[#5e80a8]" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] sm:text-xs text-[#5e80a8] uppercase tracking-wider font-medium">Password</label>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 bg-[#0c1a30] border border-[#1e3f68] rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 font-mono text-base sm:text-lg text-[#b0c4e8] text-center">
                      {store.password}
                    </div>
                    <button
                      onClick={() => copyToClipboard(store.password, 'password')}
                      className="p-2.5 sm:p-3 rounded-lg bg-[#1c3860] hover:bg-[#1e3f68] transition-colors"
                    >
                      {copied === 'password' ? <Check className="h-4 w-4 text-[#34d399]" /> : <Copy className="h-4 w-4 text-[#5e80a8]" />}
                    </button>
                  </div>
                </div>

                {/* Live screen preview */}
                {previewStream && (
                  <div className="mt-1 rounded-lg overflow-hidden border border-[#1e3f68] bg-[#071020] aspect-video relative">
                    <video
                      ref={(el) => {
                        if (el && el.srcObject !== previewStream) {
                          el.srcObject = previewStream;
                          el.play().catch(() => {});
                        }
                      }}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute top-1.5 left-1.5 flex items-center gap-1.5 bg-[#071020]/80 rounded px-2 py-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#f87171] animate-pulse" />
                      <span className="text-[10px] text-[#90acd0]">Screen capture active</span>
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-3 mt-1 sm:mt-2 px-3 py-2.5 rounded-lg bg-[#0c1a30] border border-[#1e3f68] cursor-pointer hover:border-[#2a5080] transition-colors">
                  <input
                    type="checkbox"
                    checked={store.allowRemoteControl}
                    onChange={(e) => store.setAllowRemoteControl(e.target.checked)}
                    className="w-4 h-4 rounded border-[#1e3f68] bg-[#112640] text-[#3b6cf5] focus:ring-[#3b6cf5]/30 accent-[#3b6cf5]"
                  />
                  <div className="flex items-center gap-2 flex-1">
                    <MousePointer className="h-3.5 w-3.5 text-[#5b87f7]" />
                    <span className="text-sm text-[#96b0d5]">Allow Remote Control</span>
                  </div>
                  <span className="text-[10px] text-[#406085] uppercase font-medium">
                    {store.allowRemoteControl ? 'Full Control' : 'View Only'}
                  </span>
                </label>

                <div className="flex items-center justify-between mt-1 sm:mt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#34d399] animate-pulse" />
                    <span className="text-sm text-[#7094be]">Waiting for viewer...</span>
                  </div>
                  <button
                    onClick={() => store.setLocked(!store.locked)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      store.locked
                        ? 'bg-[#3d2f10] text-[#fbbf24] border border-[#5c4a1a]'
                        : 'bg-[#1c3860] text-[#5e80a8] hover:bg-[#1e3f68]'
                    }`}
                    title={store.locked ? 'ID & Password are locked. Unlock to reset.' : 'Lock ID & Password to keep them after reconnections.'}
                  >
                    {store.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    {store.locked ? 'Locked' : 'Lock'}
                  </button>
                </div>

                <div className="flex gap-2 mt-auto">
                  <button
                    onClick={resetHost}
                    disabled={store.locked}
                    className="flex-1 py-2 rounded-lg bg-[#1c3860] text-[#90acd0] hover:bg-[#1e3f68] transition-colors text-sm flex items-center justify-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> New ID
                  </button>
                  <button
                    onClick={stopSharing}
                    className="flex-1 py-2 rounded-lg bg-[#2a1520] text-[#f87171] hover:bg-[#3a1a28] transition-colors text-sm flex items-center justify-center gap-1 border border-[#5c2035]"
                  >
                    <X className="h-3.5 w-3.5" /> Stop
                  </button>
                </div>
              </div>
            ) : store.hostState === 'permission_prompt' ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 py-4">
                <div className="w-16 h-16 rounded-full bg-[#3d2f10] flex items-center justify-center mb-2">
                  <Wifi className="h-8 w-8 text-[#fbbf24]" />
                </div>
                <h3 className="text-lg font-semibold text-[#edf2fc]">Connection Request</h3>
                <p className="text-sm text-[#7094be] text-center">
                  Someone wants to connect to your screen
                  {store.pendingViewer?.viewerIp && (
                    <span className="block text-xs text-[#5e80a8] mt-1">
                      IP: {store.pendingViewer.viewerIp}
                    </span>
                  )}
                </p>
                <div className="flex gap-3 w-full mt-2">
                  <button
                    onClick={() => handlePermission(false)}
                    className="flex-1 py-3 rounded-xl bg-[#1c3860] border border-[#1e3f68] text-[#90acd0] hover:bg-[#1e3f68] transition-all font-medium"
                  >
                    Deny
                  </button>
                  <button
                    onClick={() => handlePermission(true)}
                    className="flex-1 py-3 rounded-xl bg-[#166534] text-[#edf2fc] hover:bg-[#15803d] transition-all font-medium shadow-lg shadow-[#166534]/20"
                  >
                    Allow
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* ===== RIGHT: Connect to PC ===== */}
          <div className="glass-card p-4 sm:p-6 flex flex-col min-h-[340px] sm:min-h-[380px]">
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
              <div className="w-10 h-10 rounded-xl bg-[#1e3f68] flex items-center justify-center">
                <Wifi className="h-5 w-5 text-[#5b87f7]" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-[#edf2fc]">Connect to PC</h2>
                <p className="text-xs text-[#5e80a8]">Enter the host&apos;s ID and password</p>
              </div>
            </div>

            {store.viewerState === 'idle' || store.mode !== 'viewer' ? (
              <div className="flex-1 flex flex-col gap-4">
                <div>
                  <label className="text-[10px] sm:text-xs text-[#5e80a8] uppercase tracking-wider font-medium">Connection ID</label>
                  <input
                    type="text"
                    placeholder="Enter 9-digit ID"
                    value={store.targetId}
                    onChange={(e) => store.setTargetId(e.target.value)}
                    className="mt-1 w-full bg-[#0c1a30] border border-[#1e3f68] rounded-lg px-4 py-2.5 sm:py-3 text-[#edf2fc] placeholder-[#406085] focus:outline-none focus:border-[#3b6cf5]/50 font-mono text-center text-base sm:text-lg tracking-wider transition-colors"
                    maxLength={9}
                  />
                </div>

                <div>
                  <label className="text-[10px] sm:text-xs text-[#5e80a8] uppercase tracking-wider font-medium">Password</label>
                  <input
                    type="text"
                    placeholder="Enter password"
                    value={store.targetPassword}
                    onChange={(e) => store.setTargetPassword(e.target.value)}
                    className="mt-1 w-full bg-[#0c1a30] border border-[#1e3f68] rounded-lg px-4 py-2.5 sm:py-3 text-[#edf2fc] placeholder-[#406085] focus:outline-none focus:border-[#3b6cf5]/50 font-mono text-center text-base sm:text-lg transition-colors"
                  />
                </div>

                {store.error && (
                  <div className="bg-[#2a1520] border border-[#5c2035] rounded-lg px-4 py-2 text-sm text-[#f87171]">
                    {store.error}
                  </div>
                )}

                <button
                  onClick={connectToHost}
                  disabled={store.targetId.length !== 9 || !store.targetPassword}
                  className="mt-auto w-full py-3 rounded-xl bg-[#2b5ddb] text-[#edf2fc] font-semibold hover:bg-[#3b6cf5] transition-all shadow-lg shadow-[#2b5ddb]/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Connect
                </button>
              </div>
            ) : store.viewerState === 'authenticating' ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8">
                <Loader2 className="h-6 w-6 text-[#5b87f7] animate-spin" />
                <span className="text-[#90acd0]">Verifying credentials...</span>
                <button
                  onClick={cancelConnect}
                  className="mt-4 px-6 py-2 rounded-lg bg-[#1c3860] text-[#7094be] hover:bg-[#1e3f68] transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            ) : store.viewerState === 'waiting_approval' ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8">
                <div className="w-12 h-12 rounded-full bg-[#1e3f68] flex items-center justify-center">
                  <Loader2 className="h-6 w-6 text-[#5b87f7] animate-spin" />
                </div>
                <span className="text-[#90acd0]">Waiting for host to approve...</span>
                <p className="text-xs text-[#5e80a8]">The host will see a notification to allow your connection</p>
                <button
                  onClick={cancelConnect}
                  className="mt-4 px-6 py-2 rounded-lg bg-[#1c3860] text-[#7094be] hover:bg-[#1e3f68] transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            ) : store.viewerState === 'denied' ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8">
                <X className="h-8 w-8 text-[#f87171]" />
                <span className="text-[#90acd0]">Connection denied by host</span>
                <button
                  onClick={cancelConnect}
                  className="mt-4 px-6 py-2 rounded-lg bg-[#1c3860] text-[#7094be] hover:bg-[#1e3f68] transition-colors text-sm"
                >
                  Try Again
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-8 sm:mt-12 flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs text-[#406085]">
          <span className="flex items-center gap-1.5"><Shield className="h-3 w-3" /> End-to-end encrypted</span>
          <span className="flex items-center gap-1.5"><Monitor className="h-3 w-3" /> No installs needed</span>
          <span className="flex items-center gap-1.5"><Wifi className="h-3 w-3" /> P2P connection</span>
        </div>
      </main>
    </div>
  );
}
