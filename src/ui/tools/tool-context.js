import { _esc } from './esc.js';
import { getStrongestSignal, toGpCode, formatSignalFields } from './signals.js';
import { cloneJson } from './capture-payload.js';
import { createDomWriter } from './dom-writer.js';
import { focusFirst, pushDialog } from './focus.js';
import {
  serialiseProfileOverrideValue,
  parseProfileOverrideValue,
  formatProfileSummary,
} from './profile-options.js';
import { gamepadDeviceName, profileChip, IGNORED_OVERRIDE_NOTE } from '../profile-display.js';

/**
 * Runtime helpers shared by the built-in tools: DOM lookup inside the mounted root,
 * window listeners, gamepad access, baseline and capture loops, the capture mini
 * modal and the profile picker. One context per mount; dispose() on unmount.
 * @param {object} manager
 * @param {HTMLElement} root
 */
export function createToolContext(manager, root) {
  let cleanupFns = [];
  const shared = { capturePayload: null, syncInputDebugger: null };
  const writer = createDomWriter();

  function q(selector) {
    return root?.querySelector(selector) ?? null;
  }

  function addWindowListener(type, listener) {
    window.addEventListener(type, listener);
    cleanupFns.push(() => window.removeEventListener(type, listener));
  }

  function setSharedCapturePayload(payload) {
    shared.capturePayload = cloneJson(payload);
  }

  function dispose() {
    for (const fn of cleanupFns) fn();
    cleanupFns = [];
    shared.capturePayload = null;
    shared.syncInputDebugger = null;
  }

  function pickGamepad() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    if (!pads.length) return null;
    return pads[0];
  }

  function resolvePreferredGamepadIndex(preferredIndex = null) {
    const preferred = getGamepadByIndex(preferredIndex);
    if (preferred) return preferred.index;
    const fallback = pickGamepad();
    return fallback ? fallback.index : null;
  }

  function getGamepadByIndex(index) {
    if (index == null || !navigator.getGamepads) return null;
    return [...navigator.getGamepads()].find((g) => g && g.connected && g.index === index) || null;
  }

  /**
   * A cancellable unit of async work (baseline, capture). Its wait() timers are
   * cleared and resolved by cancel(), so nothing keeps running after a tool
   * closes or unmounts.
   */
  function createTask() {
    const waits = new Set();
    const task = {
      cancelled: false,
      wait(ms) {
        return new Promise((resolve) => {
          if (task.cancelled) {
            resolve();
            return;
          }
          const entry = { resolve, id: 0 };
          entry.id = setTimeout(() => {
            waits.delete(entry);
            resolve();
          }, ms);
          waits.add(entry);
        });
      },
      cancel() {
        task.cancelled = true;
        task.wake();
      },
      /** End the pending waits now (their timers cleared) without cancelling the task. */
      wake() {
        for (const entry of waits) {
          clearTimeout(entry.id);
          entry.resolve();
        }
        waits.clear();
      },
    };
    return task;
  }

  async function captureBaseline(gamepadIndex, durationMs, options = {}) {
    const { shouldCancel, onTick, task } = options;
    const sleep = task ? task.wait : wait;
    const samples = { buttonSums: [], axisSums: [], count: 0 };
    const start = performance.now();
    while (performance.now() - start < durationMs) {
      if (task?.cancelled || (typeof shouldCancel === 'function' && shouldCancel())) return null;
      const gp = getGamepadByIndex(gamepadIndex);
      if (!gp) return null;
      const buttons = gp.buttons || [];
      const axes = gp.axes || [];
      for (let i = 0; i < buttons.length; i++) {
        samples.buttonSums[i] = (samples.buttonSums[i] || 0) + (buttons[i].value || 0);
      }
      for (let i = 0; i < axes.length; i++) {
        samples.axisSums[i] = (samples.axisSums[i] || 0) + (axes[i] || 0);
      }
      samples.count += 1;
      const secondsLeft = Math.max(0, Math.ceil((durationMs - (performance.now() - start)) / 1000));
      if (typeof onTick === 'function') onTick(secondsLeft);
      await sleep(50);
    }
    if (task?.cancelled) return null;
    const buttonMeans = samples.buttonSums.map((sum) => sum / Math.max(1, samples.count));
    const axisMeans = samples.axisSums.map((sum) => sum / Math.max(1, samples.count));
    return { buttons: buttonMeans, axes: axisMeans };
  }

  async function captureSingleStrongestSignal(gamepadIndex, baseline, durationMs) {
    const scoreMap = new Map();
    const start = performance.now();
    while (performance.now() - start < durationMs) {
      const gp = getGamepadByIndex(gamepadIndex);
      if (!gp) break;
      const best = getStrongestSignal(gp, baseline);
      if (best) {
        const key = `${best.kind}:${best.index}:${best.direction || 'none'}`;
        const existing = scoreMap.get(key) || { ...best, score: 0, frames: 0, peakDelta: 0, peakRaw: Math.abs(best.rawValue) };
        existing.frames += 1;
        existing.score += best.delta;
        existing.peakDelta = Math.max(existing.peakDelta, best.delta);
        existing.peakRaw = Math.max(existing.peakRaw, Math.abs(best.rawValue));
        scoreMap.set(key, existing);
      }
      await wait(50);
    }
    const top = [...scoreMap.values()].sort((a, b) => b.score - a.score)[0] || null;
    if (!top || top.peakDelta < 0.2) return null;
    return { code: toGpCode(top), kind: top.kind, index: top.index, direction: top.direction || null, score: Number(top.score.toFixed(4)), frames: top.frames, peakDelta: Number(top.peakDelta.toFixed(4)), peakRaw: Number(top.peakRaw.toFixed(4)) };
  }

  /**
   * Fixed key/value readout (<dl> with dd[data-field]) written through a DOM writer.
   * @returns {{ set(values: Record<string, string>): void }}
   */
  function bindSignalGrid(dl, gridWriter = writer) {
    const cells = [];
    for (const dd of dl?.querySelectorAll('dd[data-field]') ?? []) cells.push([dd.getAttribute('data-field'), dd]);
    return {
      set(values) {
        for (const [field, dd] of cells) {
          const v = values?.[field] ?? '\u2014';
          gridWriter.text(dd, v);
          gridWriter.attr(dd, 'title', v);
        }
      },
    };
  }

  async function captureWithMiniModal({ title, instruction, gamepadIndex, baseline, durationMs = 5000, task = null, returnFocus = null }) {
    const els = {
      modal: q('.bm-capture-mini-modal'),
      panel: q('.bm-capture-mini-panel'),
      title: q('.bm-capture-mini-title'),
      instructionEl: q('.bm-capture-mini-instruction'),
      countdown: q('.bm-capture-mini-countdown'),
      liveState: q('.bm-capture-mini-live-state'),
      live: q('.bm-capture-mini-live'),
      cancelBtn: q('.bm-capture-mini-cancel-btn'),
    };
    if (!els.modal || !els.panel) return captureSingleStrongestSignal(gamepadIndex, baseline, durationMs);
    if (task?.cancelled) return null;
    const sleep = task ? task.wait : wait;
    const liveGrid = bindSignalGrid(els.live);
    const scoreMap = new Map();
    const startedAt = performance.now();
    let cancelled = false;
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    writer.text(els.title, title || 'Capture Input');
    writer.attr(els.title, 'title', title || 'Capture Input');
    writer.text(els.instructionEl, instruction || 'Press and hold input now.');
    writer.text(els.liveState, 'Waiting for strongest signal...');
    liveGrid.set(formatSignalFields(null));
    writer.text(els.countdown, '');
    els.modal.classList.add('bm-open');
    els.modal.setAttribute('aria-hidden', 'false');
    els.panel.focus();
    const onCancel = () => {
      cancelled = true;
      task?.wake();
    };
    els.cancelBtn.addEventListener('click', onCancel, { once: true });
    // Topmost dialog while open: Escape cancels and Tab stays inside, wherever focus is.
    const releaseDialog = pushDialog(els.panel, onCancel);
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      while (!cancelled && !task?.cancelled && performance.now() - startedAt < durationMs) {
        const gp = getGamepadByIndex(gamepadIndex);
        if (!gp) break;
        const best = getStrongestSignal(gp, baseline);
        if (best) {
          const key = `${best.kind}:${best.index}:${best.direction || 'none'}`;
          const existing = scoreMap.get(key) || { ...best, score: 0, frames: 0, peakDelta: 0, peakRaw: Math.abs(best.rawValue) };
          existing.frames += 1;
          existing.score += best.delta;
          existing.peakDelta = Math.max(existing.peakDelta, best.delta);
          existing.peakRaw = Math.max(existing.peakRaw, Math.abs(best.rawValue));
          scoreMap.set(key, existing);
          writer.text(els.liveState, 'Strongest signal');
          liveGrid.set(formatSignalFields(best));
        }
        const secondsLeft = Math.max(0, Math.ceil((durationMs - (performance.now() - startedAt)) / 1000));
        writer.text(els.countdown, `Hold window: ${secondsLeft}s`);
        await sleep(50);
      }
    } finally {
      els.cancelBtn.removeEventListener('click', onCancel);
      releaseDialog();
      els.modal.classList.remove('bm-open');
      els.modal.setAttribute('aria-hidden', 'true');
      // The opener is often still disabled here; fall back to the owning tool panel.
      focusFirst(previousActiveElement, returnFocus);
    }
    if (cancelled || task?.cancelled) return null;
    const top = [...scoreMap.values()].sort((a, b) => b.score - a.score)[0] || null;
    if (!top || top.peakDelta < 0.2) return null;
    return { code: toGpCode(top), kind: top.kind, index: top.index, direction: top.direction || null, score: Number(top.score.toFixed(4)), frames: top.frames, peakDelta: Number(top.peakDelta.toFixed(4)), peakRaw: Number(top.peakRaw.toFixed(4)) };
  }

  function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  /**
   * Fill a profile header (device name, source chip, profile select) for the
   * preferred gamepad. Rebuilds the select options, so call it on profile
   * changes, not per frame.
   * @param {{ select: HTMLSelectElement, chip: HTMLElement, device: HTMLElement }} controls
   */
  function refreshProfileControls(controls, preferredGamepadIndex = null) {
    const { select, chip, device, note } = controls;
    // A saved exact profile that does not fit this pad: a note next to the select.
    const setNote = (ignored) => {
      if (!note) return;
      note.hidden = !ignored;
      note.textContent = ignored ? IGNORED_OVERRIDE_NOTE : '';
      note.title = ignored ? IGNORED_OVERRIDE_NOTE : '';
    };
    const gp = preferredGamepadIndex == null ? pickGamepad() : getGamepadByIndex(preferredGamepadIndex) || pickGamepad();
    if (!gp) {
      device.textContent = 'No controller';
      device.title = 'Profile: waiting for controller';
      chip.textContent = '\u2014';
      chip.dataset.source = 'none';
      chip.title = 'Profile: waiting for controller';
      select.innerHTML = '<option value="__auto__">Auto detect</option>';
      select.disabled = true;
      setNote(false);
      return;
    }
    const resolved = manager.getResolvedGamepadProfile(gp.index);
    const options = manager.getAvailableGamepadProfileOptions(gp.index);
    const selectedValue = resolved.override ? serialiseProfileOverrideValue(resolved.override) : '__auto__';
    const exactOptions = options.exactProfiles.map((option) => `<option value="${_esc(serialiseProfileOverrideValue(option))}" ${selectedValue === serialiseProfileOverrideValue(option) ? 'selected' : ''}>Exact: ${_esc(option.label)}</option>`).join('');
    const familyOptions = options.families.map((option) => `<option value="${_esc(serialiseProfileOverrideValue(option))}" ${selectedValue === serialiseProfileOverrideValue(option) ? 'selected' : ''}>Family: ${_esc(option.label)}</option>`).join('');
    select.innerHTML = `<option value="__auto__" ${selectedValue === '__auto__' ? 'selected' : ''}>Auto detect</option>${exactOptions}${familyOptions}`;
    select.dataset.gamepadIndex = String(gp.index);
    select.disabled = false;
    // The device's own name (as in the bindings modal), the raw id in its title;
    // the chip names the source and the family.
    const chipInfo = profileChip(resolved);
    device.textContent = gamepadDeviceName(gp.id);
    device.title = gp.id;
    chip.textContent = chipInfo.text;
    chip.dataset.source = resolved.source || 'none';
    chip.title = chipInfo.title;
    select.title = formatProfileSummary(resolved);
    setNote(!!resolved.ignoredOverride);
  }

  function wireProfileControls({ controls, resolveGamepadIndex, onChange }) {
    const { select } = controls;
    select.innerHTML = '<option value="__auto__">Auto detect</option>';
    select.addEventListener('change', () => {
      const gamepadIndex = parseInt(select.dataset.gamepadIndex || `${resolveGamepadIndex?.() ?? 0}`, 10);
      if (select.value === '__auto__') manager.clearGamepadProfileOverride(gamepadIndex);
      else manager.setGamepadProfileOverride(gamepadIndex, parseProfileOverrideValue(select.value));
      refreshProfileControls(controls, gamepadIndex);
      onChange?.();
    });
  }

  function formatResolvedProfileSummary(gamepadIndex) {
    return formatProfileSummary(manager.getResolvedGamepadProfile(gamepadIndex));
  }

  return {
    manager,
    root,
    shared,
    q,
    addWindowListener,
    setSharedCapturePayload,
    dispose,
    pickGamepad,
    resolvePreferredGamepadIndex,
    getGamepadByIndex,
    createTask,
    captureBaseline,
    captureWithMiniModal,
    bindSignalGrid,
    wait,
    refreshProfileControls,
    wireProfileControls,
    formatResolvedProfileSummary,
  };
}
