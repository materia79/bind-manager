import { describe, it, expect } from 'vitest';
import { WheelNotchCounter, wheelDelta } from '../../src/input/wheel-notches.js';

function ev({ deltaY = 0, deltaX = 0, deltaMode = 0, shiftKey = false } = {}) {
  return { deltaY, deltaX, deltaMode, shiftKey };
}

function counter(options = {}) {
  let t = 0;
  const c = new WheelNotchCounter({ now: () => t, ...options });
  return { c, advance: (ms) => { t += ms; } };
}

describe('WheelNotchCounter', () => {
  it('counts a classic pixel notch (≥ 30 px) as exactly one notch', () => {
    const { c } = counter();
    expect(c.push(ev({ deltaY: -120 }))).toBe('MouseWheelUp');
    expect(c.push(ev({ deltaY: 100 }))).toBe('MouseWheelDown');
    expect(c.push(ev({ deltaY: 53 }))).toBe('MouseWheelDown');
  });

  it('counts a large coalesced pixel event as one notch, not several', () => {
    const { c } = counter();
    expect(c.push(ev({ deltaY: 400 }))).toBe('MouseWheelDown');
    expect(c.push(ev({ deltaY: 2 }))).toBeNull();
  });

  it('accumulates small trackpad / high-res deltas until the threshold', () => {
    const { c, advance } = counter();
    const results = [];
    for (let i = 0; i < 10; i++) {
      advance(16);
      results.push(c.push(ev({ deltaY: 7 })));
    }
    // 10 × 7 px = 70 px with a 30 px threshold → notches on the 5th and 9th event
    expect(results.filter(Boolean)).toEqual(['MouseWheelDown', 'MouseWheelDown']);
    expect(results.slice(0, 4)).toEqual([null, null, null, null]);
    expect(results[4]).toBe('MouseWheelDown');
  });

  it('resets the accumulator on direction change', () => {
    const { c } = counter();
    expect(c.push(ev({ deltaY: 20 }))).toBeNull();
    expect(c.push(ev({ deltaY: -20 }))).toBeNull();
    expect(c.push(ev({ deltaY: 20 }))).toBeNull();
    expect(c.push(ev({ deltaY: 15 }))).toBe('MouseWheelDown');
  });

  it('resets the accumulator after an idle gap', () => {
    const { c, advance } = counter({ idleResetMs: 200 });
    expect(c.push(ev({ deltaY: 20 }))).toBeNull();
    advance(500);
    expect(c.push(ev({ deltaY: 20 }))).toBeNull();
    advance(10);
    expect(c.push(ev({ deltaY: 20 }))).toBe('MouseWheelDown');
  });

  it('honours a custom pixel threshold', () => {
    const { c } = counter({ pixelThreshold: 100 });
    expect(c.push(ev({ deltaY: 60 }))).toBeNull();
    expect(c.push(ev({ deltaY: 60 }))).toBe('MouseWheelDown');
  });

  it('line mode: an event of one or more whole lines is one notch (Firefox 3-line notch)', () => {
    const { c } = counter();
    expect(c.push(ev({ deltaY: 3, deltaMode: 1 }))).toBe('MouseWheelDown');
    expect(c.push(ev({ deltaY: -1, deltaMode: 1 }))).toBe('MouseWheelUp');
  });

  it('line mode: fractional lines accumulate to one whole line', () => {
    const { c } = counter();
    expect(c.push(ev({ deltaY: 0.5, deltaMode: 1 }))).toBeNull();
    expect(c.push(ev({ deltaY: 0.25, deltaMode: 1 }))).toBeNull();
    expect(c.push(ev({ deltaY: 0.25, deltaMode: 1 }))).toBe('MouseWheelDown');
  });

  it('page mode: every event is one notch', () => {
    const { c } = counter();
    expect(c.push(ev({ deltaY: 0.1, deltaMode: 2 }))).toBe('MouseWheelDown');
    expect(c.push(ev({ deltaY: -1, deltaMode: 2 }))).toBe('MouseWheelUp');
  });

  it('ignores pure horizontal scrolling', () => {
    const { c } = counter();
    expect(c.push(ev({ deltaX: 120 }))).toBeNull();
  });

  it('uses deltaX for Shift+wheel (Chromium/Safari convert it to horizontal)', () => {
    const { c } = counter();
    expect(c.push(ev({ deltaX: -120, shiftKey: true }))).toBe('MouseWheelUp');
    expect(wheelDelta(ev({ deltaX: 50, shiftKey: true }))).toBe(50);
    expect(wheelDelta(ev({ deltaX: 50 }))).toBe(0);
  });

  it('reset() drops a partial accumulation', () => {
    const { c } = counter();
    expect(c.push(ev({ deltaY: 25 }))).toBeNull();
    c.reset();
    expect(c.push(ev({ deltaY: 25 }))).toBeNull();
  });
});
