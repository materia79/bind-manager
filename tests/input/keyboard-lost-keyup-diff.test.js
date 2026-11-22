/**
 * 0.2.4 against 0.2.3 (tests/input/fixtures/*-0.2.3.js, the released files):
 * the keyboard and mouse runtimes of both versions listen to the same window
 * and get the same random sequences of keydown, auto-repeat, keyup, mouse
 * buttons, wheel notches, blur, focus and modal open/close, with single keys,
 * single modifiers, combos (keys, mouse buttons and the wheel) and chords bound.
 * Every event carries the modifier flags of the keys physically down, and the
 * 0.2.4 keyboard runtime reads them (as it does for a browser's own events).
 *
 * 1. No keyup lost: after every step both versions sent exactly the same
 *    events, isPressed() of every bound code, the held modifiers and the inner
 *    state (keys held, active bindings) are the same.
 * 2. Keyups lost (a key goes up and the page never gets the event): a step may
 *    differ only where 0.2.4 repairs (a second keydown of a key that is held,
 *    an event whose flags show a held modifier up) or after such a repair, and
 *    0.2.4 always keeps the rules: held and released only while pressed, no
 *    second pressed, no modifier or chord held after an event shows it up, and
 *    after the keys are up and one more key event nothing modifier-bound stays
 *    pressed. The kinds of difference are counted (BM_DIFF_REPORT=<file> writes them there).
 * 3. Both again with synthetic events mixed in (a host's on-screen keys: any
 *    key, any order, flags none, own or random; not in the flags of the
 *    browser's events): without lost keyups exactly 0.2.3 again, and with lost
 *    keyups no repair ever releases a key a synthetic keydown holds.
 *
 * BM_DIFF_SEQUENCES sets the number of sequences per part (default 1500).
 */
import { describe, it, expect } from 'vitest';
import { appendFileSync } from 'node:fs';
import { KeyboardRuntime } from '../../src/input/keyboard-runtime.js';
import { MouseRuntime } from '../../src/input/mouse-runtime.js';
import { KeyboardRuntime as KeyboardRuntime023 } from './fixtures/keyboard-runtime-0.2.3.js';
import { MouseRuntime as MouseRuntime023 } from './fixtures/mouse-runtime-0.2.3.js';
import { ActionRegistry } from '../../src/core/action-registry.js';
import { BindingStore } from '../../src/core/binding-store.js';
import { MODIFIER_ORDER, buildComboCode, buildChordCode, isModifierChord } from '../../src/input/key-names.js';

const SEQUENCES = Number(process.env.BM_DIFF_SEQUENCES) || 1500;
const STEPS = 60;
const TIMEOUT_MS = Math.max(60000, SEQUENCES * 20);
const KEYS = ['KeyA', 'KeyS', 'Space', 'Tab', 'Escape'];
const MODS = MODIFIER_ORDER;
const COMMON_MODS = ['ControlLeft', 'ShiftLeft', 'AltLeft', 'ControlRight', 'MetaLeft'];
const BUTTONS = [0, 1, 2];
const FLAG = { ControlLeft: 'ctrlKey', ControlRight: 'ctrlKey', ShiftLeft: 'shiftKey', ShiftRight: 'shiftKey', AltLeft: 'altKey', AltRight: 'altKey', MetaLeft: 'metaKey', MetaRight: 'metaKey' };

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];

function someModifiers(r, min, max) {
  const pool = r() < 0.75 ? COMMON_MODS : MODS;
  const n = min + Math.floor(r() * (max - min + 1));
  const out = new Set();
  while (out.size < n) out.add(pick(r, pool));
  return [...out];
}

function randomCode(r) {
  const roll = r();
  if (roll < 0.2) return buildChordCode(someModifiers(r, 2, 3));
  if (roll < 0.38) return pick(r, COMMON_MODS);
  if (roll < 0.58) return buildComboCode(someModifiers(r, 1, 2), pick(r, KEYS));
  if (roll < 0.68) return buildComboCode(someModifiers(r, 1, 1), pick(r, ['MouseButton0', 'MouseButton2', 'MouseWheelUp', 'MouseWheelDown']));
  if (roll < 0.78) return pick(r, ['MouseButton0', 'MouseButton1', 'MouseButton2', 'MouseWheelUp', 'MouseWheelDown']);
  return pick(r, KEYS);
}

