import { injectStyles } from './styles.js';

/**
 * Lightweight blocking modal used while an input capture is in progress.
 * It sits above the bindings modal and exposes a minimal imperative API.
 */
export class CaptureModalController {
  constructor() {
    this._container = null;
    this._overlay = null;
    this._titleEl = null;
    this._messageEl = null;
    this._detailEl = null;
    this._cancelBtn = null;
    this._open = false;
    this._onCancel = null;
    this._returnFocusEl = null;
    /** Removes the one-shot click shield armed by a cancel on pointerdown. */
    this._releaseClickShield = null;

    this._handleOverlayKeydown = this._handleOverlayKeydown.bind(this);
    this._handleCancelClick = this._handleCancelClick.bind(this);
    this._handleContextMenu = this._handleContextMenu.bind(this);
    this._handleAuxClick = this._handleAuxClick.bind(this);
  }

  /** @param {HTMLElement} container */
  mount(container) {
    if (this._overlay) return;
    injectStyles();
    this._container = container;

    this._overlay = document.createElement('div');
    this._overlay.className = 'bm-capture-overlay';
    this._overlay.setAttribute('aria-hidden', 'true');
    this._overlay.style.display = 'none';
    this._overlay.innerHTML = `
      <div class="bm-capture-modal" role="dialog" aria-modal="true" aria-label="Capture Input" tabindex="-1">
        <div class="bm-capture-header">
          <h3 class="bm-capture-title">Capture Input</h3>
          <button class="bm-capture-cancel-btn" type="button">Cancel</button>
        </div>
        <div class="bm-capture-message">Press the input to bind now.</div>
        <div class="bm-capture-detail">Press Escape to cancel.</div>
      </div>
    `;

    this._titleEl = this._overlay.querySelector('.bm-capture-title');
    this._messageEl = this._overlay.querySelector('.bm-capture-message');
    this._detailEl = this._overlay.querySelector('.bm-capture-detail');
    this._cancelBtn = this._overlay.querySelector('.bm-capture-cancel-btn');

    this._overlay.addEventListener('keydown', this._handleOverlayKeydown);
    this._cancelBtn?.addEventListener('pointerdown', this._handleCancelClick);
    this._cancelBtn?.addEventListener('click', this._handleCancelClick);

    container.appendChild(this._overlay);
  }

  unmount() {
    this.close({ restoreFocus: false });
    this._releaseClickShield?.();
    this._cancelBtn?.removeEventListener('pointerdown', this._handleCancelClick);
    this._cancelBtn?.removeEventListener('click', this._handleCancelClick);
    this._overlay?.removeEventListener('keydown', this._handleOverlayKeydown);
    window.removeEventListener('contextmenu', this._handleContextMenu, true);
    window.removeEventListener('auxclick', this._handleAuxClick, true);
    this._overlay?.remove();
    this._overlay = null;
    this._container = null;
    this._titleEl = null;
    this._messageEl = null;
    this._detailEl = null;
    this._cancelBtn = null;
  }

  open(options = {}) {
    if (!this._overlay) return;
    this._returnFocusEl = /** @type {HTMLElement | null} */ (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    this._open = true;
    this._onCancel = typeof options.onCancel === 'function' ? options.onCancel : null;
    this.update(options);
    this._overlay.style.display = 'flex';
    this._overlay.setAttribute('aria-hidden', 'false');
    // Suppress right-click, middle-click, and other mouse defaults while capture is active
    window.addEventListener('contextmenu', this._handleContextMenu, true);
    window.addEventListener('auxclick', this._handleAuxClick, true);
    this._overlay.querySelector('.bm-capture-modal')?.focus();
  }

  update(options = {}) {
    if (!this._overlay) return;
    if (typeof options.title === 'string' && this._titleEl) this._titleEl.textContent = options.title;
    if (typeof options.message === 'string' && this._messageEl) this._messageEl.textContent = options.message;
    if (this._detailEl) {
      const detail = typeof options.detail === 'string' ? options.detail.trim() : '';
      this._detailEl.textContent = detail || 'Press Escape to cancel.';
      this._detailEl.hidden = detail.length === 0;
    }
    if (typeof options.cancelLabel === 'string' && this._cancelBtn) {
      this._cancelBtn.textContent = options.cancelLabel;
    }
  }

  close(options = {}) {
    if (!this._overlay) return;
    this._open = false;
    this._onCancel = null;
    // Defer removal so handlers survive the mouseup → contextmenu event gap
    const ctxHandler = this._handleContextMenu;
    const auxHandler = this._handleAuxClick;
    setTimeout(() => {
      window.removeEventListener('contextmenu', ctxHandler, true);
      window.removeEventListener('auxclick', auxHandler, true);
    }, 0);
    this._overlay.style.display = 'none';
    this._overlay.setAttribute('aria-hidden', 'true');
    if (options.restoreFocus !== false && this._returnFocusEl?.isConnected) {
      this._returnFocusEl.focus();
    }
    this._returnFocusEl = null;
  }

  isOpen() {
    return this._open;
  }

  _handleContextMenu(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  _handleAuxClick(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  _handleOverlayKeydown(event) {
    if (event.key === 'Tab') {
      // Focus stays in the capture dialog. No stopPropagation: during keyboard
      // capture the runtime still receives Tab as a bindable key.
      event.preventDefault();
      this._cancelBtn?.focus();
      return;
    }
    if (event.code !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    this._onCancel?.();
  }

  _handleCancelClick(event) {
    // Pointer users cancel on pointerdown; keyboard activation arrives as a click with detail 0
    if (event?.type === 'click' && event.detail !== 0) return;
    // The dialog hides on pointerdown. Suppressing the compatibility mousedown keeps it from
    // landing on whatever is underneath, which would blur the focus restored to the bindings
    // modal, and from being recorded by a mouse capture.
    if (event?.type === 'pointerdown') {
      if (event.cancelable) event.preventDefault();
      // Touch and pen still produce a click at the tap point, which now lies on the bindings modal
      this._shieldNextClick(event.pointerId);
    }
    // The owner learns that a pointer ended the capture (a second, fast tap is
    // a real tap on what lies underneath, see ModalController).
    const pointer = event?.type === 'pointerdown';
    this._onCancel?.({ pointer, rect: pointer ? this._cancelBtn?.getBoundingClientRect() ?? null : null });
  }

  /**
   * Swallow exactly the click that belongs to the cancelling pointer interaction,
   * in the capture phase, so it never reaches what was under the dialog. The
   * shield ends at that click, at the next pointerdown (a new interaction, whose
   * click is the user's), shortly after the pointer is released, or after a
   * safety timeout.
   */
  _shieldNextClick(pointerId) {
    this._releaseClickShield?.();
    const RELEASE_AFTER_UP_MS = 500;
    const SAFETY_MS = 5000;
    let timer = null;
    const release = () => {
      clearTimeout(timer);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('pointerdown', release, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      if (this._releaseClickShield === release) this._releaseClickShield = null;
    };
    const onClick = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      release();
    };
    const onUp = (event) => {
      if (pointerId != null && event.pointerId !== pointerId) return;
      clearTimeout(timer);
      timer = setTimeout(release, RELEASE_AFTER_UP_MS);
    };
    timer = setTimeout(release, SAFETY_MS);
    window.addEventListener('click', onClick, true);
    window.addEventListener('pointerdown', release, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    this._releaseClickShield = release;
  }
}