#!/usr/bin/env node
/**
 * Generate a self-signed TLS certificate for local HTTPS/WSS development.
 *
 * The cert covers localhost, 127.0.0.1, and common private-network CIDRs
 * so getDisplayMedia() works when accessing the app via LAN IP.
 *
 * Usage:  node infrastructure/generate-dev-certs.mjs
 * Output: infrastructure/certs/dev.pem  (certificate)
 *         infrastructure/certs/dev-key.pem  (private key)
 */

import { execSync } from 'child_process';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const certsDir = join(__dirname, 'certs');
const certPath = join(certsDir, 'dev.pem');
const keyPath = join(certsDir, 'dev-key.pem');

// Collect all local IPv4 addresses for SAN entries
function getLocalIPs() {
  const ips = new Set(['127.0.0.1']);
  const nets = networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.add(iface.address);
      }
    }
  }
  return [...ips];
}

if (existsSync(certPath) && existsSync(keyPath)) {
  console.log('[certs] Certificates already exist:');
  console.log(`  cert: ${certPath}`);
  console.log(`  key:  ${keyPath}`);
  console.log('[certs] Delete them and re-run to regenerate.');
  process.exit(0);
}

mkdirSync(certsDir, { recursive: true });

const localIPs = getLocalIPs();
const sanEntries = [
  'DNS:localhost',
  ...localIPs.map((ip) => `IP:${ip}`),
];

console.log('[certs] Generating self-signed certificate...');
console.log('[certs] SAN entries:', sanEntries.join(', '));

// Build openssl config for SAN
const opensslConf = join(certsDir, '_openssl.cnf');
writeFileSync(
  opensslConf,
  `[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
CN = SecureDesk Dev

[v3_req]
subjectAltName = ${sanEntries.join(',')}
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
`
);

try {
  execSync(
    `openssl req -x509 -newkey rsa:2048 -nodes -keyout "${keyPath}" -out "${certPath}" -days 365 -config "${opensslConf}"`,
    { stdio: 'pipe' }
  );
  console.log('[certs] Done!');
  console.log(`  cert: ${certPath}`);
  console.log(`  key:  ${keyPath}`);
  console.log('');
  console.log('[certs] To trust this cert in your browser:');
  console.log('  1. Open https://localhost:3000 and accept the warning, OR');
  console.log('  2. Import the cert into your OS trust store');
  console.log('');
  console.log('[certs] Also open https://<your-ip>:3001 once to accept the signaling cert');
} catch (err) {
  console.error('[certs] Failed to generate certificate.');
  console.error('[certs] Make sure "openssl" is available (comes with Git for Windows).');
  console.error(err.stderr?.toString() || err.message);
  process.exit(1);
} finally {
  // Clean up temp config
  try {
    const { unlinkSync } = await import('fs');
    unlinkSync(opensslConf);
  } catch {}
}
