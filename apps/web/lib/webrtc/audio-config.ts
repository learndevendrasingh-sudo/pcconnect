/**
 * Audio quality and low-latency configuration for WebRTC.
 *
 * Modifies SDP to configure Opus codec for high-quality stereo audio
 * with minimal latency (10ms frames, full-band, constant bitrate).
 */

/** Opus SDP parameters for high-quality, low-latency audio */
const OPUS_PARAMS: Record<string, string> = {
  maxaveragebitrate: '510000',   // 510 kbps — Opus maximum
  stereo: '1',                   // Enable stereo
  'sprop-stereo': '1',           // Advertise stereo capability
  maxplaybackrate: '48000',      // Full-band (48 kHz)
  useinbandfec: '1',             // Forward error correction
  ptime: '10',                   // 10ms frame size (half of default 20ms)
  minptime: '10',                // Minimum 10ms
  usedtx: '0',                   // Disable discontinuous transmission
  cbr: '1',                      // Constant bitrate for predictable latency
};

/**
 * Modify SDP to configure Opus for high-quality, low-latency audio.
 *
 * Finds the Opus codec fmtp line and appends/overrides parameters.
 * If no fmtp line exists for Opus, creates one.
 */
export function setOpusHighQuality(sdp: string): string {
  const lines = sdp.split('\r\n');
  const result: string[] = [];

  // Find Opus payload type from rtpmap
  let opusPayloadType: string | null = null;
  for (const line of lines) {
    const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
    if (match) {
      opusPayloadType = match[1];
      break;
    }
  }

  if (!opusPayloadType) {
    // No Opus codec found — return SDP unchanged
    return sdp;
  }

  let foundFmtp = false;

  for (const line of lines) {
    if (line.startsWith(`a=fmtp:${opusPayloadType}`)) {
      foundFmtp = true;
      // Parse existing params
      const fmtpPrefix = `a=fmtp:${opusPayloadType} `;
      const existingParams = line.slice(fmtpPrefix.length);
      const paramMap = new Map<string, string>();

      // Parse existing key=value pairs
      for (const param of existingParams.split(';')) {
        const trimmed = param.trim();
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          paramMap.set(trimmed.slice(0, eqIdx), trimmed.slice(eqIdx + 1));
        }
      }

      // Override/add our params
      for (const [key, value] of Object.entries(OPUS_PARAMS)) {
        paramMap.set(key, value);
      }

      // Rebuild fmtp line
      const paramStr = Array.from(paramMap.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join(';');
      result.push(`${fmtpPrefix}${paramStr}`);
    } else {
      result.push(line);
    }
  }

  // If no fmtp line existed, insert one after the rtpmap line
  if (!foundFmtp) {
    const finalResult: string[] = [];
    for (const line of result) {
      finalResult.push(line);
      if (line.startsWith(`a=rtpmap:${opusPayloadType}`)) {
        const paramStr = Object.entries(OPUS_PARAMS)
          .map(([k, v]) => `${k}=${v}`)
          .join(';');
        finalResult.push(`a=fmtp:${opusPayloadType} ${paramStr}`);
      }
    }
    return finalResult.join('\r\n');
  }

  return result.join('\r\n');
}

/** Mic audio constraints — echo cancellation + noise suppression for voice */
export const MIC_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000,
  channelCount: 1,
};

/** System audio constraints — high quality, no processing (would distort music) */
export const SYSTEM_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 2,
  sampleRate: 48000,
  autoGainControl: false,
  noiseSuppression: false,
  echoCancellation: false,
};
