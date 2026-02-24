import type { MouseMessage, KeyboardMessage, ReleaseKeysMessage, MouseAction, KeyAction } from '@securedesk/shared';

export function captureMouseEvent(
  event: MouseEvent | WheelEvent,
  videoElement: HTMLVideoElement,
  action: MouseAction
): MouseMessage {
  const rect = videoElement.getBoundingClientRect();

  // Account for object-fit: contain — calculate actual video rendering area
  const vw = videoElement.videoWidth;
  const vh = videoElement.videoHeight;

  let renderWidth = rect.width;
  let renderHeight = rect.height;
  let offsetX = 0;
  let offsetY = 0;

  if (vw > 0 && vh > 0) {
    const videoAspect = vw / vh;
    const containerAspect = rect.width / rect.height;

    if (videoAspect > containerAspect) {
      // Video wider than container — letterboxed top/bottom
      renderWidth = rect.width;
      renderHeight = rect.width / videoAspect;
      offsetY = (rect.height - renderHeight) / 2;
    } else {
      // Video taller — pillarboxed left/right
      renderHeight = rect.height;
      renderWidth = rect.height * videoAspect;
      offsetX = (rect.width - renderWidth) / 2;
    }
  }

  // Normalize coordinates relative to actual video content area (0-1)
  const x = (event.clientX - rect.left - offsetX) / renderWidth;
  const y = (event.clientY - rect.top - offsetY) / renderHeight;

  const message: MouseMessage = {
    type: 'mouse',
    action,
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    button: event.button,
    timestamp: Date.now(),
  };

  // Add wheel delta for scroll events
  if (action === 'wheel' && event instanceof WheelEvent) {
    message.deltaX = event.deltaX;
    message.deltaY = event.deltaY;
  }

  return message;
}

export function captureKeyboardEvent(
  event: KeyboardEvent,
  action: KeyAction
): KeyboardMessage {
  return {
    type: 'keyboard',
    action,
    code: event.code,
    key: event.key,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    timestamp: Date.now(),
  };
}

export function shouldPreventDefault(event: KeyboardEvent): boolean {
  // Allow Ctrl+Shift+I so the viewer can still open browser devtools
  if (event.ctrlKey && event.shiftKey && event.code === 'KeyI') return false;
  // Capture ALL other keyboard input during remote control.
  // Without this, browser features like find-in-page (Ctrl+F), address bar (Ctrl+L),
  // new tab (Ctrl+T), quick-find (/), page scroll (Space), etc. steal keyboard focus
  // and subsequent typing goes to the browser UI instead of the remote host.
  return true;
}

/** Create a release_keys message to unstick all modifier keys on the host */
export function createReleaseKeysMessage(): ReleaseKeysMessage {
  return {
    type: 'release_keys',
    timestamp: Date.now(),
  };
}
