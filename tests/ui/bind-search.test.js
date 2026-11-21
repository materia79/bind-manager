import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';

// 0.2.2: the search field above the bindings list.

let manager = null;

const DUALSENSE = {
  id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
  index: 0,
  connected: true,
  mapping: 'standard',
  buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })),
  axes: [0, 0, 0, 0],
};

function setGamepads(pads) {
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads });
}

/** uoc-like binds: plain letters, Enter, Tab and Escape are actions too. */
const ACTIONS = [
  { id: 'jump', label: 'Jump', group: 'Movement', slots: 2, defaultBindings: ['Space', null], defaultGamepadBindings: ['GP_B0'] },
  { id: 'forward', label: 'Move Forward', group: 'Movement', slots: 2, defaultBindings: ['KeyW', 'ArrowUp'] },
  { id: 'save', label: 'Quick Save', description: 'Saves the game', group: 'System', slots: 2, defaultBindings: ['ControlLeft+KeyS', null] },
  { id: 'zoom', label: 'Zoom In', group: 'Camera', slots: 2, defaultBindings: ['MouseWheelUp', null] },
  { id: 'saute', label: 'Sauté', description: 'Cook with élan', group: 'Kitchen', slots: 1, defaultBindings: ['KeyJ'] },
  { id: 'chat', label: 'Chat', group: 'Social', slots: 1, defaultBindings: ['Enter'] },
  { id: 'cycle', label: 'Cycle Target', group: 'Combat', slots: 1, defaultBindings: ['Tab'] },
  { id: 'pause', label: 'Pause', group: 'System', slots: 1, defaultBindings: ['Escape'] },
  { id: 'map', label: 'Map', group: 'System', slots: 1, defaultBindings: ['KeyM'] },
];

function createManager(options = {}) {
  manager = createBindManager({ namespace: `bind-search-${Math.random()}`, storage: { load: () => null, save() {} }, ...options });
  manager.registerActions(ACTIONS);
  return manager;
}

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const input = () => $('.bm-search-input');
const row = (id) => $(`.bm-action-row[data-action-id="${id}"]`);
const visibleRows = () => $$('.bm-action-row').filter((r) => !r.closest('[hidden]')).map((r) => r.dataset.actionId);

/** Type text as a user would: keydown on the field (bubbling to window), then the value and an input event. */
function type(text) {
  const el = input();
  el.focus();
  for (const ch of text) {
    const code = ch === ' ' ? 'Space' : /[a-z]/i.test(ch) ? `Key${ch.toUpperCase()}` : '';
    const down = new KeyboardEvent('keydown', { key: ch, code, bubbles: true, cancelable: true });
    el.dispatchEvent(down);
    if (!down.defaultPrevented) {
      el.value += ch;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, code, bubbles: true, cancelable: true }));
  }
}

function search(text) {
  const el = input();
  el.focus();
  el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function press(code, key = code, target = document.activeElement ?? document.body, extra = {}) {
  const down = new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true, ...extra });
  target.dispatchEvent(down);
  target.dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true, cancelable: true, ...extra }));
  return down;
}

