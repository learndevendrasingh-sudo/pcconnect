import type { DataChannelMessage, MouseMessage, KeyboardMessage } from '@securedesk/shared';

export type InputHandler = (message: MouseMessage | KeyboardMessage) => void;

export class AgentDataChannelHandler {
  private inputHandler: InputHandler | null = null;

  setInputHandler(handler: InputHandler) {
    this.inputHandler = handler;
  }

  handleMessage(channelLabel: string, rawData: string) {
    try {
      const message: DataChannelMessage = JSON.parse(rawData);

      switch (message.type) {
        case 'mouse':
        case 'keyboard':
          this.inputHandler?.(message);
          break;
        case 'clipboard':
          // Handle clipboard sync
          break;
        case 'quality':
          // Handle quality change request
          break;
        case 'monitor_select':
          // Handle monitor switch
          break;
        case 'ping':
          // Respond with pong (handled at WebRTC level)
          break;
      }
    } catch (error) {
      console.error('[DataChannel] Parse error:', error);
    }
  }
}
