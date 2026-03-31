/**
 * Maps KeyboardEvent.code values to human-readable display labels.
 * Uses KeyboardEvent.code (physical key position, layout-independent)
 * rather than KeyboardEvent.key (character output) for reliable rebinding.
 */
export const KEY_DISPLAY_NAMES = {
  // Letters
  KeyA: 'A', KeyB: 'B', KeyC: 'C', KeyD: 'D', KeyE: 'E',
  KeyF: 'F', KeyG: 'G', KeyH: 'H', KeyI: 'I', KeyJ: 'J',
  KeyK: 'K', KeyL: 'L', KeyM: 'M', KeyN: 'N', KeyO: 'O',
  KeyP: 'P', KeyQ: 'Q', KeyR: 'R', KeyS: 'S', KeyT: 'T',
  KeyU: 'U', KeyV: 'V', KeyW: 'W', KeyX: 'X', KeyY: 'Y',
  KeyZ: 'Z',

  // Digits (top row)
  Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',

  // Function keys
  F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
  F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',

  // Arrow keys
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',

  // Navigation cluster
  Home: 'Home', End: 'End',
  PageUp: 'Page Up', PageDown: 'Page Down',
  Insert: 'Insert', Delete: 'Delete',

  // Editing / whitespace
  Space: 'Space',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Tab: 'Tab',
  Escape: 'Escape',
  CapsLock: 'Caps Lock',

  // Modifiers
  ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift',
  ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl',
  AltLeft: 'Left Alt', AltRight: 'Right Alt',
  MetaLeft: 'Left Meta', MetaRight: 'Right Meta',

  // Numpad
  Numpad0: 'Num 0', Numpad1: 'Num 1', Numpad2: 'Num 2', Numpad3: 'Num 3',
  Numpad4: 'Num 4', Numpad5: 'Num 5', Numpad6: 'Num 6', Numpad7: 'Num 7',
  Numpad8: 'Num 8', Numpad9: 'Num 9',
  NumpadAdd: 'Num +', NumpadSubtract: 'Num -',
  NumpadMultiply: 'Num *', NumpadDivide: 'Num /',
  NumpadDecimal: 'Num .', NumpadEnter: 'Num Enter',
  NumLock: 'Num Lock',

  // Punctuation / symbols
  Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';', Quote: "'",
  Backquote: '`',
  Comma: ',', Period: '.', Slash: '/',

  // System / misc
  PrintScreen: 'Print Screen',
  ScrollLock: 'Scroll Lock',
  Pause: 'Pause',
  ContextMenu: 'Menu',
};

/**
 * Returns a human-readable label for a KeyboardEvent.code value.
 * Falls back to the raw code string if no label is defined.
 * @param {string | null} code
 * @returns {string}
 */
export function getKeyLabel(code) {
  if (!code) return '—';
  return KEY_DISPLAY_NAMES[code] ?? code;
}

/**
 * Returns true if the given string is a known KeyboardEvent.code value.
 * @param {string} code
 * @returns {boolean}
 */
export function isKnownCode(code) {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(KEY_DISPLAY_NAMES, code);
}