describe('bind search: markup', () => {
  beforeEach(() => { document.body.innerHTML = ''; setGamepads([]); });
  afterEach(() => { manager?.destroy(); manager = null; });

  it('puts a labelled search field in its own row between the header and the body', () => {
    createManager();
    manager.open();
    const modal = $('.bm-modal');
    const children = [...modal.children].map((el) => el.className);
    expect(children.indexOf('bm-search')).toBe(children.indexOf('bm-modal-header') + 1);
    expect(children[children.indexOf('bm-search') + 1]).toBe('bm-modal-body');
    const el = input();
    expect(el.type).toBe('search');
    expect(el.getAttribute('aria-label')).toBe('Search key bindings');
    expect(el.placeholder).toBe('Search actions or keys');
    expect($('.bm-search-clear').hidden).toBe(true);
    const status = $('.bm-search-status');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('');
  });

  it('keeps the focus on the modal when it opens, and the field comes right after the close button in Tab order', () => {
    createManager();
    manager.open();
    expect(document.activeElement).toBe($('.bm-modal'));
    $('.bm-close-btn').focus();
    // Tab from the close button goes to the browser; the next focusable in DOM order is the field
    const focusables = $$('.bm-modal button, .bm-modal select, .bm-modal input').filter((el) => !el.closest('[hidden]'));
    expect(focusables[0]).toBe($('.bm-close-btn'));
    expect(focusables[1]).toBe(input());
  });

  it('bindSearch: false leaves the modal without the search', () => {
    createManager({ bindSearch: false });
    manager.open();
    expect($('.bm-search')).toBeNull();
    expect($('.bm-search-input')).toBeNull();
    expect($('.bm-search-empty')).toBeNull();
    expect([...$('.bm-modal').children].map((el) => el.className))
      .toEqual(['bm-u-probe', 'bm-modal-header', 'bm-modal-body', 'bm-modal-footer']);
    expect($$('.bm-overlay [hidden]')).toEqual([]);
    // Escape closes as before
    press('Escape');
    expect(manager.isOpen()).toBe(false);
  });
});

describe('bind search: matching', () => {
  beforeEach(() => { document.body.innerHTML = ''; setGamepads([DUALSENSE]); });
  afterEach(() => { manager?.destroy(); manager = null; });

  it('matches the label, the description and the group, case-insensitively', () => {
    createManager();
    manager.open();
    search('JUMP');
    expect(visibleRows()).toEqual(['jump']);
    search('saves');
    expect(visibleRows()).toEqual(['save']);
    search('camera');
    expect(visibleRows()).toEqual(['zoom']);
  });

  it('ignores accents on both sides', () => {
    createManager();
    manager.open();
    search('saute');
    expect(visibleRows()).toEqual(['saute']);
    search('ÉLAN');
    expect(visibleRows()).toEqual(['saute']);
    search('Sauté');
    expect(visibleRows()).toEqual(['saute']);
  });

  it('needs every word, each anywhere in the row', () => {
    createManager();
    manager.open();
    search('  system   pause ');
    expect(visibleRows()).toEqual(['pause']);
    search('movement space');
    expect(visibleRows()).toEqual(['jump']);
    search('movement nothing');
    expect(visibleRows()).toEqual([]);
  });

  it('matches binding labels as the buttons show them: a key, a modifier, the wheel and the pad profile names', () => {
    createManager();
    manager.open();
    search('space');
    expect(visibleRows()).toEqual(['jump']);
    search('ctrl');
    expect(visibleRows()).toEqual(['save']);
    search('wheel up');
    expect(visibleRows()).toEqual(['zoom']);
    // DualSense: GP_B0 shows as Cross
    expect($('.bm-bind-btn[data-action-id="jump"][data-device="gamepad"]').textContent).toBe('Cross');
    search('cross');
    expect(visibleRows()).toEqual(['jump']);
  });

  it('does not match internal codes that the buttons do not show', () => {
    createManager();
    manager.open();
    for (const code of ['ControlLeft', 'MouseWheelUp', 'GP_B0', 'KeyW']) {
      search(code);
      expect(visibleRows(), code).toEqual([]);
    }
  });

  it('shows everything again when the text is empty or only spaces', () => {
    createManager();
    manager.open();
    search('jump');
    search('   ');
    expect(visibleRows().sort()).toEqual(ACTIONS.map((a) => a.id).sort());
    expect($('.bm-search-clear').hidden).toBe(false);
  });
});

