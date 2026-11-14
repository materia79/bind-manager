import { _esc } from './esc.js';
import { getStrongestSignal, toGpCode } from './signals.js';
import { cloneJson } from './capture-payload.js';
import { serialiseProfileOverrideValue, parseProfileOverrideValue, abbreviateTesterLabel } from './profile-options.js';

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

  async function captureBaseline(gamepadIndex, durationMs, options = {}) {
    const { shouldCancel, onTick } = options;
    const samples = { buttonSums: [], axisSums: [], count: 0 };
    const start = performance.now();
    while (performance.now() - start < durationMs) {
      if (typeof shouldCancel === 'function' && shouldCancel()) return null;
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
      await wait(50);
    }
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

  async function captureWithMiniModal({ title, instruction, gamepadIndex, baseline, durationMs = 5000 }) {
    const els = {
      modal: q('.bm-capture-mini-modal'),
      panel: q('.bm-capture-mini-panel'),
      title: q('.bm-capture-mini-title'),
      instructionEl: q('.bm-capture-mini-instruction'),
      countdown: q('.bm-capture-mini-countdown'),
      live: q('.bm-capture-mini-live'),
      cancelBtn: q('.bm-capture-mini-cancel-btn'),
    };
    if (!els.modal || !els.panel) return captureSingleStrongestSignal(gamepadIndex, baseline, durationMs);
    const scoreMap = new Map();
    const startedAt = performance.now();
    let cancelled = false;
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    els.title.textContent = title || 'Capture Input';
    els.instructionEl.textContent = instruction || 'Press and hold input now.';
    els.live.textContent = 'Waiting for strongest signal...';
    els.countdown.textContent = '';
    els.modal.classList.add('bm-open');
    els.modal.setAttribute('aria-hidden', 'false');
    els.panel.focus();
    const onCancel = () => { cancelled = true; };
    const onKeydown = (event) => {
      if (event.code !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      cancelled = true;
    };
    els.cancelBtn.addEventListener('click', onCancel, { once: true });
    els.panel.addEventListener('keydown', onKeydown);
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      while (!cancelled && performance.now() - startedAt < durationMs) {
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
          els.live.textContent = [
            `kind: ${best.kind}`,
            `index: ${best.index}`,
            `direction: ${best.direction || 'n/a'}`,
            `delta: ${best.delta.toFixed(4)}`,
            `raw: ${best.rawValue.toFixed(4)}`,
            `code: ${toGpCode(best)}`,
          ].join('\n');
        }
        const secondsLeft = Math.max(0, Math.ceil((durationMs - (performance.now() - startedAt)) / 1000));
        els.countdown.textContent = `Hold window: ${secondsLeft}s`;
        await wait(50);
      }
    } finally {
      els.panel.removeEventListener('keydown', onKeydown);
      els.modal.classList.remove('bm-open');
      els.modal.setAttribute('aria-hidden', 'true');
      if (previousActiveElement?.isConnected) previousActiveElement.focus();
    }
    if (cancelled) return null;
    const top = [...scoreMap.values()].sort((a, b) => b.score - a.score)[0] || null;
    if (!top || top.peakDelta < 0.2) return null;
    return { code: toGpCode(top), kind: top.kind, index: top.index, direction: top.direction || null, score: Number(top.score.toFixed(4)), frames: top.frames, peakDelta: Number(top.peakDelta.toFixed(4)), peakRaw: Number(top.peakRaw.toFixed(4)) };
  }

  function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  function refreshProfileControls(selectEl, autoBtn, statusEl, preferredGamepadIndex = null) {
    const gp = preferredGamepadIndex == null ? pickGamepad() : getGamepadByIndex(preferredGamepadIndex) || pickGamepad();
    if (!gp) {
      statusEl.textContent = 'Profile: waiting for controller';
      selectEl.innerHTML = '<option value="__auto__">Auto detect</option>';
      selectEl.disabled = true;
      autoBtn.disabled = true;
      return;
    }
    const resolved = manager.getResolvedGamepadProfile(gp.index);
    const options = manager.getAvailableGamepadProfileOptions(gp.index);
    const selectedValue = resolved.override ? serialiseProfileOverrideValue(resolved.override) : '__auto__';
    const exactOptions = options.exactProfiles.map((option) => `<option value="${_esc(serialiseProfileOverrideValue(option))}" ${selectedValue === serialiseProfileOverrideValue(option) ? 'selected' : ''}>Exact: ${_esc(option.label)}</option>`).join('');
    const familyOptions = options.families.map((option) => `<option value="${_esc(serialiseProfileOverrideValue(option))}" ${selectedValue === serialiseProfileOverrideValue(option) ? 'selected' : ''}>Family: ${_esc(option.label)}</option>`).join('');
    selectEl.innerHTML = `<option value="__auto__" ${selectedValue === '__auto__' ? 'selected' : ''}>Auto detect</option>${exactOptions}${familyOptions}`;
    selectEl.dataset.gamepadIndex = String(gp.index);
    autoBtn.dataset.gamepadIndex = String(gp.index);
    selectEl.disabled = false;
    autoBtn.disabled = false;
    statusEl.textContent = formatResolvedProfileSummary(gp.index);
  }

  function wireProfileControls({ selectEl, autoBtn, statusEl, resolveGamepadIndex, onChange }) {
    selectEl.innerHTML = '<option value="__auto__">Auto detect</option>';
    selectEl.addEventListener('change', () => {
      const gamepadIndex = parseInt(selectEl.dataset.gamepadIndex || `${resolveGamepadIndex?.() ?? 0}`, 10);
      if (selectEl.value === '__auto__') manager.clearGamepadProfileOverride(gamepadIndex);
      else manager.setGamepadProfileOverride(gamepadIndex, parseProfileOverrideValue(selectEl.value));
      refreshProfileControls(selectEl, autoBtn, statusEl, gamepadIndex);
      onChange?.();
    });
    autoBtn.addEventListener('click', () => {
      const gamepadIndex = parseInt(autoBtn.dataset.gamepadIndex || `${resolveGamepadIndex?.() ?? 0}`, 10);
      manager.clearGamepadProfileOverride(gamepadIndex);
      refreshProfileControls(selectEl, autoBtn, statusEl, gamepadIndex);
      onChange?.();
    });
  }

  function formatResolvedProfileSummary(gamepadIndex) {
    const resolved = manager.getResolvedGamepadProfile(gamepadIndex);
    const sourceLabel = { manual: 'Manual override', exact: 'Exact match', family: 'Family fallback', generic: 'Generic fallback' }[resolved.source] ?? resolved.source;
    const profileName = resolved.definition?.sourceName ?? resolved.family;
    return `Profile: ${sourceLabel} (${profileName})`;
  }

  function applyControllerLabels(gamepadIndex = 0) {
    const nodes = root.querySelectorAll('.bm-tester-controller [data-code]');
    for (const node of nodes) {
      const code = node.dataset.code;
      const label = manager.getGamepadLabel(code, gamepadIndex);
      node.textContent = abbreviateTesterLabel(label);
      node.title = label;
    }
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
    captureBaseline,
    captureWithMiniModal,
    wait,
    refreshProfileControls,
    wireProfileControls,
    formatResolvedProfileSummary,
    applyControllerLabels,
  };
}
