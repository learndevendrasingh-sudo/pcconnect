import type {
  DataChannelMessage,
  PingMessage,
  PongMessage,
} from '@securedesk/shared';

export type DataChannelMessageHandler = (message: DataChannelMessage) => void;

export class DataChannelManager {
  private handlers = new Map<string, DataChannelMessageHandler[]>();
  private channels = new Map<string, RTCDataChannel>();
  private openCallbacks = new Map<string, (() => void)[]>();

  on(type: DataChannelMessage['type'], handler: DataChannelMessageHandler) {
    const existing = this.handlers.get(type) || [];
    existing.push(handler);
    this.handlers.set(type, existing);
  }

  off(type: DataChannelMessage['type'], handler: DataChannelMessageHandler) {
    const existing = this.handlers.get(type) || [];
    this.handlers.set(type, existing.filter((h) => h !== handler));
  }

  handleMessage(event: MessageEvent) {
    try {
      const message: DataChannelMessage = JSON.parse(event.data);
      const handlers = this.handlers.get(message.type) || [];
      for (const handler of handlers) {
        handler(message);
      }
    } catch (error) {
      console.error('[DataChannel] Failed to parse message:', error);
    }
  }

  attachToChannel(channel: RTCDataChannel) {
    this.channels.set(channel.label, channel);
    channel.onmessage = (event) => this.handleMessage(event);
    channel.onopen = () => {
      console.log(`[DataChannel] '${channel.label}' opened`);
      const cbs = this.openCallbacks.get(channel.label);
      if (cbs) {
        for (const cb of cbs) cb();
        this.openCallbacks.delete(channel.label);
      }
    };
    channel.onerror = (e) => console.error(`[DataChannel] '${channel.label}' error:`, e);
    console.log(`[DataChannel] Attached to '${channel.label}' (state: ${channel.readyState})`);

    // If the channel is already open, fire open callbacks immediately
    if (channel.readyState === 'open') {
      const cbs = this.openCallbacks.get(channel.label);
      if (cbs) {
        for (const cb of cbs) cb();
        this.openCallbacks.delete(channel.label);
      }
    }
  }

  /** Register a one-time callback for when a channel opens (fires immediately if already open) */
  onceOpen(channelLabel: string, callback: () => void) {
    const channel = this.channels.get(channelLabel);
    if (channel?.readyState === 'open') {
      callback();
      return;
    }
    const existing = this.openCallbacks.get(channelLabel) || [];
    existing.push(callback);
    this.openCallbacks.set(channelLabel, existing);
  }

  /** Send a message on a specific channel by label */
  send(channelLabel: string, message: DataChannelMessage) {
    const channel = this.channels.get(channelLabel);
    if (channel?.readyState === 'open') {
      channel.send(JSON.stringify(message));
    }
  }

  /** Send a pong response (used by host) */
  sendPong(ping: PingMessage) {
    const pong: PongMessage = {
      type: 'pong',
      seq: ping.seq,
      timestamp: ping.timestamp, // echo back original timestamp for RTT calculation
    };
    this.send('input', pong);
  }

  /** Remove all registered handlers and channels (used before reconnect) */
  removeAllHandlers() {
    this.handlers.clear();
    this.openCallbacks.clear();
    // Don't close channels — they belong to the old PeerConnection which is already closed
    this.channels.clear();
    console.log('[DataChannel] All handlers and channels cleared');
  }

  static serialize(message: DataChannelMessage): string {
    return JSON.stringify(message);
  }
}
