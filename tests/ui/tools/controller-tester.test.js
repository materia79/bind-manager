import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBuiltInToolsController } from '../../../src/ui/built-in-tools-controller.js';
import { createFakeManager, createFakePad, installManualRaf, spyText, countDomWork } from './helpers.js';

function mountTester({ family = 'dualsense', pad = createFakePad() } = {}) {
  const manager = createFakeManager({ family });
  vi.stubGlobal('navigator', { ...globalThis.navigator, getGamepads: () => [pad.pad, null, null, null] });
  const tools = createBuiltInToolsController(manager, { builtInTools: true });
  tools.mount(document.body);
  const root = document.querySelector('.bm-built-in-tools-root');
  const q = (s) => root.querySelector(s);
  return { tools, manager, pad, root, q };
}

describe('controller tester frame loop', () => {
  let raf;
  let t;

  beforeEach(() => {
    raf = installManualRaf();
  });

  afterEach(() => {
    t?.tools.unmount();
    t = null;
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('polls with requestAnimationFrame while open', () => {
    t = mountTester();
    t.tools.openControllerTest();
    expect(raf.pending()).toBe(1);
    raf.step(3);
    expect(raf.pending()).toBe(1);
  });

  it('lights pad nodes, moves the stick dot and fills the trigger', () => {
    t = mountTester();
    t.tools.openControllerTest();
    t.pad.setButton(0, 1);
    t.pad.setButton(6, 0.5);
    t.pad.setAxis(0, -1);
    raf.step();
    expect(t.q('.bm-tester-pad [data-code="GP_B0"]').classList.contains('bm-active')).toBe(true);
    expect(t.q('.bm-tester-pad [data-code="GP_B1"]').classList.contains('bm-active')).toBe(false);
    expect(t.q('.bm-tester-pad [data-code="GP_A0N"]').classList.contains('bm-active')).toBe(true);
    expect(t.q('.bm-tester-pad [data-code="GP_B6"] .bm-pad-value').textContent).toBe('0.50');
    expect(Number(t.q('.bm-tester-pad [data-code="GP_B6"] .bm-pad-fill').getAttribute('width'))).toBeGreaterThan(0);
    const dot = t.q('.bm-tester-pad [data-stick="left"] .bm-pad-dot').getAttribute('transform');
    expect(dot).not.toBe('translate(380 410)');
  });

  it('does not write to the DOM over 10 identical frames', () => {
    t = mountTester();
    t.tools.openControllerTest();
    t.q('.bm-tester-debug-btn').click();
    t.q('.bm-tester-editor-btn').click();
    t.pad.setButton(0, 1);
    t.pad.setButton(7, 0.3);
    t.pad.setAxis(2, 0.6);
    raf.step(2);

    const status = spyText(t.q('.bm-tester-status'));
    const triggerValue = spyText(t.q('.bm-tester-pad [data-code="GP_B7"] .bm-pad-value'));
    const signalKind = spyText(t.q('.bm-tester-signal dd[data-field="kind"]'));
    const activeCodes = spyText(t.q('.bm-tester-active-codes'));
    const rawCell = spyText(t.q('.bm-tester-raw-buttons').firstElementChild);
    const editStatus = spyText(t.q('.bm-tester-edit-status'));
    const dot = t.q('.bm-tester-pad [data-stick="right"] .bm-pad-dot');
    const node = t.q('.bm-tester-pad [data-code="GP_B0"]');
    const setAttr = vi.spyOn(dot, 'setAttribute');
    const toggle = vi.spyOn(node.classList, 'toggle');
    const svgHtml = vi.spyOn(t.q('.bm-tester-pad'), 'innerHTML', 'set');

    raf.step(10);

    for (const spy of [status, triggerValue, signalKind, activeCodes, rawCell, editStatus, setAttr, toggle, svgHtml]) {
      expect(spy).not.toHaveBeenCalled();
    }

    // and a change is written exactly where it belongs
    t.pad.setButton(7, 0.8);
    raf.step();
    expect(triggerValue).toHaveBeenCalledTimes(1);
    expect(triggerValue).toHaveBeenLastCalledWith('0.80');
    expect(setAttr).not.toHaveBeenCalled();
  });

  it('does no DOM work at all over 60 identical frames (prototype-level count)', () => {
    t = mountTester();
    t.tools.openControllerTest();
    t.q('.bm-tester-debug-btn').click();
    t.q('.bm-tester-editor-btn').click();
    t.pad.setButton(0, 1);
    t.pad.setButton(7, 0.3);
    t.pad.setAxis(2, 0.6);
    raf.step(3);

    const work = countDomWork(t.root);
    try {
      // the counter itself catches a same-value attribute write and a stringify
      t.q('.bm-tester-status').setAttribute('title', t.q('.bm-tester-status').getAttribute('title'));
      JSON.stringify({});
      t.root.querySelectorAll('*');
      expect(work.counts.setAttribute).toBe(1);
      expect(work.counts.stringify).toBe(1);
      expect(work.counts.querySelectorAll).toBe(1);
      for (const k of Object.keys(work.counts)) work.counts[k] = 0;
      work.log.length = 0;

      raf.step(60);
      expect(work.log).toEqual([]);
      expect(work.total()).toBe(0);
    } finally {
      work.restore();
    }
  });

  it('shows a deliberate empty state without a controller and picks the layout on connect', () => {
    const fake = createFakePad();
    let connected = false;
    const manager = createFakeManager({ family: 'dualsense' });
    vi.stubGlobal('navigator', { ...globalThis.navigator, getGamepads: () => (connected ? [fake.pad, null, null, null] : [null, null, null, null]) });
    const tools = createBuiltInToolsController(manager, { builtInTools: true });
    tools.mount(document.body);
    t = { tools, q: (s) => document.querySelector(`.bm-built-in-tools-root ${s}`) };
    tools.openControllerTest();
    raf.step();
    const svg = t.q('.bm-tester-pad');
    expect(svg.classList.contains('bm-pad-empty')).toBe(true);
    expect(t.q('.bm-pad-message').textContent).toBe('Connect a controller and press any button');
    expect(t.q('.bm-tester-status').textContent).toBe('No controller · Connect a controller to begin.');

    connected = true;
    raf.step();
    expect(svg.classList.contains('bm-pad-empty')).toBe(false);
    // dualsense: symmetric layout, B17 is the touchpad
    expect(t.q('.bm-tester-pad [data-code="GP_B17"]').getAttribute('class')).toContain('bm-pad-touchpad');

    connected = false;
    raf.step();
    expect(svg.classList.contains('bm-pad-empty')).toBe(true);
  });

  it('lets transient hints expire on a state change or after a few seconds', () => {
    const fake = createFakePad();
    let connected = false;
    vi.stubGlobal('navigator', { ...globalThis.navigator, getGamepads: () => (connected ? [fake.pad, null, null, null] : [null, null, null, null]) });
    const tools = createBuiltInToolsController(createFakeManager(), { builtInTools: true });
    tools.mount(document.body);
    t = { tools, q: (s) => document.querySelector(`.bm-built-in-tools-root ${s}`) };
    const now = vi.spyOn(performance, 'now');
    let clock = 1000;
    now.mockImplementation(() => clock);
    try {
      tools.openControllerTest();
      raf.step();
      t.q('.bm-tester-editor-btn').click();
      t.q('.bm-tester-calibrate-btn').click();
      expect(t.q('.bm-tester-status').textContent).toBe('No controller · No controller detected. Connect one, then calibrate.');
      clock += 2000;
      raf.step();
      expect(t.q('.bm-tester-status').textContent).toMatch(/No controller detected/);
      clock += 3000;
      raf.step();
      expect(t.q('.bm-tester-status').textContent).toBe('No controller · Connect a controller to begin.');

      t.q('.bm-tester-calibrate-btn').click();
      expect(t.q('.bm-tester-status').textContent).toMatch(/No controller detected/);
      connected = true;
      clock += 16;
      raf.step();
      expect(t.q('.bm-tester-status').textContent).toBe('Slot 0 · Connected · Press any button, trigger, d-pad direction or stick.');

      // a hint set while connected expires after its time
      t.q('.bm-tester-calibrate-btn').click();
      expect(t.q('.bm-tester-status').textContent).toMatch(/Calibrating baseline/);
      clock += 10_000;
      raf.step();
      expect(t.q('.bm-tester-status').textContent).toMatch(/Calibrating baseline/); // still calibrating: kept alive by its ticks
    } finally {
      now.mockRestore();
    }
  });

  it('stops the loop on close', () => {
    t = mountTester();
    t.tools.openControllerTest();
    raf.step(2);
    t.q('.bm-tester-close-btn').click();
    expect(raf.pending()).toBe(0);
    expect(raf.caf).toHaveBeenCalled();
    expect(t.tools.isAnyOpen()).toBe(false);
  });

  it('stops the loop on Escape', () => {
    t = mountTester();
    t.tools.openControllerTest();
    t.q('.bm-tester-panel').dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    expect(raf.pending()).toBe(0);
  });

  it('stops the loop on unmount', () => {
    t = mountTester();
    t.tools.openControllerTest();
    raf.step();
    t.tools.unmount();
    expect(raf.pending()).toBe(0);
    const calls = raf.raf.mock.calls.length;
    raf.step(5);
    expect(raf.raf.mock.calls.length).toBe(calls);
    t = null;
  });

  it('keeps the panel classes and section visibility in sync with the toggles', () => {
    t = mountTester();
    t.tools.openControllerTest();
    const panel = t.q('.bm-tester-panel');
    expect(panel.classList.contains('bm-side-open')).toBe(false);
    t.q('.bm-tester-debug-btn').click();
    expect(panel.classList.contains('bm-side-open')).toBe(true);
    expect(t.q('.bm-tester-debug').hidden).toBe(false);
    expect(t.q('.bm-tester-debug-btn').getAttribute('aria-pressed')).toBe('true');
    t.q('.bm-tester-debug-btn').click();
    expect(panel.classList.contains('bm-side-open')).toBe(false);
  });

  it('shows the profile chip, controller name and no Auto button', () => {
    t = mountTester();
    t.tools.openControllerTest();
    raf.step();
    expect(t.q('.bm-tester-profile-chip').textContent).toBe('Family');
    expect(t.q('.bm-tester-device').textContent).toBe('DualSense Wireless Controller');
    expect(t.q('.bm-tester-profile-select option').textContent).toBe('Auto detect');
    expect(t.root.querySelector('[class*="auto-btn"]')).toBeNull();
    expect(t.q('.bm-tester-close-btn').title).toMatch(/Esc/);
  });

  it('uses the symmetric layout for dualsense and the offset one for xbox, with full names in title', () => {
    t = mountTester({ family: 'dualsense' });
    t.tools.openControllerTest();
    raf.step();
    const cross = t.q('.bm-tester-pad [data-code="GP_B0"]');
    expect(cross.querySelector('.bm-pad-label').textContent).toBe('');
    expect(cross.querySelector('.bm-pad-glyph').getAttribute('d')).toMatch(/^M -9 -9/);
    expect(cross.querySelector('title').textContent).toBe('Cross');
    expect(cross.getAttribute('aria-label')).toBe('Cross');
    expect(t.q('.bm-tester-pad [data-code="GP_B17"]').getAttribute('class')).toContain('bm-pad-touchpad');
    t.tools.unmount();

    t = mountTester({ family: 'xbox360' });
    t.tools.openControllerTest();
    raf.step();
    expect(t.q('.bm-tester-pad [data-code="GP_B17"]').getAttribute('class')).toContain('bm-pad-center');
    expect(t.q('.bm-tester-pad [data-code="GP_B17"]').getAttribute('display')).toBe('none');
    expect(t.q('.bm-tester-pad [data-code="GP_B20"]').getAttribute('display')).toBe('none');
  });

  it('shows extra keys only when labelled', () => {
    t = mountTester({ family: 'steam' });
    t.tools.openControllerTest();
    raf.step();
    for (const code of ['GP_B17', 'GP_B18', 'GP_B19', 'GP_B20', 'GP_B21', 'GP_B22', 'GP_B23']) {
      expect(t.q(`.bm-tester-pad [data-code="${code}"]`).getAttribute('display'), code).toBeNull();
    }
    expect(t.q('.bm-tester-pad [data-code="GP_B18"] .bm-pad-label').textContent).toBe('L Pad');
  });

  it('edit mode selects a node by data-code and assigns the held input', () => {
    t = mountTester();
    t.tools.openControllerTest();
    t.q('.bm-tester-editor-btn').click();
    t.q('.bm-tester-edit-toggle-btn').click();
    t.q('.bm-tester-pad [data-code="GP_B3"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(t.q('.bm-tester-pad [data-code="GP_B3"]').classList.contains('bm-selected')).toBe(true);
    expect(t.q('.bm-tester-edit-target').textContent).toBe('Edit target: GP_B3');

    const now = vi.spyOn(performance, 'now');
    let clock = 10_000;
    now.mockImplementation(() => clock);
    t.pad.setButton(2, 1);
    for (let i = 0; i < 4; i++) {
      clock += 120;
      raf.step();
    }
    expect(t.manager.setGamepadProfileMappingEntry).toHaveBeenCalledWith(0, 'GP_B3', { kind: 'button', index: 2 }, expect.anything());
    expect(t.q('.bm-tester-edit-status').textContent).toMatch(/^Updated GP_B3/);
    now.mockRestore();
  });
});
