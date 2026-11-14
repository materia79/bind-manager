/**
 * Focus helpers for the tool dialogs: keep Tab inside the topmost dialog and
 * hand focus back to a usable element when a dialog closes. Only runs on key
 * presses and open/close, never per frame.
 */

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** True when el can take focus right now (connected, enabled, rendered, not hidden). */
export function isFocusable(el) {
  if (!el || !el.isConnected || typeof el.focus !== 'function') return false;
  if (el.disabled) return false;
  if (el.closest('[hidden], [aria-hidden="true"]')) return false;
  if (el.getClientRects().length === 0) return false;
  return getComputedStyle(el).visibility !== 'hidden';
}

/** Focusable elements inside a container, in DOM order. */
export function focusableIn(container) {
  return [...container.querySelectorAll(FOCUSABLE)].filter(isFocusable);
}

/** Keep Tab / Shift+Tab inside `panel`. Call from its keydown handler. */
export function trapTab(panel, ev) {
  if (ev.key !== 'Tab') return;
  const list = focusableIn(panel);
  if (!list.length) {
    ev.preventDefault();
    panel.focus();
    return;
  }
  const first = list[0];
  const last = list[list.length - 1];
  const active = document.activeElement;
  const inside = panel.contains(active) && active !== panel && list.includes(active);
  if (ev.shiftKey) {
    if (!inside || active === first) {
      ev.preventDefault();
      last.focus();
    }
  } else if (!inside || active === last) {
    ev.preventDefault();
    first.focus();
  }
}

/** Focus the first candidate that can take focus; returns the focused element or null. */
export function focusFirst(...candidates) {
  for (const el of candidates) {
    if (el && (isFocusable(el) || (el.getAttribute?.('tabindex') === '-1' && el.isConnected && el.getClientRects().length > 0))) {
      el.focus();
      if (document.activeElement === el) return el;
    }
  }
  return null;
}

/**
 * Return focus after a tool closes: the element that opened it, else the
 * bindings modal (or the first focusable inside it).
 */
export function restoreFocusAfterClose(opener) {
  const bindings = document.querySelector('.bm-overlay .bm-modal');
  return focusFirst(opener, bindings, ...(bindings ? focusableIn(bindings) : []));
}