function makeStore(r) {
  const registry = new ActionRegistry();
  const store = new BindingStore(registry);
  const count = 3 + Math.floor(r() * 6);
  const defs = [];
  for (let i = 0; i < count; i++) {
    const def = { id: `a${i}`, slots: 2, defaultBindings: [randomCode(r), r() < 0.5 ? randomCode(r) : null] };
    defs.push(def.defaultBindings);
    store.initAction(registry.register(def));
  }
  return { store, defs };
}

/** The physical world: keys and buttons down, focus, the modal. */
function flags(world) {
  const init = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
  for (const c of world.keys) if (FLAG[c]) init[FLAG[c]] = true;
  return init;
}

/** One random step; keyups and repeats prefer keys that are down. */
function randomStep(r, world) {
  const roll = r();
  const keys = [...world.keys];
  if (roll < 0.30) {
    const code = r() < 0.7 ? pick(r, COMMON_MODS) : pick(r, [...MODS, ...KEYS, 'KeyQ']);
    return world.keys.has(code) ? ['repeat', code] : ['down', code];
  }
  if (roll < 0.42) return keys.length ? ['repeat', pick(r, keys)] : ['down', pick(r, KEYS)];
  if (roll < 0.70) return keys.length ? ['up', pick(r, keys)] : ['down', pick(r, COMMON_MODS)];
  if (roll < 0.80) {
    const b = pick(r, BUTTONS);
    return world.buttons.has(b) ? ['mouseup', b] : ['mousedown', b];
  }
  if (roll < 0.86) return ['wheel', r() < 0.5 ? -120 : 120];
  if (roll < 0.90) return world.focused ? ['blur'] : ['focus'];
  if (roll < 0.95) return world.suppressed ? ['close'] : ['open'];
  if (!world.focused) return ['focus'];
  const code = pick(r, KEYS);
  return world.keys.has(code) ? ['repeat', code] : ['down', code];
}

/**
 * A synthetic key event, as a host's on-screen or remapped key sends it: any
 * key, in any order (second keydowns and keyups of keys not down included),
 * with no flags, its own flag only, or random flags. Not physical: the flags of
 * the browser's own events do not show it.
 */
function randomSynthStep(r) {
  const roll = r();
  const kind = roll < 0.45 ? 'synth-down' : roll < 0.55 ? 'synth-repeat' : 'synth-up';
  const code = r() < 0.6 ? pick(r, COMMON_MODS) : pick(r, [...MODS, ...KEYS]);
  return [kind, code, pick(r, ['none', 'own', 'random'])];
}

/** Events sent by a script (the trusted check of 0.2.4 reads this). */
const SYNTHETIC = new WeakSet();

/** Apply a step to the world and the page; `lost` drops a keyup's event. */
function apply(step, world, runtimes, lost) {
  const [kind, arg] = step;
  const send = (event) => { if (world.focused) window.dispatchEvent(event); };
  if (kind === 'down' || kind === 'repeat') {
    world.keys.add(arg);
    send(new KeyboardEvent('keydown', { code: arg, repeat: kind === 'repeat', bubbles: true, cancelable: true, ...flags(world) }));
  } else if (kind === 'up') {
    world.keys.delete(arg);
    if (!lost) send(new KeyboardEvent('keyup', { code: arg, bubbles: true, cancelable: true, ...flags(world) }));
  } else if (kind === 'mousedown' || kind === 'mouseup') {
    if (kind === 'mousedown') world.buttons.add(arg); else world.buttons.delete(arg);
    send(new MouseEvent(kind, { button: arg, bubbles: true, cancelable: true, ...flags(world) }));
  } else if (kind === 'wheel') {
    send(new WheelEvent('wheel', { deltaY: arg, deltaMode: 0, bubbles: true, cancelable: true, ...flags(world) }));
  } else if (kind === 'blur') {
    if (world.focused) window.dispatchEvent(new Event('blur'));
    world.focused = false;
  } else if (kind === 'focus') {
    if (!world.focused) window.dispatchEvent(new Event('focus'));
    world.focused = true;
  } else if (kind === 'open' || kind === 'close') {
    world.suppressed = kind === 'open';
    for (const rt of runtimes) rt.setGameplaySuppressed(world.suppressed);
  } else if (kind.startsWith('synth-')) {
    const mode = step[2];
    const init = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
    if (mode === 'own' && FLAG[arg]) init[FLAG[arg]] = kind !== 'synth-up';
    if (mode === 'random') for (const f of Object.keys(init)) init[f] = world.rand() < 0.5;
    const event = new KeyboardEvent(kind === 'synth-up' ? 'keyup' : 'keydown', { code: arg, repeat: kind === 'synth-repeat', bubbles: true, cancelable: true, ...(mode === 'none' ? {} : init) });
    SYNTHETIC.add(event);
    window.dispatchEvent(event);
  }
}

