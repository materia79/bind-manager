import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';
import { LocalStorageAdapter } from '../../src/storage/local-storage-adapter.js';

// 0.2.2: groups of the bindings list fold and unfold.

let manager = null;

const ACTIONS = [
  { id: 'jump', label: 'Jump', group: 'Movement', slots: 2, defaultBindings: ['Space', null] },
  { id: 'forward', label: 'Move Forward', group: 'Movement', slots: 2, defaultBindings: ['KeyW', 'ArrowUp'] },
  { id: 'fire', label: 'Fireball', group: 'Spells', slots: 1, defaultBindings: ['KeyF'] },
  { id: 'frost', label: 'Frost Nova', group: 'Spells', slots: 1, defaultBindings: [null] },
  { id: 'heal', label: 'Heal', group: 'Spells', slots: 1, defaultBindings: [null], defaultGamepadBindings: ['GP_B3'] },
  { id: 'blink', label: 'Blink', group: 'Spells', slots: 1, defaultBindings: [null] },
  { id: 'map', label: 'Map', group: 'System', slots: 1, defaultBindings: ['KeyM'] },
];

/** A storage adapter in memory, with the fold methods (or without, for older adapters). */
function memoryStorage({ folds = true } = {}) {
  const data = { bindings: null, folds: undefined, saves: 0, foldSaves: 0 };
  const adapter = {
    data,
    load: () => data.bindings,
    save(bindings) { data.bindings = bindings; data.saves += 1; return true; },
    clear() { data.bindings = null; data.folds = undefined; },
  };
  if (folds) {
    adapter.loadCollapsedGroups = () => data.folds ?? [];
    adapter.saveCollapsedGroups = (state) => { data.folds = JSON.parse(JSON.stringify(state)); data.foldSaves += 1; };
  }
  return adapter;
}

function createManager(options = {}) {
  manager = createBindManager({ namespace: `fold-${Math.random()}`, storage: memoryStorage(), ...options });
  manager.registerActions(ACTIONS);
  return manager;
}

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const header = (group) => $$('.bm-group-toggle').find((b) => b.dataset.group === group);
const groupEl = (group) => header(group)?.closest('.bm-group');
const rowsOf = (group) => groupEl(group).querySelector('.bm-group-rows');
const isFolded = (group) => header(group).getAttribute('aria-expanded') === 'false';
const visibleRows = () => $$('.bm-action-row').filter((r) => !r.closest('[hidden]')).map((r) => r.dataset.actionId);

