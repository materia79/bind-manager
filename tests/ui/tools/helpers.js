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

/**
 * Count every DOM write on nodes under `root` (setAttribute/removeAttribute,
 * classList.toggle/add/remove, textContent/innerHTML/nodeValue setters) plus
 * every JSON.stringify and querySelectorAll call anywhere, by patching the
 * prototypes. Call restore() when done.
 */
export function countDomWork(root) {
  const counts = { setAttribute: 0, removeAttribute: 0, classList: 0, textContent: 0, innerHTML: 0, nodeValue: 0, stringify: 0, querySelectorAll: 0 };
  const log = [];
  const under = (node) => {
    const el = node?.nodeType === 1 ? node : node?.parentNode;
    return !!el && (el === root || root.contains(el));
  };
  const restores = [];
  const patchMethod = (proto, name, key, test = (self) => under(self)) => {
    const orig = proto[name];
    proto[name] = function patched(...args) {
      if (test(this, args)) {
        counts[key]++;
        log.push(`${key}:${name}:${this.className?.baseVal ?? this.className ?? this.nodeName}:${String(args[0]).slice(0, 40)}`);
      }
      return orig.apply(this, args);
    };
    restores.push(() => { proto[name] = orig; });
  };
  const patchSetter = (proto, prop, key) => {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    Object.defineProperty(proto, prop, {
      ...desc,
      set(v) {
        if (under(this)) {
          counts[key]++;
          log.push(`${key}:${this.className?.baseVal ?? this.className ?? this.nodeName}:${String(v).slice(0, 40)}`);
        }
        desc.set.call(this, v);
      },
    });
    restores.push(() => Object.defineProperty(proto, prop, desc));
  };
  patchMethod(Element.prototype, 'setAttribute', 'setAttribute');
  patchMethod(Element.prototype, 'removeAttribute', 'removeAttribute');
  for (const m of ['toggle', 'add', 'remove', 'replace']) {
    const orig = DOMTokenList.prototype[m];
    DOMTokenList.prototype[m] = function patched(...args) {
      counts.classList++;
      log.push(`classList.${m}:${String(args[0])}`);
      return orig.apply(this, args);
    };
    restores.push(() => { DOMTokenList.prototype[m] = orig; });
  }
  patchSetter(Node.prototype, 'textContent', 'textContent');
  patchSetter(Node.prototype, 'nodeValue', 'nodeValue');
  patchSetter(Element.prototype, 'innerHTML', 'innerHTML');
  patchMethod(Element.prototype, 'querySelectorAll', 'querySelectorAll', () => true);
  patchMethod(Document.prototype, 'querySelectorAll', 'querySelectorAll', () => true);
  patchMethod(DocumentFragment.prototype, 'querySelectorAll', 'querySelectorAll', () => true);
  const stringify = JSON.stringify;
  JSON.stringify = function patched(...args) {
    counts.stringify++;
    log.push('JSON.stringify');
    return stringify.apply(this, args);
  };
  restores.push(() => { JSON.stringify = stringify; });
  return {
    counts,
    log,
    total: () => Object.values(counts).reduce((a, b) => a + b, 0),
    restore: () => { for (const r of restores.reverse()) r(); },
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