describe('bind search: what it shows', () => {
  beforeEach(() => { document.body.innerHTML = ''; setGamepads([]); });
  afterEach(() => { manager?.destroy(); manager = null; });

  it('hides rows and empty groups without re-rendering', () => {
    createManager();
    manager.open();
    const jumpRow = row('jump');
    const groups = () => $$('.bm-group').filter((g) => !g.hidden).map((g) => g.querySelector('.bm-group-title').textContent);
    search('jump');
    expect(row('jump')).toBe(jumpRow);
    expect(groups()).toEqual(['Movement']);
    expect(row('forward').hidden).toBe(true);
    expect(row('forward').isConnected).toBe(true);
    expect(document.activeElement).toBe(input());
  });

  it('announces the number of matches politely and says when nothing matches, naming the text', () => {
    createManager();
    manager.open();
    const status = $('.bm-search-status');
    const empty = $('.bm-search-empty');
    search('system');
    expect(status.textContent).toBe('3 key bindings match.');
    expect(empty.hidden).toBe(true);
    search('jump');
    expect(status.textContent).toBe('1 key binding matches.');
    search('<img src=x onerror="window.__pwned=1">');
    expect(status.textContent).toBe('No key bindings match.');
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe('No key bindings match "<img src=x onerror="window.__pwned=1">".');
    expect(empty.querySelector('img')).toBeNull();
    expect(window.__pwned).toBeUndefined();
    search('');
    expect(status.textContent).toBe('');
    expect(empty.hidden).toBe(true);
  });

  it('escapes the kept text when the modal re-renders', () => {
    createManager();
    manager.open();
    search('"><img src=x>');
    manager.registerAction({ id: 'late', label: 'Late' });
    expect(input().value).toBe('"><img src=x>');
    expect($('.bm-overlay img')).toBeNull();
  });

  it('takes hidden rows out of the focus trap', () => {
    createManager();
    manager.open();
    search('map');
    // Visible controls: close, field, clear, Map's controls, footer
    const lastFooter = $$('.bm-modal-footer button').at(-1);
    lastFooter.focus();
    press('Tab', 'Tab');
    // jsdom moves no focus itself; the trap wraps from the last to the first
    expect(document.activeElement).toBe($('.bm-close-btn'));
    $('.bm-close-btn').focus();
    press('Tab', 'Tab', $('.bm-close-btn'), { shiftKey: true });
    expect(document.activeElement).toBe(lastFooter);
    // A hidden row's button counts as outside: Tab from there goes to the first control
    $('.bm-bind-btn[data-action-id="jump"]').focus();
    press('Tab', 'Tab', $('.bm-bind-btn[data-action-id="jump"]'));
    expect(document.activeElement).toBe($('.bm-close-btn'));
  });

  it('keeps a row visible while it holds the focus, after a rebind changes its labels', () => {
    createManager();
    manager.open();
    search('space');
    const btn = $('.bm-bind-btn[data-action-id="jump"][data-slot="0"]');
    btn.focus();
    manager.setBinding('jump', 0, 'KeyK');
    expect(btn.textContent).toBe('K');
    expect(row('jump').hidden).toBe(false);
    expect(document.activeElement).toBe(btn);
    // Once the field changes again, the row is filtered like any other
    search('spac');
    expect(row('jump').hidden).toBe(true);
  });
});