function search(text) {
  const el = $('.bm-search-input');
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

describe('group folding: header', () => {
  beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });
  afterEach(() => { manager?.destroy(); manager = null; });

  it('the group title is a button with aria-expanded, aria-controls, a marker and a bound / total count', () => {
    createManager();
    manager.open();
    const btn = header('Spells');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.type).toBe('button');
    expect(btn.classList.contains('bm-group-title')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const controls = document.getElementById(btn.getAttribute('aria-controls'));
    expect(controls).toBe(rowsOf('Spells'));
    expect(controls.querySelectorAll('.bm-action-row')).toHaveLength(4);
    expect(btn.querySelector('.bm-group-marker').getAttribute('aria-hidden')).toBe('true');
    expect(btn.querySelector('.bm-group-name').textContent).toBe('Spells');
    // Fireball (key) and Heal (pad) are bound
    expect(btn.querySelector('.bm-group-count-short').textContent).toBe('2 / 4');
    expect(btn.querySelector('.bm-group-count-long').textContent).toBe('2 of 4 bound');
    expect(header('Movement').querySelector('.bm-group-count-short').textContent).toBe('2 / 2');
  });

  it('ids are unique across two managers on one page', () => {
    createManager();
    const first = manager;
    const second = createBindManager({ namespace: `fold-b-${Math.random()}`, storage: memoryStorage() });
    second.registerActions(ACTIONS);
    first.open();
    second.open();
    const ids = $$('.bm-group-rows').map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    second.destroy();
  });

  it('a click folds and unfolds; folded rows are hidden and out of the focus trap', () => {
    createManager();
    manager.open();
    header('Spells').click();
    expect(isFolded('Spells')).toBe(true);
    expect(rowsOf('Spells').hidden).toBe(true);
    expect(groupEl('Spells').hidden).toBe(false);
    expect(groupEl('Spells').classList.contains('bm-group-folded')).toBe(true);
    expect(visibleRows()).toEqual(['jump', 'forward', 'map']);
    // Tab from a hidden row's button counts as outside the trap: it goes to the first control
    const hiddenBtn = $('.bm-bind-btn[data-action-id="fire"]');
    hiddenBtn.focus();
    press('Tab', 'Tab', hiddenBtn);
    expect(document.activeElement).toBe($('.bm-close-btn'));
    header('Spells').click();
    expect(isFolded('Spells')).toBe(false);
    expect(rowsOf('Spells').hidden).toBe(false);
  });

  it('Enter and Space work because the header is a real button (keyboard activation is a click)', () => {
    createManager();
    manager.open();
    const btn = header('System');
    btn.focus();
    // jsdom does not turn Enter into a click; the browser does (see the Playwright test)
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(isFolded('System')).toBe(true);
    expect(document.activeElement).toBe(btn);
  });

  it('the count follows binding changes without a re-render', () => {
    createManager();
    manager.open();
    const btn = header('Spells');
    manager.setBinding('frost', 0, 'KeyR');
    expect(header('Spells')).toBe(btn);
    expect(btn.querySelector('.bm-group-count-short').textContent).toBe('3 / 4');
    manager.clearBinding('fire', 0);
    expect(btn.querySelector('.bm-group-count-short').textContent).toBe('2 / 4');
    manager.resetAll();
    expect(btn.querySelector('.bm-group-count-short').textContent).toBe('2 / 4');
  });

  it('focus inside a group that folds goes to its header', () => {
    createManager();
    manager.open();
    const btn = $('.bm-bind-btn[data-action-id="fire"]');
    btn.focus();
    // Fold by any path while the focus is inside: here the API a host would use, a re-render with the state
    manager.setGroupCollapsed('Spells', true);
    expect(document.activeElement).toBe(header('Spells'));
  });

  it('headers are disabled during a capture and enabled after it', () => {
    createManager();
    manager.open();
    const bind = $('.bm-bind-btn[data-action-id="map"]');
    bind.focus();
    bind.click();
    expect($$('.bm-group-toggle').every((b) => b.disabled)).toBe(true);
    header('Spells').click();
    expect(isFolded('Spells')).toBe(false);
    press('Escape', 'Escape', document.activeElement);
    expect($$('.bm-group-toggle').some((b) => b.disabled)).toBe(false);
  });

  it('refresh() keeps fold state and a header focus', () => {
    createManager();
    manager.open();
    header('Spells').click();
    header('Spells').focus();
    manager.registerAction({ id: 'late', label: 'Late', group: 'Spells' });
    expect(isFolded('Spells')).toBe(true);
    expect(document.activeElement).toBe(header('Spells'));
    expect(header('Spells').querySelector('.bm-group-count-short').textContent).toBe('2 / 5');
  });

  it('a group name with quotes and markup is escaped and its header is found again', () => {
    createManager();
    manager.registerAction({ id: 'odd', label: 'Odd', group: 'He said "<b>hi</b>" \\ ok' });
    manager.open();
    const btn = header('He said "<b>hi</b>" \\ ok');
    expect(btn.querySelector('b')).toBeNull();
    btn.focus();
    btn.click();
    manager.registerAction({ id: 'odd2', label: 'Odd 2', group: 'He said "<b>hi</b>" \\ ok' });
    expect(document.activeElement).toBe(header('He said "<b>hi</b>" \\ ok'));
    expect(isFolded('He said "<b>hi</b>" \\ ok')).toBe(true);
  });
});

