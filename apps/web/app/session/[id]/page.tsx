'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useSessionStore } from '@/lib/stores/session-store';
import { PeerConnection } from '@/lib/webrtc/peer-connection';
import { signalingManager } from '@/lib/webrtc/signaling-manager';
import { DataChannelManager } from '@/lib/webrtc/data-channel';
import { RemoteViewer } from '@/components/session/remote-viewer';
import { SessionToolbar } from '@/components/session/toolbar';
import { ChatPanel } from '@/components/session/chat-panel';
import { FilePanel } from '@/components/session/file-panel';
import { useAppStore } from '@/lib/stores/connection-store';
import { takeHostDisplayStream } from '@/lib/webrtc/media-store';
import type {
  ChatMessage,
  ClipboardMessage,
  MouseMessage,
  KeyboardMessage,
  ReleaseKeysMessage,
  PingMessage,
  ControlPermissionMessage,
} from '@securedesk/shared';

const INPUT_PROXY_URL = 'ws://127.0.0.1:3002';
const INPUT_PROXY_TOKEN = process.env.NEXT_PUBLIC_INPUT_PROXY_TOKEN || '';
const PING_INTERVAL_MS = 2000;

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = params.id as string;
  const role = searchParams.get('role') || 'viewer';
  const allowControlParam = searchParams.get('control') !== '0'; // default true
  const [allowControl, setAllowControl] = useState(allowControlParam);

  // Get the session password for E2E key derivation
  const e2ePassword = useAppStore((s) => role === 'host' ? s.password : s.targetPassword);

  const {
    connectionState,
    setConnectionState,
    setSessionId,
    setSignalingConnected,
    startTimer,
    addChatMessage,
    setLatency,
    setRemoteCursor,
    inputProxyConnected,
    setInputProxyConnected,
    micEnabled,
    fileOpen,
    toggleFilePanel,
    reset,
  } = useSessionStore();

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteAudioStream, setRemoteAudioStream] = useState<MediaStream | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlling, setControlling] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const peerRef = useRef<PeerConnection | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dcManagerRef = useRef(new DataChannelManager());
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const offerSentRef = useRef(false); // Guard against duplicate offers
  const hostReadySentRef = useRef(false); // Guard against duplicate HOST_READY
  const viewerReadySentRef = useRef(false); // Guard against duplicate VIEWER_READY
  const cleaningUpRef = useRef(false); // Prevents onended from triggering handleDisconnect during cleanup

  // Input proxy WebSocket (host connects to local proxy for native input execution)
  const inputProxyRef = useRef<WebSocket | null>(null);
  const pingSeqRef = useRef(0);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectingRef = useRef(false); // re-entry guard for attemptReconnect

  // Ref to access localStream inside callbacks
  const localStreamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Track mic audio tracks so we can mute/unmute them
  const micTracksRef = useRef<MediaStreamTrack[]>([]);

  // Mute/unmute mic tracks when micEnabled changes
  useEffect(() => {
    for (const track of micTracksRef.current) {
      track.enabled = micEnabled;
    }
  }, [micEnabled]);

  // ========== Input Proxy Connection (Host only, when control allowed) ==========
  useEffect(() => {
    if (role !== 'host' || !allowControl) return;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      try {
        console.log('[InputProxy] Attempting to connect to', INPUT_PROXY_URL);
        ws = new WebSocket(INPUT_PROXY_URL);

        ws.onopen = () => {
          console.log('[InputProxy] Connected — sending auth...');
          // Send auth token as first message
          ws?.send(JSON.stringify({ type: 'auth', token: INPUT_PROXY_TOKEN }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'connected') {
              console.log('[InputProxy] ✅ Authenticated to local input proxy');
              setInputProxyConnected(true);
              inputProxyRef.current = ws;
            }
          } catch {
            // ignore non-JSON messages
          }
        };

        ws.onclose = (event) => {
          console.log('[InputProxy] Disconnected from input proxy (code:', event.code, 'reason:', event.reason, ')');
          setInputProxyConnected(false);
          inputProxyRef.current = null;
          // Retry in 3 seconds
          reconnectTimer = setTimeout(connect, 3000);
        };

        ws.onerror = (err) => {
          console.warn('[InputProxy] WebSocket error:', err);
          ws?.close();
        };
      } catch (e) {
        console.error('[InputProxy] WebSocket constructor error:', e);
        reconnectTimer = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      inputProxyRef.current = null;
      setInputProxyConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, allowControl]);

  // ========== Dynamic mouse/keyboard/release_keys handlers (Host only) ==========
  // Registered/unregistered when allowControl changes mid-session
  useEffect(() => {
    if (role !== 'host') return;

    if (!allowControl) {
      console.log('[Host] ⚠️ Remote control disabled — input handlers not active');
      return;
    }

    console.log('[Host] ✅ Registering mouse/keyboard/release_keys input handlers');

    const handleMouse = (msg: import('@securedesk/shared').DataChannelMessage) => {
      const mouseMsg = msg as MouseMessage;
      setRemoteCursor({ x: mouseMsg.x, y: mouseMsg.y, visible: true });
      if (inputProxyRef.current?.readyState === WebSocket.OPEN) {
        inputProxyRef.current.send(JSON.stringify(mouseMsg));
      }
    };

    const handleKeyboard = (msg: import('@securedesk/shared').DataChannelMessage) => {
      const keyMsg = msg as KeyboardMessage;
      if (inputProxyRef.current?.readyState === WebSocket.OPEN) {
        inputProxyRef.current.send(JSON.stringify(keyMsg));
      }
    };

    const handleReleaseKeys = (msg: import('@securedesk/shared').DataChannelMessage) => {
      if (inputProxyRef.current?.readyState === WebSocket.OPEN) {
        inputProxyRef.current.send(JSON.stringify(msg as ReleaseKeysMessage));
      }
    };

    dcManagerRef.current.on('mouse', handleMouse);
    dcManagerRef.current.on('keyboard', handleKeyboard);
    dcManagerRef.current.on('release_keys', handleReleaseKeys);

    return () => {
      console.log('[Host] Unregistering mouse/keyboard/release_keys handlers');
      dcManagerRef.current.off('mouse', handleMouse);
      dcManagerRef.current.off('keyboard', handleKeyboard);
      dcManagerRef.current.off('release_keys', handleReleaseKeys);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, allowControl]);

  // ========== Initialize ==========
  useEffect(() => {
    cleaningUpRef.current = false;
    setSessionId(sessionId);

    const signaling = signalingManager.getClient();
    if (!signaling) {
      console.error('[Session] No signaling client — redirecting to home');
      router.push('/');
      return;
    }

    setSignalingConnected(signaling.isConnected);

    // Rebind signaling events for session page
    signalingManager.rebindEvents({
      onHostReady: async () => {
        // Viewer: host finished screen capture — now safe to send offer
        // Guard: only send ONE offer (HOST_READY can arrive multiple times due to VIEWER_READY re-trigger)
        if (role === 'viewer' && peerRef.current && !offerSentRef.current) {
          offerSentRef.current = true;
          console.log('[Session] Host ready — viewer sending offer...');
          const offer = await peerRef.current.createOffer();
          signaling.sendOffer(sessionId, offer);
          console.log('[Viewer] Sent offer to host');
        }
      },
      onViewerReady: async () => {
        // Host: viewer's session page is ready — re-send HOST_READY (once)
        if (role === 'host' && peerRef.current && !hostReadySentRef.current) {
          hostReadySentRef.current = true;
          console.log('[Session] Viewer ready — host re-sending HOST_READY');
          signaling.sendHostReady(sessionId);
        }
      },
      onOffer: async (data) => {
        // Host receives viewer's offer
        if (role === 'host' && data.sdp && peerRef.current) {
          console.log('[Session] Host received offer, creating answer...');
          console.log('[Session] PeerConnection senders:', peerRef.current.getRTCPeerConnection().getSenders().map(s => s.track ? `${s.track.kind}(${s.track.readyState})` : 'no-track').join(', '));
          try {
            // Don't pass localStream — tracks were already added to the
            // PeerConnection immediately after creation in startHostFlow.
            const answer = await peerRef.current.handleOffer(data.sdp);
            signaling.sendAnswer(sessionId, answer);
          } catch (err) {
            console.error('[Session] Error handling offer:', err);
          }
        }
      },
      onAnswer: async (data) => {
        // Viewer receives host's answer
        if (role === 'viewer' && data.sdp && peerRef.current) {
          console.log('[Session] Viewer received answer');
          try {
            await peerRef.current.setAnswer(data.sdp);
          } catch (err) {
            console.error('[Session] Error setting answer:', err);
          }
        }
      },
      onIceCandidate: async (data) => {
        if (data.candidate && peerRef.current) {
          try {
            await peerRef.current.addIceCandidate(data.candidate);
          } catch (err) {
            console.error('[Session] Error adding ICE candidate:', err);
          }
        }
      },
      onSessionEnded: (data) => {
        console.log('[Session] Ended:', data.reason);
        handleDisconnect();
      },
      onDisconnect: (reason) => {
        console.log('[Session] Signaling disconnected:', reason);
        setSignalingConnected(false);
        attemptReconnect();
      },
      onConnect: () => {
        setSignalingConnected(true);
        setReconnecting(false);
        reconnectAttempts.current = 0;
      },
    });

    // Start the appropriate flow
    if (role === 'host') {
      startHostFlow(signaling);
    } else {
      startViewerFlow(signaling);
    }

    return () => {
      cleaningUpRef.current = true;
      // Remove onended handler BEFORE stopping tracks to prevent the
      // cascade: track.stop() → onended → handleDisconnect → signalingManager.disconnect → navigate('/')
      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = null;
      }
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      peerRef.current?.close();
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      reconnectingRef.current = false;
      // Reset negotiation guards so a fresh mount can re-negotiate
      offerSentRef.current = false;
      hostReadySentRef.current = false;
      viewerReadySentRef.current = false;
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ========== Host Flow ==========
  async function startHostFlow(signaling: NonNullable<ReturnType<typeof signalingManager.getClient>>) {
    try {
      // Reuse existing live stream on reconnect, or take pre-captured stream,
      // or capture fresh if user navigated directly to this URL
      let displayStream: MediaStream | null = null;

      // Check if we already have a live display stream (reconnect scenario)
      if (localStreamRef.current && localStreamRef.current.getVideoTracks().some(t => t.readyState === 'live')) {
        displayStream = localStreamRef.current;
        console.log('[Host] Reusing existing live display stream (reconnect)');
      }

      if (!displayStream) {
        displayStream = takeHostDisplayStream();
      }

      if (!displayStream) {
        console.log('[Host] No pre-captured stream — calling getDisplayMedia now...');
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
      } else if (!localStreamRef.current) {
        console.log('[Host] Using pre-captured stream from home page');
      }

      setLocalStream(displayStream);
      localStreamRef.current = displayStream;

      // If user stops sharing (clicks "Stop sharing" in browser chrome)
      displayStream.getVideoTracks()[0].onended = () => {
        // Guard: don't trigger disconnect during useEffect cleanup —
        // cleanup nulls this handler before stopping tracks, but the ended
        // event fires asynchronously, so also check cleaningUpRef.
        if (cleaningUpRef.current) return;
        console.log('[Host] Screen sharing stopped by user');
        handleDisconnect();
      };

      // Also capture microphone for 2-way audio (with echo cancellation + noise suppression)
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
            channelCount: 1,
          },
        });
        const micTracks = micStream.getAudioTracks();
        micTracksRef.current = micTracks;
        for (const track of micTracks) {
          displayStream.addTrack(track);
        }
        console.log('[Host] Microphone captured —', micTracks.length, 'audio tracks');
      } catch {
        console.log('[Host] Microphone not available — continuing without mic');
      }

      // Create PeerConnection for host (does NOT create offer)
      const peer = new PeerConnection({
        onTrack: (mediaStream) => {
          console.log('[Host] Received remote track (viewer audio)');
          setRemoteAudioStream(mediaStream);
        },
        onDataChannel: (channel) => {
          dcManagerRef.current.attachToChannel(channel);
        },
        onConnectionStateChange: (state) => {
          setConnectionState(state);
          if (state === 'connected') {
            startTimer();
            reconnectAttempts.current = 0;
            setReconnecting(false);
            // Send control permission once the input data channel is actually open
            dcManagerRef.current.onceOpen('input', () => {
              const permMsg: ControlPermissionMessage = {
                type: 'control_permission',
                allowed: allowControlParam,
                timestamp: Date.now(),
              };
              dcManagerRef.current.send('input', permMsg);
              console.log('[Host] Sent control_permission:', allowControlParam);
            });
          } else if (state === 'failed') {
            attemptReconnect();
          } else if (state === 'disconnected') {
            // 'disconnected' is transient — ICE may auto-recover.
            // Only escalate to reconnect if it doesn't recover within 5s.
            console.log('[Host] ICE disconnected — waiting 5s for recovery...');
            setTimeout(() => {
              if (peerRef.current?.getRTCPeerConnection().connectionState === 'disconnected') {
                console.log('[Host] ICE did not recover — reconnecting');
                attemptReconnect();
              }
            }, 5000);
          }
        },
        onIceCandidate: (candidate) => {
          signaling.sendIceCandidate(sessionId, candidate.toJSON());
        },
        onError: (err) => console.error('[Host WebRTC] Error:', err),
      });

      // Add display stream tracks to PeerConnection IMMEDIATELY — must happen
      // before any SDP negotiation so the tracks are included in the answer.
      // Previously tracks were deferred to handleOffer, which could cause
      // the answer SDP to lack video/audio m-lines on some Chrome versions.
      peer.addStream(displayStream);
      console.log('[Host] Added', displayStream.getTracks().length, 'tracks to PeerConnection:',
        displayStream.getTracks().map(t => `${t.kind}(${t.readyState})`).join(', '));

      peerRef.current = peer;

      // Enable E2E encryption (derives key from session password)
      if (e2ePassword) {
        peer.enableE2E(e2ePassword, sessionId).then((ok) => {
          if (ok) console.log('[Host] E2E encryption key derived');
        });
      }

      // Register chat handler
      dcManagerRef.current.on('chat', (msg) => {
        addChatMessage(msg as ChatMessage);
      });

      // Register clipboard receive handler
      dcManagerRef.current.on('clipboard', async (msg) => {
        const clipboard = msg as ClipboardMessage;
        try {
          await navigator.clipboard.writeText(clipboard.text);
          console.log('[Clipboard] Received and synced');
        } catch {
          console.log('[Clipboard] Failed to write to clipboard');
        }
      });

      // Mouse/keyboard/release_keys handlers are registered dynamically via useEffect
      // so they respond to allowControl toggling mid-session (see below)

      // Respond to ping with pong (latency measurement)
      dcManagerRef.current.on('ping', (msg) => {
        dcManagerRef.current.sendPong(msg as PingMessage);
      });

      // Signal to viewer that host is ready for WebRTC negotiation
      signaling.sendHostReady(sessionId);
      console.log('[Host] Ready — sent HOST_READY, waiting for viewer offer...');
    } catch (err) {
      // User cancelled the screen picker dialog
      console.log('[Host] Screen capture cancelled:', err);
      handleDisconnect();
    }
  }

  // ========== Viewer Flow ==========
  async function startViewerFlow(signaling: NonNullable<ReturnType<typeof signalingManager.getClient>>) {
    const peer = new PeerConnection({
      onTrack: (mediaStream) => {
        console.log('[Viewer] Received remote stream');
        setStream(mediaStream);
        startTimer();
      },
      onDataChannel: (channel) => {
        dcManagerRef.current.attachToChannel(channel);
      },
      onConnectionStateChange: (state) => {
        setConnectionState(state);
        if (state === 'connected') {
          reconnectAttempts.current = 0;
          setReconnecting(false);
          // Start ping/pong for latency measurement
          startPingInterval();
        } else if (state === 'failed') {
          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
          attemptReconnect();
        } else if (state === 'disconnected') {
          // 'disconnected' is transient — ICE may auto-recover.
          // Only escalate to reconnect if it doesn't recover within 5s.
          console.log('[Viewer] ICE disconnected — waiting 5s for recovery...');
          setTimeout(() => {
            if (peerRef.current?.getRTCPeerConnection().connectionState === 'disconnected') {
              console.log('[Viewer] ICE did not recover — reconnecting');
              if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
              attemptReconnect();
            }
          }, 5000);
        }
      },
      onIceCandidate: (candidate) => {
        signaling.sendIceCandidate(sessionId, candidate.toJSON());
      },
      onError: (err) => console.error('[Viewer WebRTC] Error:', err),
    });

    // Enable E2E encryption (derives key from session password)
    if (e2ePassword) {
      peer.enableE2E(e2ePassword, sessionId).then((ok) => {
        if (ok) console.log('[Viewer] E2E encryption key derived');
      });
    }

    // Register chat handler
    dcManagerRef.current.on('chat', (msg) => {
      addChatMessage(msg as ChatMessage);
    });

    // Register clipboard receive handler
    dcManagerRef.current.on('clipboard', async (msg) => {
      const clipboard = msg as ClipboardMessage;
      try {
        await navigator.clipboard.writeText(clipboard.text);
        console.log('[Clipboard] Received and synced');
      } catch {
        console.log('[Clipboard] Failed to write to clipboard');
      }
    });

    // Handle pong responses for latency measurement
    dcManagerRef.current.on('pong', (msg) => {
      const rtt = Date.now() - msg.timestamp;
      setLatency(rtt);
    });

    // Listen for control permission from host
    dcManagerRef.current.on('control_permission', (msg) => {
      const perm = msg as ControlPermissionMessage;
      console.log('[Viewer] Control permission from host:', perm.allowed);
      setAllowControl(perm.allowed);
      if (!perm.allowed) setControlling(false);
    });

    // Capture viewer's microphone for 2-way audio BEFORE exposing peerRef.
    // This prevents the race condition where HOST_READY arrives during mic
    // capture, causing createOffer() to run before audio tracks are added.
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
      });
      micTracksRef.current = micStream.getAudioTracks();
      peer.addStream(micStream);
      console.log('[Viewer] Microphone captured —', micTracksRef.current.length, 'audio tracks');
    } catch {
      console.log('[Viewer] Microphone not available — continuing without mic');
    }

    // Set peerRef AFTER mic capture so onHostReady (which checks peerRef.current)
    // can't create an offer before audio tracks are added to the peer.
    peerRef.current = peer;

    // Tell the host that our peer is ready — this fixes the race condition where
    // HOST_READY fires before the viewer's session page has rebound signaling events.
    // The host will re-send HOST_READY upon receiving VIEWER_READY.
    if (!viewerReadySentRef.current) {
      viewerReadySentRef.current = true;
      signaling.sendViewerReady(sessionId);
      console.log('[Viewer] Peer ready — sent VIEWER_READY, waiting for HOST_READY...');
    }
  }

  // ========== Ping/Pong Latency ==========
  function startPingInterval() {
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

    pingIntervalRef.current = setInterval(() => {
      if (peerRef.current) {
        const ping: PingMessage = {
          type: 'ping',
          seq: pingSeqRef.current++,
          timestamp: Date.now(),
        };
        peerRef.current.sendInput(JSON.stringify(ping));
      }
    }, PING_INTERVAL_MS);
  }

  // ========== Auto-Reconnect ==========
  function attemptReconnect() {
    // Re-entry guard — prevent multiple concurrent reconnect chains
    if (reconnectingRef.current) {
      console.log('[Session] Reconnect already in progress — skipping');
      return;
    }

    if (reconnectAttempts.current >= maxReconnectAttempts) {
      console.log('[Session] Max reconnect attempts reached');
      setReconnecting(false);
      reconnectingRef.current = false;
      return;
    }

    reconnectingRef.current = true;
    setReconnecting(true);
    reconnectAttempts.current++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current - 1), 16000);

    console.log(`[Session] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);

    // Store the timer so handleDisconnect can cancel it
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      reconnectingRef.current = false;

      const signaling = signalingManager.getClient();
      if (!signaling) return;

      peerRef.current?.close();

      // Clear accumulated DataChannel handlers before re-registering in new flow
      dcManagerRef.current.removeAllHandlers();

      // Reset negotiation guards for fresh reconnection
      offerSentRef.current = false;
      hostReadySentRef.current = false;
      viewerReadySentRef.current = false;

      if (role === 'viewer') {
        startViewerFlow(signaling);
      } else if (role === 'host') {
        // Reuse existing display stream instead of re-prompting getDisplayMedia
        if (localStreamRef.current && localStreamRef.current.getVideoTracks().some(t => t.readyState === 'live')) {
          console.log('[Host] Reconnecting with existing display stream');
          startHostFlow(signaling);
        } else {
          console.log('[Host] Display stream ended — re-capturing');
          startHostFlow(signaling);
        }
      }
    }, delay);
  }

  // ========== Escape Key ==========
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && controlling) {
        setControlling(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [controlling]);

  // ========== Disconnect ==========
  function handleDisconnect() {
    // Cancel any pending reconnect timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectingRef.current = false;

    const signaling = signalingManager.getClient();
    signaling?.endSession(sessionId);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    peerRef.current?.close();
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    setStream(null);
    setLocalStream(null);
    setControlling(false);
    reset();
    signalingManager.disconnect();
    router.push('/');
  }

  // ========== Fullscreen ==========
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    } else {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    }
  }, []);

  const toggleControl = useCallback(() => {
    setControlling((prev) => !prev);
  }, []);

  // Host: toggle allow remote control and notify viewer via data channel
  const toggleAllowControl = useCallback(() => {
    const newVal = !allowControl;
    setAllowControl(newVal);
    const permMsg: ControlPermissionMessage = {
      type: 'control_permission',
      allowed: newVal,
      timestamp: Date.now(),
    };
    dcManagerRef.current.send('input', permMsg);
    console.log('[Host] Toggled control_permission:', newVal);
  }, [allowControl]);

  // ========== Clipboard Sync ==========
  const handleClipboardSync = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const msg: ClipboardMessage = {
        type: 'clipboard',
        text,
        timestamp: Date.now(),
      };
      peerRef.current?.sendInput(JSON.stringify(msg));
      console.log('[Clipboard] Sent:', text.slice(0, 50));
    } catch {
      console.log('[Clipboard] Permission denied or empty clipboard');
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative flex flex-col h-screen bg-black">
      <SessionToolbar
        sessionId={sessionId}
        role={role}
        onDisconnect={handleDisconnect}
        onToggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
        controlling={controlling}
        onToggleControl={toggleControl}
        onToggleAllowControl={toggleAllowControl}
        onClipboardSync={handleClipboardSync}
        allowControl={allowControl}
      />

      <div className="flex flex-1 overflow-hidden">
        <RemoteViewer
          peerConnection={peerRef.current}
          stream={role === 'host' ? localStream : stream}
          controlling={controlling}
          isFullscreen={isFullscreen}
          role={role}
          allowControl={allowControl}
          onToggleControl={toggleControl}
        />
        <ChatPanel
          peerConnection={peerRef.current}
          userName={role === 'host' ? 'Host' : 'Viewer'}
        />
        <FilePanel
          isOpen={fileOpen}
          onClose={toggleFilePanel}
          peerConnection={peerRef.current}
          dcManager={dcManagerRef.current}
        />
      </div>

      {/* Hidden audio element to play viewer's mic on the host side (2-way audio) */}
      {role === 'host' && remoteAudioStream && (
        <audio
          autoPlay
          playsInline
          ref={(el) => {
            if (el && el.srcObject !== remoteAudioStream) {
              el.srcObject = remoteAudioStream;
              el.play().catch(() => {});
            }
          }}
        />
      )}

      {/* Input proxy warning banner (host only) */}
      {role === 'host' && allowControl && !inputProxyConnected && connectionState === 'connected' && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-[#b45309] rounded-lg px-4 py-2 text-sm text-[#edf2fc] shadow-lg">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Input proxy not running — run <code className="mx-1 px-1.5 py-0.5 bg-[#0c1a30]/60 rounded text-xs font-mono">pnpm --filter input-proxy dev</code> for remote control
        </div>
      )}

      {/* Reconnecting overlay */}
      {reconnecting && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#0c1a30]/95">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-blue-500/30 border-t-blue-500 animate-spin" />
            <p className="text-[#edf2fc] text-lg font-medium mb-1">Reconnecting...</p>
            <p className="text-[#5e80a8] text-sm">
              Attempt {reconnectAttempts.current}/{maxReconnectAttempts}
            </p>
            <button
              onClick={handleDisconnect}
              className="mt-4 px-4 py-2 rounded-lg bg-[#f87171]/15 text-[#f87171] hover:bg-[#f87171]/25 transition-colors text-sm"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}

      {/* Bottom status bar */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between h-7 px-3 bg-[#071020] text-[11px] text-[#5e80a8] z-40">
        <div className="flex items-center gap-2">
          {connectionState === 'connected' ? (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#34d399] animate-pulse" />
              <span className="text-[#34d399] font-medium">Session Active</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#fbbf24] animate-pulse" />
              <span className="text-[#fbbf24]">{connectionState === 'connecting' ? 'Connecting...' : connectionState}</span>
            </div>
          )}
          <span className="text-[#406085]">•</span>
          <span>P2P Encrypted</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-medium">{role === 'host' ? (allowControl ? 'Hosting' : 'Hosting (View Only)') : controlling ? 'Controlling' : 'View only'}</span>
          {role === 'viewer' && allowControl && controlling && <span className="hidden sm:inline text-[#406085]">Press Esc to release control</span>}
        </div>
      </div>
    </div>
  );
}
