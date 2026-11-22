/**
 * Random key sequences against the keyboard runtime (0.2.3 chords).
 *
 * 1. Without a modifier-only chord bound, 0.2.3 must send exactly the events of
 *    0.2.2 (tests/input/fixtures/keyboard-runtime-0.2.2.js, the released file):
 *    both runtimes listen to the same events; their event lists, isPressed() for
 *    every bound code and the held modifiers are compared after every step.
 * 2. With chords bound as well, every event is checked against the rules:
 *    - a modifier keydown sends the chord of exactly the modifiers held when it
 *      is bound, otherwise what 0.2.2 sends for that keydown;
 *    - other keydowns, and the release of their bindings, are as in 0.2.2;
 *    - pressed, held and released pair up per action and code: held and released
 *      only while pressed, no second pressed before the release;
 *    - after a keyup no active chord contains that key;
 *    - after blur nothing is left pressed.
 *
 * Since 0.2.4 both parts send realistic sequences: no second keydown (without
 * repeat) for a key that is down. That only happens after a lost keyup, and
 * 0.2.4 then releases the first press before the second (0.2.2 and 0.2.3 sent a
 * second pressed); tests/input/keyboard-lost-keyup-diff.test.js compares those
 * sequences with 0.2.3.
 *
 * BM_FUZZ_SEQUENCES sets the number of sequences per part (default 1500).
 */
import { describe, it, expect } from 'vitest';
import { KeyboardRuntime } from '../../src/input/keyboard-runtime.js';
import { KeyboardRuntime as KeyboardRuntime022 } from './fixtures/keyboard-runtime-0.2.2.js';
import { ActionRegistry } from '../../src/core/action-registry.js';
import { BindingStore } from '../../src/core/binding-store.js';
import { MODIFIER_ORDER, buildComboCode, buildChordCode, isModifierChord } from '../../src/input/key-names.js';

const SEQUENCES = Number(process.env.BM_FUZZ_SEQUENCES) || 1500;
const STEPS = 48;
// About 1 ms per sequence; generous, so a loaded machine or BM_FUZZ_SEQUENCES=100000 does not time out
const TIMEOUT_MS = Math.max(30000, SEQUENCES * 10);
const KEYS = ['KeyA', 'KeyS', 'KeyW', 'Space', 'Escape', 'Tab'];
const ALL = [...MODIFIER_ORDER, ...KEYS];

/** mulberry32: a small seeded PRNG, so a failure can be replayed from its seed. */
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

function pick(r, list) { return list[Math.floor(r() * list.length)]; }

/** 1-3 distinct modifiers, biased to the common Ctrl/Shift/Alt left keys so combos and chords collide. */
function someModifiers(r, min, max) {
  const pool = r() < 0.7 ? ['ControlLeft', 'ShiftLeft', 'AltLeft', 'ControlRight'] : MODIFIER_ORDER;
  const n = min + Math.floor(r() * (max - min + 1));
  const out = new Set();
  while (out.size < n) out.add(pick(r, pool));
  return [...out];
}

function randomCode(r, chords) {
  const roll = r();
  if (chords && roll < 0.3) return buildChordCode(someModifiers(r, 2, 3));
  if (roll < 0.5) return pick(r, MODIFIER_ORDER.slice(0, 6));
  if (roll < 0.75) return buildComboCode(someModifiers(r, 1, 2), pick(r, KEYS));
  return pick(r, KEYS);
}

function randomActions(r, chords) {
  const count = 2 + Math.floor(r() * 5);
  return Array.from({ length: count }, (_, i) => ({
    id: `a${i}`,
    slots: 2,
    defaultBindings: [randomCode(r, chords), r() < 0.5 ? randomCode(r, chords) : null],
  }));
}

/**
 * One random step: [kind, code?]. Keyups and repeats prefer keys that are down.
 * `realistic`: no second keydown (without repeat) for a key that is down, as
 * browsers send when no keyup is lost (both parts since 0.2.4).
 */
