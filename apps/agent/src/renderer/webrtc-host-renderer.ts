/**
 * WebRTC Host Renderer — runs inside a hidden BrowserWindow.
 * Has full access to Chromium's WebRTC stack (RTCPeerConnection, getUserMedia).
 *
 * Communicates with main process via the webrtcBridge preload API.
 */

declare global {
  interface Window {
    webrtcBridge: {
      sendReady: () => void;
      sendIceCandidate: (candidate: RTCIceCandidateInit) => void;
      sendConnectionState: (state: string) => void;
      sendDataChannelMessage: (channel: string, message: string) => void;
      sendAnswer: (answer: RTCSessionDescriptionInit) => void;
      onInit: (callback: (data: { sourceId: string; sessionId: string; iceServers: RTCIceServer[] }) => void) => void;
      onOffer: (callback: (offer: RTCSessionDescriptionInit) => void) => void;
      onRemoteIceCandidate: (callback: (candidate: RTCIceCandidateInit) => void) => void;
      onClose: (callback: () => void) => void;
    };
  }
}

let pc: RTCPeerConnection | null = null;
let stream: MediaStream | null = null;
const pendingCandidates: RTCIceCandidateInit[] = [];

// Wait for initialization from main process
window.webrtcBridge.onInit(async (data) => {
  const { sourceId, iceServers } = data;

  try {
    // Capture screen using Electron's chromeMediaSource constraint
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 30,
        },
      } as any,
    });

    // Create peer connection
    pc = new RTCPeerConnection({
      iceServers: iceServers as RTCIceServer[],
      iceCandidatePoolSize: 10,
    });

    // Add screen capture tracks
    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream);
    }

    // ICE candidate events
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        window.webrtcBridge.sendIceCandidate(event.candidate.toJSON());
      }
    };

    // Connection state
    pc.onconnectionstatechange = () => {
      if (pc) {
        window.webrtcBridge.sendConnectionState(pc.connectionState);
      }
    };

    // Handle data channels from viewer
    pc.ondatachannel = (event) => {
      const channel = event.channel;
      channel.onmessage = (msgEvent) => {
        window.webrtcBridge.sendDataChannelMessage(channel.label, msgEvent.data);
      };
    };

    console.log('[WebRTC Renderer] Initialized with source:', sourceId);
  } catch (err) {
    console.error('[WebRTC Renderer] Init failed:', err);
  }
});

// Handle offer from viewer (forwarded by main process)
window.webrtcBridge.onOffer(async (offer) => {
  if (!pc) return;

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    // Flush any ICE candidates that arrived before remote description was set
    for (const candidate of pendingCandidates) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
    pendingCandidates.length = 0;

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Send answer back to main process
    window.webrtcBridge.sendAnswer(answer);
    console.log('[WebRTC Renderer] Sent answer');
  } catch (err) {
    console.error('[WebRTC Renderer] Handle offer failed:', err);
  }
});

// Handle remote ICE candidates
window.webrtcBridge.onRemoteIceCandidate(async (candidate) => {
  if (!pc) return;

  try {
    if (pc.remoteDescription) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      pendingCandidates.push(candidate);
    }
  } catch (err) {
    console.error('[WebRTC Renderer] Add ICE candidate failed:', err);
  }
});

// Cleanup
window.webrtcBridge.onClose(() => {
  stream?.getTracks().forEach((t) => t.stop());
  pc?.close();
  stream = null;
  pc = null;
});

// Signal to main process that renderer is ready
window.webrtcBridge.sendReady();
