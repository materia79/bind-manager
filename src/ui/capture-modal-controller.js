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

    this._handleOverlayKeydown = this._handleOverlayKeydown.bind(this);
    this._handleCancelClick = this._handleCancelClick.bind(this);
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
    this._cancelBtn?.addEventListener('click', this._handleCancelClick);

    container.appendChild(this._overlay);
  }

  unmount() {
    this.close({ restoreFocus: false });
    this._cancelBtn?.removeEventListener('click', this._handleCancelClick);
    this._overlay?.removeEventListener('keydown', this._handleOverlayKeydown);
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

  _handleOverlayKeydown(event) {
    if (event.code !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    this._onCancel?.();
  }

  _handleCancelClick() {
    this._onCancel?.();
  }
}