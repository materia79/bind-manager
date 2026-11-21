/**
 * The rebind dialog's note for a reserved key (PR #2, adapted to the browser
 * guard): shown for a captured reserved key, off with reservedKeyWarnings:false,
 * shown together with a conflict (conflict first), and always with the full text
 * in the title (the element clamps at three lines).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';

let n = 0;
let manager = null;

function create(options = {}) {
  manager = createBindManager({ namespace: `reserved-warning-${n}`, ...options });
  manager.registerAction({ id: 'close-bag', label: 'Close bag', slots: 1, defaultBindings: ['KeyB'] });
  manager.registerAction({ id: 'quit-menu', label: 'Quit menu', slots: 1, defaultBindings: ['ControlLeft+KeyW'] });
  manager.registerAction({ id: 'fire', label: 'Fire', slots: 1, defaultBindings: ['KeyF'] });
  manager.open();
  return manager;
}

/** A combo as a real capture sees it: modifier down, key down and up, modifier up. */
function pressCombo(modifiers, code) {
  const fire = (type, c) => window.dispatchEvent(new KeyboardEvent(type, {
    code: c, key: c, bubbles: true, cancelable: true,
    ctrlKey: modifiers.includes('ControlLeft'), shiftKey: modifiers.includes('ShiftLeft'),
  }));
  for (const m of modifiers) fire('keydown', m);
  fire('keydown', code);
  fire('keyup', code);
  for (const m of [...modifiers].reverse()) fire('keyup', m);
}

const warning = () => document.querySelector('.bm-conflict-warning');
const capture = (actionId) => document.querySelector(`.bm-bind-btn[data-action-id="${actionId}"][data-slot="0"][data-device="keyboard"]`).click();

describe('reserved-key note in the rebind dialog', () => {
  beforeEach(() => { n += 1; document.body.innerHTML = ''; });
  afterEach(() => { manager?.destroy(); manager = null; });

  it('shows a note for a reserved key, with the full text in the title', () => {
    create();
    capture('close-bag');
    pressCombo(['ControlLeft'], 'KeyT');
    expect(manager.getBinding('close-bag')[0]).toBe('ControlLeft+KeyT');
    expect(warning().classList.contains('bm-hidden')).toBe(false);
    expect(warning().textContent).toMatch(/only works while the game is fullscreen\. The browser uses it to open a new tab\.$/);
    expect(warning().getAttribute('title')).toBe(warning().textContent);
  });

  it('uses the level of the key: blocked and unreliable read differently', () => {
    create();
    capture('close-bag');
    pressCombo(['ControlLeft', 'ShiftLeft'], 'KeyQ');
    expect(warning().textContent).toMatch(/will not work in the browser\./);
    capture('fire');
    pressCombo([], 'F11');
    expect(warning().textContent).toMatch(/may not work in every browser\./);
    expect(warning().getAttribute('title')).toBe(warning().textContent);
  });

  it('shows nothing for a reserved key with reservedKeyWarnings: false', () => {
    create({ reservedKeyWarnings: false });
    capture('close-bag');
    pressCombo(['ControlLeft'], 'KeyT');
    expect(manager.getBinding('close-bag')[0]).toBe('ControlLeft+KeyT');
    expect(warning().classList.contains('bm-hidden')).toBe(true);
  });

  it('shows the conflict and the reserved note together, conflict first', () => {
    create();
    capture('close-bag');
    pressCombo(['ControlLeft'], 'KeyW');
    const text = warning().textContent;
    expect(text).toMatch(/is also bound to "Quit menu" — both will be active\./);
    expect(text).toMatch(/only works while the game is fullscreen\. The browser uses it to close the tab\.$/);
    expect(text.indexOf('also bound')).toBeLessThan(text.indexOf('only works'));
    expect(warning().getAttribute('title')).toBe(text);
  });

  it('a plain conflict still reads as before', () => {
    create();
    capture('close-bag');
    pressCombo([], 'KeyF');
    expect(warning().textContent).toMatch(/is also bound to "Fire" — both will be active\.$/);
    expect(warning().getAttribute('title')).toBe(warning().textContent);
  });

  it("follows the manager's guard while it is enabled", () => {
    create({ browserGuard: { enabled: true, allow: ['Mod+KeyT'] } });
    capture('close-bag');
    pressCombo(['ControlLeft'], 'KeyT');
    expect(warning().textContent).toMatch(/may not work in every browser\. The browser uses it to open a new tab, and the browser guard is set to let it through\.$/);
  });
});
