import { screen } from 'electron';
import { mouse, keyboard, Button, Key, Point } from '@nut-tree/nut-js';
import type { MouseMessage, KeyboardMessage } from '@securedesk/shared';

// Map browser KeyboardEvent.code to nut.js Key enum
const KEY_MAP: Record<string, Key> = {
  // Letters
  KeyA: Key.A, KeyB: Key.B, KeyC: Key.C, KeyD: Key.D, KeyE: Key.E,
  KeyF: Key.F, KeyG: Key.G, KeyH: Key.H, KeyI: Key.I, KeyJ: Key.J,
  KeyK: Key.K, KeyL: Key.L, KeyM: Key.M, KeyN: Key.N, KeyO: Key.O,
  KeyP: Key.P, KeyQ: Key.Q, KeyR: Key.R, KeyS: Key.S, KeyT: Key.T,
  KeyU: Key.U, KeyV: Key.V, KeyW: Key.W, KeyX: Key.X, KeyY: Key.Y,
  KeyZ: Key.Z,
  // Numbers
  Digit0: Key.Num0, Digit1: Key.Num1, Digit2: Key.Num2, Digit3: Key.Num3,
  Digit4: Key.Num4, Digit5: Key.Num5, Digit6: Key.Num6, Digit7: Key.Num7,
  Digit8: Key.Num8, Digit9: Key.Num9,
  // Function keys
  F1: Key.F1, F2: Key.F2, F3: Key.F3, F4: Key.F4, F5: Key.F5, F6: Key.F6,
  F7: Key.F7, F8: Key.F8, F9: Key.F9, F10: Key.F10, F11: Key.F11, F12: Key.F12,
  // Modifiers
  ShiftLeft: Key.LeftShift, ShiftRight: Key.RightShift,
  ControlLeft: Key.LeftControl, ControlRight: Key.RightControl,
  AltLeft: Key.LeftAlt, AltRight: Key.RightAlt,
  MetaLeft: Key.LeftSuper, MetaRight: Key.RightSuper,
  // Navigation
  ArrowUp: Key.Up, ArrowDown: Key.Down, ArrowLeft: Key.Left, ArrowRight: Key.Right,
  Home: Key.Home, End: Key.End, PageUp: Key.PageUp, PageDown: Key.PageDown,
  // Editing
  Backspace: Key.Backspace, Delete: Key.Delete, Enter: Key.Return,
  Tab: Key.Tab, Escape: Key.Escape, Space: Key.Space,
  Insert: Key.Insert,
  // Punctuation
  Minus: Key.Minus, Equal: Key.Equal,
  BracketLeft: Key.LeftBracket, BracketRight: Key.RightBracket,
  Backslash: Key.Backslash, Semicolon: Key.Semicolon,
  Quote: Key.Quote, Backquote: Key.Grave,
  Comma: Key.Comma, Period: Key.Period, Slash: Key.Slash,
  CapsLock: Key.CapsLock, NumLock: Key.NumLock, ScrollLock: Key.ScrollLock,
  PrintScreen: Key.Print, Pause: Key.Pause,
};

export class InputHandler {
  private screenWidth: number;
  private screenHeight: number;

  constructor() {
    const primary = screen.getPrimaryDisplay();
    this.screenWidth = primary.size.width;
    this.screenHeight = primary.size.height;

    // Configure nut.js for responsiveness
    mouse.config.autoDelayMs = 0;
    mouse.config.mouseSpeed = 2000;
    keyboard.config.autoDelayMs = 0;
  }

  /** Update screen dimensions (e.g., on display change) */
  updateScreenSize() {
    const primary = screen.getPrimaryDisplay();
    this.screenWidth = primary.size.width;
    this.screenHeight = primary.size.height;
  }

  /** Handle a mouse input message (normalized 0-1 coordinates) */
  async handleMouse(msg: MouseMessage): Promise<void> {
    const x = Math.round(msg.x * this.screenWidth);
    const y = Math.round(msg.y * this.screenHeight);
    const point = new Point(x, y);

    try {
      switch (msg.action) {
        case 'move':
          await mouse.setPosition(point);
          break;

        case 'click':
          await mouse.setPosition(point);
          await mouse.click(Button.LEFT);
          break;

        case 'dblclick':
          await mouse.setPosition(point);
          await mouse.doubleClick(Button.LEFT);
          break;

        case 'contextmenu':
          await mouse.setPosition(point);
          await mouse.click(Button.RIGHT);
          break;

        case 'mousedown':
          await mouse.setPosition(point);
          await mouse.pressButton(Button.LEFT);
          break;

        case 'mouseup':
          await mouse.setPosition(point);
          await mouse.releaseButton(Button.LEFT);
          break;

        case 'wheel':
          await mouse.setPosition(point);
          if (msg.deltaY !== undefined) {
            const scrollAmount = Math.abs(msg.deltaY) > 0 ? Math.sign(msg.deltaY) * 3 : 0;
            await mouse.scrollDown(scrollAmount);
          }
          break;
      }
    } catch (err) {
      console.error('[InputHandler] Mouse error:', err);
    }
  }

  /** Handle a keyboard input message */
  async handleKeyboard(msg: KeyboardMessage): Promise<void> {
    const nutKey = KEY_MAP[msg.code];
    if (!nutKey) {
      console.warn(`[InputHandler] Unmapped key code: ${msg.code}`);
      return;
    }

    try {
      // Build modifier array for combos (Ctrl+C, Alt+F4, etc.)
      const modifiers: Key[] = [];
      if (msg.ctrlKey) modifiers.push(Key.LeftControl);
      if (msg.altKey) modifiers.push(Key.LeftAlt);
      if (msg.shiftKey) modifiers.push(Key.LeftShift);
      if (msg.metaKey) modifiers.push(Key.LeftSuper);

      if (msg.action === 'keydown') {
        if (modifiers.length > 0) {
          // Press modifier combo
          await keyboard.pressKey(...modifiers, nutKey);
        } else {
          await keyboard.pressKey(nutKey);
        }
      } else if (msg.action === 'keyup') {
        if (modifiers.length > 0) {
          await keyboard.releaseKey(nutKey, ...modifiers);
        } else {
          await keyboard.releaseKey(nutKey);
        }
      }
    } catch (err) {
      console.error('[InputHandler] Keyboard error:', err);
    }
  }
}
