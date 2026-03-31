import { getKeyLabel } from '../input/key-names.js';
import { injectStyles } from './styles.js';
import { getGamepadLabel } from '../input/gamepad-profiles.js';

/**
 * Manages the bottom-of-screen key hint overlay.
 *
 * Each registered action starts with its hint hidden.
 * Show/hide is controlled either per-action via the handle returned
 * from registerAction(), or in bulk via manager.showAllHints() / hideAllHints().
 *
 * The bar is pointer-events:none so it never blocks clicks on game canvases.
 * It re-renders whenever a binding changes (e.g. W → Up Arrow) so displayed
 * key labels automatically stay in sync.
 */
export class HintsController {
  /**
   * @param {import('../core/binding-store.js').BindingStore} bindingStore
   * @param {import('../core/action-registry.js').ActionRegistry} registry
   */
  constructor(bindingStore, registry, gamepadRuntime = null) {
    this._store = bindingStore;
    this._registry = registry;
      this._gamepadRuntime = gamepadRuntime;
    this._bar = null;
    /** @type {Set<string>} action ids that should currently be visible */
    this._visible = new Set();
    this._unsubscribeStore = null;
    this._onGamepadChange = null;
  }

  /** @param {HTMLElement} container */
  mount(container) {
    injectStyles();
    this._bar = document.createElement('div');
    this._bar.className = 'bm-hints';
    this._bar.style.display = 'none';
    container.appendChild(this._bar);

    this._unsubscribeStore = this._store.subscribe(() => this._render());

      this._onGamepadChange = () => this._render();
      if (typeof window !== 'undefined') {
        window.addEventListener('bm-gamepad-connected',    this._onGamepadChange);
        window.addEventListener('bm-gamepad-disconnected', this._onGamepadChange);
      }
  }

  unmount() {
    this._unsubscribeStore?.();
    this._bar?.remove();
        if (this._onGamepadChange && typeof window !== 'undefined') {
          window.removeEventListener('bm-gamepad-connected',    this._onGamepadChange);
          window.removeEventListener('bm-gamepad-disconnected', this._onGamepadChange);
        }
    this._bar = null;
  }

  /** Make a single action's hint visible. */
  show(actionId) {
    this._visible.add(actionId);
    this._render();
  }

  /** Hide a single action's hint. */
  hide(actionId) {
    this._visible.delete(actionId);
    this._render();
  }

  /**
   * Set visibility of a single action's hint.
   * @param {string} actionId
   * @param {boolean} visible
   */
  setVisible(actionId, visible) {
    if (visible) this.show(actionId); else this.hide(actionId);
  }

  /** Show hints for all registered actions. */
  showAll() {
    for (const action of this._registry.getAll()) {
      this._visible.add(action.id);
    }
    this._render();
  }

  /** Hide all hints. */
  hideAll() {
    this._visible.clear();
    this._render();
  }

  /**
   * Force a full re-render (called after new actions are registered).
   * @public
   */
  refresh() {
    this._render();
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  _render() {
    if (!this._bar) return;
    const items = [];

    for (const actionId of this._visible) {
      const action = this._registry.get(actionId);
      if (!action) continue;

      const kbBindings = this._store.get(actionId, 'keyboard') ?? [];
      const gpBindings = this._store.get(actionId, 'gamepad')  ?? [];

      const kbKeys = kbBindings.filter(Boolean).map(getKeyLabel);
      const profile = this._gamepadRuntime?.getActiveProfile() ?? 'generic';
      const gpKeys = gpBindings.filter(Boolean).map(code => getGamepadLabel(code, profile));

      if (kbKeys.length === 0 && gpKeys.length === 0) continue;

      const kbHtml = kbKeys
        .map(k => `<kbd class="bm-hint-key">${_esc(k)}</kbd>`)
        .join('<span class="bm-hint-sep">/</span>');
      const gpHtml = gpKeys
        .map(k => `<kbd class="bm-hint-key bm-hint-gp-key">${_esc(k)}</kbd>`)
        .join('<span class="bm-hint-sep">/</span>');

      const keysHtml = [kbHtml, gpHtml].filter(Boolean).join('<span class="bm-hint-sep">·</span>');

      items.push(`
        <div class="bm-hint-item">
          <span class="bm-hint-keys">${keysHtml}</span>
          <span class="bm-hint-label">${_esc(action.label)}</span>
        </div>
      `);
    }

    this._bar.innerHTML = items.join('');
    this._bar.style.display = items.length > 0 ? 'flex' : 'none';
  }
}

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