const sorted = (it) => [...it].map(String).sort();
/** Keys held, and the active bindings in their order (the order of the releases on blur or suppression). */
function innerState(kb, mouse) {
  return JSON.stringify([sorted(kb._pressed), [...kb._activeBindings].map((e) => e.join('=')), [...mouse._activeBindings].map((e) => e.join('='))]);
}

/** Pairing per action and code: returns the first violation, updating `active`. */
function pairing(lines, active) {
  let first = null;
  for (const line of lines) {
    const [actionId, type, code] = line.split(':');
    const key = `${actionId}:${code}`;
    const on = active.has(key);
    if (type === 'pressed' && on) first ??= `second pressed without release: ${line}`;
    if ((type === 'held' || type === 'released') && !on) first ??= `${type} without pressed: ${line}`;
    if (type === 'pressed') active.add(key);
    if (type === 'released') active.delete(key);
  }
  return first;
}

/** Multiset difference a - b. */
function minus(a, b) {
  const rest = [...b];
  return a.filter((x) => { const i = rest.indexOf(x); if (i < 0) return true; rest.splice(i, 1); return false; });
}

/** Does 0.2.4 repair at this step (state both runtimes share, flags as the event carries them)? */
function repairCause(step, kb, world, lost) {
  const [kind, code] = step;
  // Only keys a trusted keydown holds can be repaired, and only by the browser's own events
  // Settling sends keyups for every key down and one more key: a modifier held here but up shows then
  if (kind === 'settle') return MODIFIER_ORDER.some((m) => kb._isTrustedHeld(m) && !world.keys.has(m)) ? 'flags show a held modifier up' : null;
  if (lost || !world.focused || !['down', 'repeat', 'up'].includes(kind)) return null;
  const keys = new Set(world.keys);
  if (kind === 'up') keys.delete(code); else keys.add(code);
  const f = flags({ keys });
  for (const m of MODIFIER_ORDER) if (m !== code && kb._isTrustedHeld(m) && !f[FLAG[m]]) return 'flags show a held modifier up';
  if (kind === 'down' && kb._isTrustedHeld(code) && !world.suppressed) return 'second keydown of a held key';
  return null;
}

function kindsOf(step, now, old) {
  const out = [];
  const extraNow = minus(now, old);
  const extraOld = minus(old, now);
  const types = (lines) => [...new Set(lines.map((l) => l.split(':')[1]))].sort().join('+');
  if (extraNow.length) out.push(`${step[0]}: only 0.2.4 sends ${types(extraNow)}`);
  if (extraOld.length) out.push(`${step[0]}: only 0.2.3 sends ${types(extraOld)}`);
  if (!extraNow.length && !extraOld.length) out.push(`${step[0]}: same events, other order`);
  return out;
}

