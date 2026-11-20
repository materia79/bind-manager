import { describe, it, expect } from 'vitest';
import {
  serialiseProfileOverrideValue,
  parseProfileOverrideValue,
  profileSourceChip,
  formatProfileSummary,
  profileSignature,
  controllerDisplayName,
} from '../../../src/ui/tools/profile-options.js';
import { createDomWriter } from '../../../src/ui/tools/dom-writer.js';

describe('profile header helpers', () => {
  it('round-trips override values', () => {
    for (const o of [{ type: 'profile', key: '054c-0ce6' }, { type: 'family', family: 'xbox' }]) {
      expect(parseProfileOverrideValue(serialiseProfileOverrideValue(o))).toEqual(o);
    }
    expect(serialiseProfileOverrideValue(null)).toBe('__auto__');
    expect(parseProfileOverrideValue('__auto__')).toBeNull();
  });

  it('names the profile source in a chip', () => {
    expect(['exact', 'family', 'generic', 'manual'].map(profileSourceChip)).toEqual(['Exact', 'Family', 'Generic', 'Manual']);
    expect(formatProfileSummary({ source: 'family', family: 'dualsense' })).toBe('Profile: Family fallback (dualsense)');
  });

  it('changes the signature when the override or family changes', () => {
    const a = { source: 'family', family: 'dualsense', profileKey: null, override: null };
    expect(profileSignature(a)).toBe(profileSignature({ ...a }));
    expect(profileSignature(a)).not.toBe(profileSignature({ ...a, override: { type: 'family', family: 'xbox' } }));
    expect(profileSignature(a)).not.toBe(profileSignature({ ...a, family: 'xbox' }));
  });

  it('shortens Gamepad.id strings', () => {
    expect(controllerDisplayName('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('DualSense Wireless Controller');
    expect(controllerDisplayName('054c-0ce6-DualSense Wireless Controller')).toBe('DualSense Wireless Controller');
    expect(controllerDisplayName('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('Xbox 360 Controller');
    expect(controllerDisplayName('')).toBe('Unknown controller');
  });
});

describe('createDomWriter', () => {
  it('writes text, attributes and classes only on change', () => {
    const w = createDomWriter();
    const el = document.createElement('div');
    let writes = 0;
    const desc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
    Object.defineProperty(el, 'textContent', { get() { return desc.get.call(this); }, set(v) { writes++; desc.set.call(this, v); } });
    w.text(el, 'a');
    w.text(el, 'a');
    w.text(el, 'b');
    expect(writes).toBe(2);
    expect(el.textContent).toBe('b');

    w.attr(el, 'title', 'x');
    w.attr(el, 'title', 'x');
    expect(el.getAttribute('title')).toBe('x');
    w.attr(el, 'title', null);
    expect(el.hasAttribute('title')).toBe(false);

    w.cls(el, 'on', true);
    w.cls(el, 'on', true);
    expect(el.classList.contains('on')).toBe(true);
    w.cls(el, 'on', false);
    expect(el.classList.contains('on')).toBe(false);
  });
});
