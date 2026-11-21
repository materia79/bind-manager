/**
 * Modifier-only chords (0.2.3): "ControlLeft+ShiftLeft" and the like.
 *
 * The rules under test:
 * - fire: on the keydown that makes the held modifiers exactly the chord, in any
 *   order; keys other than modifiers that are held do not count
 * - the chord wins over that modifier's own binding for that keydown (like a combo
 *   over its bare key); a modifier pressed earlier keeps its own binding
 * - held: the auto-repeat of the key that completed the chord, while it is active
 * - released: when the first of its keys goes up (once), on blur and suppression
 * - a bound combo with a key (Ctrl+Shift+A) fires as before, the chord stays held
 * - capture: the first modifier released with no other key pressed records the
 *   chord of every modifier held then, in canonical order
 */
import { describe, it, expect, afterEach } from 'vitest';
import { KeyboardRuntime } from '../../src/input/keyboard-runtime.js';
import { ActionRegistry } from '../../src/core/action-registry.js';
import { BindingStore } from '../../src/core/binding-store.js';
import { buildChordCode, isModifierChord, normalizeChordCode, getKeyLabel, isKnownCode } from '../../src/input/key-names.js';
import * as pkg from '../../src/index.js';

let runtime = null;

function setup(actions) {
  const registry = new ActionRegistry();
  const store = new BindingStore(registry);
  for (const def of actions) store.initAction(registry.register({ slots: 2, ...def }));
  runtime = new KeyboardRuntime(store);
  runtime.start();
  const events = [];
  runtime.onAnyAction((e) => events.push(`${e.actionId}:${e.type}:${e.code}`));
  return { runtime, store, registry, events };
}

const down = (code, repeat = false) => window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat }));
const up = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code }));

describe('key-name helpers for chords', () => {
  it('buildChordCode puts distinct modifiers in MODIFIER_ORDER', () => {
    expect(buildChordCode(['ShiftLeft', 'ControlLeft'])).toBe('ControlLeft+ShiftLeft');
    expect(buildChordCode(['MetaRight', 'AltLeft', 'ShiftRight', 'ControlRight'])).toBe('ControlRight+ShiftRight+AltLeft+MetaRight');
    expect(buildChordCode(['ShiftLeft', 'ShiftLeft'])).toBe('ShiftLeft');
    expect(buildChordCode(['ShiftLeft', 'KeyA'])).toBe('ShiftLeft');
    expect(buildChordCode([])).toBe('');
  });

  it('isModifierChord: two or more distinct modifiers, nothing else', () => {
    expect(isModifierChord('ControlLeft+ShiftLeft')).toBe(true);
    expect(isModifierChord('ShiftLeft+ControlLeft')).toBe(true);
    expect(isModifierChord('ControlLeft+ShiftRight+AltLeft')).toBe(true);
    expect(isModifierChord('ControlLeft')).toBe(false);
    expect(isModifierChord('ControlLeft+KeyA')).toBe(false);
    expect(isModifierChord('ControlLeft+ControlLeft')).toBe(false);
    expect(isModifierChord('ControlLeft+')).toBe(false);
    expect(isModifierChord(null)).toBe(false);
  });

  it('normalizeChordCode reorders chords only', () => {
    expect(normalizeChordCode('ShiftLeft+ControlLeft')).toBe('ControlLeft+ShiftLeft');
    expect(normalizeChordCode('ShiftLeft+ControlLeft+KeyA')).toBe('ShiftLeft+ControlLeft+KeyA');
    expect(normalizeChordCode('KeyA')).toBe('KeyA');
    expect(normalizeChordCode(null)).toBe(null);
  });

  it('a chord is a known code with a readable label, and the helpers are exported', () => {
    expect(isKnownCode('ControlLeft+ShiftLeft')).toBe(true);
    expect(getKeyLabel('ControlLeft+ShiftLeft')).toBe('Left Ctrl + Left Shift');
    expect(pkg.buildChordCode).toBe(buildChordCode);
    expect(pkg.isModifierChord).toBe(isModifierChord);
  });
});