function runSequence(seed, lostRate, tally, synthRate = 0) {
  const r = rng(seed);
  const { store, defs } = makeStore(r);
  const kb = new KeyboardRuntime(store);
  kb._hasTrustedFlags = (event) => !SYNTHETIC.has(event);
  const mouse = new MouseRuntime(store, kb);
  const kbOld = new KeyboardRuntime023(store);
  const mouseOld = new MouseRuntime023(store, kbOld);
  const log = { now: [], old: [] };
  const record = (side) => (e) => log[side].push(`${e.actionId}:${e.type}:${e.code}`);
  kb.onAnyAction(record('now')); mouse.onAnyAction(record('now'));
  kbOld.onAnyAction(record('old')); mouseOld.onAnyAction(record('old'));
  const runtimes = [kb, mouse, kbOld, mouseOld];
  for (const rt of runtimes) rt.start();
  const world = { keys: new Set(), buttons: new Set(), focused: true, suppressed: false, rand: r };
  const steps = [];
  const active = { now: new Set(), old: new Set() };
  const codes = [...new Set(defs.flat().filter(Boolean))];
  const fail = (msg) => `seed ${seed}: ${msg}\nbindings ${JSON.stringify(defs)}\nsteps ${steps.join(' | ')}`;
  try {
    const total = STEPS + 1;
    for (let i = 0; i < total; i++) {
      // The last step settles: every key and button up (delivered), then one more key event
      const settle = i === STEPS;
      const step = settle ? ['settle'] : synthRate > 0 && r() < synthRate ? randomSynthStep(r) : randomStep(r, world);
      const lost = !settle && step[0] === 'up' && r() < lostRate;
      steps.push(step.join(' ') + (lost ? ' (lost)' : ''));
      const sameBefore = innerState(kb, mouse) === innerState(kbOld, mouseOld);
      const cause = sameBefore ? repairCause(step, kb, world, lost) : null;
      // Keys a synthetic keydown holds: no repair may release them (only a keyup, blur or the modal)
      const synthHeld = [...kb._pressed].filter((c) => !kb._isTrustedHeld(c));
      const keyupFor = settle ? new Set([...world.keys, 'KeyQ']) : new Set(step[0] === 'up' || step[0] === 'synth-up' ? [step[1]] : []);
      const before = { now: log.now.length, old: log.old.length };
      if (settle) {
        if (!world.focused) apply(['focus'], world, runtimes, false);
        for (const k of [...world.keys]) apply(['up', k], world, runtimes, false);
        for (const b of [...world.buttons]) apply(['mouseup', b], world, runtimes, false);
        apply(['down', 'KeyQ'], world, runtimes, false);
        apply(['up', 'KeyQ'], world, runtimes, false);
      } else {
        apply(step, world, runtimes, lost);
      }
      if (lost) tally.lost += 1;
      const added = { now: log.now.slice(before.now), old: log.old.slice(before.old) };
      // Synthetic second keydowns send a second pressed in both versions (as in 0.2.3),
      // so the pairing rule holds for 0.2.4 only without synthetic events
      const pairNow = pairing(added.now, active.now);
      if (pairNow && synthRate === 0) return fail(`0.2.4: ${pairNow}`);
      if (pairNow) tally.nowPairingSynthetic += 1;
      if (pairing(added.old, active.old)) tally.oldPairing += 1;
      if (!['blur', 'open'].includes(step[0])) {
        for (const c of synthHeld) {
          if (!keyupFor.has(c) && !kb._pressed.has(c)) return fail(`0.2.4 released ${c}, held by a synthetic keydown, at "${step.join(' ')}"`);
        }
      }
      if (step[0].startsWith('synth-')) tally.synthetic += 1;
      const same = JSON.stringify(added.now) === JSON.stringify(added.old);
      if (lostRate === 0) {
        if (!same) return fail(`events differ at "${step.join(' ')}": 0.2.4 ${JSON.stringify(added.now)}, 0.2.3 ${JSON.stringify(added.old)}`);
        for (const code of codes) {
          if (kb.isPressed(code) !== kbOld.isPressed(code) || mouse.isPressed(code) !== mouseOld.isPressed(code)) return fail(`isPressed(${code}) differs`);
        }
        if (kb.getHeldModifiers().join() !== kbOld.getHeldModifiers().join()) return fail('held modifiers differ');
        if (innerState(kb, mouse) !== innerState(kbOld, mouseOld)) return fail('inner state differs');
        tally.steps += 1;
        continue;
      }
      // Lost keyups: a difference from a shared state needs a repair cause
      if (!same) {
        if (sameBefore && !cause) return fail(`difference without a lost keyup at "${step.join(' ')}": 0.2.4 ${JSON.stringify(added.now)}, 0.2.3 ${JSON.stringify(added.old)}`);
        const origin = cause ?? 'after an earlier repair';
        tally.diffSteps += 1;
        for (const k of kindsOf(step, added.now, added.old)) tally.kinds.set(`${origin} | ${k}`, (tally.kinds.get(`${origin} | ${k}`) ?? 0) + 1);
      }
      if (cause && sameBefore) tally.causes.set(cause, (tally.causes.get(cause) ?? 0) + 1);
      // After a key event 0.2.4 holds no modifier, and no chord, that the flags show up
      if (world.focused && (settle || ['down', 'repeat', 'up'].includes(step[0]) && !lost)) {
        const f = flags(world);
        const stale = kb.getHeldModifiers().filter((m) => kb._isTrustedHeld(m) && !f[FLAG[m]] && m !== step[1]);
        if (stale.length) return fail(`0.2.4 still holds ${stale} after "${step.join(' ')}"`);
        for (const code of kb._activeBindings.values()) {
          if (isModifierChord(code) && code.split('+').some((m) => kb._isTrustedHeld(m) && !f[FLAG[m]])) return fail(`0.2.4 chord ${code} still active after "${step.join(' ')}"`);
        }
        if (kbOld.getHeldModifiers().some((m) => !f[FLAG[m]] && m !== step[1])) tally.oldStale += 1;
      }
      tally.steps += 1;
    }
    // Settled: nothing whose key is a modifier stays pressed in 0.2.4; keys whose
    // keyup was lost stay pressed in both versions until pressed again or a blur
    for (const [raw, code] of kb._activeBindings) {
      // A key a synthetic keydown holds waits for its synthetic keyup, as in 0.2.3
      if (!kb._isTrustedHeld(raw)) { tally.synthResidual += 1; continue; }
      if (MODIFIER_ORDER.includes(raw)) return fail(`0.2.4 still has ${raw} -> ${code} after settling`);
      tally.residual += 1;
    }
    tally.oldResidualModifiers += [...kbOld._activeBindings.keys()].filter((raw) => MODIFIER_ORDER.includes(raw)).length;
    // A blur releases the rest: every pressed of 0.2.4 got its released
    const n = log.now.length;
    const nOld = log.old.length;
    window.dispatchEvent(new Event('blur'));
    const closing = pairing(log.now.slice(n), active.now);
    pairing(log.old.slice(nOld), active.old);
    if (synthRate === 0) {
      if (closing) return fail(`0.2.4 after blur: ${closing}`);
      if (active.now.size > 0) return fail(`0.2.4 pressed without released after blur: ${[...active.now]}`);
    } else if (lostRate === 0 && sorted(active.now).join() !== sorted(active.old).join()) {
      // A synthetic second keydown leaves a pressed without its own released, in both versions alike
      return fail(`after blur 0.2.4 leaves ${sorted(active.now)}, 0.2.3 ${sorted(active.old)}`);
    }
    return null;
  } finally {
    for (const rt of runtimes) rt.stop();
  }
}

