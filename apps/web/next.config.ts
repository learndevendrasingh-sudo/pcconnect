import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Disable React StrictMode — it double-mounts effects in development,
  // which destroys MediaStreams and RTCPeerConnections (track.stop() fires
  // onended → handleDisconnect → navigation + signaling teardown).
  // WebRTC apps with getDisplayMedia/getUserMedia are incompatible with StrictMode.
  reactStrictMode: false,
  transpilePackages: ['@securedesk/shared'],
  allowedDevOrigins: [
    // Next.js allowedDevOrigins uses hostnames (no protocol).
    // Allow any LAN IP to access the dev server.
    '192.168.*',
    '10.*',
    '172.16.*',
  ],
};

export default nextConfig;
