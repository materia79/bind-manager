/**
 * Turns raw WheelEvents into discrete wheel "notches" (MouseWheelUp / MouseWheelDown).
 *
 * Browsers and devices report wheel motion very differently:
 * - deltaMode 0 (pixels): Chromium/Safari, and Firefox when deltaY is read first.
 *   A classic notch is ~50–120 px; trackpads and free-spinning / high-resolution
 *   wheels send many small deltas.
 * - deltaMode 1 (lines): Firefox, usually 3 lines per notch (system setting),
 *   fractional lines for high-resolution wheels.
 * - deltaMode 2 (pages): rare, one event per page scroll.
 *
 * Rules (one notch = one pressed+released pulse):
 * - A pixel event of at least `pixelThreshold` px counts as one notch.
 * - A line event spanning at least one whole line counts as one notch
 *   (not one notch per line — a 3-line Firefox notch is still one notch).
 * - A page event counts as one notch.
 * - Smaller deltas (trackpads, high-res wheels) accumulate per direction and emit
 *   one notch each time the accumulator reaches the threshold (30 px / 1 line).
 *   The accumulator resets on direction change or after `idleResetMs` without wheel input.
 * - Vertical motion only. Exception: with Shift held, Chromium and Safari report the
 *   wheel on deltaX (horizontal scroll), so deltaX is used when deltaY is 0 and Shift is
 *   down; that keeps Shift+wheel chords working. Pure horizontal scrolling is ignored.
 */

export const DEFAULT_WHEEL_PIXEL_THRESHOLD = 30;
export const DEFAULT_WHEEL_IDLE_RESET_MS = 200;

const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

export class WheelNotchCounter {
  /**
   * @param {{ pixelThreshold?: number, idleResetMs?: number, now?: () => number }} [options]
   */
  constructor(options = {}) {
    this._pixelThreshold = options.pixelThreshold > 0 ? options.pixelThreshold : DEFAULT_WHEEL_PIXEL_THRESHOLD;
    this._idleResetMs = options.idleResetMs ?? DEFAULT_WHEEL_IDLE_RESET_MS;
    this._now = options.now ?? (() => Date.now());
    this.reset();
  }

  /** Drop any partially accumulated delta. */
  reset() {
    this._acc = 0;
    this._dir = 0;
    this._lastTime = -Infinity;
  }

  /**
   * Feed one wheel event.
   * @param {WheelEvent} event
   * @returns {'MouseWheelUp' | 'MouseWheelDown' | null} the notch produced, or null
   */
  push(event) {
    // Read deltaMode before the deltas: Firefox then reports its native line units.
    const mode = event.deltaMode;
    const delta = wheelDelta(event);
    if (!delta) return null;

    const dir = Math.sign(delta);
    const now = this._now();
    if (dir !== this._dir || now - this._lastTime > this._idleResetMs) this._acc = 0;
    this._dir = dir;
    this._lastTime = now;

    const code = dir < 0 ? 'MouseWheelUp' : 'MouseWheelDown';
    if (mode === DOM_DELTA_PAGE) {
      this._acc = 0;
      return code;
    }

    const unit = mode === DOM_DELTA_LINE ? 1 : this._pixelThreshold;
    const magnitude = Math.abs(delta);
    if (magnitude >= unit) {
      this._acc = 0;
      return code;
    }
    this._acc += magnitude;
    if (this._acc >= unit) {
      this._acc -= unit;
      return code;
    }
    return null;
  }
}

/**
 * The signed vertical wheel delta of an event (negative = up), honouring the
 * Shift+wheel → deltaX conversion done by Chromium and Safari.
 * @param {WheelEvent} event
 * @returns {number}
 */
export function wheelDelta(event) {
  const dy = event.deltaY || 0;
  if (dy !== 0) return dy;
  if (event.shiftKey) return event.deltaX || 0;
  return 0;
}