function randomStep(r, down, realistic) {
  const roll = r();
  const downList = [...down];
  if (roll < 0.42) {
    const code = r() < 0.75 ? pick(r, MODIFIER_ORDER.slice(0, 6)) : pick(r, ALL);
    if (realistic && down.has(code)) return ['repeat', code];
    return ['down', code];
  }
  if (roll < 0.58) return ['repeat', downList.length && r() < 0.9 ? pick(r, downList) : pick(r, ALL)];
  if (roll < 0.92) return ['up', downList.length && r() < 0.9 ? pick(r, downList) : pick(r, ALL)];
  if (roll < 0.95) return ['blur'];
  if (roll < 0.98) return ['suppress'];
  return ['resume'];
}

function makeStore(actions) {
  const registry = new ActionRegistry();
  const store = new BindingStore(registry);
  for (const def of actions) store.initAction(registry.register(def));
  return store;
}

function fire(step) {
  const [kind, code] = step;
  if (kind === 'down' || kind === 'repeat') window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat: kind === 'repeat' }));
  else if (kind === 'up') window.dispatchEvent(new KeyboardEvent('keyup', { code }));
  else if (kind === 'blur') window.dispatchEvent(new Event('blur'));
}

/**
 * Run one sequence on both runtimes. `check(ctx)` runs after every step with the
 * events each runtime sent for that step. Returns a description of the first
 * failure, or null.
 */
function runSequence(seed, chords, check) {
  const r = rng(seed);
  const actions = randomActions(r, chords);
  const store = makeStore(actions);
  const now = new KeyboardRuntime(store);
  const old = new KeyboardRuntime022(store);
  const log = { now: [], old: [] };
  now.onAnyAction((e) => log.now.push(`${e.actionId}:${e.type}:${e.code}`));
  old.onAnyAction((e) => log.old.push(`${e.actionId}:${e.type}:${e.code}`));
  now.start();
  old.start();
  const down = new Set();
  const steps = [];
  let suppressed = false;
  const state = { active: new Map() };
  try {
    for (let i = 0; i < STEPS; i++) {
      const step = randomStep(r, down, true);
      steps.push(step.join(' '));
      const heldBefore = old.getHeldModifiers();
      const before = { now: log.now.length, old: log.old.length };
      if (step[0] === 'suppress') { suppressed = true; now.setGameplaySuppressed(true); old.setGameplaySuppressed(true); }
      else if (step[0] === 'resume') { suppressed = false; now.setGameplaySuppressed(false); old.setGameplaySuppressed(false); }
      else fire(step);
      if (step[0] === 'down') down.add(step[1]);
      if (step[0] === 'up') down.delete(step[1]);
      if (step[0] === 'blur') down.clear();
      const failure = check({
        step, store, now, old, suppressed, heldBefore, state,
        added: { now: log.now.slice(before.now), old: log.old.slice(before.old) },
      });
      if (failure) return `seed ${seed}: ${failure}\nbindings ${JSON.stringify(actions.map((a) => a.defaultBindings))}\nsteps ${steps.join(' | ')}`;
    }
    return null;
  } finally {
    now.stop();
    old.stop();
  }
}

const boundCodes = (store) => [...new Set([...store._keyboard.values()].flat().filter(Boolean))];

/** Part 1: identical to 0.2.2. */
function sameAsOld({ added, store, now, old }) {
  if (JSON.stringify(added.now) !== JSON.stringify(added.old)) return `events differ: ${JSON.stringify(added.now)} vs 0.2.2 ${JSON.stringify(added.old)}`;
  for (const code of boundCodes(store)) {
    if (now.isPressed(code) !== old.isPressed(code)) return `isPressed(${code}) differs`;
  }
  if (now.getHeldModifiers().join() !== old.getHeldModifiers().join()) return 'held modifiers differ';
  return null;
}