describe('group folding: options and storage', () => {
  beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });
  afterEach(() => { manager?.destroy(); manager = null; });

  it('collapsedGroups folds groups at start; the player\'s choice wins over it', () => {
    const storage = memoryStorage();
    createManager({ storage, collapsedGroups: ['Spells', 'Unknown'] });
    manager.open();
    expect(isFolded('Spells')).toBe(true);
    expect(isFolded('Movement')).toBe(false);
    header('Spells').click();
    header('Movement').click();
    expect(storage.data.folds).toEqual([['Spells', false], ['Movement', true]]);
    manager.destroy();
    document.body.innerHTML = '';
    // Next session: the stored choices win over the host defaults both ways
    manager = createBindManager({ namespace: 'x', storage, collapsedGroups: ['Spells'] });
    manager.registerActions(ACTIONS);
    manager.open();
    expect(isFolded('Spells')).toBe(false);
    expect(isFolded('Movement')).toBe(true);
  });

  it('LocalStorageAdapter keeps the folds in their own key; the bindings key is byte-identical', () => {
    const ns = `fold-ls-${Math.random()}`;
    manager = createBindManager({ namespace: ns });
    manager.registerActions(ACTIONS);
    manager.setBinding('frost', 0, 'KeyR');
    const bindingsBefore = localStorage.getItem(`bind-manager:${ns}`);
    manager.open();
    header('Spells').click();
    expect(localStorage.getItem(`bind-manager:${ns}`)).toBe(bindingsBefore);
    expect(JSON.parse(bindingsBefore)).toEqual({ version: 1, bindings: expect.any(Object) });
    expect(Object.keys(JSON.parse(bindingsBefore))).toEqual(['version', 'bindings']);
    expect(localStorage.getItem(`bind-manager:${ns}:collapsed-groups`)).toBe('{"version":2,"groups":[["Spells",true]]}');
    manager.destroy();
    document.body.innerHTML = '';
    manager = createBindManager({ namespace: ns });
    manager.registerActions(ACTIONS);
    manager.open();
    expect(isFolded('Spells')).toBe(true);
  });

  it('a storage adapter without the fold methods keeps working; folds live in memory', () => {
    const storage = memoryStorage({ folds: false });
    createManager({ storage });
    manager.open();
    header('Spells').click();
    manager.close();
    manager.open();
    expect(isFolded('Spells')).toBe(true);
    expect(storage.data.saves).toBe(0);
  });

  it('adapters that throw or return junk never break the modal', () => {
    for (const load of [() => { throw new Error('boom'); }, () => null, () => 'junk', () => ({ Spells: 'yes', Map: 1, Movement: true })]) {
      document.body.innerHTML = '';
      const storage = memoryStorage();
      storage.loadCollapsedGroups = load;
      storage.saveCollapsedGroups = () => { throw new Error('quota'); };
      createManager({ storage });
      manager.open();
      expect(() => header('Spells').click()).not.toThrow();
      expect(isFolded('Spells')).toBe(true);
      manager.destroy();
      manager = null;
    }
  });

  it('LocalStorageAdapter reads version 2 pairs or a version 1 object, and drops malformed entries', () => {
    const adapter = new LocalStorageAdapter('fold-read');
    const key = 'bind-manager:fold-read:collapsed-groups';
    for (const raw of ['not json', '{"version":2,"groups":{"A":true}}', '{"version":1,"groups":[true]}', '{"version":1}', '{"version":3,"groups":[["A",true]]}', 'null']) {
      localStorage.setItem(key, raw);
      expect(adapter.loadCollapsedGroups(), raw).toEqual([]);
    }
    localStorage.setItem(key, '{"version":1,"groups":{"A":true,"B":false,"C":"yes","__proto__":true}}');
    expect(adapter.loadCollapsedGroups()).toEqual([['A', true], ['B', false], ['__proto__', true]]);
    localStorage.setItem(key, '{"version":2,"groups":[["7",true],["__proto__",false],["X","yes"]]}');
    expect(adapter.loadCollapsedGroups()).toEqual([['7', true], ['__proto__', false]]);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });

  it('clearStorage() removes the stored folds and keeps the current ones on screen; Reset All leaves them alone', () => {
    const ns = `fold-clear-${Math.random()}`;
    manager = createBindManager({ namespace: ns });
    manager.registerActions(ACTIONS);
    manager.open();
    header('Spells').click();
    $('.bm-reset-all-btn').click();
    expect(isFolded('Spells')).toBe(true);
    expect(localStorage.getItem(`bind-manager:${ns}:collapsed-groups`)).not.toBeNull();
    manager.clearStorage();
    expect(localStorage.getItem(`bind-manager:${ns}:collapsed-groups`)).toBeNull();
    expect(isFolded('Spells')).toBe(true);
  });

  it('a group named __proto__ folds and is stored like any other', () => {
    const storage = memoryStorage();
    createManager({ storage });
    manager.registerAction({ id: 'p', label: 'P', group: '__proto__' });
    manager.open();
    header('__proto__').click();
    expect(isFolded('__proto__')).toBe(true);
    expect(storage.data.folds).toEqual([['__proto__', true]]);
  });

  it('groupFolding: false renders plain titles; with bindSearch: false too the markup is as in 0.2.1', () => {
    createManager({ groupFolding: false, bindSearch: false, collapsedGroups: ['Spells'] });
    manager.open();
    expect($('.bm-group-toggle')).toBeNull();
    expect($('.bm-group-rows')).toBeNull();
    const title = $('.bm-group-title');
    expect(title.tagName).toBe('DIV');
    expect(title.textContent).toBe('Movement');
    expect(title.nextElementSibling.classList.contains('bm-action-row')).toBe(true);
    expect(visibleRows()).toHaveLength(ACTIONS.length);
    expect($$('.bm-overlay [hidden]')).toEqual([]);
  });
});

describe('group folding with the search', () => {
  beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });
  afterEach(() => { manager?.destroy(); manager = null; });

  it('a search shows matches inside folded groups; clearing it brings the folds back', () => {
    createManager({ collapsedGroups: ['Spells'] });
    manager.open();
    search('frost');
    expect(visibleRows()).toEqual(['frost']);
    expect(isFolded('Spells')).toBe(false);
    search('');
    expect(isFolded('Spells')).toBe(true);
    expect(visibleRows()).toEqual(['jump', 'forward', 'map']);
  });

  it('a header click during a search folds the group for that search only', () => {
    const storage = memoryStorage();
    createManager({ storage });
    manager.open();
    search('f');
    header('Spells').click();
    expect(isFolded('Spells')).toBe(true);
    expect(visibleRows()).toEqual(['forward']);
    // Still counted as matches, and the group stays visible with its header
    expect(groupEl('Spells').hidden).toBe(false);
    search('fr');
    expect(isFolded('Spells')).toBe(true);
    expect(storage.data.folds).toBeUndefined();
    search('');
    expect(isFolded('Spells')).toBe(false);
    search('f');
    expect(isFolded('Spells')).toBe(false);
  });

  it('a folded group with no match is hidden with its header during a search', () => {
    createManager({ collapsedGroups: ['System'] });
    manager.open();
    search('jump');
    expect(groupEl('System').hidden).toBe(true);
    expect(groupEl('Spells').hidden).toBe(true);
  });
});
