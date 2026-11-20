import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CaptureModalController } from '../../src/ui/capture-modal-controller.js';

// The dialog hides on pointerdown at Cancel. The click that belongs to the same
// pointer interaction then arrives at whatever lies underneath; it must never
// reach it (touch and pen produce that click even when mousedown is suppressed).

function pointer(type, { pointerId = 1, pointerType = 'touch' } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: pointerType } });
  return event;
}

describe('CaptureModalController cancel by pointer', () => {
  let modal;
  let underneath;
  let onCancel;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    underneath = document.createElement('button');
    document.body.appendChild(underneath);
    modal = new CaptureModalController();
    modal.mount(document.body);
    onCancel = vi.fn(() => modal.close({ restoreFocus: false }));
    modal.open({ onCancel });
  });

  afterEach(() => {
    modal.unmount();
    vi.useRealTimers();
  });

  const cancelBtn = () => document.querySelector('.bm-capture-cancel-btn');

  it('swallows the click that follows the cancelling pointerdown', () => {
    const clicked = vi.fn();
    underneath.addEventListener('click', clicked);

    cancelBtn().dispatchEvent(pointer('pointerdown'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(modal.isOpen()).toBe(false);

    window.dispatchEvent(pointer('pointerup'));
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
    underneath.dispatchEvent(click);
    expect(clicked).not.toHaveBeenCalled();
    expect(click.defaultPrevented).toBe(true);
  });

  it('swallows only one click', () => {
    const clicked = vi.fn();
    underneath.addEventListener('click', clicked);
    cancelBtn().dispatchEvent(pointer('pointerdown'));
    underneath.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    underneath.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('lets a genuine click through once a new pointer interaction starts', () => {
    const clicked = vi.fn();
    underneath.addEventListener('click', clicked);
    cancelBtn().dispatchEvent(pointer('pointerdown'));
    window.dispatchEvent(pointer('pointerup'));

    // A new press elsewhere: its click is the user's
    underneath.dispatchEvent(pointer('pointerdown', { pointerId: 2 }));
    underneath.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('expires shortly after the pointer is released when no click comes', () => {
    const clicked = vi.fn();
    underneath.addEventListener('click', clicked);
    cancelBtn().dispatchEvent(pointer('pointerdown'));
    window.dispatchEvent(pointer('pointercancel'));
    vi.advanceTimersByTime(1000);
    underneath.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('keyboard activation of Cancel (click with detail 0) cancels and swallows nothing', () => {
    const clicked = vi.fn();
    underneath.addEventListener('click', clicked);
    cancelBtn().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    underneath.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    expect(clicked).toHaveBeenCalledTimes(1);
  });
});
