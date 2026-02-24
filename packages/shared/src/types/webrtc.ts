// WebRTC message types for DataChannel communication

export type DataChannelMessageType =
  | 'mouse'
  | 'keyboard'
  | 'clipboard'
  | 'chat'
  | 'file_meta'
  | 'file_chunk'
  | 'file_complete'
  | 'quality'
  | 'monitor_select'
  | 'ping'
  | 'pong'
  | 'control_permission'
  | 'release_keys'
  | 'e2e_ready';

export interface BaseMessage {
  type: DataChannelMessageType;
  timestamp: number;
}

// Mouse events
export type MouseAction = 'move' | 'click' | 'dblclick' | 'contextmenu' | 'mousedown' | 'mouseup' | 'wheel';

export interface MouseMessage extends BaseMessage {
  type: 'mouse';
  action: MouseAction;
  x: number; // normalized 0-1
  y: number; // normalized 0-1
  button?: number; // 0=left, 1=middle, 2=right
  deltaX?: number;
  deltaY?: number;
}

// Keyboard events
export type KeyAction = 'keydown' | 'keyup';

export interface KeyboardMessage extends BaseMessage {
  type: 'keyboard';
  action: KeyAction;
  code: string; // KeyboardEvent.code
  key: string; // KeyboardEvent.key
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

// Clipboard sync
export interface ClipboardMessage extends BaseMessage {
  type: 'clipboard';
  text: string;
}

// Chat
export interface ChatMessage extends BaseMessage {
  type: 'chat';
  text: string;
  sender: string;
}

// File transfer
export interface FileMetaMessage extends BaseMessage {
  type: 'file_meta';
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
}

export interface FileChunkMessage extends BaseMessage {
  type: 'file_chunk';
  fileId: string;
  chunkIndex: number;
  data: string; // base64 encoded chunk
}

export interface FileCompleteMessage extends BaseMessage {
  type: 'file_complete';
  fileId: string;
  checksum: string;
}

// Quality control
export type QualityPreset = 'auto' | 'low' | 'medium' | 'high';

export interface QualityMessage extends BaseMessage {
  type: 'quality';
  preset: QualityPreset;
  maxWidth?: number;
  maxHeight?: number;
  maxFps?: number;
}

export interface QualityConfig {
  preset: QualityPreset;
  maxWidth: number;
  maxHeight: number;
  maxFps: number;
  maxBitrate: number;
}

export const QUALITY_PRESETS: Record<QualityPreset, QualityConfig> = {
  auto: { preset: 'auto', maxWidth: 1920, maxHeight: 1080, maxFps: 30, maxBitrate: 4000000 },
  low: { preset: 'low', maxWidth: 1280, maxHeight: 720, maxFps: 15, maxBitrate: 1000000 },
  medium: { preset: 'medium', maxWidth: 1920, maxHeight: 1080, maxFps: 24, maxBitrate: 2500000 },
  high: { preset: 'high', maxWidth: 1920, maxHeight: 1080, maxFps: 30, maxBitrate: 5000000 },
};

// Monitor selection
export interface MonitorSelectMessage extends BaseMessage {
  type: 'monitor_select';
  monitorId: string;
}

export interface MonitorInfo {
  id: string;
  name: string;
  width: number;
  height: number;
  isPrimary: boolean;
}

// Latency measurement
export interface PingMessage extends BaseMessage {
  type: 'ping';
  seq: number;
}

export interface PongMessage extends BaseMessage {
  type: 'pong';
  seq: number;
}

// Control permission (host → viewer, sent when data channel opens)
export interface ControlPermissionMessage extends BaseMessage {
  type: 'control_permission';
  allowed: boolean;
}

// Release all modifier keys (viewer → host, sent on blur/control toggle)
export interface ReleaseKeysMessage extends BaseMessage {
  type: 'release_keys';
}

// E2E encryption ready signal
export interface E2EReadyMessage extends BaseMessage {
  type: 'e2e_ready';
}

export type DataChannelMessage =
  | MouseMessage
  | KeyboardMessage
  | ClipboardMessage
  | ChatMessage
  | FileMetaMessage
  | FileChunkMessage
  | FileCompleteMessage
  | QualityMessage
  | MonitorSelectMessage
  | PingMessage
  | PongMessage
  | ControlPermissionMessage
  | ReleaseKeysMessage
  | E2EReadyMessage;
