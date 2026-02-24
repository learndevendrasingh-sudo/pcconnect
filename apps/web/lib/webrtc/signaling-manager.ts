import { SignalingClient, type SignalingEvents } from './signaling';

/**
 * Singleton manager for SignalingClient.
 * Preserves the Socket.IO connection across Next.js page navigations
 * (home → session) so the server doesn't see a disconnect.
 */
class SignalingManager {
  private client: SignalingClient | null = null;

  getClient(): SignalingClient | null {
    return this.client;
  }

  createClient(events: SignalingEvents): SignalingClient {
    if (this.client?.isConnected) {
      this.client.disconnect();
    }
    this.client = new SignalingClient(events);
    return this.client;
  }

  /**
   * Transfer ownership: rebind event handlers without disconnecting.
   * Used when navigating from home page to session page.
   */
  rebindEvents(events: Partial<SignalingEvents>): void {
    if (this.client) {
      this.client.rebindHandlers(events);
    }
  }

  disconnect(): void {
    this.client?.disconnect();
    this.client = null;
  }

  get isConnected(): boolean {
    return this.client?.isConnected ?? false;
  }
}

export const signalingManager = new SignalingManager();
