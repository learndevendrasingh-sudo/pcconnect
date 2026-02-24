/**
 * Module-level store for the host's captured display stream.
 * Persists across Next.js client-side navigations (home → session page).
 *
 * getDisplayMedia is called on the home page so the picker appears
 * immediately (Google Meet style). The stream is stored here and
 * consumed by the session page via takeHostDisplayStream().
 */

let _displayStream: MediaStream | null = null;

/** Store the captured display stream */
export function setHostDisplayStream(stream: MediaStream) {
  _displayStream = stream;
}

/** Get the stored display stream without removing it */
export function getHostDisplayStream(): MediaStream | null {
  return _displayStream;
}

/** Take the stream and clear the reference (transfers ownership to caller).
 *  Returns null if the stream's video track has already ended (e.g., user
 *  clicked "Stop sharing" before the session page loaded). */
export function takeHostDisplayStream(): MediaStream | null {
  const stream = _displayStream;
  _displayStream = null;
  if (!stream) return null;
  // Verify the stream is still alive — a stopped track can't be reused
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack || videoTrack.readyState === 'ended') {
    return null;
  }
  return stream;
}

/** Stop all tracks and clear the store */
export function clearHostDisplayStream() {
  if (_displayStream) {
    _displayStream.getTracks().forEach((t) => t.stop());
  }
  _displayStream = null;
}
