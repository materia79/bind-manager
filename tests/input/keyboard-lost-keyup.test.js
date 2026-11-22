/**
 * A keyup the page never saw (0.2.4). Browsers lose keyups: a key let go in
 * another frame or while a native dialog or menu had the keys, a host that
 * stops the event, Cmd on macOS (the keyups of other keys are not delivered
 * while it is held). The window keeps its focus, so no blur cleans up.
 *
 * Both repairs act only on a trusted event (from the browser itself) and only
 * on keys held by trusted keydowns:
 * - A trusted second keydown (not a repeat) of a key a trusted keydown holds:
 *   its keyup was lost. The old press is released first, so every pressed gets
 *   its released.
 * - A trusted key event whose modifier flags (ctrlKey, shiftKey, altKey,
 *   metaKey) say a modifier is up that a trusted keydown holds: that modifier is
 *   released first, as if its keyup had arrived (its own entry and every chord
 *   with it). A flag covers both sides, so it releases both and cannot release
 *   one side while the other is down. With AltGr held
 *   (getModifierState('AltGraph')) the Ctrl and Alt flags are not read. The
 *   event's own key is never released by its flags.
 * - A key a synthetic keydown pressed (or pressed again while it was down) is
 *   never released by a repair, and a synthetic event never repairs: synthetic
 *   events (a host's on-screen keys, its tests) behave exactly as in 0.2.3.
 *
 * jsdom events are never trusted (isTrusted cannot be set), so these tests
 * let the runtime treat events as trusted unless marked synthetic; the
 * Chromium tests in tests/e2e/lost-keyup.spec.js use real, trusted events.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { KeyboardRuntime } from '../../src/input/keyboard-runtime.js';
import { ActionRegistry } from '../../src/core/action-registry.js';
import { BindingStore } from '../../src/core/binding-store.js';

const FLAG = { ControlLeft: 'ctrlKey', ControlRight: 'ctrlKey', ShiftLeft: 'shiftKey', ShiftRight: 'shiftKey', AltLeft: 'altKey', AltRight: 'altKey', MetaLeft: 'metaKey', MetaRight: 'metaKey' };

let runtime = null;
let held = new Set();
let log = [];
/** Events a test marks as synthetic (sent by a script, not the browser). */
const SYNTHETIC = new WeakSet();

/**
 * A runtime with these bindings ({ actionId: code }). `trusted`: events count
 * as the browser's own (flags read) unless marked synthetic; false: every
 * event is synthetic, as jsdom's really are.
 */
function setup(bindings, { trusted = true } = {}) {
  const registry = new ActionRegistry();
  const store = new BindingStore(registry);
  for (const [id, code] of Object.entries(bindings)) store.initAction(registry.register({ id, slots: 1, defaultBindings: [code] }));
  runtime = new KeyboardRuntime(store);
  if (trusted) runtime._hasTrustedFlags = (event) => !SYNTHETIC.has(event);
  runtime.onAnyAction((e) => log.push(`${e.actionId}:${e.type}`));
  runtime.start();
  return runtime;
}

/**
 * A key event with the flags of the keys physically down (`held`), as a browser
 * sends it. `lost`: the key changes state but the page never gets the event.
 */
function key(type, code, { lost = false, repeat = false, altGraph = false } = {}) {
  if (type === 'keydown') held.add(code); else held.delete(code);
  if (lost) return;
  const init = { code, repeat, bubbles: true, cancelable: true };
  for (const c of held) if (FLAG[c]) init[FLAG[c]] = true;
  // Firefox on Windows: with AltGr down ctrlKey and altKey are false and AltGraph is set
  if (altGraph) Object.assign(init, { ctrlKey: false, altKey: false });
  const event = new KeyboardEvent(type, init);
  if (altGraph) Object.defineProperty(event, 'getModifierState', { value: (m) => m === 'AltGraph' });
  window.dispatchEvent(event);
}

/** A synthetic key event, as a host's on-screen button sends it: not physical, its own flags. */
function synth(type, code, init = {}) {
  const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init });
  SYNTHETIC.add(event);
  window.dispatchEvent(event);
}

const take = () => log.splice(0);

afterEach(() => { runtime?.stop(); runtime = null; held = new Set(); log = []; });

