import { getKeyLabel } from '../input/key-names.js';
import { injectStyles } from './styles.js';
import { getGamepadLabel } from '../input/gamepad-profiles.js';

/**
 * Controls the key binding modal UI.
 *
 * Lifecycle:
 *   mount(container) → creates DOM, subscribes to store changes
 *   open() / close() / toggle() → show/hide
 *   unmount() → removes DOM, unsubscribes
 *
 * Capture flow:
 *   User clicks a bind button → _startCapture(actionId, slot, buttonEl)
 *   KeyboardRuntime intercepts next keydown and calls back with code or null
 *   On code → store.set(), re-render with possible conflict warning
 *   On null (Escape) → cancel, re-render
 */
export class ModalController {
  /**
   * @param {import('../core/binding-store.js').BindingStore} bindingStore
   * @param {import('../core/action-registry.js').ActionRegistry} registry
   * @param {import('../input/keyboard-runtime.js').KeyboardRuntime} keyboardRuntime
   */
  constructor(bindingStore, registry, keyboardRuntime, gamepadRuntime = null) {
    this._store = bindingStore;
    this._registry = registry;
    this._runtime = keyboardRuntime;
  this._gamepadRuntime = gamepadRuntime;

    this._container = null;
    this._overlay = null;
    this._open = false;
    /** @type {{ actionId: string, slot: number, device: string, buttonEl: HTMLElement } | null} */
    this._captureTarget = null;
    this._warningTimeout = null;
    this._unsubscribeStore = null;
    this._onGamepadChange = null;
  }