describe('bind search: keys', () => {
  beforeEach(() => { document.body.innerHTML = ''; setGamepads([]); });
  afterEach(() => { manager?.destroy(); manager = null; });

  it('typing letters, Enter, Tab and Escape bound to actions fires none of them', () => {
    createManager();
    const events = [];
    manager.onAnyAction((e) => events.push(`${e.actionId}:${e.type}`));
    manager.open();
    type('map jump');
    press('Enter', 'Enter', input());
    press('Tab', 'Tab', input());
    input().focus();
    press('Escape', 'Escape', input()); // clears the text
    expect(events).toEqual([]);
    expect(manager.isOpen()).toBe(true);
    expect(input().value).toBe('');
    // No capture was started either: nothing is waiting for a key
    expect($('.bm-capturing')).toBeNull();
    expect(manager.getBinding('map')).toEqual(['KeyM']);
  });

  it('Tab from the field still moves the focus inside the modal (Shift+Tab wraps nothing away)', () => {
    createManager();
    manager.open();
    input().focus();
    const event = press('Tab', 'Tab', input());
    // Not the last control: the browser moves the focus, nothing cancels the key
    expect(event.defaultPrevented).toBe(false);
    $('.bm-close-btn').focus();
    const back = press('Tab', 'Tab', $('.bm-close-btn'), { shiftKey: true });
    expect(back.defaultPrevented).toBe(true);
  });

  it('Escape with text clears it and keeps the modal open; Escape on an empty field closes it', () => {
    createManager();
    manager.open();
    search('jump');
    const first = press('Escape', 'Escape', input());
    expect(first.defaultPrevented).toBe(true);
    expect(manager.isOpen()).toBe(true);
    expect(input().value).toBe('');
    expect(visibleRows()).toHaveLength(ACTIONS.length);
    expect(document.activeElement).toBe(input());
    press('Escape', 'Escape', input());
    expect(manager.isOpen()).toBe(false);
  });

  it('the Escape that closes the modal does not fire an action bound to Escape', () => {
    createManager();
    const events = [];
    manager.onAnyAction((e) => events.push(`${e.actionId}:${e.type}`));
    manager.open();
    input().focus();
    press('Escape', 'Escape', input());
    expect(manager.isOpen()).toBe(false);
    expect(events).toEqual([]);
    // Also from the modal itself, with the search off
    manager.destroy();
    document.body.innerHTML = '';
    createManager({ bindSearch: false });
    manager.onAnyAction((e) => events.push(`${e.actionId}:${e.type}`));
    manager.open();
    press('Escape', 'Escape', $('.bm-modal'));
    expect(manager.isOpen()).toBe(false);
    expect(events).toEqual([]);
    // Gameplay is live again: the next Escape is the game's
    press('Escape', 'Escape', document.body);
    expect(events).toEqual(['pause:pressed', 'pause:released']);
  });

  it('the Escape that only clears the text does not reach window listeners', () => {
    createManager();
    const seen = vi.fn();
    window.addEventListener('keydown', seen);
    try {
      manager.open();
      search('jump');
      press('Escape', 'Escape', input());
      expect(seen).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', seen);
    }
  });

  it('Enter in the field does nothing', () => {
    createManager();
    manager.open();
    search('jump');
    press('Enter', 'Enter', input());
    expect(manager.isOpen()).toBe(true);
    expect(input().value).toBe('jump');
    expect(visibleRows()).toEqual(['jump']);
    expect($('.bm-capturing')).toBeNull();
  });

  it('a letter debug key types into the field instead of toggling the modal', () => {
    createManager({ debug: true, debugKey: 'KeyK' });
    manager.open();
    type('k');
    expect(manager.isOpen()).toBe(true);
    expect(input().value).toBe('k');
    // Outside the field the key still toggles
    $('.bm-modal').focus();
    press('KeyK', 'k', $('.bm-modal'));
    expect(manager.isOpen()).toBe(false);
  });

  it('Ctrl+letter debug key and the default F5 still toggle from the field', () => {
    createManager({ debug: true });
    manager.open();
    input().focus();
    const f5 = press('F5', 'F5', input());
    expect(f5.defaultPrevented).toBe(true);
    expect(manager.isOpen()).toBe(false);
    manager.destroy();
    document.body.innerHTML = '';
    createManager({ debug: true, debugKey: 'KeyK' });
    manager.open();
    input().focus();
    press('KeyK', 'k', input(), { ctrlKey: true });
    expect(manager.isOpen()).toBe(false);
  });

  it('the browser guard cancels nothing typed into the field', () => {
    createManager({ browserGuard: { when: 'always' } });
    manager.open();
    input().focus();
    for (const [code, key] of [['KeyM', 'm'], ['Space', ' '], ['Enter', 'Enter'], ['Backspace', 'Backspace'], ['KeyA', 'a']]) {
      const event = press(code, key, input(), code === 'KeyA' ? { ctrlKey: true } : {});
      expect(event.defaultPrevented, code).toBe(false);
    }
  });

  it('the field keeps its context menu; the rest of the modal still blocks it', () => {
    createManager();
    manager.open();
    const onField = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    input().dispatchEvent(onField);
    expect(onField.defaultPrevented).toBe(false);
    const elsewhere = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    $('.bm-modal-title').dispatchEvent(elsewhere);
    expect(elsewhere.defaultPrevented).toBe(true);
  });
});

