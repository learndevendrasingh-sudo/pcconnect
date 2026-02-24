import koffi from 'koffi';
import type { MouseMessage, KeyboardMessage } from '@securedesk/shared';

// ========== Windows API via koffi FFI ==========

const user32 = koffi.load('user32.dll');

// Mouse functions
const SetCursorPos = user32.func('bool SetCursorPos(int x, int y)');
const mouse_event = user32.func('void mouse_event(uint32 dwFlags, uint32 dx, uint32 dy, int32 dwData, uintptr dwExtraInfo)');

// Keyboard functions
const keybd_event = user32.func('void keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr dwExtraInfo)');

// Scan code mapping: VK → hardware scan code
const MapVirtualKeyW = user32.func('uint32 MapVirtualKeyW(uint32 uCode, uint32 uMapType)');
const MAPVK_VK_TO_VSC = 0;

// Screen size
const GetSystemMetrics = user32.func('int GetSystemMetrics(int nIndex)');

// Mouse event flags
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;
const MOUSEEVENTF_WHEEL = 0x0800;
const MOUSEEVENTF_HWHEEL = 0x1000;

// Keyboard event flags
const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP = 0x0002;

// Virtual key codes (browser KeyboardEvent.code → Windows VK code)
const VK_MAP: Record<string, number> = {
  // Letters
  KeyA: 0x41, KeyB: 0x42, KeyC: 0x43, KeyD: 0x44, KeyE: 0x45,
  KeyF: 0x46, KeyG: 0x47, KeyH: 0x48, KeyI: 0x49, KeyJ: 0x4A,
  KeyK: 0x4B, KeyL: 0x4C, KeyM: 0x4D, KeyN: 0x4E, KeyO: 0x4F,
  KeyP: 0x50, KeyQ: 0x51, KeyR: 0x52, KeyS: 0x53, KeyT: 0x54,
  KeyU: 0x55, KeyV: 0x56, KeyW: 0x57, KeyX: 0x58, KeyY: 0x59,
  KeyZ: 0x5A,
  // Numbers (top row)
  Digit0: 0x30, Digit1: 0x31, Digit2: 0x32, Digit3: 0x33,
  Digit4: 0x34, Digit5: 0x35, Digit6: 0x36, Digit7: 0x37,
  Digit8: 0x38, Digit9: 0x39,
  // Numpad
  Numpad0: 0x60, Numpad1: 0x61, Numpad2: 0x62, Numpad3: 0x63,
  Numpad4: 0x64, Numpad5: 0x65, Numpad6: 0x66, Numpad7: 0x67,
  Numpad8: 0x68, Numpad9: 0x69,
  NumpadMultiply: 0x6A, NumpadAdd: 0x6B, NumpadSubtract: 0x6D,
  NumpadDecimal: 0x6E, NumpadDivide: 0x6F, NumpadEnter: 0x0D,
  // Function keys
  F1: 0x70, F2: 0x71, F3: 0x72, F4: 0x73, F5: 0x74, F6: 0x75,
  F7: 0x76, F8: 0x77, F9: 0x78, F10: 0x79, F11: 0x7A, F12: 0x7B,
  // Modifiers
  ShiftLeft: 0xA0, ShiftRight: 0xA1,
  ControlLeft: 0xA2, ControlRight: 0xA3,
  AltLeft: 0xA4, AltRight: 0xA5,
  MetaLeft: 0x5B, MetaRight: 0x5C,
  // Navigation
  ArrowUp: 0x26, ArrowDown: 0x28, ArrowLeft: 0x25, ArrowRight: 0x27,
  Home: 0x24, End: 0x23, PageUp: 0x21, PageDown: 0x22,
  // Editing
  Backspace: 0x08, Delete: 0x2E, Enter: 0x0D,
  Tab: 0x09, Escape: 0x1B, Space: 0x20,
  Insert: 0x2D,
  // Punctuation
  Minus: 0xBD, Equal: 0xBB,
  BracketLeft: 0xDB, BracketRight: 0xDD,
  Backslash: 0xDC, IntlBackslash: 0xE2, Semicolon: 0xBA,
  Quote: 0xDE, Backquote: 0xC0,
  Comma: 0xBC, Period: 0xBE, Slash: 0xBF,
  CapsLock: 0x14, NumLock: 0x90, ScrollLock: 0x91,
  PrintScreen: 0x2C, Pause: 0x13,
  ContextMenu: 0x5D,
};

// Extended keys need KEYEVENTF_EXTENDEDKEY flag — these are keys that use the
// enhanced 101/102-key keyboard scan codes (right-side modifiers, nav cluster, arrows, etc.)
const EXTENDED_KEY_CODES = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown',
  'Insert', 'Delete', 'PrintScreen',
  'NumpadEnter', 'NumpadDivide',
  'ControlRight', 'AltRight', 'MetaLeft', 'MetaRight',
  'ContextMenu',
]);

// System metrics constants
const SM_CXSCREEN = 0;
const SM_CYSCREEN = 1;

export class InputExecutor {
  private screenWidth: number;
  private screenHeight: number;
  // Deduplication: track last mouseup timestamp (viewer clock) to skip
  // redundant click/dblclick/contextmenu that the browser fires AFTER mousedown+mouseup.
  private lastMouseUpTimestamp = 0;
  // Pre-computed scan code cache for fast lookup
  private scanCodeCache = new Map<number, number>();