function report(line) {
  appendFileSync(process.env.BM_DIFF_REPORT, line + '\n');
}

function newTally() {
  return { steps: 0, lost: 0, diffSteps: 0, oldPairing: 0, oldStale: 0, residual: 0, oldResidualModifiers: 0, synthetic: 0, synthResidual: 0, nowPairingSynthetic: 0, kinds: new Map(), causes: new Map() };
}

describe('0.2.4 against 0.2.3: keyboard and mouse runtimes', () => {
  it(`no keyup lost, consistent flags: the same events and state at every step (${SEQUENCES} sequences of ${STEPS} steps)`, () => {
    const tally = newTally();
    for (let seed = 1; seed <= SEQUENCES; seed++) {
      const failure = runSequence(seed, 0, tally);
      if (failure) expect.fail(failure);
    }
    if (process.env.BM_DIFF_REPORT) report(`[diff] no lost keyups: ${SEQUENCES} sequences, ${tally.steps} steps, 0 differences`);
    expect(tally.steps).toBe(SEQUENCES * (STEPS + 1));
  }, TIMEOUT_MS);

  it(`keyups lost: every difference is a repair and 0.2.4 keeps the rules (${SEQUENCES} sequences of ${STEPS} steps)`, () => {
    const tally = newTally();
    for (let seed = 1; seed <= SEQUENCES; seed++) {
      const failure = runSequence(5e6 + seed, 0.2, tally);
      if (failure) expect.fail(failure);
    }
    if (process.env.BM_DIFF_REPORT) {
      report(`[diff] lost keyups: ${SEQUENCES} sequences, ${tally.steps} steps, ${tally.lost} keyups lost, ${tally.diffSteps} steps differ`);
      report(`[diff] repairs started by: ${JSON.stringify(Object.fromEntries(tally.causes))}`);
      for (const [k, n] of [...tally.kinds].sort((a, b) => b[1] - a[1])) report(`[diff]   ${n}\t${k}`);
      report(`[diff] 0.2.3 in the same sequences: ${tally.oldPairing} steps break pressed/held/released pairing, ${tally.oldStale} key events with a modifier held that the flags show up, ${tally.oldResidualModifiers} modifier entries left after settling`);
      report(`[diff] non-modifier keys left pressed after settling (both versions, until pressed again or blur): ${tally.residual}`);
    }
    // The sequences really lose keyups and really differ
    expect(tally.lost).toBeGreaterThan(SEQUENCES);
    expect(tally.diffSteps).toBeGreaterThan(SEQUENCES / 10);
    expect(tally.oldPairing).toBeGreaterThan(0);
  }, TIMEOUT_MS);

  it(`synthetic and trusted events mixed, no keyup lost: the same events and state at every step (${SEQUENCES} sequences of ${STEPS} steps)`, () => {
    const tally = newTally();
    for (let seed = 1; seed <= SEQUENCES; seed++) {
      const failure = runSequence(9e6 + seed, 0, tally, 0.25);
      if (failure) expect.fail(failure);
    }
    if (process.env.BM_DIFF_REPORT) report(`[diff] mixed, no lost keyups: ${SEQUENCES} sequences, ${tally.steps} steps (${tally.synthetic} synthetic), 0 differences; synthetic second pressed in both versions: ${tally.nowPairingSynthetic} steps`);
    expect(tally.steps).toBe(SEQUENCES * (STEPS + 1));
    // Synthetic double keydowns really happen (0.2.3 and 0.2.4 both send a second pressed)
    expect(tally.synthetic).toBeGreaterThan(SEQUENCES * 5);
    expect(tally.nowPairingSynthetic).toBeGreaterThan(0);
  }, TIMEOUT_MS);

  it(`synthetic and trusted events mixed, keyups lost: every difference is a repair, no repair touches a synthetic hold (${SEQUENCES} sequences of ${STEPS} steps)`, () => {
    const tally = newTally();
    for (let seed = 1; seed <= SEQUENCES; seed++) {
      const failure = runSequence(13e6 + seed, 0.2, tally, 0.25);
      if (failure) expect.fail(failure);
    }
    if (process.env.BM_DIFF_REPORT) {
      report(`[diff] mixed, lost keyups: ${SEQUENCES} sequences, ${tally.steps} steps (${tally.synthetic} synthetic), ${tally.lost} keyups lost, ${tally.diffSteps} steps differ`);
      report(`[diff] repairs started by: ${JSON.stringify(Object.fromEntries(tally.causes))}`);
      report(`[diff] keys held by a synthetic keydown left after settling (both versions, until their synthetic keyup or blur): ${tally.synthResidual}`);
    }
    expect(tally.lost).toBeGreaterThan(SEQUENCES);
    expect(tally.diffSteps).toBeGreaterThan(SEQUENCES / 10);
  }, TIMEOUT_MS);
});
