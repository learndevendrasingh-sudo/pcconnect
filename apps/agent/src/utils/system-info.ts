import os from 'os';

export interface SystemInfo {
  hostname: string;
  os: string;
  platform: string;
  arch: string;
  cpus: number;
  totalMemory: string;
  username: string;
}

export function getSystemInfo(): SystemInfo {
  const totalMem = os.totalmem();
  const gbMem = (totalMem / (1024 * 1024 * 1024)).toFixed(1);

  return {
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()}`,
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: `${gbMem} GB`,
    username: os.userInfo().username,
  };
}