  /** @param {HTMLElement} container */
  mount(container) {
    injectStyles();
    this._container = container;

    this._overlay = document.createElement('div');
    this._overlay.className = 'bm-overlay';
    this._overlay.setAttribute('role', 'dialog');
    this._overlay.setAttribute('aria-modal', 'true');
    this._overlay.setAttribute('aria-label', 'Key Bindings');
    this._overlay.style.display = 'none';

    // Click on the backdrop (not the modal itself) closes the modal
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) this.close();
    });

    this._overlay.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (!this._captureTarget) {
          this.close();
        } else if (this._captureTarget.device === 'gamepad') {
          // Keyboard Escape cancels an in-progress gamepad capture
          this._gamepadRuntime?.cancelCapture();
        }
        // For keyboard captures, Escape is handled inside KeyboardRuntime.startCapture
      }
    });


    container.appendChild(this._overlay);
    this._render();

    // Re-render when any binding changes while modal is open
    this._unsubscribeStore = this._store.subscribe(() => {
      if (this._open) this._updateBindButtons();  // lightweight, avoids full DOM teardown

        // Update button labels when a controller connects/disconnects
        this._onGamepadChange = () => { if (this._open) this._updateBindButtons(); };
        if (typeof window !== 'undefined') {
          window.addEventListener('bm-gamepad-connected',    this._onGamepadChange);
          window.addEventListener('bm-gamepad-disconnected', this._onGamepadChange);
        }
    });
  }

  unmount() {
    this._unsubscribeStore?.();
    clearTimeout(this._warningTimeout);
    this._overlay?.remove();
        if (this._onGamepadChange && typeof window !== 'undefined') {
          window.removeEventListener('bm-gamepad-connected',    this._onGamepadChange);
          window.removeEventListener('bm-gamepad-disconnected', this._onGamepadChange);
        }
    this._overlay = null;
    this._container = null;
  }

  open() {
    if (!this._overlay) return;
    this._render();
    this._overlay.style.display = 'flex';
    this._open = true;
    this._runtime.setGameplaySuppressed(true);
      this._gamepadRuntime?.setGameplaySuppressed(true);
    // Focus the modal so Escape works without a mouse click first
    this._overlay.querySelector('.bm-modal')?.focus();
  }

  close() {
    if (!this._overlay) return;
    this._cancelCapture();
    this._overlay.style.display = 'none';
    this._open = false;
    this._runtime.setGameplaySuppressed(false);
    this._gamepadRuntime?.setGameplaySuppressed(false);
  }

  toggle() {
    if (this._open) this.close(); else this.open();
  }

  isOpen() {
    return this._open;
  }

  /**
   * Full re-render of modal content (called on open, action registration, reset).
   * @public - intentionally accessible from bind-manager.js
   */
  refresh() {
    this._render();
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  _render() {
    if (!this._overlay) return;
    const groups = this._registry.getGroups();
    this._overlay.innerHTML = `
      <div class="bm-modal" tabindex="-1">
        <div class="bm-modal-header">
          <h2 class="bm-modal-title">Key Bindings</h2>
          <button class="bm-close-btn" aria-label="Close">✕</button>
        </div>
        <div class="bm-modal-body">
          ${this._renderGroups(groups)}
        </div>
        <div class="bm-modal-footer">
          <div class="bm-conflict-warning bm-hidden" role="alert"></div>
          <button class="bm-reset-all-btn">Reset All</button>
        </div>
      </div>
    `;

    this._overlay.querySelector('.bm-close-btn')
      .addEventListener('click', () => this.close());

    this._overlay.querySelector('.bm-reset-all-btn')
      .addEventListener('click', () => {
        if (this._captureTarget) return;
        this._store.resetAll();
        this._render();
      });

    for (const btn of this._overlay.querySelectorAll('.bm-bind-btn')) {
      btn.addEventListener('click', () => {
        if (this._captureTarget) return;
        const { actionId, slot, device } = btn.dataset;
        this._startCapture(actionId, parseInt(slot, 10), btn, device || 'keyboard');
      });
    }

    for (const btn of this._overlay.querySelectorAll('.bm-clear-slot-btn')) {
      btn.addEventListener('click', () => {
        if (this._captureTarget) return;
        const { actionId, slot, device } = btn.dataset;
        this._store.clear(actionId, parseInt(slot, 10), device || 'keyboard');
        this._updateBindButtons();
      });
    }

    for (const btn of this._overlay.querySelectorAll('.bm-action-reset-btn')) {
      btn.addEventListener('click', () => {
        if (this._captureTarget) return;
        this._store.reset(btn.dataset.actionId);
        this._render();
      });
    }
    // Restore capture highlight if mid-capture when render was forced
    if (this._captureTarget) {
      const { actionId, slot, device } = this._captureTarget;
      const btn = this._overlay.querySelector(
        `.bm-bind-btn[data-action-id="${CSS.escape(actionId)}"][data-slot="${slot}"][data-device="${device || 'keyboard'}"]`
      );
      if (btn) {
        btn.classList.add('bm-capturing');
        btn.textContent = device === 'gamepad' ? 'Press a button…' : 'Press a key…';
        this._captureTarget.buttonEl = btn;
      }
      this._setCaptureUiState(true, btn);
    }
  }

  /** Lightweight update that only rewrites button labels — avoids full DOM teardown. */
  _updateBindButtons() {
    if (!this._overlay) return;
    for (const btn of this._overlay.querySelectorAll('.bm-bind-btn')) {
      const { actionId, slot, device } = btn.dataset;
      // Don't touch the button currently being captured
      if (this._captureTarget?.actionId === actionId &&
          this._captureTarget?.slot === parseInt(slot, 10) &&
          this._captureTarget?.device === device) continue;

      const bindings = this._store.get(actionId, device || 'keyboard');
      const code = bindings?.[parseInt(slot, 10)] ?? null;
      btn.textContent = code
        ? (device === 'gamepad' ? this._getGamepadLabel(code) : getKeyLabel(code))
        : '—';
      btn.classList.toggle('bm-unbound', !code);
    }
  }

  _renderGroups(groups) {
    if (groups.size === 0) {
      return '<p style="padding:20px;color:var(--bm-text-desc);text-align:center">No actions registered yet.</p>';
    }
    return [...groups.entries()]
      .map(([name, actions]) => `
        <div class="bm-group">
          <div class="bm-group-title">${_esc(name)}</div>
          ${actions.map(a => this._renderAction(a)).join('')}
        </div>
      `).join('');
  }

  _renderAction(action) {
    const kbBindings = this._store.get(action.id, 'keyboard') ?? [];
    const gpBindings = this._store.get(action.id, 'gamepad')  ?? [];

    const kbSlots = Array.from({ length: action.slots }, (_, i) => {
      const code  = kbBindings[i] ?? null;
      const label = code ? getKeyLabel(code) : '—';
      const cls   = code ? 'bm-bind-btn' : 'bm-bind-btn bm-unbound';
      return `
        <div class="bm-slot">
          <button class="${cls}" data-action-id="${_esc(action.id)}" data-slot="${i}" data-device="keyboard" title="Click to rebind">${_esc(label)}</button>
          <button class="bm-clear-slot-btn" data-action-id="${_esc(action.id)}" data-slot="${i}" data-device="keyboard" title="Clear" aria-label="Clear keyboard binding">×</button>
        </div>`;
    });

    const gpSlots = Array.from({ length: action.gamepadSlots }, (_, i) => {
      const code  = gpBindings[i] ?? null;
      const label = code ? this._getGamepadLabel(code) : '—';
      const cls   = code ? 'bm-bind-btn' : 'bm-bind-btn bm-unbound';
      return `
        <div class="bm-slot">
          <button class="${cls}" data-action-id="${_esc(action.id)}" data-slot="${i}" data-device="gamepad" title="Click to rebind">${_esc(label)}</button>
          <button class="bm-clear-slot-btn" data-action-id="${_esc(action.id)}" data-slot="${i}" data-device="gamepad" title="Clear" aria-label="Clear gamepad binding">×</button>
        </div>`;
    });

    return `
      <div class="bm-action-row">
        <div class="bm-action-info">
          <div class="bm-action-label">${_esc(action.label)}</div>
          ${action.description ? `<div class="bm-action-desc">${_esc(action.description)}</div>` : ''}
        </div>
        <div class="bm-action-controls">
          <div class="bm-device-rows">
            <div class="bm-device-row">
              <span class="bm-device-badge bm-device-kbd" title="Keyboard">⌨</span>
              <div class="bm-bind-slots">${kbSlots.join('')}</div>
            </div>
            <div class="bm-device-row">
              <span class="bm-device-badge bm-device-gp" title="Gamepad">⊕</span>
              <div class="bm-bind-slots">${gpSlots.join('')}</div>
            </div>
          </div>
          <button class="bm-action-reset-btn" data-action-id="${_esc(action.id)}" title="Reset to default">↺</button>
        </div>
      </div>`;
  }

  _startCapture(actionId, slot, buttonEl, device = 'keyboard') {
    if (this._captureTarget) return;
    this._captureTarget = { actionId, slot, device, buttonEl };
    this._setCaptureUiState(true, buttonEl);
    buttonEl.classList.add('bm-capturing');

    if (device === 'gamepad') {
      buttonEl.textContent = 'Press a button…';
      // Guard: no controller connected
      const connected = this._gamepadRuntime?.getConnectedGamepads() ?? [];
      if (!this._gamepadRuntime || connected.length === 0) {
        this._captureTarget = null;
        this._setCaptureUiState(false, null);
        buttonEl.classList.remove('bm-capturing');
        this._updateBindButtons();
        this._showWarning('No controller detected. Plug in a gamepad and try again.');
        return;
      }
      this._gamepadRuntime.startCapture((code) => {
        this._captureTarget = null;
        this._setCaptureUiState(false, null);
        if (code === null) { this._updateBindButtons(); return; }
        const result = this._store.set(actionId, slot, code, 'gamepad');
        if (result.conflicts.length > 0) {
          this._showConflictWarning(result.conflicts, code, 'gamepad');
        } else {
          this._hideConflictWarning();
        }
        this._updateBindButtons();
      });
    } else {
      buttonEl.textContent = 'Press a key…';
      this._runtime.startCapture((code) => {
        this._captureTarget = null;
        this._setCaptureUiState(false, null);
        if (code === null) { this._updateBindButtons(); return; }
        const result = this._store.set(actionId, slot, code, 'keyboard');
        if (result.conflicts.length > 0) {
          this._showConflictWarning(result.conflicts, code, 'keyboard');
        } else {
          this._hideConflictWarning();
        }
        this._updateBindButtons();
      });
    }
  }

  _cancelCapture() {
    if (this._captureTarget) {
      if (this._captureTarget.device === 'gamepad') {
        this._gamepadRuntime?.cancelCapture();
      } else {
        this._runtime.cancelCapture();
      }
      this._captureTarget = null;
      this._setCaptureUiState(false, null);
      this._updateBindButtons();
    }
  }

  _setCaptureUiState(capturing, activeButton) {
    if (!this._overlay) return;
    for (const btn of this._overlay.querySelectorAll('.bm-bind-btn')) {
      const isActive = activeButton != null && btn === activeButton;
      btn.disabled = capturing && !isActive;
      if (!capturing) btn.classList.remove('bm-capturing');
    }
    for (const btn of this._overlay.querySelectorAll('.bm-clear-slot-btn')) {
      btn.disabled = capturing;
    }
    for (const btn of this._overlay.querySelectorAll('.bm-action-reset-btn')) {
      btn.disabled = capturing;
    }
    const resetAllBtn = this._overlay.querySelector('.bm-reset-all-btn');
    if (resetAllBtn) resetAllBtn.disabled = capturing;
  }

  _showConflictWarning(conflicts, code, device = 'keyboard') {
    const warningEl = this._overlay?.querySelector('.bm-conflict-warning');
    if (!warningEl) return;
    const names = conflicts.map(c => {
      const action = this._registry.get(c.actionId);
      return action ? `"${action.label}"` : c.actionId;
    });
    const label = device === 'gamepad' ? this._getGamepadLabel(code) : getKeyLabel(code);
    warningEl.textContent = `${label} is also bound to ${names.join(', ')} — both will be active.`;
    warningEl.classList.remove('bm-hidden');
    clearTimeout(this._warningTimeout);
    this._warningTimeout = setTimeout(() => warningEl.classList.add('bm-hidden'), 5000);
  }

  _showWarning(message) {
    const warningEl = this._overlay?.querySelector('.bm-conflict-warning');
    if (!warningEl) return;
    warningEl.textContent = message;
    warningEl.classList.remove('bm-hidden');
    clearTimeout(this._warningTimeout);
    this._warningTimeout = setTimeout(() => warningEl.classList.add('bm-hidden'), 4000);
  }

  _getGamepadLabel(code) {
    const profile = this._gamepadRuntime ? this._gamepadRuntime.getActiveProfile() : 'generic';
    return getGamepadLabel(code, profile);
  }

  _hideConflictWarning() {
    clearTimeout(this._warningTimeout);
    this._overlay?.querySelector('.bm-conflict-warning')?.classList.add('bm-hidden');
  }
}

/** XSS-safe HTML escaping for inline string interpolation. */
function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
