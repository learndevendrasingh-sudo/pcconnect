'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useSessionStore } from '@/lib/stores/session-store';
import { captureMouseEvent, captureKeyboardEvent, shouldPreventDefault, createReleaseKeysMessage } from '@/lib/webrtc/input-capture';
import type { PeerConnection } from '@/lib/webrtc/peer-connection';

const MOUSE_MOVE_THROTTLE_MS = 16; // ~60fps cap for mouse move events

interface RemoteViewerProps {
  peerConnection: PeerConnection | null;
  stream: MediaStream | null;
  controlling: boolean;
  isFullscreen: boolean;
  role: string;
  allowControl: boolean;
  onToggleControl?: () => void;
}

export function RemoteViewer({ peerConnection, stream, controlling, isFullscreen, role, allowControl, onToggleControl }: RemoteViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fpsFrameCount = useRef(0);
  const fpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cursorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMouseMoveRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const { connectionState, remoteCursor, audioEnabled, setFps, setRemoteCursor } = useSessionStore();

  // Attach stream to video element and ensure low-latency playback
  useEffect(() => {
    if (videoRef.current && stream) {
      const video = videoRef.current;
      video.srcObject = stream;
      // Low-latency hints — minimize buffering for real-time feel
      video.disableRemotePlayback = true;
      if ('latencyHint' in video) {
        (video as any).latencyHint = 'interactive';
      }
      // Explicitly play — if autoplay is blocked (unmuted), mute and retry
      video.play().catch(() => {
        if (videoRef.current) {
          videoRef.current.muted = true;
          videoRef.current.play().catch(() => {});
        }
      });
    }
  }, [stream]);

  // FPS counter
  useEffect(() => {
    if (!stream || !videoRef.current) return;

    const video = videoRef.current;
    let cleanupFallback: (() => void) | null = null;

    // Use requestVideoFrameCallback if available (more accurate)
    if (typeof (video as any).requestVideoFrameCallback === 'function') {
      const countFrame = () => {
        fpsFrameCount.current++;
        (video as any).requestVideoFrameCallback(countFrame);
      };
      (video as any).requestVideoFrameCallback(countFrame);
    } else {
      // Fallback: count timeupdate events
      const handleTimeUpdate = () => { fpsFrameCount.current++; };
      video.addEventListener('timeupdate', handleTimeUpdate);
      cleanupFallback = () => video.removeEventListener('timeupdate', handleTimeUpdate);
    }

    // Report FPS every second
    fpsIntervalRef.current = setInterval(() => {
      setFps(fpsFrameCount.current);
      fpsFrameCount.current = 0;
    }, 1000);

    return () => {
      if (fpsIntervalRef.current) clearInterval(fpsIntervalRef.current);
      cleanupFallback?.();
    };
  }, [stream, setFps]);

  // Audio amplification via Web Audio API — viewer only.
  // getDisplayMedia screen audio is typically much quieter than native OS playback,
  // and the <video> element maxes at volume 1.0. A GainNode lets us boost beyond 100%.
  useEffect(() => {
    // Only viewers need amplified audio; host hears their own audio natively
    if (role !== 'viewer' || !stream || !audioEnabled) {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      audioContextRef.current = null;
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = 2.5; // 2.5x volume amplification
      source.connect(gain);
      gain.connect(ctx.destination);

      // Resume in case autoplay policy suspended the context
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      audioContextRef.current = ctx;
    } catch {
      // AudioContext not available — fall back to video element audio
      audioContextRef.current = null;
    }

    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      audioContextRef.current = null;
    };
  }, [role, stream, audioEnabled]);

  // Mouse event handlers — only when controlling (viewer only)
  const sendMouseEvent = useCallback(
    (event: React.MouseEvent | React.WheelEvent, action: Parameters<typeof captureMouseEvent>[2]) => {
      if (!allowControl || !controlling || !peerConnection || !videoRef.current) {
        return;
      }
      // Throttle mouse move to ~60fps to avoid flooding the data channel
      if (action === 'move') {
        const now = performance.now();
        if (now - lastMouseMoveRef.current < MOUSE_MOVE_THROTTLE_MS) return;
        lastMouseMoveRef.current = now;
      } else {
        // Prevent default browser behavior (text selection, drag, etc.) when controlling
        event.preventDefault();
      }
      const msg = captureMouseEvent(event.nativeEvent as MouseEvent, videoRef.current, action);
      peerConnection.sendInput(JSON.stringify(msg));
    },
    [peerConnection, controlling, allowControl]
  );

  // Non-passive wheel listener — React's onWheel is passive and can't preventDefault
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !allowControl || !controlling || !peerConnection) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const msg = captureMouseEvent(e, video, 'wheel');
      peerConnection.sendInput(JSON.stringify(msg));
    };

    video.addEventListener('wheel', handleWheel, { passive: false });
    return () => video.removeEventListener('wheel', handleWheel);
  }, [peerConnection, controlling, allowControl]);

  // Keyboard handlers — only when controlling (viewer only)
  useEffect(() => {
    if (!allowControl || !controlling || connectionState !== 'connected' || !peerConnection) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return;
      if (shouldPreventDefault(e)) e.preventDefault();
      e.stopPropagation();
      const msg = captureKeyboardEvent(e, 'keydown');
      peerConnection.sendInput(JSON.stringify(msg));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return;
      if (shouldPreventDefault(e)) e.preventDefault();
      e.stopPropagation();
      const msg = captureKeyboardEvent(e, 'keyup');
      peerConnection.sendInput(JSON.stringify(msg));
    };

    // Use capture phase (third arg = true) so we intercept keys before any
    // other handler on the page can consume them.
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [connectionState, peerConnection, controlling, allowControl]);

  // Periodic focus recovery — after OS-level shortcuts (Win+S, Alt+Tab) briefly
  // steal focus, this ensures the container gets re-focused so keyboard resumes.
  useEffect(() => {
    if (!controlling) return;

    const interval = setInterval(() => {
      if (document.hasFocus() && containerRef.current && document.activeElement !== containerRef.current) {
        containerRef.current.focus();
      }
    }, 500);

    return () => clearInterval(interval);
  }, [controlling]);

  // Send release_keys when viewer takes/releases control (clean slate for modifier keys)
  useEffect(() => {
    if (!peerConnection) return;
    peerConnection.sendInput(JSON.stringify(createReleaseKeysMessage()));
  }, [controlling, peerConnection]);

  // Release stuck modifier keys when browser loses focus (prevents Win+key, Alt+Tab stuck)
  useEffect(() => {
    if (!allowControl || !controlling || !peerConnection) return;

    const sendRelease = () => {
      peerConnection.sendInput(JSON.stringify(createReleaseKeysMessage()));
    };

    const handleBlur = () => {
      sendRelease();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        sendRelease();
      }
    };

    const handleFocus = () => {
      // Re-focus the container when window regains focus
      containerRef.current?.focus();
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [allowControl, controlling, peerConnection]);

  // Auto-focus container when viewer starts controlling (ensures keyboard capture)
  useEffect(() => {
    if (controlling && containerRef.current) {
      containerRef.current.focus();
    }
  }, [controlling]);

  // Auto-hide remote cursor after 3 seconds of inactivity
  useEffect(() => {
    if (remoteCursor.visible && role === 'host') {
      if (cursorTimeoutRef.current) clearTimeout(cursorTimeoutRef.current);
      cursorTimeoutRef.current = setTimeout(() => {
        setRemoteCursor({ visible: false });
      }, 3000);
    }
    return () => {
      if (cursorTimeoutRef.current) clearTimeout(cursorTimeoutRef.current);
    };
  }, [remoteCursor.x, remoteCursor.y, remoteCursor.visible, role, setRemoteCursor]);

  // Calculate cursor position in video coordinates
  const getCursorStyle = useCallback(() => {
    if (!videoRef.current || !remoteCursor.visible) return { display: 'none' as const };

    const video = videoRef.current;
    const rect = video.getBoundingClientRect();

    // Calculate actual video rendering area (accounting for object-fit: contain)
    const videoAspect = video.videoWidth / video.videoHeight;
    const containerAspect = rect.width / rect.height;

    let renderWidth: number, renderHeight: number, offsetX: number, offsetY: number;

    if (videoAspect > containerAspect) {
      // Video is wider — letterboxed top/bottom
      renderWidth = rect.width;
      renderHeight = rect.width / videoAspect;
      offsetX = 0;
      offsetY = (rect.height - renderHeight) / 2;
    } else {
      // Video is taller — pillarboxed left/right
      renderHeight = rect.height;
      renderWidth = rect.height * videoAspect;
      offsetX = (rect.width - renderWidth) / 2;
      offsetY = 0;
    }

    const left = offsetX + remoteCursor.x * renderWidth;
    const top = offsetY + remoteCursor.y * renderHeight;

    return {
      display: 'block' as const,
      left: `${left}px`,
      top: `${top}px`,
    };
  }, [remoteCursor]);

  if (connectionState !== 'connected' && !stream) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0c1a30]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-blue-500/30 border-t-blue-500 animate-spin" />
          <p className="text-[#7094be] text-sm">
            {connectionState === 'connecting' ? 'Establishing connection...' : 'Waiting for stream...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex-1 flex items-center justify-center bg-black overflow-hidden relative ${
        controlling ? 'cursor-none' : 'cursor-default'
      } ${isFullscreen ? 'w-screen h-screen' : ''}`}
      tabIndex={0}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={
          isFullscreen
            ? 'w-full h-full object-contain'
            : 'max-w-full max-h-full object-contain'
        }
        onMouseMove={(e) => sendMouseEvent(e, 'move')}
        onMouseDown={(e) => sendMouseEvent(e, 'mousedown')}
        onMouseUp={(e) => sendMouseEvent(e, 'mouseup')}
        onClick={(e) => sendMouseEvent(e, 'click')}
        onDoubleClick={(e) => sendMouseEvent(e, 'dblclick')}
        onContextMenu={(e) => {
          e.preventDefault();
          sendMouseEvent(e, 'contextmenu');
        }}
      />

      {/* Remote cursor overlay (shown on HOST when viewer is controlling) */}
      {role === 'host' && remoteCursor.visible && (
        <div
          className="absolute pointer-events-none z-30 -translate-x-1/2 -translate-y-1/2"
          style={getCursorStyle()}
        >
          {/* Cursor arrow SVG */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="drop-shadow-lg">
            <path
              d="M5 3L19 12L12 12L8 21L5 3Z"
              fill="#3b82f6"
              stroke="white"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          <div className="absolute top-6 left-4 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap">
            Viewer
          </div>
        </div>
      )}

      {/* Control mode indicator / Take Control button */}
      {role === 'viewer' && !controlling && stream && (
        allowControl ? (
          <button
            onClick={onToggleControl}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#2b5ddb] hover:bg-[#3b6cf5] rounded-xl px-6 py-3 text-sm font-medium text-[#edf2fc] shadow-lg shadow-[#2b5ddb]/30 transition-all hover:scale-105 cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
            </svg>
            Take Control
          </button>
        ) : (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-[#071020] rounded-lg px-4 py-2 text-sm text-[#7094be] pointer-events-none">
            View Only — Remote control is disabled by the host
          </div>
        )
      )}
    </div>
  );
}
