import { RTC_CONFIG } from './ice-config';
import { CONFIG } from '@securedesk/shared';
import { setOpusHighQuality } from './audio-config';
import { isE2ESupported, deriveKey, applyE2EEncryption } from './e2e-encryption';

export type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export interface PeerConnectionEvents {
  onTrack: (stream: MediaStream) => void;
  onDataChannel: (channel: RTCDataChannel) => void;
  onConnectionStateChange: (state: ConnectionState) => void;
  onIceCandidate: (candidate: RTCIceCandidate) => void;
  onError: (error: Error) => void;
}

export class PeerConnection {
  private pc: RTCPeerConnection;
  private events: PeerConnectionEvents;
  private inputChannel: RTCDataChannel | null = null;
  private fileChannel: RTCDataChannel | null = null;
  private chatChannel: RTCDataChannel | null = null;
  private remoteStream: MediaStream | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private e2eKey: CryptoKey | null = null;
  private e2eActive = false;

  constructor(events: PeerConnectionEvents) {
    this.events = events;
    this.pc = new RTCPeerConnection(RTC_CONFIG);
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.pc.ontrack = (event) => {
      console.log('[PeerConnection] ontrack:', event.track.kind, 'readyState:', event.track.readyState, 'streams:', event.streams.length);
      let stream = event.streams[0];
      if (!stream) {
        // Fallback: create a MediaStream from the track if no associated stream
        console.warn('[PeerConnection] ontrack: no associated stream — creating one from track');
        stream = new MediaStream([event.track]);
      }
      if (this.remoteStream && this.remoteStream.id === stream.id) {
        // Same stream (additional track added) — re-emit so UI can update
        this.events.onTrack(this.remoteStream);
      } else {
        this.remoteStream = stream;
        this.events.onTrack(stream);
      }
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[PeerConnection] Local ICE candidate:', event.candidate.type, event.candidate.protocol, event.candidate.address);
        this.events.onIceCandidate(event.candidate);
      } else {
        console.log('[PeerConnection] ICE gathering complete');
      }
    };

    this.pc.onicecandidateerror = (event) => {
      console.warn('[PeerConnection] ICE candidate error:', (event as RTCPeerConnectionIceErrorEvent).errorCode, (event as RTCPeerConnectionIceErrorEvent).errorText);
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log('[PeerConnection] ICE connection state:', this.pc.iceConnectionState);
    };

    this.pc.onicegatheringstatechange = () => {
      console.log('[PeerConnection] ICE gathering state:', this.pc.iceGatheringState);
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState as ConnectionState;
      console.log('[PeerConnection] Connection state:', state);
      if (state === 'connected') {
        this.applyLowLatencyEncoding();
      }
      this.events.onConnectionStateChange(state);
    };

