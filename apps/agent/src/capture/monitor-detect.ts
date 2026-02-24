import { screen, type Display } from 'electron';
import type { MonitorInfo } from '@securedesk/shared';

export function detectMonitors(): MonitorInfo[] {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();

  return displays.map((display) => ({
    id: display.id.toString(),
    name: `Display ${display.id} (${display.size.width}x${display.size.height})`,
    width: display.size.width,
    height: display.size.height,
    isPrimary: display.id === primary.id,
  }));
}

export function getDisplayById(id: string): Display | undefined {
  return screen.getAllDisplays().find((d) => d.id.toString() === id);
}
