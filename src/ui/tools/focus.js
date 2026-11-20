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

// ---- Open dialog stack ------------------------------------------------------

/** @type {{ panel: HTMLElement, onEscape: () => void }[]} open tool dialogs, topmost last */
const openDialogs = [];

/**
 * Escape and Tab for the topmost open tool dialog, whatever holds focus (a
 * control that just disabled itself, <body>, ...). Capture phase on window,
 * so the keys never reach a dialog underneath (the bindings modal).
 */
function onDialogKeydown(ev) {
  const top = openDialogs[openDialogs.length - 1];
  if (!top) return;
  if (ev.key === 'Tab') {
    ev.stopPropagation();
    trapTab(top.panel, ev);
  } else if (ev.code === 'Escape' || ev.key === 'Escape') {
    ev.preventDefault();
    ev.stopPropagation();
    top.onEscape();
  }
}

/**
 * Register an open tool dialog. While it is the topmost one, Escape calls
 * `onEscape` and Tab stays inside `panel`. Returns the function that
 * unregisters it (call it on close).
 * @param {HTMLElement} panel
 * @param {() => void} onEscape
 * @returns {() => void}
 */
export function pushDialog(panel, onEscape) {
  const entry = { panel, onEscape };
  if (openDialogs.length === 0) window.addEventListener('keydown', onDialogKeydown, true);
  openDialogs.push(entry);
  return () => {
    const i = openDialogs.indexOf(entry);
    if (i < 0) return;
    openDialogs.splice(i, 1);
    if (openDialogs.length === 0) window.removeEventListener('keydown', onDialogKeydown, true);
  };
}

/**
 * Focus never rests on <body> or on a control that can no longer take it:
 * move it to `panel` then. Focus elsewhere (another dialog) is left alone.
 * @param {HTMLElement} panel
 */
export function keepFocusInPanel(panel) {
  const active = document.activeElement;
  if (active && active !== document.body && !panel.contains(active)) return;
  if (active && active !== document.body && (active === panel || isFocusable(active))) return;
  panel.focus({ preventScroll: true });
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