describe('a second keydown after a lost keyup', () => {
  it('releases the first press before the new one', () => {
    setup({ jump: 'KeyA' });
    key('keydown', 'KeyA');
    key('keyup', 'KeyA', { lost: true });
    key('keydown', 'KeyA');
    expect(take()).toEqual(['jump:pressed', 'jump:released', 'jump:pressed']);
    key('keyup', 'KeyA');
    expect(take()).toEqual(['jump:released']);
  });

  it('a combo: the old combo is released, the new press resolves anew', () => {
    setup({ select: 'ControlLeft+KeyA', jump: 'KeyA' });
    key('keydown', 'ControlLeft');
    key('keydown', 'KeyA');
    key('keyup', 'KeyA', { lost: true });
    key('keyup', 'ControlLeft');
    key('keydown', 'KeyA');
    expect(take()).toEqual(['select:pressed', 'select:released', 'jump:pressed']);
  });

  it('a modifier: its chord is released with it, then the keydown fires the chord again', () => {
    setup({ names: 'ControlLeft+ShiftLeft' });
    key('keydown', 'ControlLeft');
    key('keydown', 'ShiftLeft');
    key('keyup', 'ControlLeft', { lost: true });
    key('keydown', 'ControlLeft');
    expect(take()).toEqual(['names:pressed', 'names:released', 'names:pressed']);
    key('keyup', 'ShiftLeft');
    key('keyup', 'ControlLeft');
    expect(take()).toEqual(['names:released']);
  });

  it('a repeat is still a repeat: held, nothing released', () => {
    setup({ jump: 'KeyA' });
    key('keydown', 'KeyA');
    key('keydown', 'KeyA', { repeat: true });
    expect(take()).toEqual(['jump:pressed', 'jump:held']);
  });
});

describe('synthetic events and keys a synthetic keydown holds: exactly as in 0.2.3', () => {
  it('three synthetic keydowns and one keyup: pressed three times, released once', () => {
    setup({ walk: 'KeyW' });
    synth('keydown', 'KeyW');
    synth('keydown', 'KeyW');
    synth('keydown', 'KeyW');
    synth('keyup', 'KeyW');
    expect(take()).toEqual(['walk:pressed', 'walk:pressed', 'walk:pressed', 'walk:released']);
  });

  it('the same with every event synthetic, as jsdom sends them', () => {
    setup({ walk: 'KeyW' }, { trusted: false });
    synth('keydown', 'KeyW');
    synth('keydown', 'KeyW');
    synth('keyup', 'KeyW');
    expect(take()).toEqual(['walk:pressed', 'walk:pressed', 'walk:released']);
  });

  it('a synthetic Shift held by a host is not released by a real key\'s flags', () => {
    setup({ run: 'ShiftLeft', walk: 'KeyW' });
    synth('keydown', 'ShiftLeft', { shiftKey: true });
    key('keydown', 'KeyW');
    key('keyup', 'KeyW');
    expect(take()).toEqual(['run:pressed', 'walk:pressed', 'walk:released']);
    expect(runtime.isPressed('ShiftLeft')).toBe(true);
    synth('keyup', 'ShiftLeft');
    expect(take()).toEqual(['run:released']);
  });

  it('a synthetic modifier still counts for combos and chords of real keys', () => {
    setup({ sprintJump: 'ShiftLeft+Space', names: 'ControlLeft+ShiftLeft' });
    synth('keydown', 'ShiftLeft');
    key('keydown', 'Space');
    key('keyup', 'Space');
    key('keydown', 'ControlLeft');
    expect(take()).toEqual(['sprintJump:pressed', 'sprintJump:released', 'names:pressed']);
  });

  it('held by a synthetic keydown, a real second keydown: no repair (a second pressed, as in 0.2.3)', () => {
    setup({ walk: 'KeyW' });
    synth('keydown', 'KeyW');
    key('keydown', 'KeyW');
    expect(take()).toEqual(['walk:pressed', 'walk:pressed']);
    key('keyup', 'KeyW');
    synth('keyup', 'KeyW');
    expect(take()).toEqual(['walk:released']);
  });

  it('held by a real keydown, a synthetic second keydown: no repair, and the key is never repaired after it', () => {
    setup({ walk: 'KeyW', run: 'ShiftLeft' });
    key('keydown', 'KeyW');
    synth('keydown', 'KeyW');
    expect(take()).toEqual(['walk:pressed', 'walk:pressed']);
    // A real keydown again (its keyup "lost"): the synthetic source may still hold it, so no release
    key('keydown', 'KeyW');
    expect(take()).toEqual(['walk:pressed']);
    // Same for a modifier and the flags: a real Shift, then a synthetic Shift keydown
    key('keydown', 'ShiftLeft');
    synth('keydown', 'ShiftLeft', { shiftKey: true });
    key('keyup', 'ShiftLeft', { lost: true });
    key('keydown', 'KeyQ');
    expect(take()).toEqual(['run:pressed', 'run:pressed']);
    expect(runtime.isPressed('ShiftLeft')).toBe(true);
  });

  it('a synthetic event never repairs a real key whose keyup was lost', () => {
    setup({ crouch: 'ControlLeft', jump: 'KeyA' });
    key('keydown', 'ControlLeft');
    key('keyup', 'ControlLeft', { lost: true });
    synth('keydown', 'KeyA');
    expect(take()).toEqual(['crouch:pressed', 'jump:pressed']);
    // The next real event does
    key('keydown', 'KeyS');
    expect(take()).toEqual(['crouch:released']);
  });

  it('a key that left and came back with a real keydown is repaired again', () => {
    setup({ walk: 'KeyW' });
    synth('keydown', 'KeyW');
    synth('keyup', 'KeyW');
    key('keydown', 'KeyW');
    key('keyup', 'KeyW', { lost: true });
    key('keydown', 'KeyW');
    expect(take()).toEqual(['walk:pressed', 'walk:released', 'walk:pressed', 'walk:released', 'walk:pressed']);
  });
});

