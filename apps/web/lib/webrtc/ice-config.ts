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
    // Metered.ca TURN relay — provides relay candidates
    // when direct P2P fails (mDNS not resolving, firewall blocking, etc.)
    servers.push(
      {
        urls: 'stun:stun.relay.metered.ca:80',
      },
      {
        urls: 'turn:global.relay.metered.ca:80',
        username: '766f5f08454926398ea7fd52',
        credential: 'BRvrhbjwriHcY4lZ',
      },
      {
        urls: 'turn:global.relay.metered.ca:80?transport=tcp',
        username: '766f5f08454926398ea7fd52',
        credential: 'BRvrhbjwriHcY4lZ',
      },
      {
        urls: 'turn:global.relay.metered.ca:443',
        username: '766f5f08454926398ea7fd52',
        credential: 'BRvrhbjwriHcY4lZ',
      },
      {
        urls: 'turns:global.relay.metered.ca:443?transport=tcp',
        username: '766f5f08454926398ea7fd52',
        credential: 'BRvrhbjwriHcY4lZ',
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
