/**
 * End-to-End Encryption for WebRTC media streams.
 *
 * Uses AES-256-GCM via Web Crypto API to encrypt/decrypt individual
 * video and audio frames through the WebRTC Encoded Transform API
 * (RTCRtpScriptTransform / createEncodedStreams).
 *
 * Key derivation: PBKDF2 from the shared session password + sessionId salt.
 * Both peers derive the same key without explicit key exchange.
 *
 * Frame format: [IV (12 bytes)][encrypted payload + GCM tag (16 bytes)]
 */

const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 100_000;

/** Check if the browser supports Encoded Transform (Insertable Streams) */
export function isE2ESupported(): boolean {
  if (typeof window === 'undefined') return false;
  // Check for the newer RTCRtpScriptTransform or the legacy createEncodedStreams
  return (
    typeof (window as any).RTCRtpScriptTransform !== 'undefined' ||
    typeof (RTCRtpSender.prototype as any).createEncodedStreams === 'function'
  );
}

/** Derive an AES-256-GCM key from password + salt using PBKDF2 */
export async function deriveKey(password: string, salt: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Encrypt a single frame's data in-place */
async function encryptFrameData(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  // Prepend IV to encrypted data: [IV (12)][ciphertext + tag]
  const result = new Uint8Array(IV_LENGTH + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), IV_LENGTH);
  return result.buffer;
}

/** Decrypt a single frame's data */
async function decryptFrameData(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
  const iv = new Uint8Array(data, 0, IV_LENGTH);
  const ciphertext = new Uint8Array(data, IV_LENGTH);

  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
}

/**
 * Create an encryption TransformStream for sender frames.
 * Encrypts each frame's data with AES-GCM before transmission.
 */
function createEncryptTransform(key: CryptoKey): TransformStream {
  return new TransformStream({
    async transform(frame: any, controller: any) {
      try {
        const data = frame.data as ArrayBuffer;
        if (data.byteLength === 0) {
          controller.enqueue(frame);
          return;
        }
        const encrypted = await encryptFrameData(key, data);
        frame.data = encrypted;
        controller.enqueue(frame);
      } catch {
        // If encryption fails, pass through unencrypted (graceful degradation)
        controller.enqueue(frame);
      }
    },
  });
}

/**
 * Create a decryption TransformStream for receiver frames.
 * Decrypts each frame's data with AES-GCM after reception.
 */
function createDecryptTransform(key: CryptoKey): TransformStream {
  return new TransformStream({
    async transform(frame: any, controller: any) {
      try {
        const data = frame.data as ArrayBuffer;
        // If frame is too small to contain IV + tag, skip decryption
        if (data.byteLength <= IV_LENGTH + 16) {
          controller.enqueue(frame);
          return;
        }
        const decrypted = await decryptFrameData(key, data);
        frame.data = decrypted;
        controller.enqueue(frame);
      } catch {
        // If decryption fails (e.g. unencrypted frame), pass through
        controller.enqueue(frame);
      }
    },
  });
}

/**
 * Apply E2E encryption to all senders and receivers on a peer connection.
 * Must be called after tracks are added but before the connection is negotiated.
 *
 * Uses the legacy createEncodedStreams API (widely supported in Chromium).
 */
export function applyE2EEncryption(pc: RTCPeerConnection, key: CryptoKey): boolean {
  if (!isE2ESupported()) {
    console.warn('[E2E] Browser does not support Encoded Transform — E2E disabled');
    return false;
  }

  let applied = 0;

  // Encrypt outgoing frames (senders)
  for (const sender of pc.getSenders()) {
    if (!sender.track) continue;
    try {
      const senderAny = sender as any;
      if (typeof senderAny.createEncodedStreams === 'function') {
        const { readable, writable } = senderAny.createEncodedStreams();
        readable.pipeThrough(createEncryptTransform(key)).pipeTo(writable);
        applied++;
        console.log(`[E2E] Encrypt transform applied to ${sender.track.kind} sender`);
      }
    } catch (err) {
      console.warn(`[E2E] Skipping sender encryption (non-fatal):`, err);
    }
  }

  // Decrypt incoming frames (receivers)
  for (const receiver of pc.getReceivers()) {
    if (!receiver.track) continue;
    try {
      const receiverAny = receiver as any;
      if (typeof receiverAny.createEncodedStreams === 'function') {
        const { readable, writable } = receiverAny.createEncodedStreams();
        readable.pipeThrough(createDecryptTransform(key)).pipeTo(writable);
        applied++;
        console.log(`[E2E] Decrypt transform applied to ${receiver.track.kind} receiver`);
      }
    } catch (err) {
      console.warn(`[E2E] Skipping receiver decryption (non-fatal):`, err);
    }
  }

  if (applied > 0) {
    console.log(`[E2E] Encryption active — AES-256-GCM (${applied} transforms)`);
    return true;
  }
  console.log('[E2E] No transforms applied (no tracks yet or API unavailable)');
  return false;
}