describe('a modifier whose keyup was lost is released by the flags of the next key event', () => {
  it('a chord does not fire on a single modifier press', () => {
    setup({ crouch: 'ControlLeft', run: 'ShiftLeft', names: 'ControlLeft+ShiftLeft' });
    key('keydown', 'ControlLeft');
    key('keyup', 'ControlLeft', { lost: true });
    key('keydown', 'ShiftLeft');
    expect(take()).toEqual(['crouch:pressed', 'crouch:released', 'run:pressed']);
    expect(runtime.getHeldModifiers()).toEqual(['ShiftLeft']);
  });

  it('a chord does not fire a second time', () => {
    setup({ names: 'ControlLeft+ShiftLeft' });
    key('keydown', 'ControlLeft');
    key('keydown', 'ShiftLeft');
    key('keyup', 'ShiftLeft');
    key('keyup', 'ControlLeft', { lost: true });
    key('keydown', 'ShiftLeft');
    expect(take()).toEqual(['names:pressed', 'names:released']);
  });

  it('an extra modifier left over does not block an exact-set chord', () => {
    setup({ names: 'ControlLeft+ShiftLeft' });
    key('keydown', 'AltLeft');
    key('keyup', 'AltLeft', { lost: true });
    key('keydown', 'ControlLeft');
    key('keydown', 'ShiftLeft');
    expect(take()).toEqual(['names:pressed']);
  });

  it('a combo: Ctrl+A is not sent once Ctrl is up', () => {
    setup({ select: 'ControlLeft+KeyA', jump: 'KeyA' });
    key('keydown', 'ControlLeft');
    key('keyup', 'ControlLeft', { lost: true });
    key('keydown', 'KeyA');
    expect(take()).toEqual(['jump:pressed']);
  });

  it('a chord completed by another key is released at the first event that shows its modifier up', () => {
    setup({ names: 'ControlLeft+ShiftLeft', jump: 'KeyA' });
    key('keydown', 'ControlLeft');
    key('keydown', 'ShiftLeft');
    key('keyup', 'ControlLeft', { lost: true });
    key('keydown', 'KeyA');
    expect(take()).toEqual(['names:pressed', 'names:released', 'jump:pressed']);
  });

  it('a repeat and a keyup carry the flags too', () => {
    setup({ crouch: 'ControlLeft', jump: 'KeyA' });
    key('keydown', 'KeyA');
    key('keydown', 'ControlLeft');
    key('keyup', 'ControlLeft', { lost: true });
    key('keydown', 'KeyA', { repeat: true });
    expect(take()).toEqual(['jump:pressed', 'crouch:pressed', 'crouch:released', 'jump:held']);
    key('keydown', 'ShiftLeft');
    key('keyup', 'ShiftLeft', { lost: true });
    key('keyup', 'KeyA');
    expect(runtime.getHeldModifiers()).toEqual([]);
  });

  it('the flag covers both sides: both are released; one side lost while the other is down stays (a limit)', () => {
    setup({ left: 'ControlLeft', right: 'ControlRight' });
    key('keydown', 'ControlLeft');
    key('keydown', 'ControlRight');
    key('keyup', 'ControlLeft', { lost: true });
    key('keydown', 'KeyQ');
    // ctrlKey is still true (Right Ctrl is down): the lost Left Ctrl cannot be told
    expect(take()).toEqual(['left:pressed', 'right:pressed']);
    key('keyup', 'ControlRight', { lost: true });
    key('keyup', 'KeyQ');
    expect(take().sort()).toEqual(['left:released', 'right:released']);
  });

  it('the event\'s own key is released by its keyup only, once', () => {
    setup({ run: 'ShiftLeft', crouch: 'ControlLeft' });
    key('keydown', 'ShiftLeft');
    key('keyup', 'ShiftLeft');
    expect(take()).toEqual(['run:pressed', 'run:released']);
    // A modifier keydown whose own flag is (oddly) false still presses it
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft' }));
    expect(take()).toEqual(['crouch:pressed']);
  });

  it('AltGr held: the Ctrl and Alt flags are not read (they disagree with the keys on some layouts and browsers)', () => {
    setup({ ctrl: 'ControlLeft', altgr: 'AltRight' });
    key('keydown', 'ControlLeft');
    key('keydown', 'AltRight');
    key('keydown', 'KeyQ', { altGraph: true });
    key('keyup', 'KeyQ', { altGraph: true });
    expect(take()).toEqual(['ctrl:pressed', 'altgr:pressed']);
    key('keyup', 'AltRight');
    key('keyup', 'ControlLeft');
    expect(take()).toEqual(['altgr:released', 'ctrl:released']);
  });

  it('synthetic events (not isTrusted) are not read: 0.2.3 behaviour', () => {
    setup({ select: 'ControlLeft+KeyA', jump: 'KeyA' }, { trusted: false });
    key('keydown', 'ControlLeft');
    key('keyup', 'ControlLeft', { lost: true });
    key('keydown', 'KeyA');
    expect(take()).toEqual(['select:pressed']);
  });

  it('macOS: a key let go while Cmd is held stays pressed until it is pressed again (then released first)', () => {
    setup({ all: 'MetaLeft+KeyA', jump: 'KeyA' });
    key('keydown', 'MetaLeft');
    key('keydown', 'KeyA');
    key('keyup', 'KeyA', { lost: true });
    key('keyup', 'MetaLeft');
    expect(take()).toEqual(['all:pressed']);
    expect(runtime.isPressed('MetaLeft+KeyA')).toBe(true);
    key('keydown', 'KeyA');
    expect(take()).toEqual(['all:released', 'jump:pressed']);
  });

  it('a modifier lost during a recording does not stay held for the game afterwards', () => {
    setup({ jump: 'KeyA', select: 'ControlLeft+KeyA' });
    runtime.setGameplaySuppressed(true);
    runtime.startCapture(() => {});
    key('keydown', 'ControlLeft');
    key('keyup', 'ControlLeft', { lost: true });
    key('keydown', 'KeyQ');
    key('keyup', 'KeyQ');
    runtime.setGameplaySuppressed(false);
    key('keydown', 'KeyA');
    expect(take()).toEqual(['jump:pressed']);
  });

  it('recording: a modifier whose keyup was lost is not recorded with the next key', () => {
    setup({});
    const recorded = [];
    runtime.setGameplaySuppressed(true);
    runtime.startCapture((code) => recorded.push(code));
    key('keydown', 'ControlLeft');
    key('keyup', 'ControlLeft', { lost: true });
    key('keydown', 'KeyA');
    key('keyup', 'KeyA');
    expect(recorded).toEqual(['KeyA']);
  });
});
