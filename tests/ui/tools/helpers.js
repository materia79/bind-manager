import { vi } from 'vitest';
import { labelFor } from './fixtures/family-labels.js';

/** Minimal manager surface used by the built-in tools. */
export function createFakeManager({ family = 'dualsense', source = 'family', mapping = null } = {}) {
  const resolved = { source, family, profileKey: null, override: null, definition: mapping ? { mapping, sourceName: family } : null };
  const labels = labelFor(family);
  return {
    resolved,
    getResolvedGamepadProfile: vi.fn(() => resolved),
    getGamepadLabel: vi.fn((code) => labels(code)),
    getAvailableGamepadProfileOptions: vi.fn(() => ({ exactProfiles: [], families: [{ type: 'family', family: 'xbox', label: 'Xbox' }] })),
    setGamepadProfileOverride: vi.fn(() => true),
    clearGamepadProfileOverride: vi.fn(() => true),
    setGamepadProfileMappingEntry: vi.fn(() => true),
    removeGamepadProfileMappingEntry: vi.fn(() => true),
    getGamepadProfileDefinition: vi.fn(() => null),
  };
}

/** A controllable standard gamepad for navigator.getGamepads(). */
export function createFakePad({ buttons = 18, axes = 4 } = {}) {
  const pad = {
    id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    buttons: Array.from({ length: buttons }, () => ({ pressed: false, touched: false, value: 0 })),
    axes: new Array(axes).fill(0),
  };
  return {
    pad,
    setButton(i, value) {
      pad.buttons[i] = { pressed: value > 0, touched: value > 0, value };
    },
    setAxis(i, value) {
      pad.axes[i] = value;
    },
  };
}

/** Replace requestAnimationFrame with a manual queue; step() runs one frame. */
export function installManualRaf() {
  let queue = new Map();
  let nextId = 1;
  const raf = vi.fn((cb) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  });
  const caf = vi.fn((id) => {
    queue.delete(id);
  });
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', caf);
  return {
    raf,
    caf,
    pending: () => queue.size,
    step(n = 1) {
      for (let i = 0; i < n; i++) {
        const current = queue;
        queue = new Map();
        for (const cb of current.values()) cb(performance.now());
      }
    },
  };
}

/** Count writes to textContent on one node. */
export function spyText(node) {
  const desc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
  const spy = vi.fn();
  Object.defineProperty(node, 'textContent', {
    configurable: true,
    get() { return desc.get.call(this); },
    set(v) { spy(v); desc.set.call(this, v); },
  });
  return spy;
}
