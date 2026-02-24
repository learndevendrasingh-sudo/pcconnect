// Renderer process — UI logic for the agent window

declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<{
        connectionId: string;
        password: string;
        status: string;
        version: string;
        systemInfo: { hostname: string };
      }>;
      getDisplays: () => Promise<any[]>;
      minimizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      onStatusUpdate: (callback: (status: string) => void) => void;
      onSessionStarted: (callback: (sessionId: string) => void) => void;
      onSessionEnded: (callback: (reason: string) => void) => void;
      onPasswordUpdated: (callback: (password: string) => void) => void;
    };
  }
}

const $ = (id: string) => document.getElementById(id) as HTMLElement;

let passwordVisible = false;
let currentPassword = '';

async function init() {
  // Title bar buttons
  $('btn-minimize').addEventListener('click', () => window.electronAPI.minimizeWindow());
  $('btn-close').addEventListener('click', () => window.electronAPI.closeWindow());

  // Load config
  const config = await window.electronAPI.getConfig();
  $('connection-id').textContent = formatConnectionId(config.connectionId || '---');
  currentPassword = config.password || '';
  $('password-text').textContent = '••••••••••••';
  $('sys-hostname').textContent = config.systemInfo?.hostname || '---';
  $('sys-version').textContent = `v${config.version}`;
  updateStatus(config.status);

  // Copy ID
  $('btn-copy-id').addEventListener('click', () => {
    navigator.clipboard.writeText(config.connectionId);
    $('btn-copy-id').textContent = 'Copied!';
    setTimeout(() => ($('btn-copy-id').textContent = 'Copy ID'), 2000);
  });

  // Toggle password
  $('btn-toggle-password').addEventListener('click', () => {
    passwordVisible = !passwordVisible;
    $('password-text').textContent = passwordVisible ? currentPassword : '••••••••••••';
  });

  // Event listeners from main process
  window.electronAPI.onStatusUpdate(updateStatus);

  window.electronAPI.onSessionStarted((sessionId) => {
    $('session-card').classList.remove('hidden');
  });

  window.electronAPI.onSessionEnded((reason) => {
    $('session-card').classList.add('hidden');
  });

  window.electronAPI.onPasswordUpdated((password) => {
    currentPassword = password;
    $('password-text').textContent = passwordVisible ? password : '••••••••••••';
  });
}

function updateStatus(status: string) {
  const dot = $('status-dot');
  const text = $('status-text');

  dot.className = `status-dot ${status}`;

  switch (status) {
    case 'online':
      text.textContent = 'Ready for connections';
      break;
    case 'busy':
      text.textContent = 'In session';
      break;
    case 'offline':
      text.textContent = 'Offline';
      break;
    default:
      text.textContent = 'Connecting...';
  }
}

function formatConnectionId(id: string): string {
  if (id.length !== 9) return id;
  return `${id.slice(0, 3)} ${id.slice(3, 6)} ${id.slice(6, 9)}`;
}

document.addEventListener('DOMContentLoaded', init);

export {};