    this.pc.ondatachannel = (event) => {
      const channel = event.channel;
      this.handleDataChannel(channel);
      this.events.onDataChannel(channel);
    };
  }

  private handleDataChannel(channel: RTCDataChannel) {
    switch (channel.label) {
      case CONFIG.DATA_CHANNEL_INPUT:
        this.inputChannel = channel;
        break;
      case CONFIG.DATA_CHANNEL_FILE:
        this.fileChannel = channel;
        break;
      case CONFIG.DATA_CHANNEL_CHAT:
        this.chatChannel = channel;
        break;
    }
  }

  private async flushPendingCandidates() {
    for (const candidate of this.pendingCandidates) {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
    this.pendingCandidates = [];
  }

  /** Configure senders for low-latency, high-quality encoding */
  private applyLowLatencyEncoding() {
    for (const sender of this.pc.getSenders()) {
      if (!sender.track) continue;
      try {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }

        if (sender.track.kind === 'video') {
          params.encodings[0].maxBitrate = 5_000_000;
          params.encodings[0].maxFramerate = 30;
          // Prioritize framerate over resolution for real-time feel
          params.degradationPreference = 'maintain-framerate';
        } else if (sender.track.kind === 'audio') {
          params.encodings[0].maxBitrate = 510_000;
          params.encodings[0].networkPriority = 'high';
          params.encodings[0].priority = 'high';
        }

        sender.setParameters(params).catch((err) => {
          console.warn('[PeerConnection] Failed to set encoding params:', err);
        });
      } catch (err) {
        console.warn('[PeerConnection] Error configuring sender:', err);
      }
    }
    console.log('[PeerConnection] Applied low-latency encoding parameters');
  }

  // ========== Viewer Methods (creates offer) ==========

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    // Create data channels (viewer is the offerer)
    this.inputChannel = this.pc.createDataChannel(CONFIG.DATA_CHANNEL_INPUT, {
      ordered: true,
    });
    this.fileChannel = this.pc.createDataChannel(CONFIG.DATA_CHANNEL_FILE, {
      ordered: false,
      maxRetransmits: 3,
    });
    this.chatChannel = this.pc.createDataChannel(CONFIG.DATA_CHANNEL_CHAT, {
      ordered: true,
    });

    // Emit viewer-created channels so DataChannelManager can attach onmessage
    // (ondatachannel only fires on the answerer/host, not the offerer/viewer)
    this.events.onDataChannel(this.inputChannel);
    this.events.onDataChannel(this.fileChannel);
    this.events.onDataChannel(this.chatChannel);

    // Apply E2E encryption to senders BEFORE negotiation (createEncodedStreams
    // must be called before setLocalDescription, not after connection)
    this.tryApplyE2E();

    const offer = await this.pc.createOffer({
      offerToReceiveVideo: true,
      offerToReceiveAudio: true,
    });
    // Apply high-quality low-latency Opus settings to SDP
    if (offer.sdp) {
      offer.sdp = setOpusHighQuality(offer.sdp);
    }
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  // Set remote SDP answer (viewer receives this)
  async setAnswer(answer: RTCSessionDescriptionInit) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    await this.flushPendingCandidates();
  }

  // ========== Host Methods (receives offer, creates answer) ==========

  /**
   * Add a local MediaStream's tracks to the peer connection.
   * Call this BEFORE handleOffer so tracks are included in the answer.
   */
  addStream(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
      this.pc.addTrack(track, stream);
    }
  }

  /**
   * Host receives viewer's offer, sets it as remote description,
   * creates an answer, and returns it.
   * If a localStream is provided, its tracks are added before creating the answer.
   */
  async handleOffer(
    offer: RTCSessionDescriptionInit,
    localStream?: MediaStream
  ): Promise<RTCSessionDescriptionInit> {
    if (localStream) {
      this.addStream(localStream);
    }

    // Apply E2E encryption to senders BEFORE negotiation
    this.tryApplyE2E();

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    await this.flushPendingCandidates();

    const answer = await this.pc.createAnswer();
    // Apply high-quality low-latency Opus settings to SDP
    if (answer.sdp) {
      answer.sdp = setOpusHighQuality(answer.sdp);
    }
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  // ========== ICE Candidates ==========

  // Add ICE candidate from remote peer (buffers if remote description not set yet)
  async addIceCandidate(candidate: RTCIceCandidateInit) {
    console.log('[PeerConnection] Remote ICE candidate:', candidate.candidate?.split(' ').slice(4, 8).join(' '));
    if (this.pc.remoteDescription) {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      this.pendingCandidates.push(candidate);
    }
  }

  // ========== Data Channel Methods ==========

  sendInput(data: string) {
    if (this.inputChannel?.readyState === 'open') {
      this.inputChannel.send(data);
    } else {
      console.warn('[PeerConnection] Input channel not open, state:', this.inputChannel?.readyState ?? 'null', 'label:', this.inputChannel?.label ?? 'null');
    }
  }

  sendChat(data: string) {
    if (this.chatChannel?.readyState === 'open') {
      this.chatChannel.send(data);
    }
  }

  sendFile(data: string | ArrayBuffer) {
    if (this.fileChannel?.readyState === 'open') {
      this.fileChannel.send(data as string);
    }
  }

  // ========== Getters ==========

  getInputChannel(): RTCDataChannel | null {
    return this.inputChannel;
  }

  getChatChannel(): RTCDataChannel | null {
    return this.chatChannel;
  }

  getFileChannel(): RTCDataChannel | null {
    return this.fileChannel;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  getStats(): Promise<RTCStatsReport> {
    return this.pc.getStats();
  }

  getRTCPeerConnection(): RTCPeerConnection {
    return this.pc;
  }

  /**
   * Enable E2E encryption by deriving a key from password + sessionId.
   * Call before the connection is established (before createOffer/handleOffer).
   * Both peers must call this with the same password+sessionId to communicate.
   */
  async enableE2E(password: string, sessionId: string): Promise<boolean> {
    if (!isE2ESupported()) {
      console.warn('[PeerConnection] E2E not supported by browser');
      return false;
    }
    try {
      this.e2eKey = await deriveKey(password, `securedesk-e2e-${sessionId}`);
      console.log('[PeerConnection] E2E key derived — will apply before negotiation');
      return true;
    } catch (err) {
      console.error('[PeerConnection] E2E key derivation failed:', err);
      return false;
    }
  }

  /**
   * Apply E2E encryption to current senders/receivers.
   * Called from createOffer/handleOffer BEFORE setLocalDescription.
   * Gracefully skips if no key or not supported.
   */
  private tryApplyE2E(): void {
    if (!this.e2eKey || this.e2eActive) return;
    try {
      this.e2eActive = applyE2EEncryption(this.pc, this.e2eKey);
    } catch (err) {
      console.warn('[PeerConnection] E2E encryption failed (non-fatal):', err);
      this.e2eActive = false;
    }
  }

  /** Whether E2E encryption is currently active */
  get isE2EActive(): boolean {
    return this.e2eActive;
  }

  /** Trigger an ICE restart — creates a new offer with iceRestart: true */
  async restartIce(): Promise<RTCSessionDescriptionInit> {
    console.log('[PeerConnection] Restarting ICE...');
    const offer = await this.pc.createOffer({ iceRestart: true });
    if (offer.sdp) {
      offer.sdp = setOpusHighQuality(offer.sdp);
    }
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  close() {
    this.inputChannel?.close();
    this.fileChannel?.close();
    this.chatChannel?.close();
    this.pc.close();
    this.remoteStream = null;
    this.pendingCandidates = [];
  }
}