describe('KeyboardRuntime: modifier-only chords at runtime', () => {
  afterEach(() => { runtime?.stop(); runtime = null; });

  it('fires on the keydown that completes it, held on repeat, released when a key goes up', () => {
    const { events } = setup([{ id: 'names', defaultBindings: ['ControlLeft+ShiftLeft'] }]);
    down('ControlLeft');
    expect(events).toEqual([]);
    down('ShiftLeft');
    down('ShiftLeft', true);
    down('ShiftLeft', true);
    up('ShiftLeft');
    up('ControlLeft');
    expect(events).toEqual([
      'names:pressed:ControlLeft+ShiftLeft',
      'names:held:ControlLeft+ShiftLeft',
      'names:held:ControlLeft+ShiftLeft',
      'names:released:ControlLeft+ShiftLeft',
    ]);
  });

  it('order does not matter: Shift then Ctrl is the same chord', () => {
    const { events } = setup([{ id: 'names', defaultBindings: ['ControlLeft+ShiftLeft'] }]);
    down('ShiftLeft');
    down('ControlLeft');
    down('ControlLeft', true);
    up('ControlLeft');
    up('ShiftLeft');
    expect(events).toEqual([
      'names:pressed:ControlLeft+ShiftLeft',
      'names:held:ControlLeft+ShiftLeft',
      'names:released:ControlLeft+ShiftLeft',
    ]);
  });

  it('releasing the key pressed first ends the chord at once; the other key stays silent', () => {
    const { runtime, events } = setup([{ id: 'names', defaultBindings: ['ControlLeft+ShiftLeft'] }]);
    down('ControlLeft');
    down('ShiftLeft');
    expect(runtime.isPressed('ControlLeft+ShiftLeft')).toBe(true);
    up('ControlLeft');
    expect(runtime.isPressed('ControlLeft+ShiftLeft')).toBe(false);
    down('ShiftLeft', true);
    up('ShiftLeft');
    expect(events).toEqual(['names:pressed:ControlLeft+ShiftLeft', 'names:released:ControlLeft+ShiftLeft']);
  });

  it('pressing the released key again completes the chord again', () => {
    const { events } = setup([{ id: 'names', defaultBindings: ['ControlLeft+ShiftLeft'] }]);
    down('ControlLeft');
    down('ShiftLeft');
    up('ShiftLeft');
    down('ShiftLeft');
    up('ControlLeft');
    up('ShiftLeft');
    expect(events).toEqual([
      'names:pressed:ControlLeft+ShiftLeft', 'names:released:ControlLeft+ShiftLeft',
      'names:pressed:ControlLeft+ShiftLeft', 'names:released:ControlLeft+ShiftLeft',
    ]);
  });

  it('Ctrl alone and Ctrl+Shift bound: Ctrl fires, then the chord (instead of Shift alone)', () => {
    const { events } = setup([
      { id: 'crouch', defaultBindings: ['ControlLeft'] },
      { id: 'sprint', defaultBindings: ['ShiftLeft'] },
      { id: 'names', defaultBindings: ['ControlLeft+ShiftLeft'] },
    ]);
    down('ControlLeft');
    down('ShiftLeft');
    up('ShiftLeft');
    up('ControlLeft');
    expect(events).toEqual([
      'crouch:pressed:ControlLeft',
      'names:pressed:ControlLeft+ShiftLeft',
      'names:released:ControlLeft+ShiftLeft',
      'crouch:released:ControlLeft',
    ]);
  });

  it('the other order: Shift fires alone, then the chord (instead of Ctrl alone)', () => {
    const { events } = setup([
      { id: 'crouch', defaultBindings: ['ControlLeft'] },
      { id: 'sprint', defaultBindings: ['ShiftLeft'] },
      { id: 'names', defaultBindings: ['ControlLeft+ShiftLeft'] },
    ]);
    down('ShiftLeft');
    down('ControlLeft');
    up('ShiftLeft');
    up('ControlLeft');
    // Shift up ends the chord (completed by Ctrl) and Shift's own binding
    expect(events).toEqual([
      'sprint:pressed:ShiftLeft',
      'names:pressed:ControlLeft+ShiftLeft',
      'names:released:ControlLeft+ShiftLeft',
      'sprint:released:ShiftLeft',
    ]);
  });

  it('Ctrl+Shift and Ctrl+Shift+A bound: both fire, the chord stays held through A', () => {
    const { events } = setup([
      { id: 'names', defaultBindings: ['ControlLeft+ShiftLeft'] },
      { id: 'all', defaultBindings: ['ControlLeft+ShiftLeft+KeyA'] },
    ]);
    down('ControlLeft');
    down('ShiftLeft');
    down('KeyA');
    down('KeyA', true);
    up('KeyA');
    up('ShiftLeft');
    up('ControlLeft');
    expect(events).toEqual([
      'names:pressed:ControlLeft+ShiftLeft',
      'all:pressed:ControlLeft+ShiftLeft+KeyA',
      'all:held:ControlLeft+ShiftLeft+KeyA',
      'all:released:ControlLeft+ShiftLeft+KeyA',
      'names:released:ControlLeft+ShiftLeft',
    ]);
  });

  it('only Ctrl+Shift bound: Ctrl+Shift+A fires the chord (before A) and A alone as before', () => {
    const { events } = setup([
      { id: 'names', defaultBindings: ['ControlLeft+ShiftLeft'] },
      { id: 'left', defaultBindings: ['KeyA'] },
    ]);
    down('ControlLeft');
    down('ShiftLeft');
    down('KeyA');
    up('KeyA');
    up('ControlLeft');
    up('ShiftLeft');
    expect(events).toEqual([
      'names:pressed:ControlLeft+ShiftLeft',
      'left:pressed:KeyA',
      'left:released:KeyA',
      'names:released:ControlLeft+ShiftLeft',
    ]);
  });

  it('keys other than modifiers held before do not count', () => {
    const { events } = setup([
      { id: 'names', defaultBindings: ['ControlLeft+ShiftLeft'] },
      { id: 'forward', defaultBindings: ['KeyW'] },
    ]);
    down('KeyW');
    down('ControlLeft');
    down('ShiftLeft');
    up('ShiftLeft');
    up('ControlLeft');
    up('KeyW');
    expect(events).toEqual([
      'forward:pressed:KeyW',
      'names:pressed:ControlLeft+ShiftLeft',
      'names:released:ControlLeft+ShiftLeft',
      'forward:released:KeyW',
    ]);
  });

  it('the modifiers must be exactly the chord: an extra modifier held first, or the other side, does not fire it', () => {
    const { events } = setup([
      { id: 'names', defaultBindings: ['ControlLeft+ShiftLeft'] },
      { id: 'sprint', defaultBindings: ['ShiftLeft'] },
    ]);
    down('AltLeft');
    down('ControlLeft');
    down('ShiftLeft');
    up('ShiftLeft');
    up('ControlLeft');
    up('AltLeft');
    down('ControlRight');
    down('ShiftLeft');
    up('ShiftLeft');
    up('ControlRight');
    expect(events).toEqual([
      'sprint:pressed:ShiftLeft', 'sprint:released:ShiftLeft',
      'sprint:pressed:ShiftLeft', 'sprint:released:ShiftLeft',
    ]);
  });

  it('a modifier added to an active chord leaves it active (like a modifier held under a combo)', () => {
    const { events } = setup([{ id: 'names', defaultBindings: ['ControlLeft+ShiftLeft'] }]);
    down('ControlLeft');
    down('ShiftLeft');
    down('AltLeft');
    up('AltLeft');
    up('ShiftLeft');
    up('ControlLeft');
    expect(events).toEqual(['names:pressed:ControlLeft+ShiftLeft', 'names:released:ControlLeft+ShiftLeft']);
  });

  it('three-modifier chords, and a bigger chord on top of a smaller one', () => {
    const { events } = setup([
      { id: 'two', defaultBindings: ['ControlLeft+ShiftLeft'] },
      { id: 'three', defaultBindings: ['ControlLeft+ShiftLeft+AltLeft'] },
    ]);
    down('AltLeft');
    down('ShiftLeft');
    down('ControlLeft');
    up('ControlLeft');
    expect(events).toEqual(['three:pressed:ControlLeft+ShiftLeft+AltLeft', 'three:released:ControlLeft+ShiftLeft+AltLeft']);
    events.length = 0;
    up('AltLeft');
    up('ShiftLeft');
    down('ControlLeft');
    down('ShiftLeft');
    down('AltLeft');
    up('ShiftLeft');
    up('AltLeft');
    up('ControlLeft');
    // Shift up ends both (both contain it): chords completed by other keys first,
    // then the binding of the key that went up
    expect(events).toEqual([
      'two:pressed:ControlLeft+ShiftLeft',
      'three:pressed:ControlLeft+ShiftLeft+AltLeft',
      'three:released:ControlLeft+ShiftLeft+AltLeft',
      'two:released:ControlLeft+ShiftLeft',
    ]);
  });

  it('a chord bound to two actions fires both; one action may hold several chords', () => {
    const { events } = setup([
      { id: 'names', slots: 2, defaultBindings: ['ControlLeft+ShiftLeft', 'ControlRight+ShiftRight'] },
      { id: 'other', slots: 1, defaultBindings: ['ControlLeft+ShiftLeft'] },
    ]);
    down('ControlRight');
    down('ShiftRight');
    up('ShiftRight');
    up('ControlRight');
    down('ShiftLeft');
    down('ControlLeft');
    up('ControlLeft');
    up('ShiftLeft');
    expect(events).toEqual([
      'names:pressed:ControlRight+ShiftRight', 'names:released:ControlRight+ShiftRight',
      'names:pressed:ControlLeft+ShiftLeft', 'other:pressed:ControlLeft+ShiftLeft',
      'names:released:ControlLeft+ShiftLeft', 'other:released:ControlLeft+ShiftLeft',
    ]);
  });

  it('suppression and window blur release an active chord once; nothing after', () => {
    const { runtime, events } = setup([{ id: 'names', defaultBindings: ['ControlLeft+ShiftLeft'] }]);
    down('ControlLeft');
    down('ShiftLeft');
    runtime.setGameplaySuppressed(true);
    runtime.setGameplaySuppressed(false);
    down('ShiftLeft', true);
    up('ControlLeft');
    up('ShiftLeft');
    down('ShiftLeft');
    down('ControlLeft');
    window.dispatchEvent(new Event('blur'));
    down('ControlLeft', true);
    up('ShiftLeft');
    up('ControlLeft');
    expect(events).toEqual([
      'names:pressed:ControlLeft+ShiftLeft', 'names:released:ControlLeft+ShiftLeft',
      'names:pressed:ControlLeft+ShiftLeft', 'names:released:ControlLeft+ShiftLeft',
    ]);
  });

  it('chords pressed while suppressed stay silent after resuming until pressed anew', () => {
    const { runtime, events } = setup([{ id: 'names', defaultBindings: ['ControlLeft+ShiftLeft'] }]);
    runtime.setGameplaySuppressed(true);
    down('ControlLeft');
    down('ShiftLeft');
    runtime.setGameplaySuppressed(false);
    down('ShiftLeft', true);
    up('ShiftLeft');
    up('ControlLeft');
    expect(events).toEqual([]);
  });

  it('stop() releases an active chord', () => {
    const { runtime, events } = setup([{ id: 'names', defaultBindings: ['ControlLeft+ShiftLeft'] }]);
    down('ControlLeft');
    down('ShiftLeft');
    runtime.stop();
    expect(events).toEqual(['names:pressed:ControlLeft+ShiftLeft', 'names:released:ControlLeft+ShiftLeft']);
  });

  it('a listener that stops the runtime on release does not get a second release', () => {
    const { runtime, events } = setup([
      { id: 'names', defaultBindings: ['ControlLeft+ShiftLeft'] },
      { id: 'big', defaultBindings: ['ControlLeft+ShiftLeft+AltLeft'] },
    ]);
    runtime.onAction('names', (e) => { if (e.type === 'released') runtime.stop(); });
    down('ControlLeft');
    down('ShiftLeft');
    down('AltLeft');
    up('ControlLeft');
    const released = events.filter((e) => e.includes(':released:'));
    expect(released.filter((e) => e.startsWith('names:'))).toHaveLength(1);
    expect(released.filter((e) => e.startsWith('big:'))).toHaveLength(1);
  });

  it('a chord in another order (setBinding or a default) is stored in canonical order and fires', () => {
    const { store, events } = setup([
      { id: 'names', slots: 1, defaultBindings: ['ShiftLeft+ControlLeft'] },
      { id: 'other', slots: 1 },
    ]);
    expect(store.get('names')).toEqual(['ControlLeft+ShiftLeft']);
    const { conflicts } = store.set('other', 0, 'ShiftLeft+ControlLeft');
    expect(store.get('other')).toEqual(['ControlLeft+ShiftLeft']);
    expect(conflicts).toEqual([{ actionId: 'names', slot: 0 }]);
    down('ShiftLeft');
    down('ControlLeft');
    up('ShiftLeft');
    up('ControlLeft');
    expect(events).toEqual([
      'names:pressed:ControlLeft+ShiftLeft', 'other:pressed:ControlLeft+ShiftLeft',
      'names:released:ControlLeft+ShiftLeft', 'other:released:ControlLeft+ShiftLeft',
    ]);
  });

  it('combos with a key written in another order are left as they are (as in 0.2.2)', () => {
    const { store } = setup([{ id: 'x', slots: 1, defaultBindings: ['ShiftLeft+ControlLeft+KeyA'] }]);
    expect(store.get('x')).toEqual(['ShiftLeft+ControlLeft+KeyA']);
  });
});

