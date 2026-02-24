import { desktopCapturer, type Display, screen } from 'electron';

export interface CaptureOptions {
  displayId?: string;
  maxWidth?: number;
  maxHeight?: number;
  maxFps?: number;
}

export async function getScreenSources() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 320, height: 180 },
  });
  return sources;
}

export function getAllDisplays() {
  return screen.getAllDisplays().map((d) => ({
    id: d.id.toString(),
    name: `Display ${d.id}`,
    width: d.size.width,
    height: d.size.height,
    scaleFactor: d.scaleFactor,
    isPrimary: d.id === screen.getPrimaryDisplay().id,
    bounds: d.bounds,
  }));
}

export function getPrimaryDisplay(): Display {
  return screen.getPrimaryDisplay();
}

/**
 * Get MediaStream constraints for screen capture.
 * These constraints are used in the hidden BrowserWindow's
 * navigator.mediaDevices.getUserMedia() call.
 */
export function getMediaConstraints(sourceId: string, options: CaptureOptions = {}) {
  return {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxWidth: options.maxWidth || 1920,
        maxHeight: options.maxHeight || 1080,
        maxFrameRate: options.maxFps || 30,
      },
    },
  };
}