/** Part 2: the chord rules. */
function chordRules({ step, store, now, old, suppressed, heldBefore, added, state }) {
  const [kind, code] = step;
  // Pairing per action and code
  for (const line of added.now) {
    const [actionId, type, dispatched] = line.split(':');
    const keyOf = `${actionId}:${dispatched}`;
    const active = state.active.get(keyOf) ?? false;
    if (type === 'pressed' && active) return `second pressed without release: ${line}`;
    if ((type === 'held' || type === 'released') && !active) return `${type} without pressed: ${line}`;
    if (type === 'pressed') state.active.set(keyOf, true);
    if (type === 'released') state.active.delete(keyOf);
  }
  if (now.getHeldModifiers().join() !== old.getHeldModifiers().join()) return 'held modifiers differ';
  const isMod = MODIFIER_ORDER.includes(code);
  if (kind === 'down' && !suppressed) {
    if (isMod) {
      const set = new Set([...heldBefore, code]);
      const chord = buildChordCode([...set]);
      const expected = set.size > 1 && store.getActionsByCode(chord).length > 0
        ? store.getActionsByCode(chord).map((id) => `${id}:pressed:${chord}`)
        : added.old;
      if (JSON.stringify(added.now) !== JSON.stringify(expected)) return `modifier keydown sent ${JSON.stringify(added.now)}, expected ${JSON.stringify(expected)}`;
    } else if (JSON.stringify(added.now) !== JSON.stringify(added.old)) {
      return `keydown of ${code} sent ${JSON.stringify(added.now)}, 0.2.2 ${JSON.stringify(added.old)}`;
    }
  }
  if (kind === 'repeat' && !isMod && JSON.stringify(added.now) !== JSON.stringify(added.old)) {
    return `repeat of ${code} sent ${JSON.stringify(added.now)}, 0.2.2 ${JSON.stringify(added.old)}`;
  }
  if (kind === 'up') {
    if (added.now.some((l) => !l.includes(':released:'))) return `keyup sent more than releases: ${JSON.stringify(added.now)}`;
    if (!isMod && JSON.stringify(added.now) !== JSON.stringify(added.old)) return `keyup of ${code} sent ${JSON.stringify(added.now)}, 0.2.2 ${JSON.stringify(added.old)}`;
    for (const keyOf of state.active.keys()) {
      const dispatched = keyOf.slice(keyOf.indexOf(':') + 1);
      if (isModifierChord(dispatched) && dispatched.split('+').includes(code)) return `chord ${dispatched} still active after ${code} went up`;
    }
    for (const c of boundCodes(store)) {
      if (isModifierChord(c) && c.split('+').includes(code) && now.isPressed(c)) return `isPressed(${c}) after ${code} went up`;
    }
  }
  if (kind === 'blur' || kind === 'suppress') {
    if (state.active.size > 0) return `still pressed after ${kind}: ${[...state.active.keys()]}`;
  }
  return null;
}

describe('keyboard runtime fuzz', () => {
  it(`without chords: the same events as 0.2.2 (${SEQUENCES} sequences of ${STEPS} steps)`, () => {
    for (let seed = 1; seed <= SEQUENCES; seed++) {
      const failure = runSequence(seed, false, sameAsOld);
      if (failure) expect.fail(failure);
    }
  }, TIMEOUT_MS);

  it(`with chords: every event follows the rules (${SEQUENCES} sequences of ${STEPS} steps)`, () => {
    let chordPresses = 0;
    for (let seed = 1; seed <= SEQUENCES; seed++) {
      const failure = runSequence(1e6 + seed, true, (ctx) => {
        chordPresses += ctx.added.now.filter((l) => l.includes(':pressed:') && isModifierChord(l.split(':')[2])).length;
        return chordRules(ctx);
      });
      if (failure) expect.fail(failure);
    }
    // The sequences really exercise chords
    expect(chordPresses).toBeGreaterThan(SEQUENCES / 10);
  }, TIMEOUT_MS);
});