  constructor() {
    this.screenWidth = GetSystemMetrics(SM_CXSCREEN);
    this.screenHeight = GetSystemMetrics(SM_CYSCREEN);
    console.log(`[InputExecutor] Screen: ${this.screenWidth}x${this.screenHeight}`);

    // Pre-compute scan codes for all mapped VK codes
    for (const [code, vk] of Object.entries(VK_MAP)) {
      const scan = MapVirtualKeyW(vk, MAPVK_VK_TO_VSC);
      this.scanCodeCache.set(vk, scan);
      if (scan === 0 && code !== 'Pause') {
        // Pause has scan code 0 which is normal
        console.warn(`[InputExecutor] No scan code for ${code} (vk=0x${vk.toString(16)})`);
      }
    }
  }

  handleMouse(msg: MouseMessage): void {
    const x = Math.round(msg.x * this.screenWidth);
    const y = Math.round(msg.y * this.screenHeight);

    // Deduplicate: browser fires mousedown → mouseup → click sequentially.
    // The mousedown+mouseup already produced the click at OS level, so skip
    // the redundant click/dblclick/contextmenu if mouseup just happened.
    if (msg.action === 'click' || msg.action === 'dblclick' || msg.action === 'contextmenu') {
      if (this.lastMouseUpTimestamp > 0 && (msg.timestamp - this.lastMouseUpTimestamp) < 150) {
        return; // Already handled by mousedown+mouseup pair
      }
    }

    try {
      switch (msg.action) {
        case 'move':
          SetCursorPos(x, y);
          break;
        case 'click':
          SetCursorPos(x, y);
          mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
          mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
          break;
        case 'dblclick':
          SetCursorPos(x, y);
          mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
          mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
          mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
          mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
          break;
        case 'contextmenu':
          SetCursorPos(x, y);
          mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
          mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
          break;
        case 'mousedown': {
          SetCursorPos(x, y);
          const downFlag = msg.button === 2 ? MOUSEEVENTF_RIGHTDOWN
            : msg.button === 1 ? MOUSEEVENTF_MIDDLEDOWN
            : MOUSEEVENTF_LEFTDOWN;
          mouse_event(downFlag, 0, 0, 0, 0);
          break;
        }
        case 'mouseup': {
          SetCursorPos(x, y);
          const upFlag = msg.button === 2 ? MOUSEEVENTF_RIGHTUP
            : msg.button === 1 ? MOUSEEVENTF_MIDDLEUP
            : MOUSEEVENTF_LEFTUP;
          mouse_event(upFlag, 0, 0, 0, 0);
          this.lastMouseUpTimestamp = msg.timestamp;
          break;
        }
        case 'wheel':
          SetCursorPos(x, y);
          if (msg.deltaY !== undefined && msg.deltaY !== 0) {
            // Windows WHEEL_DELTA is 120 per notch.
            // Browser deltaY ~100px per mouse wheel notch, smaller for trackpads.
            const absDelta = Math.abs(msg.deltaY);
            const notches = Math.max(1, Math.round(absDelta / 100));
            const wheelDelta = -Math.sign(msg.deltaY) * notches * 120;
            mouse_event(MOUSEEVENTF_WHEEL, 0, 0, wheelDelta, 0);
          }
          if (msg.deltaX !== undefined && msg.deltaX !== 0) {
            const absX = Math.abs(msg.deltaX);
            const hNotches = Math.max(1, Math.round(absX / 100));
            const hDelta = Math.sign(msg.deltaX) * hNotches * 120;
            mouse_event(MOUSEEVENTF_HWHEEL, 0, 0, hDelta, 0);
          }
          break;
      }
    } catch (err) {
      console.error('[InputExecutor] Mouse error:', err);
    }
  }

  /** Release all modifier keys to prevent stuck modifiers after focus loss */
  handleReleaseKeys(): void {
    const modifierVKs = [
      0xA0, 0xA1, // LShift, RShift
      0xA2, 0xA3, // LCtrl, RCtrl
      0xA4, 0xA5, // LAlt, RAlt
      0x5B, 0x5C, // LWin, RWin
    ];
    try {
      for (const vk of modifierVKs) {
        const scanCode = this.scanCodeCache.get(vk) ?? 0;
        keybd_event(vk, scanCode & 0xFF, KEYEVENTF_KEYUP, 0);
      }
      console.log('[InputExecutor] Released all modifier keys');
    } catch (err) {
      console.error('[InputExecutor] Error releasing keys:', err);
    }
  }

  handleKeyboard(msg: KeyboardMessage): void {
    const vk = VK_MAP[msg.code];
    if (vk === undefined) {
      console.warn(`[InputExecutor] Unmapped key code: ${msg.code} (key: ${msg.key})`);
      return;
    }

    try {
      // Get hardware scan code from cache (pre-computed in constructor)
      const scanCode = this.scanCodeCache.get(vk) ?? 0;

      // Build flags: extended key flag for nav cluster, arrows, right-side modifiers
      let flags = 0;
      if (EXTENDED_KEY_CODES.has(msg.code)) {
        flags |= KEYEVENTF_EXTENDEDKEY;
      }
      if (msg.action === 'keyup') {
        flags |= KEYEVENTF_KEYUP;
      }

      keybd_event(vk, scanCode & 0xFF, flags, 0);
    } catch (err) {
      console.error('[InputExecutor] Keyboard error:', err);
    }
  }
}
