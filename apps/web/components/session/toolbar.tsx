'use client';

import { useSessionStore } from '@/lib/stores/session-store';
import { useSessionTimer } from '@/lib/hooks/use-session-timer';
import { QualitySelector } from './quality-selector';
import {
  Maximize,
  Minimize,
  MessageSquare,
  FileUp,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Monitor,
  PhoneOff,
  Wifi,
  Clock,
  MousePointer,
  MousePointerClick,
  Camera,
  Clipboard,
  Copy,
  Check,
} from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';

interface ToolbarProps {
  sessionId: string;
  role: string;
  onDisconnect: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  controlling: boolean;
  onToggleControl: () => void;
  onToggleAllowControl?: () => void;
  onClipboardSync: () => void;
  allowControl: boolean;
}

export function SessionToolbar({
  sessionId,
  role,
  onDisconnect,
  onToggleFullscreen,
  isFullscreen,
  controlling,
  onToggleControl,
  onClipboardSync,
  onToggleAllowControl,
  allowControl,
}: ToolbarProps) {
  const { latency, fps, audioEnabled, micEnabled, toggleAudio, toggleMic, toggleChat, chatOpen, fileOpen, toggleFilePanel, inputProxyConnected } = useSessionStore();
  const { formatted } = useSessionTimer();
  const [visible, setVisible] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [idCopied, setIdCopied] = useState(false);

  // Auto-hide toolbar after 3 seconds — only when viewer is actively controlling
  useEffect(() => {
    if (hovered || !controlling) {
      setVisible(true);
      return;
    }

    const timer = setTimeout(() => {
      setVisible(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, [hovered, controlling]);

  // Show on mouse near top edge
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (e.clientY < 8) {
        setVisible(true);
      }
    }
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const latencyColor = latency < 50 ? 'text-[#34d399]' : latency < 150 ? 'text-[#fbbf24]' : 'text-[#f87171]';

  const handleScreenshot = useCallback(() => {
    const video = document.querySelector('video');
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const link = document.createElement('a');
    link.download = `screenshot-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  return (
    <div
      className={`absolute top-0 left-0 right-0 z-50 transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center justify-between h-12 px-2 sm:px-4 bg-[#162f50] border-b border-[#1e3f68]">
        {/* Left: Status indicators */}
        <div className="flex items-center gap-2 sm:gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <Wifi className="h-3.5 w-3.5 text-[#34d399]" />
            <span className={`font-mono text-xs ${latencyColor}`}>{latency}ms</span>
          </div>
          <div className="hidden sm:block text-[#5e80a8] text-xs">{fps} FPS</div>
          <div className="hidden sm:flex items-center gap-1.5 text-[#90acd0]">
            <Clock className="h-3.5 w-3.5" />
            <span className="font-mono text-xs">{formatted}</span>
          </div>
          <div className="hidden sm:block w-px h-4 bg-[#1e3f68]" />
          <button
            onClick={() => {
              navigator.clipboard.writeText(sessionId);
              setIdCopied(true);
              setTimeout(() => setIdCopied(false), 2000);
            }}
            className="hidden sm:flex items-center gap-1 text-[#5e80a8] hover:text-[#b0c4e8] transition-colors"
            title="Copy Session ID"
          >
            <span className="font-mono text-xs truncate max-w-[120px]">{sessionId.replace('session_', '').slice(0, 12)}</span>
            {idCopied ? <Check className="h-3 w-3 text-[#34d399]" /> : <Copy className="h-3 w-3" />}
          </button>
          {role === 'host' && (
            <>
              <div className="hidden sm:block w-px h-4 bg-[#1e3f68]" />
              <div
                className="hidden sm:flex items-center gap-1.5"
                title={inputProxyConnected ? 'Input proxy connected — remote control active' : 'Input proxy not running — start it for remote control'}
              >
                <div className={`w-2 h-2 rounded-full ${inputProxyConnected ? 'bg-[#34d399]' : 'bg-[#fbbf24] animate-pulse'}`} />
                <span className={`text-xs ${inputProxyConnected ? 'text-[#34d399]' : 'text-[#fbbf24]'}`}>
                  {inputProxyConnected ? 'Proxy OK' : 'No Proxy'}
                </span>
              </div>
              <button
                onClick={onToggleAllowControl}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                  allowControl
                    ? 'bg-[#34d399]/15 text-[#34d399] border border-[#34d399]/30'
                    : 'bg-[#f87171]/15 text-[#f87171] border border-[#f87171]/30'
                }`}
                title={allowControl ? 'Remote control enabled — click to disable' : 'Remote control disabled — click to enable'}
              >
                <MousePointer className="h-3 w-3" />
                {allowControl ? 'Control On' : 'Control Off'}
              </button>
            </>
          )}
        </div>

        {/* Center: Controls */}
        <div className="flex items-center gap-0.5">
          {/* Take/Release Control (viewer only, when host allows) */}
          {role === 'viewer' && allowControl && (
            <button
              onClick={onToggleControl}
              className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-all ${
                controlling
                  ? 'bg-[#2b5ddb]/25 text-[#5b87f7] border border-[#3b6cf5]/30'
                  : 'text-[#90acd0] hover:bg-[#1c3860] hover:text-[#edf2fc]'
              }`}
              title={controlling ? 'Release Control' : 'Take Control'}
            >
              {controlling ? <MousePointerClick className="h-3.5 w-3.5" /> : <MousePointer className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{controlling ? 'Controlling' : 'Take Control'}</span>
            </button>
          )}

          <div className="w-px h-5 bg-[#1e3f68] mx-0.5 sm:mx-1.5" />

          <QualitySelector />

          <ToolbarButton
            icon={Monitor}
            label="Monitors"
            onClick={() => {}}
          />

          <div className="w-px h-5 bg-[#1e3f68] mx-0.5 sm:mx-1.5" />

          <ToolbarButton
            icon={audioEnabled ? Volume2 : VolumeX}
            label={audioEnabled ? 'Mute Speaker' : 'Unmute Speaker'}
            onClick={toggleAudio}
            active={audioEnabled}
          />
          <ToolbarButton
            icon={micEnabled ? Mic : MicOff}
            label={micEnabled ? 'Mute Mic' : 'Unmute Mic'}
            onClick={toggleMic}
            active={micEnabled}
          />
          <ToolbarButton
            icon={MessageSquare}
            label="Chat"
            onClick={toggleChat}
            active={chatOpen}
          />
          <ToolbarButton
            icon={FileUp}
            label="File Transfer"
            onClick={toggleFilePanel}
            active={fileOpen}
          />

          <div className="w-px h-5 bg-[#1e3f68] mx-0.5 sm:mx-1.5" />

          <ToolbarButton
            icon={Camera}
            label="Screenshot"
            onClick={handleScreenshot}
          />
          <ToolbarButton
            icon={Clipboard}
            label="Clipboard Sync"
            onClick={onClipboardSync}
          />
          <ToolbarButton
            icon={isFullscreen ? Minimize : Maximize}
            label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            onClick={onToggleFullscreen}
          />
        </div>

        {/* Right: Disconnect */}
        <button
          onClick={onDisconnect}
          className="flex items-center gap-1.5 sm:gap-2 rounded-lg bg-[#f87171]/15 px-2 sm:px-3 py-1.5 text-sm font-medium text-[#f87171] hover:bg-[#f87171]/25 transition-colors"
        >
          <PhoneOff className="h-4 w-4" />
          <span className="hidden sm:inline">Disconnect</span>
        </button>
      </div>
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  active = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
        active
          ? 'bg-[#2b5ddb]/20 text-[#5b87f7]'
          : 'text-[#90acd0] hover:bg-[#1c3860] hover:text-[#edf2fc]'
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