describe('bind search: state', () => {
  beforeEach(() => { document.body.innerHTML = ''; setGamepads([]); });
  afterEach(() => { manager?.destroy(); manager = null; });

  it('keeps text, focus and caret across refresh()', () => {
    createManager();
    manager.open();
    search('move');
    input().setSelectionRange(1, 3);
    manager.registerAction({ id: 'run', label: 'Run', group: 'Movement' }); // refresh() while open
    const el = input();
    expect(el.value).toBe('move');
    expect(document.activeElement).toBe(el);
    expect([el.selectionStart, el.selectionEnd]).toEqual([1, 3]);
    expect(visibleRows()).toEqual(['jump', 'forward', 'run']);
    expect($('.bm-search-clear').hidden).toBe(false);
  });

  it('applies the filter again when binding labels change', () => {
    createManager();
    manager.open();
    search('wheel');
    expect(visibleRows()).toEqual(['zoom']);
    manager.setBinding('map', 0, 'MouseWheelDown');
    expect(visibleRows().sort()).toEqual(['map', 'zoom']);
    manager.resetAll();
    expect(visibleRows()).toEqual(['zoom']);
  });

  it('applies the filter again when the gamepad profile changes the labels', () => {
    setGamepads([DUALSENSE]);
    createManager();
    manager.open();
    search('cross');
    expect(visibleRows()).toEqual(['jump']);
    manager.setGamepadProfileOverride(0, { type: 'family', family: 'xbox' });
    expect($('.bm-bind-btn[data-action-id="jump"][data-device="gamepad"]').textContent).toBe('A');
    expect(visibleRows()).toEqual([]);
    expect($('.bm-search-empty').hidden).toBe(false);
  });

  it('clears the text on close, and the next open shows the full list with the focus on the modal', () => {
    createManager();
    manager.open();
    search('jump');
    manager.close();
    expect(input().value).toBe('');
    manager.open();
    expect(input().value).toBe('');
    expect(visibleRows()).toHaveLength(ACTIONS.length);
    expect(document.activeElement).toBe($('.bm-modal'));
    expect($('.bm-search-clear').hidden).toBe(true);
  });

  it('the clear button empties the field and puts the focus back in it', () => {
    createManager();
    manager.open();
    search('jump');
    const clear = $('.bm-search-clear');
    expect(clear.hidden).toBe(false);
    clear.focus();
    clear.click();
    expect(input().value).toBe('');
    expect(clear.hidden).toBe(true);
    expect(document.activeElement).toBe(input());
    expect(visibleRows()).toHaveLength(ACTIONS.length);
  });

  it('is disabled during a capture, like the other controls, and enabled again after it', () => {
    createManager();
    manager.open();
    search('map');
    const btn = $('.bm-bind-btn[data-action-id="map"]');
    btn.focus();
    btn.click();
    expect($('.bm-capturing')).toBe(btn);
    expect(input().disabled).toBe(true);
    expect($('.bm-search-clear').disabled).toBe(true);
    // A refresh during the capture keeps it disabled and the captured row visible
    manager.registerAction({ id: 'late', label: 'Late' });
    expect(input().disabled).toBe(true);
    expect(row('map').hidden).toBe(false);
    press('Escape', 'Escape', document.activeElement);
    expect(input().disabled).toBe(false);
    expect($('.bm-search-clear').disabled).toBe(false);
    expect(input().value).toBe('map');
  });
});
