import { CONFIG } from '@securedesk/shared';

export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [...CONFIG.ICE_SERVERS];

  // Add TURN server if configured via env vars (preferred — use your own TURN)
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const turnUser = process.env.NEXT_PUBLIC_TURN_USER;
  const turnPass = process.env.NEXT_PUBLIC_TURN_PASS;

  if (turnUrl && turnUser && turnPass) {
    servers.push({
      urls: turnUrl,
      username: turnUser,
      credential: turnPass,
    });
  } else {
    // Free Metered TURN relay for development — provides relay candidates
    // when direct P2P fails (mDNS not resolving, firewall blocking, etc.)
    servers.push(
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    );
  }

  return servers;
}

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: getIceServers(),
  iceTransportPolicy: 'all',
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};
