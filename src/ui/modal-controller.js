import { getKeyLabel } from '../input/key-names.js';
import { getReservedInfo } from '../input/reserved-codes.js';
import { injectStyles } from './styles.js';
import { getGamepadLabel } from '../input/gamepad-profiles.js';
import { gamepadDeviceName, profileChip, ignoredOverrideNote } from './profile-display.js';

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
  constructor(bindingStore, registry, keyboardRuntime, gamepadRuntime = null, captureModal = null, footerActions = [], mouseRuntime = null, options = {}) {
    /** Warn when a captured key is one the browser or OS keeps for itself. */
    this._reservedKeyWarnings = options.reservedKeyWarnings !== false;
    /** @type {() => { guard?: import('../input/reserved-codes.js').ReservedGuardState | null, platform?: import('../input/reserved-codes.js').ReservedPlatform }} the guard's state and the platform */
    this._reservedContext = typeof options.reservedContext === 'function' ? options.reservedContext : () => ({});
    /** The search field above the list; false leaves the modal as it was before 0.2.2. */
    this._bindSearch = options.bindSearch !== false;
    /** Text in the search field; kept across re-renders, cleared on close(). */
    this._searchText = '';
    /** Body scroll position when the filter became active, restored when it is cleared. */
    this._scrollBeforeSearch = 0;
    /** Group headers fold their rows; false leaves the plain group titles of 0.2.1. */
    this._groupFolding = options.groupFolding !== false;
    /** The host's groups that start folded (a remembered choice of the player wins). */
    this._defaultCollapsed = new Set(Array.isArray(options.collapsedGroups) ? options.collapsedGroups.filter((name) => typeof name === 'string') : []);
    /** @type {{ load?: () => unknown, save?: (groups: [string, boolean][]) => void } | null} where the player's choices persist */
    this._foldStore = options.foldStore ?? null;
    /** @type {Map<string, boolean>} the player's choices: group name → folded */
    this._foldChoices = this._groupFolding ? _readFoldChoices(this._foldStore) : new Map();
    /** @type {Map<string, boolean>} folds made during the current search only */
    this._searchFolds = new Map();
    /** Unique per controller, for the ids aria-controls points at. */
    this._uid = ++_controllerCount;
    this._store = bindingStore;
    this._registry = registry;
    this._runtime = keyboardRuntime;
  this._gamepadRuntime = gamepadRuntime;
    this._mouseRuntime = mouseRuntime;
    this._captureModal = captureModal;
    this._footerActions = Array.isArray(footerActions) ? footerActions : [];

    this._container = null;
    this._overlay = null;
    this._open = false;
    /** Element focused before open(); focus returns there on close(). */
    this._returnFocusEl = null;
    /** Body scroll position at close(), restored on the next open(). */
    this._savedScrollTop = 0;
    /** Widest slot counts over all actions, for the layout decision. */
    this._slotCounts = { kb: 1, gp: 1 };
    this._resizeObserver = null;
    /** @type {{ actionId: string, slot: number, device: string, buttonEl: HTMLElement } | null} */
    this._captureTarget = null;
    this._warningTimeout = null;
    /** After a capture is cancelled by pointer: until when, and over which area (the Cancel button), taps are ignored. */
    this._pointerGuard = { until: 0, rect: null };
    this._unsubscribeStore = null;
    this._onGamepadChange = null;

    // Bound handlers for blocking mouse defaults while modal is open
    this._handleBlockMouseDown = this._handleBlockMouseDown.bind(this);
    this._handleBlockContextMenu = this._handleBlockContextMenu.bind(this);
    this._handleBlockAuxClick = this._handleBlockAuxClick.bind(this);
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

    // Delegated listeners survive re-renders. Click on the backdrop (not the modal itself) closes the modal
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) {
        this.close();
        return;
      }
      const btn = e.target instanceof Element ? e.target.closest('button') : null;
      if (btn && this._overlay.contains(btn)) this._handleButtonClick(btn, e);
    });

    this._overlay.addEventListener('change', (e) => {
      if (e.target instanceof Element && e.target.matches('.bm-profile-select')) {
        this._handleProfileSelectChange(/** @type {HTMLSelectElement} */ (e.target));
      }
    });

    this._overlay.addEventListener('input', (e) => {
      if (e.target instanceof HTMLInputElement && e.target.matches('.bm-search-input')) this._setSearchText(e.target.value);
    });

    // Only the list scrolls. The box is overflow: clip (never scrolls); where
    // clip is unknown (Safari before 16) it is overflow: hidden, which code can
    // still scroll (scrollIntoView, focus()): put it back, the list keeps its part.
    // Scroll events do not bubble, so this listens in the capture phase.
    this._overlay.addEventListener('scroll', (e) => {
      const box = e.target;
      if (box instanceof HTMLElement && box.classList.contains('bm-modal') && (box.scrollTop !== 0 || box.scrollLeft !== 0)) {
        box.scrollTop = 0;
        box.scrollLeft = 0;
      }
    }, true);

    this._overlay.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        const input = this._searchInput();
        if (this._captureTarget) {
          e.preventDefault();
          e.stopPropagation();
          this._cancelCapture();
        } else if (input && e.target === input && _isComposing(e)) {
          // This Escape cancels an IME composition: the input method's, not ours
        } else if (input && input.value !== '' && (e.target === input || e.target === this._overlay.querySelector('.bm-search-clear'))) {
          // First Escape in the search row empties the field (focus goes to it), the next one closes the modal
          e.preventDefault();
          e.stopPropagation();
          this._setSearchText('');
          if (e.target !== input) input.focus({ preventScroll: true });
        } else {
          // The Escape that closes the modal is used up here: once closed, gameplay is
          // live again, and the key must not reach an action bound to Escape on window
          e.stopPropagation();
          this.close();
        }
      } else if (e.key === 'Tab') {
        this._trapTab(e);
      }
    });

    container.appendChild(this._overlay);
    // Re-evaluate the row layout whenever the modal body changes size (viewport, host CSS)
    if (typeof ResizeObserver === 'function') {
      this._resizeObserver = new ResizeObserver(() => this._updateLayout());
    }
    this._render();

    // Re-render when any binding changes while modal is open
    this._unsubscribeStore = this._store.subscribe(() => {
      if (this._open) this._updateBindButtons();  // lightweight, avoids full DOM teardown
    });

      // Update button labels and the profile line when a controller connects/disconnects
      this._onGamepadChange = () => {
        if (!this._open) return;
        this._updateBindButtons();
        this._updateProfilePanel();
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('bm-gamepad-connected',    this._onGamepadChange);
        window.addEventListener('bm-gamepad-disconnected', this._onGamepadChange);
        window.addEventListener('bm-gamepad-profile-changed', this._onGamepadChange);
      }
  }

  unmount() {
    this._unsubscribeStore?.();
    clearTimeout(this._warningTimeout);
    // Ensure mouse-blocking handlers are removed
    window.removeEventListener('mousedown', this._handleBlockMouseDown, true);
    window.removeEventListener('contextmenu', this._handleBlockContextMenu, true);
    window.removeEventListener('auxclick', this._handleBlockAuxClick, true);
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._overlay?.remove();
        if (this._onGamepadChange && typeof window !== 'undefined') {
          window.removeEventListener('bm-gamepad-connected',    this._onGamepadChange);
          window.removeEventListener('bm-gamepad-disconnected', this._onGamepadChange);
          window.removeEventListener('bm-gamepad-profile-changed', this._onGamepadChange);
        }
    this._onGamepadChange = null;
    this._overlay = null;
    this._container = null;
  }

  open() {
    // Already open: keep focus, scroll and content as they are
    if (!this._overlay || this._open) return;
    const active = document.activeElement;
    this._returnFocusEl = active instanceof HTMLElement && active !== document.body && !this._overlay.contains(active)
      ? active
      : null;
    this._render();
    this._overlay.style.display = 'flex';
    this._updateLayout();
    const body = this._overlay.querySelector('.bm-modal-body');
    if (body) body.scrollTop = this._savedScrollTop;
    this._open = true;
    this._runtime.setGameplaySuppressed(true);
      this._gamepadRuntime?.setGameplaySuppressed(true);
      this._mouseRuntime?.setGameplaySuppressed(true);
    // Block all mouse defaults (context menu, back/forward thumb buttons, etc.)
    window.addEventListener('mousedown', this._handleBlockMouseDown, true);
    window.addEventListener('contextmenu', this._handleBlockContextMenu, true);
    window.addEventListener('auxclick', this._handleBlockAuxClick, true);
    // Focus the modal so Escape works without a mouse click first
    this._overlay.querySelector('.bm-modal')?.focus({ preventScroll: true });
  }

  close() {
    if (!this._overlay) return;
    this._cancelCapture();
    const wasOpen = this._open;
    if (wasOpen) {
      // A filtered list's scroll position means nothing in the full list: keep the one from before the search
      this._savedScrollTop = _searchWords(this._searchText).length > 0
        ? this._scrollBeforeSearch
        : this._overlay.querySelector('.bm-modal-body')?.scrollTop ?? 0;
    }
    this._searchFolds.clear();
    if (this._searchText !== '') {
      this._searchText = '';
      const input = this._searchInput();
      if (input) input.value = '';
      this._applySearch();
    }
    this._overlay.style.display = 'none';
    this._open = false;
    this._runtime.setGameplaySuppressed(false);
    this._gamepadRuntime?.setGameplaySuppressed(false);
    this._mouseRuntime?.setGameplaySuppressed(false);
    window.removeEventListener('mousedown', this._handleBlockMouseDown, true);
    window.removeEventListener('contextmenu', this._handleBlockContextMenu, true);
    window.removeEventListener('auxclick', this._handleBlockAuxClick, true);
    const returnEl = this._returnFocusEl;
    this._returnFocusEl = null;
    if (wasOpen && returnEl?.isConnected) returnEl.focus({ preventScroll: true });
  }

  toggle() {
    if (this._open) this.close(); else this.open();
  }

  isOpen() {
    return this._open;
  }

  /**
   * True when `event` types or edits text in the search field (a printable
   * character, Backspace, Delete, the arrows, Home or End, or any keystroke
   * of an IME composition). The manager's
   * debug toggle key ignores such events, so it can be a letter key.
   * @param {KeyboardEvent} event
   */
  isSearchTyping(event) {
    const input = this._searchInput();
    if (!input || event.target !== input) return false;
    // Every keystroke of an IME composition goes to the input method
    if (_isComposing(event)) return true;
    const key = event.key ?? '';
    if (TEXT_EDIT_KEYS.has(key)) return true;
    // A character; Ctrl or Cmd make it a shortcut, unless Ctrl comes from AltGr
    return [...key].length === 1 && !event.metaKey && (!event.ctrlKey || !!event.getModifierState?.('AltGraph'));
  }

  /**
   * Full re-render of modal content (called on open and action registration).
   * Keeps the body scroll position and re-focuses the equivalent element.
   * @public - intentionally accessible from bind-manager.js
   */
  refresh() {
    this._render();
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  _render() {
    if (!this._overlay) return;
    const focus = this._describeFocus();
    const scrollTop = this._overlay.querySelector('.bm-modal-body')?.scrollTop ?? 0;
    const groups = this._registry.getGroups();
    const actions = [...groups.values()].flat();
    const kbSlots = Math.max(1, ...actions.map((a) => a.slots));
    const gpSlots = Math.max(1, ...actions.map((a) => a.gamepadSlots));
    this._slotCounts = { kb: kbSlots, gp: gpSlots };
    // Until the first measurement, assume the default modal width; _updateLayout() corrects it
    const layout = _layoutFor(DEFAULT_BODY_WIDTH, kbSlots, gpSlots);
    this._overlay.innerHTML = `
      <div class="bm-modal bm-layout-${layout}" tabindex="-1" style="--bm-kb-slots: ${kbSlots}; --bm-gp-slots: ${gpSlots}">
        <span class="bm-u-probe" aria-hidden="true"></span>
        <div class="bm-modal-header">
          <h2 class="bm-modal-title">Key Bindings</h2>
          <button class="bm-close-btn" type="button" aria-label="Close">✕</button>
        </div>${this._renderSearch()}
        <div class="bm-modal-body">
          ${this._renderGamepadProfilePanel()}
          ${this._renderGroups(groups)}${this._bindSearch ? `
          <p class="bm-empty bm-search-empty" hidden></p>` : ''}
        </div>
        <div class="bm-modal-footer">
          <div class="bm-conflict-warning bm-hidden" role="alert"></div>
          <div class="bm-footer-actions">
            ${this._renderFooterActions()}
            <button class="bm-reset-all-btn" type="button">Reset All</button>
          </div>
        </div>
      </div>
    `;

    // Filter before the scroll position comes back; the row or group header that held the focus stays visible
    this._applySearch(focus?.actionId, focus?.role === 'bm-group-toggle' ? focus.group : null);
    const body = this._overlay.querySelector('.bm-modal-body');
    if (body) body.scrollTop = scrollTop;
    if (body && this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver.observe(body);
    }
    this._updateLayout();

    // Restore capture highlight if mid-capture when render was forced
    if (this._captureTarget) {
      const { actionId, slot, device } = this._captureTarget;
      const btn = this._overlay.querySelector(_slotSelector('bm-bind-btn', actionId, slot, device || 'keyboard'));
      if (btn) {
        btn.classList.add('bm-capturing');
        btn.textContent = device === 'gamepad' ? 'Press a button…' : 'Press a key or click…';
        this._captureTarget.buttonEl = btn;
      }
      this._setCaptureUiState(true, btn);
    }

    if (focus) this._restoreFocus(focus);
  }

  /** Delegated click handling for every button in the modal. */
  _handleButtonClick(btn, event = null) {
    const cls = btn.classList;
    if (cls.contains('bm-close-btn')) {
      this.close();
      return;
    }
    if (this._captureTarget) return;
    if (cls.contains('bm-search-clear')) {
      this._setSearchText('');
      this._searchInput()?.focus({ preventScroll: true });
      return;
    }
    // Just after a capture was cancelled by pointer, a second fast tap or click on
    // the Cancel button's spot lands on the slot that was under the dialog: ignore
    // it. Elsewhere, and keyboard activation (detail 0), pass.
    if ((cls.contains('bm-bind-btn') || cls.contains('bm-clear-slot-btn')) && this._isGuardedPointerClick(event)) return;

    if (cls.contains('bm-reset-all-btn')) {
      this._store.resetAll();
      this._hideConflictWarning();
      this._updateBindButtons();
    } else if (cls.contains('bm-action-reset-btn')) {
      this._store.reset(btn.dataset.actionId);
      this._hideConflictWarning();
      this._updateBindButtons();
    } else if (cls.contains('bm-group-toggle')) {
      this._toggleGroup(btn.dataset.group);
    } else if (cls.contains('bm-footer-action-btn')) {
      const id = btn.dataset.footerActionId;
      const action = this._footerActions.find((entry) => entry?.id === id);
      action?.onClick?.();
    } else if (cls.contains('bm-bind-btn')) {
      const { actionId, slot, device } = btn.dataset;
      this._startCapture(actionId, parseInt(slot, 10), btn, device || 'keyboard');
    } else if (cls.contains('bm-clear-slot-btn')) {
      const { actionId, slot, device } = btn.dataset;
      this._store.clear(actionId, parseInt(slot, 10), device || 'keyboard');
      this._updateBindButtons();
      // The clear button hides once its slot is empty; keep focus on the slot
      if (document.activeElement === btn && !_isFocusable(btn)) {
        btn.closest('.bm-slot')?.querySelector('.bm-bind-btn')?.focus({ preventScroll: true });
      }
    }
  }

  _handleProfileSelectChange(select) {
    const gamepadIndex = parseInt(select.dataset.gamepadIndex || '0', 10);
    const value = select.value;
    if (value === '__auto__') {
      this._gamepadRuntime?.clearProfileOverride(gamepadIndex);
    } else {
      this._gamepadRuntime?.setProfileOverride(gamepadIndex, _parseProfileOverrideValue(value));
    }
    // The runtime's profile-changed event updates both too; repeat for runtimes that do not emit it
    this._updateProfilePanel();
    this._updateBindButtons();
  }

  /** Keep Tab / Shift+Tab inside the modal. */
  _trapTab(event) {
    const modal = this._overlay?.querySelector('.bm-modal');
    if (!modal) return;
    const focusables = [...modal.querySelectorAll(FOCUSABLE)].filter(_isFocusable);
    if (focusables.length === 0) {
      event.preventDefault();
      modal.focus({ preventScroll: true });
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    const inside = focusables.includes(active);
    if (event.shiftKey && (active === first || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Describe the focused element by role and data attributes, so it can be found again after a rebuild. */
  _describeFocus() {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || !this._overlay?.contains(el)) return null;
    const role = FOCUS_ROLES.find((r) => el.classList.contains(r)) ?? 'bm-modal';
    const { actionId, slot, device, footerActionId, group } = el.dataset;
    // The search field keeps its caret and selection too
    const caret = el instanceof HTMLInputElement && role === 'bm-search-input'
      ? { start: el.selectionStart, end: el.selectionEnd, direction: el.selectionDirection }
      : null;
    return { role, actionId, slot, device, footerActionId, group, caret };
  }

  _restoreFocus(focus) {
    const attrs = [
      ['action-id', focus.actionId],
      ['slot', focus.slot],
      ['device', focus.device],
      ['footer-action-id', focus.footerActionId],
    ];
    const selector = `.${focus.role}` + attrs
      .filter(([, value]) => value != null)
      .map(([name, value]) => `[data-${name}="${_attrEscape(value)}"]`)
      .join('');
    // A group name may hold anything (a newline breaks a selector): found by comparison
    let target = focus.role === 'bm-group-toggle'
      ? [...this._overlay.querySelectorAll('.bm-group-toggle')].find((btn) => btn.dataset.group === focus.group) ?? null
      : this._overlay.querySelector(selector);
    if (target && !_isFocusable(target) && focus.role === 'bm-clear-slot-btn') {
      target = target.closest('.bm-slot')?.querySelector('.bm-bind-btn') ?? null;
    }
    if (target && !_isFocusable(target) && focus.role === 'bm-search-clear') target = this._searchInput();
    if (!target || !_isFocusable(target)) target = this._overlay.querySelector('.bm-modal');
    target?.focus({ preventScroll: true });
    if (focus.caret && target instanceof HTMLInputElement && focus.caret.start != null) {
      target.setSelectionRange(focus.caret.start, focus.caret.end ?? focus.caret.start, focus.caret.direction ?? 'none');
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
      const label = code
        ? (device === 'gamepad' ? this._getGamepadLabel(code) : getKeyLabel(code))
        : '—';
      btn.textContent = label;
      btn.title = _bindTitle(code ? label : null);
      btn.classList.toggle('bm-unbound', !code);
    }
    this._updateGroupCounts();
    // Binding labels are matched, so a changed label can change what the filter shows
    this._applySearch();
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  /** The search row between the header and the body, with its leading line break ('' when the option is off, so the markup stays as in 0.2.1). */
  _renderSearch() {
    if (!this._bindSearch) return '';
    const value = this._searchText;
    return `
        <div class="bm-search">
          <input class="bm-search-input" type="search" aria-label="Search key bindings" placeholder="Search actions or keys" autocomplete="off" spellcheck="false" enterkeyhint="search" value="${_esc(value)}">
          <button class="bm-search-clear" type="button" aria-label="Clear search" title="Clear search"${value === '' ? ' hidden' : ''}>×</button>
          <span class="bm-search-status bm-visually-hidden" role="status" aria-live="polite" aria-atomic="true"></span>
        </div>`;
  }

  /** @returns {HTMLInputElement | null} */
  _searchInput() {
    return this._overlay?.querySelector('.bm-search-input') ?? null;
  }

  /**
   * New search text, typed or set: filter, and scroll the list to its top while
   * a filter is active. Clearing it returns to the position before the search.
   */
  _setSearchText(text) {
    const wasActive = _searchWords(this._searchText).length > 0;
    const isActive = _searchWords(text).length > 0;
    const body = this._overlay?.querySelector('.bm-modal-body');
    if (!wasActive && isActive) this._scrollBeforeSearch = body?.scrollTop ?? 0;
    this._searchText = text;
    if (!isActive) this._searchFolds.clear();
    const input = this._searchInput();
    if (input && input.value !== text) input.value = text;
    this._applySearch();
    if (body && isActive) body.scrollTop = 0;
    else if (body && wasActive) body.scrollTop = this._scrollBeforeSearch;
  }

  /**
   * Show the rows that match the search text, hide the others (and a group
   * with no row left) with the hidden attribute: no re-render, so focus and the
   * DOM stay. A row holding the focus or the capture stays visible, so a
   * rebind inside a filtered list never removes the control in use.
   * @param {string | null} [pinnedActionId] - a row to keep visible as well (the focus before a re-render)
   */
  _applySearch(pinnedActionId = null, pinnedGroup = null) {
    const input = this._searchInput();
    // Neither search nor folding: leave the markup as it is (0.2.1)
    if (!this._overlay || (!input && !this._groupFolding)) return;
    const words = input ? _searchWords(this._searchText) : [];
    const searching = words.length > 0;
    const active = document.activeElement;
    // The clear button hides before the focus check below, so a focused clear
    // button emptied by a script hands the focus to the field
    const clear = input ? this._overlay.querySelector('.bm-search-clear') : null;
    if (clear) clear.hidden = this._searchText === '';
    const pinned = new Set([pinnedActionId, this._captureTarget?.actionId].filter((id) => id != null));
    let rows = 0;
    let matches = 0;
    for (const group of this._overlay.querySelectorAll('.bm-group')) {
      let visible = 0;
      for (const row of group.querySelectorAll('.bm-action-row')) {
        rows += 1;
        const show = !searching
          || pinned.has(row.dataset.actionId)
          || row.contains(active)
          || this._rowMatches(row.dataset.actionId, words);
        if (row.hidden === show) row.hidden = !show;
        if (show) visible += 1;
      }
      // A group holding the focus (its header) stays shown, like a row does; so
      // does the group whose header held it before a re-render
      group.hidden = visible === 0 && !group.contains(active)
        && !(pinnedGroup != null && group.dataset.group === pinnedGroup);
      matches += visible;
      if (this._groupFolding) this._applyFold(group, this._isGroupFolded(group.dataset.group, searching));
    }
    this._keepFocusInside(active);
    if (!input) return;

    const query = this._searchText.trim();
    const empty = this._overlay.querySelector('.bm-search-empty');
    if (empty) {
      empty.hidden = !(words.length > 0 && matches === 0 && rows > 0);
      empty.textContent = empty.hidden ? '' : `No key bindings match "${query}".`;
    }
    const status = this._overlay.querySelector('.bm-search-status');
    if (status) {
      const text = words.length === 0 ? ''
        : matches === 0 ? 'No key bindings match.'
          : `${matches} key binding${matches === 1 ? '' : 's'} ${matches === 1 ? 'matches' : 'match'}.`;
      if (status.textContent !== text) status.textContent = text;
    }
  }

  /**
   * Second line of defence: when the control that had the focus is hidden now
   * (by the filter, a label change, the clear button going away), move the
   * focus to the nearest sensible control instead of letting it fall to
   * <body>, where Escape and the Tab trap no longer work.
   */
  _keepFocusInside(previous) {
    const modal = this._overlay?.querySelector('.bm-modal');
    if (!modal || !(previous instanceof HTMLElement) || previous === modal || !modal.contains(previous)) return;
    const current = document.activeElement;
    if (current !== previous && current instanceof HTMLElement && modal.contains(current)) return;
    if (_isFocusable(previous)) return;
    const bindBtn = previous.classList.contains('bm-clear-slot-btn') ? previous.closest('.bm-slot')?.querySelector('.bm-bind-btn') : null;
    const target = [bindBtn, this._searchInput()].find((el) => el && _isFocusable(el)) ?? modal;
    target.focus({ preventScroll: true });
  }

  // ── Group folding ───────────────────────────────────────────────────────────

  /**
   * Folded or open: the remembered state (the player's choice, else the host's
   * collapsedGroups), or during a search the fold made for that search (open by default).
   */
  _isGroupFolded(name, searching = _searchWords(this._searchText).length > 0) {
    if (searching) return this._searchFolds.get(name) ?? false;
    return this._foldChoices.has(name) ? this._foldChoices.get(name) : this._defaultCollapsed.has(name);
  }

  /** Show a group folded or open; focus inside rows that fold goes to the group's header. */
  _applyFold(group, folded) {
    const rowsEl = group.querySelector('.bm-group-rows');
    const btn = group.querySelector('.bm-group-toggle');
    if (!rowsEl || !btn) return;
    const hadFocus = folded && rowsEl.contains(document.activeElement);
    rowsEl.hidden = folded;
    btn.setAttribute('aria-expanded', String(!folded));
    group.classList.toggle('bm-group-folded', folded);
    if (hadFocus) btn.focus({ preventScroll: true });
  }

  /** A header click: during a search it folds for that search only, otherwise it is remembered. */
  _toggleGroup(name) {
    if (_searchWords(this._searchText).length > 0) {
      this._searchFolds.set(name, !this._isGroupFolded(name, true));
      this._applySearch();
    } else {
      this.setGroupCollapsed(name, !this._isGroupFolded(name, false));
    }
  }

  /**
   * Fold or unfold a group and remember it, like the player's click.
   * @public - used by bind-manager.js
   * @param {string} name
   * @param {boolean} collapsed
   */
  setGroupCollapsed(name, collapsed) {
    if (typeof name !== 'string') return;
    // Most recent last, so the cap drops the oldest choices
    this._foldChoices.delete(name);
    this._foldChoices.set(name, !!collapsed);
    while (this._foldChoices.size > MAX_FOLD_CHOICES) this._foldChoices.delete(this._foldChoices.keys().next().value);
    try {
      this._foldStore?.save?.([...this._foldChoices]);
    } catch {
      // A storage that fails keeps the state in memory
    }
    this._applySearch();
  }

  /**
   * The remembered fold state of a group (a search does not change it).
   * @public - used by bind-manager.js
   * @param {string} name
   */
  isGroupCollapsed(name) {
    return this._isGroupFolded(name, false);
  }

  /** Bound actions of a group (any keyboard or gamepad slot set) and all of them. */
  _groupCount(actions) {
    const bound = actions.filter((a) => [
      ...(this._store.get(a.id, 'keyboard') ?? []),
      ...(this._store.get(a.id, 'gamepad') ?? []),
    ].some(Boolean)).length;
    return { bound, total: actions.length };
  }

  _renderGroupCount(actions) {
    const { bound, total } = this._groupCount(actions);
    return `<span class="bm-group-count-short" aria-hidden="true">${bound} / ${total}</span><span class="bm-group-count-long bm-visually-hidden">${bound} of ${total} bound</span>`;
  }

  /** Rewrite the headers' counts in place. */
  _updateGroupCounts() {
    if (!this._groupFolding || !this._overlay) return;
    const groups = this._registry.getGroups();
    for (const btn of this._overlay.querySelectorAll('.bm-group-toggle')) {
      const { bound, total } = this._groupCount(groups.get(btn.dataset.group) ?? []);
      const short = btn.querySelector('.bm-group-count-short');
      const long = btn.querySelector('.bm-group-count-long');
      if (short) short.textContent = `${bound} / ${total}`;
      if (long) long.textContent = `${bound} of ${total} bound`;
    }
  }

  /**
   * Every word must occur in the action's label, description or group, or in
   * the label of one of its current bindings as its button shows it.
   */
  _rowMatches(actionId, words) {
    const action = this._registry.get(actionId);
    if (!action) return false;
    const labels = [
      ...(this._store.get(actionId, 'keyboard') ?? []).filter(Boolean).map((code) => getKeyLabel(code)),
      ...(this._store.get(actionId, 'gamepad') ?? []).filter(Boolean).map((code) => this._getGamepadLabel(code)),
    ];
    const haystack = _fold([action.label, action.description ?? '', action.group, ...labels].join('\n'));
    return words.every((word) => haystack.includes(word));
  }

  /**
   * Update the gamepad profile line in place. Only a different controller (or
   * connect / disconnect) replaces the line; focus inside it is kept.
   */
  _updateProfilePanel() {
    const panel = this._overlay?.querySelector('.bm-profile-panel');
    if (!panel) return;
    const state = this._getProfilePanelState();

    if (panel.dataset.key !== state.key) {
      const hadFocus = panel.contains(document.activeElement);
      const template = document.createElement('template');
      template.innerHTML = this._renderGamepadProfilePanel(state).trim();
      const next = template.content.firstElementChild;
      panel.replaceWith(next);
      if (hadFocus) {
        (next.querySelector('.bm-profile-select') ?? this._overlay.querySelector('.bm-modal'))?.focus({ preventScroll: true });
      }
      return;
    }
    if (!state.connected) return;

    const name = panel.querySelector('.bm-profile-name');
    if (name) {
      name.textContent = state.name;
      name.title = state.gamepadId;
    }
    const chip = panel.querySelector('.bm-profile-chip');
    if (chip) {
      chip.textContent = state.sourceLabel;
      chip.title = state.sourceTitle;
      chip.className = `bm-profile-chip bm-profile-chip--${state.source}`;
    }
    const select = panel.querySelector('.bm-profile-select');
    if (select && select.value !== state.selectedValue) select.value = state.selectedValue;
  }

  _getProfilePanelState() {
    const connected = this._gamepadRuntime?.getConnectedGamepads?.() ?? [];
    if (connected.length === 0) return { key: 'none', connected: false };

    const primaryGamepad = connected[0];
    const resolved = this._gamepadRuntime.getResolvedProfile(primaryGamepad.index);
    const override = this._gamepadRuntime.getProfileOverride(primaryGamepad.index);
    const options = this._gamepadRuntime.getAvailableProfileOptions(primaryGamepad.index);
    const selectedValue = override ? _serialiseProfileOverrideValue(override) : '__auto__';
    const source = String(resolved.source ?? 'generic').replace(/[^a-z-]/gi, '');
    const chip = profileChip(resolved);
    const optionList = [
      { value: '__auto__', label: 'Auto detect' },
      ...options.exactProfiles.map((option) => ({ value: _serialiseProfileOverrideValue(option), label: `Exact: ${option.label}` })),
      ...options.families.map((option) => ({ value: _serialiseProfileOverrideValue(option), label: `Family: ${option.label}` })),
    ];

    // The note text for a saved exact profile that does not apply ('' when none).
    const ignored = ignoredOverrideNote(resolved.ignoredOverride);
    return {
      key: `${primaryGamepad.index}|${primaryGamepad.id}|${ignored}|${optionList.map((o) => o.value).join(',')}`,
      ignored,
      connected: true,
      gamepadIndex: primaryGamepad.index,
      gamepadId: primaryGamepad.id,
      // The device's own name, like the tools' header (shared function)
      name: gamepadDeviceName(primaryGamepad.id),
      source,
      sourceLabel: chip.text,
      sourceTitle: chip.title,
      selectedValue,
      optionList,
    };
  }

  _renderGroups(groups) {
    if (groups.size === 0) {
      return '<p class="bm-empty">No actions registered yet.</p>';
    }
    if (this._groupFolding) {
      // Header and rows; folded state, aria-expanded and hidden are set by _applySearch()
      return [...groups.entries()]
        .map(([name, actions], index) => {
          const id = `bm-group-rows-${this._uid}-${index}`;
          return `
        <div class="bm-group" data-group="${_esc(name)}">
          <button class="bm-group-title bm-group-toggle" type="button" aria-expanded="true" aria-controls="${id}" data-group="${_esc(name)}"><span class="bm-group-marker" aria-hidden="true">▾</span><span class="bm-group-name">${_esc(name)}</span><span class="bm-group-count">${this._renderGroupCount(actions)}</span></button>
          <div class="bm-group-rows" id="${id}">
            ${actions.map(a => this._renderAction(a)).join('')}
          </div>
        </div>`;
        }).join('');
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
          <button class="${cls}" type="button" data-action-id="${_esc(action.id)}" data-slot="${i}" data-device="keyboard" title="${_esc(_bindTitle(code ? label : null))}">${_esc(label)}</button>
          <button class="bm-clear-slot-btn" type="button" data-action-id="${_esc(action.id)}" data-slot="${i}" data-device="keyboard" title="Clear" aria-label="Clear keyboard binding">×</button>
        </div>`;
    });

    const gpSlots = Array.from({ length: action.gamepadSlots }, (_, i) => {
      const code  = gpBindings[i] ?? null;
      const label = code ? this._getGamepadLabel(code) : '—';
      const cls   = code ? 'bm-bind-btn' : 'bm-bind-btn bm-unbound';
      return `
        <div class="bm-slot">
          <button class="${cls}" type="button" data-action-id="${_esc(action.id)}" data-slot="${i}" data-device="gamepad" title="${_esc(_bindTitle(code ? label : null))}">${_esc(label)}</button>
          <button class="bm-clear-slot-btn" type="button" data-action-id="${_esc(action.id)}" data-slot="${i}" data-device="gamepad" title="Clear" aria-label="Clear gamepad binding">×</button>
        </div>`;
    });

    return `
      <div class="bm-action-row" data-action-id="${_esc(action.id)}">
        <div class="bm-action-info">
          <div class="bm-action-label" title="${_esc(action.label)}">${_esc(action.label)}</div>
          ${action.description ? `<div class="bm-action-desc" title="${_esc(action.description)}">${_esc(action.description)}</div>` : ''}
        </div>
        <div class="bm-action-controls">
          <div class="bm-device-rows">
            <div class="bm-device-row bm-device-row--keyboard">
              <span class="bm-device-badge bm-device-kbd" title="Keyboard and mouse">⌨</span>
              <div class="bm-bind-slots">${kbSlots.join('')}</div>
            </div>
            <div class="bm-device-row bm-device-row--gamepad">
              <span class="bm-device-badge bm-device-gp" title="Gamepad">⊕</span>
              <div class="bm-bind-slots">${gpSlots.join('')}</div>
            </div>
          </div>
          <button class="bm-action-reset-btn" type="button" data-action-id="${_esc(action.id)}" title="Reset to default" aria-label="Reset ${_esc(action.label)} to default">↺</button>
        </div>
      </div>`;
  }

  /** One line: controller name (raw Gamepad.id in its title), source chip, profile select. */
  _renderGamepadProfilePanel(state = this._getProfilePanelState()) {
    if (!state.connected) {
      return `
        <div class="bm-profile-panel bm-profile-panel-empty" data-key="none">
          <span class="bm-profile-name">No controller connected</span>
        </div>
      `;
    }

    const options = state.optionList
      .map((option) => `<option value="${_esc(option.value)}" ${option.value === state.selectedValue ? 'selected' : ''}>${_esc(option.label)}</option>`)
      .join('');

    return `
      <div class="bm-profile-panel" data-key="${_esc(state.key)}">
        <span class="bm-profile-name" title="${_esc(state.gamepadId)}">${_esc(state.name)}</span>
        <span class="bm-profile-chip bm-profile-chip--${state.source}" title="${_esc(state.sourceTitle)}">${_esc(state.sourceLabel)}</span>
        <select class="bm-profile-select" data-gamepad-index="${state.gamepadIndex}" aria-label="Controller profile">${options}</select>${state.ignored ? `<span class="bm-profile-note" role="note">${_esc(state.ignored)}</span>` : ''}
      </div>
    `;
  }

  _renderFooterActions() {
    if (!this._footerActions.length) return '';
    return this._footerActions
      .filter((action) => action && typeof action.id === 'string' && typeof action.label === 'string')
      .map((action) => {
        const className = action.className ? ` bm-footer-action-btn--${_esc(action.className)}` : '';
        const title = action.title ? ` title="${_esc(action.title)}"` : '';
        return `<button class="bm-footer-action-btn${className}" data-footer-action-id="${_esc(action.id)}" type="button"${title}>${_esc(action.label)}</button>`;
      })
      .join('');
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
        this._captureModal?.close();
        this._updateBindButtons();
        this._showWarning('No controller detected. Plug in a gamepad and try again.');
        return;
      }
      this._captureModal?.open({
        title: 'Capture Gamepad Input',
        message: 'Press the gamepad input to bind now.',
        detail: 'This capture stays open until input is detected or Escape cancels it.',
        onCancel: (info) => this._cancelCaptureFrom(info),
      });
      this._gamepadRuntime.startCapture((code) => {
        this._endCapture(actionId, slot, 'gamepad');
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
      buttonEl.textContent = 'Press a key or click…';
      this._captureModal?.open({
        title: 'Capture Input',
        message: 'Press a key or mouse button to bind now.',
        detail: 'Modifier combos supported, also modifiers alone (Ctrl + Shift). Escape cancels.',
        onCancel: (info) => this._cancelCaptureFrom(info),
      });
      let captured = false;
      const commitCapture = (code, device) => {
        if (captured) return;
        captured = true;
        // Cancel the other runtime
        if (device === 'keyboard') {
          this._mouseRuntime?.cancelCapture();
        } else {
          this._runtime.cancelCapture();
        }
        this._endCapture(actionId, slot, 'keyboard');
        if (code === null) { this._updateBindButtons(); return; }
        const result = this._store.set(actionId, slot, code, 'keyboard');
        const reserved = this._reservedKeyWarnings
          ? getReservedInfo(code, { ...this._reservedContext(), bound: true })
          : null;
        if (reserved || result.conflicts.length > 0) {
          this._showConflictWarning(result.conflicts, code, 'keyboard', reserved);
        } else {
          this._hideConflictWarning();
        }
        this._updateBindButtons();
      };
      this._runtime.startCapture((code) => commitCapture(code, 'keyboard'));
      this._mouseRuntime?.startCapture((code) => commitCapture(code, 'mouse'));
    }
  }

  /** Cancel requested by the capture dialog; a pointer cancel arms the pointer guard. */
  _cancelCaptureFrom(info) {
    if (info?.pointer && info.rect) this._pointerGuard = { until: performance.now() + POINTER_GUARD_MS, rect: info.rect };
    this._cancelCapture();
  }

  /** A pointer click within POINTER_GUARD_MS of a pointer cancel, on the Cancel button's spot. */
  _isGuardedPointerClick(event) {
    const { until, rect } = this._pointerGuard;
    if (!event || event.detail === 0 || !rect || performance.now() >= until) return false;
    const m = POINTER_GUARD_MARGIN_PX;
    return event.clientX >= rect.left - m && event.clientX <= rect.right + m
      && event.clientY >= rect.top - m && event.clientY <= rect.bottom + m;
  }

  _cancelCapture() {
    if (this._captureTarget) {
      // Read first: a runtime may report the cancel synchronously and end the capture itself
      const { actionId, slot, device } = this._captureTarget;
      if (device === 'gamepad') {
        this._gamepadRuntime?.cancelCapture();
      } else {
        this._runtime.cancelCapture();
        this._mouseRuntime?.cancelCapture();
      }
      this._endCapture(actionId, slot, device || 'keyboard');
      this._updateBindButtons();
    }
  }

  /**
   * Close the capture dialog and put focus back on the captured slot, found by
   * identity: a refresh() during the capture may have replaced the button.
   */
  _endCapture(actionId, slot, device) {
    this._captureModal?.close({ restoreFocus: false });
    this._captureTarget = null;
    this._setCaptureUiState(false, null);
    if (!this._open || !this._overlay) return;
    const btn = this._overlay.querySelector(_slotSelector('bm-bind-btn', actionId, slot, device));
    (btn && _isFocusable(btn) ? btn : this._overlay.querySelector('.bm-modal'))?.focus({ preventScroll: true });
  }

  /** Pick the row layout from the modal body's real width (see the layout notes in styles.js). */
  _updateLayout() {
    const modal = this._overlay?.querySelector('.bm-modal');
    const body = modal?.querySelector('.bm-modal-body');
    const probe = modal?.querySelector('.bm-u-probe');
    if (!body || !probe) return;
    const apply = (layout) => {
      for (const name of LAYOUTS) modal.classList.toggle(`bm-layout-${name}`, name === layout);
    };
    // A content-sized modal (--bm-modal-width: auto, fit-content, ...) changes width with the
    // layout, so measure again after each change until it is stable, all before the next paint
    const tried = [];
    for (let i = 0; i < LAYOUTS.length; i++) {
      const u = probe.getBoundingClientRect().width / 1000;
      // Hidden or no layout engine (jsdom): keep the class chosen at render time
      if (!(u > 0) || body.clientWidth === 0) return;
      const layout = _layoutFor(body.clientWidth / u, this._slotCounts.kb, this._slotCounts.gp);
      if (modal.classList.contains(`bm-layout-${layout}`)) return;
      if (tried.includes(layout)) {
        // Oscillating between layouts: settle on the most compact one tried
        apply(LAYOUTS[Math.max(...tried.map((name) => LAYOUTS.indexOf(name)))]);
        return;
      }
      tried.push(layout);
      apply(layout);
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
    for (const btn of this._overlay.querySelectorAll('.bm-footer-action-btn')) {
      btn.disabled = capturing;
    }
    for (const el of this._overlay.querySelectorAll('.bm-search-input, .bm-search-clear, .bm-group-toggle')) {
      el.disabled = capturing;
    }
  }

  /**
   * The conflict note and, for a reserved key, the reserved note: one element,
   * conflict first. The title always holds the full text (the element clamps at
   * three lines).
   * @param {{ actionId: string }[]} conflicts
   * @param {string} code
   * @param {'keyboard' | 'gamepad'} [device]
   * @param {import('../input/reserved-codes.js').ReservedInfo | null} [reserved]
   */
  _showConflictWarning(conflicts, code, device = 'keyboard', reserved = null) {
    const warningEl = this._overlay?.querySelector('.bm-conflict-warning');
    if (!warningEl) return;
    const label = device === 'gamepad' ? this._getGamepadLabel(code) : getKeyLabel(code);
    const notes = [];
    if (conflicts.length > 0) {
      const names = conflicts.map(c => {
        const action = this._registry.get(c.actionId);
        return action ? `"${action.label}"` : c.actionId;
      });
      notes.push(`${label} is also bound to ${names.join(', ')} — both will be active.`);
    }
    if (reserved) {
      const lead = reserved.guardLetsThrough
        ? `The browser guard lets ${label} through, so the browser also acts on it.`
        : {
          blocked: `${label} will not work in the browser.`,
          'fullscreen-only': `${label} only works while the game is fullscreen in a Chromium browser.`,
          unreliable: `${label} may not work in every browser.`,
        }[reserved.level];
      notes.push(`${lead} ${reserved.reason}`);
    }
    warningEl.textContent = notes.join(' ');
    warningEl.title = warningEl.textContent;
    warningEl.classList.remove('bm-hidden');
    clearTimeout(this._warningTimeout);
    this._warningTimeout = setTimeout(() => warningEl.classList.add('bm-hidden'), reserved ? 8000 : 5000);
  }

  _showWarning(message) {
    const warningEl = this._overlay?.querySelector('.bm-conflict-warning');
    if (!warningEl) return;
    warningEl.textContent = message;
    warningEl.title = message;
    warningEl.classList.remove('bm-hidden');
    clearTimeout(this._warningTimeout);
    this._warningTimeout = setTimeout(() => warningEl.classList.add('bm-hidden'), 4000);
  }

  _getGamepadLabel(code) {
    if (this._gamepadRuntime?.getLabelForCode) {
      return this._gamepadRuntime.getLabelForCode(code);
    }
    return getGamepadLabel(code, 'generic');
  }

  _hideConflictWarning() {
    clearTimeout(this._warningTimeout);
    this._overlay?.querySelector('.bm-conflict-warning')?.classList.add('bm-hidden');
  }

  // ── Mouse-blocking handlers (active while modal is open) ───────────────

  /** Block non-left mousedown defaults (back/forward thumb buttons, middle click). */
  _handleBlockMouseDown(event) {
    if (event.button !== 0) {
      event.preventDefault();
    }
  }

  _handleBlockContextMenu(event) {
    // The search field keeps its own menu (paste, spelling)
    if (event.target != null && event.target === this._searchInput()) return;
    event.preventDefault();
  }

  _handleBlockAuxClick(event) {
    event.preventDefault();
  }
}

const FOCUSABLE = 'button, select, input, textarea, [href], [tabindex]:not([tabindex="-1"])';

/** How long after a capture ended by pointer a tap or click on a bind or clear button is ignored. */
const POINTER_GUARD_MS = 350;
/** Slack around the Cancel button's rectangle for the guard (finger jitter). */
const POINTER_GUARD_MARGIN_PX = 12;

/** Classes that identify a focusable control across re-renders, most specific first. */
const FOCUS_ROLES = [
  'bm-bind-btn',
  'bm-clear-slot-btn',
  'bm-action-reset-btn',
  'bm-profile-select',
  'bm-footer-action-btn',
  'bm-reset-all-btn',
  'bm-close-btn',
  'bm-search-input',
  'bm-search-clear',
  'bm-group-toggle',
];

/** Fold choices remembered per namespace; the oldest go first beyond this. */
const MAX_FOLD_CHOICES = 256;

let _controllerCount = 0;

/**
 * The player's stored fold choices as a Map in their order, oldest first.
 * The store gives `[name, folded]` pairs (or an object `{ name: folded }`, in
 * its key order); a name listed twice counts with its last entry, and beyond
 * MAX_FOLD_CHOICES the newest are kept. Anything else counts as none, and a
 * store that throws as empty.
 */
function _readFoldChoices(store) {
  const choices = new Map();
  try {
    const raw = store?.load?.();
    if (!raw || typeof raw !== 'object') return choices;
    const entries = Array.isArray(raw) ? raw : Object.entries(raw);
    for (const entry of entries) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string' || typeof entry[1] !== 'boolean') continue;
      choices.delete(entry[0]);
      choices.set(entry[0], entry[1]);
    }
    while (choices.size > MAX_FOLD_CHOICES) choices.delete(choices.keys().next().value);
  } catch {
    // Unreadable: start with the host's defaults
  }
  return choices;
}

/** A keystroke of an IME composition (Chromium also reports key 'Process', keyCode 229). */
function _isComposing(event) {
  return !!event.isComposing || event.keyCode === 229;
}

/** Keys that edit the search field's text besides printable characters. */
const TEXT_EDIT_KEYS = new Set(['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

/** Lower case, accents removed: "Sauté" and "saute" match. */
function _fold(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** The search text as folded words; empty when there is nothing to filter by. */
function _searchWords(text) {
  return _fold(text).split(/\s+/).filter(Boolean);
}


/*
 * Row geometry in --bm-u, mirrored from styles.js: row padding 24 + 24, label
 * at least 200, row gap 16, device row = badge 24 + gap 8 + n slots of 154
 * (bind 120 + gap 4 + clear 24 + gap 6) - 6, 28 between device groups on one
 * line, then gap 12 and the 32 reset button.
 */
const LAYOUTS = ['inline', 'stacked', 'narrow'];
const ROW_PADDING = 48;
const LABEL_MIN = 200;
const ROW_GAP = 16;
const GROUP_GAP = 28;
const RESET = 12 + 32;
/** Default modal (1080) minus the reserved scrollbar gutter (10). */
const DEFAULT_BODY_WIDTH = 1070;

function _deviceWidth(slots) {
  return 32 + slots * 154 - 6;
}

/** @returns {'inline' | 'stacked' | 'narrow'} */
function _layoutFor(bodyWidthU, kbSlots, gpSlots) {
  const kb = _deviceWidth(kbSlots);
  const gp = _deviceWidth(gpSlots);
  if (bodyWidthU >= ROW_PADDING + LABEL_MIN + ROW_GAP + kb + GROUP_GAP + gp + RESET) return 'inline';
  if (bodyWidthU >= ROW_PADDING + LABEL_MIN + ROW_GAP + Math.max(kb, gp) + RESET) return 'stacked';
  return 'narrow';
}

function _isFocusable(el) {
  if (!(el instanceof HTMLElement) || el.disabled || el.closest('[hidden], .bm-hidden')) return false;
  return typeof getComputedStyle !== 'function' || getComputedStyle(el).visibility !== 'hidden';
}

/** Escape a value for use inside a double-quoted attribute selector. */
function _attrEscape(value) {
  return String(value).replace(/["\\]/g, '\\$&');
}

function _slotSelector(cls, actionId, slot, device) {
  return `.${cls}[data-action-id="${_attrEscape(actionId)}"][data-slot="${_attrEscape(slot)}"][data-device="${_attrEscape(device)}"]`;
}

function _bindTitle(label) {
  return label ? `${label} (click to rebind)` : 'Click to rebind';
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

function _serialiseProfileOverrideValue(override) {
  if (!override || typeof override !== 'object') return '__auto__';
  if (override.type === 'profile') return `profile:${override.key}`;
  if (override.type === 'family') return `family:${override.family}`;
  return '__auto__';
}

function _parseProfileOverrideValue(value) {
  if (typeof value !== 'string') return null;
  if (value.startsWith('profile:')) {
    return { type: 'profile', key: value.slice('profile:'.length) };
  }
  if (value.startsWith('family:')) {
    return { type: 'family', family: value.slice('family:'.length) };
  }
  return null;
}