describe('KeyboardRuntime: recording a chord', () => {
  afterEach(() => { runtime?.stop(); runtime = null; });

  function capture(rt) {
    const got = [];
    rt.startCapture((code) => got.push(code));
    return got;
  }

  it('Ctrl, Shift, release Shift: records ControlLeft+ShiftLeft at that release', () => {
    const { runtime } = setup([]);
    const got = capture(runtime);
    down('ControlLeft');
    down('ShiftLeft');
    expect(got).toEqual([]);
    up('ShiftLeft');
    expect(got).toEqual(['ControlLeft+ShiftLeft']);
    up('ControlLeft');
    expect(got).toEqual(['ControlLeft+ShiftLeft']);
  });

  it('the press order and which key goes up first do not matter', () => {
    const { runtime } = setup([]);
    let got = capture(runtime);
    down('ShiftLeft');
    down('ControlLeft');
    up('ShiftLeft');
    up('ControlLeft');
    expect(got).toEqual(['ControlLeft+ShiftLeft']);
    got = capture(runtime);
    down('ShiftRight');
    down('AltLeft');
    down('ControlRight');
    up('AltLeft');
    up('ShiftRight');
    up('ControlRight');
    expect(got).toEqual(['ControlRight+ShiftRight+AltLeft']);
  });

  it('a single modifier still records alone (unchanged)', () => {
    const { runtime } = setup([]);
    const got = capture(runtime);
    down('ShiftLeft');
    down('ShiftLeft', true);
    up('ShiftLeft');
    expect(got).toEqual(['ShiftLeft']);
  });

  it('a modifier pressed and released before the next one: the first one alone (unchanged)', () => {
    const { runtime } = setup([]);
    const got = capture(runtime);
    down('ControlLeft');
    up('ControlLeft');
    down('ShiftLeft');
    up('ShiftLeft');
    expect(got).toEqual(['ControlLeft']);
  });

  it('combos still wait for their key: Ctrl+A, and Ctrl+Shift+A with Ctrl let go first (unchanged)', () => {
    const { runtime } = setup([]);
    let got = capture(runtime);
    down('ControlLeft');
    down('KeyA');
    up('ControlLeft');
    expect(got).toEqual([]);
    up('KeyA');
    expect(got).toEqual(['ControlLeft+KeyA']);
    got = capture(runtime);
    down('ControlLeft');
    down('ShiftLeft');
    down('KeyA');
    up('ShiftLeft');
    up('ControlLeft');
    expect(got).toEqual([]);
    up('KeyA');
    expect(got).toEqual(['ControlLeft+ShiftLeft+KeyA']);
  });

  it('Escape still cancels, with modifiers held', () => {
    const { runtime } = setup([]);
    const got = capture(runtime);
    down('ControlLeft');
    down('ShiftLeft');
    down('Escape');
    expect(got).toEqual([null]);
    up('ShiftLeft');
    up('ControlLeft');
    expect(got).toEqual([null]);
  });

  it('a recorded chord fires at once when bound, and the keys still held after the capture send nothing', () => {
    const { runtime, store, events } = setup([{ id: 'names', slots: 1 }]);
    runtime.startCapture((code) => store.set('names', 0, code));
    down('ControlLeft');
    down('ShiftLeft');
    up('ShiftLeft');
    down('ControlLeft', true);
    up('ControlLeft');
    expect(store.get('names')).toEqual(['ControlLeft+ShiftLeft']);
    expect(events).toEqual([]);
    down('ShiftLeft');
    down('ControlLeft');
    up('ControlLeft');
    expect(events).toEqual(['names:pressed:ControlLeft+ShiftLeft', 'names:released:ControlLeft+ShiftLeft']);
  });
});
