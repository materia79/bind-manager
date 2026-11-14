import { _esc } from './esc.js';
import { getStrongestSignal, formatSignalFields } from './signals.js';
import { createDomWriter } from './dom-writer.js';
import { profileSignature } from './profile-options.js';
import { restoreFocusAfterClose, pushDialog, keepFocusInPanel } from './focus.js';
import {
  CAPTURE_PRESETS,
  DEFAULT_CAPTURE_PRESET,
  cloneJson,
  getCapturePreset,
  validateCapturePayload,
  formatValidationSummary,
  suggestCaptureFileName,
  STANDARD_LAYOUT_NOTE,
  isStandardMapping,
} from './capture-payload.js';

/**
 * Input Remap tool (the "Input Debugger" modal): guided capture of a controller
 * into the capture JSON payload.
 * @param {ReturnType<import('./tool-context.js').createToolContext>} ctx
 */
export function createInputDebugger(ctx) {
  const { manager, q, addWindowListener, setSharedCapturePayload, pickGamepad, resolvePreferredGamepadIndex, getGamepadByIndex, createTask, captureBaseline, captureWithMiniModal, bindSignalGrid, refreshProfileControls, wireProfileControls } = ctx;

  const els = {
    modal: q('.bm-debug-modal'),
    panel: q('.bm-debug-panel'),
    device: q('.bm-debug-device'),
    profileChip: q('.bm-debug-profile-chip'),
    profileSelect: q('.bm-debug-profile-select'),
    presetSelect: q('.bm-debug-preset-select'),
    status: q('.bm-debug-status'),
    progress: q('.bm-debug-progress'),
    countdown: q('.bm-debug-countdown'),
    liveState: q('.bm-debug-live-state'),
    live: q('.bm-debug-live'),
    validation: q('.bm-debug-validation'),
    output: q('.bm-debug-results'),
    startBtn: q('.bm-debug-start-btn'),
    backBtn: q('.bm-debug-back-btn'),
    redoBtn: q('.bm-debug-redo-btn'),
    captureBtn: q('.bm-debug-capture-btn'),
    nextBtn: q('.bm-debug-next-btn'),
    copyBtn: q('.bm-debug-copy-btn'),
    downloadBtn: q('.bm-debug-download-btn'),
    closeBtn: q('.bm-debug-close-btn'),
    layoutNote: q('.bm-debug-layout-note'),
  };

  const state = {
    isOpen: false,
    isRunning: false,
    cancel: false,
    activeGamepadIndex: null,
    selectedPreset: DEFAULT_CAPTURE_PRESET,
    baseline: null,
    captures: [],
    currentStepIndex: 0,
    liveTimer: null,
    lastProfileSignature: null,
    task: null,
    opener: null,
    releaseDialog: null,
  };

  const profileControls = { select: els.profileSelect, chip: els.profileChip, device: els.device, note: q('.bm-debug-profile-note') };
  const writer = createDomWriter();
  const liveGrid = bindSignalGrid(els.live, writer);

  const refreshProfileUi = () => {
    if (!state.isOpen) return;
    const activeIndex = resolvePreferredGamepadIndex(state.activeGamepadIndex);
    state.activeGamepadIndex = activeIndex;
    state.lastProfileSignature = null;
    refreshProfileControls(profileControls, activeIndex);
  };

  els.presetSelect.innerHTML = Object.values(CAPTURE_PRESETS)
    .map((preset) => `<option value="${_esc(preset.id)}">${_esc(preset.label)}</option>`)
    .join('');
  els.presetSelect.value = DEFAULT_CAPTURE_PRESET;

  els.startBtn.addEventListener('click', () => {
    runDebug().catch((err) => {
      setStatus(`Debug failed: ${err?.message || String(err)}`);
      state.isRunning = false;
      updateButtonState();
    });
  });
  els.presetSelect.addEventListener('change', () => {
    state.selectedPreset = els.presetSelect.value || DEFAULT_CAPTURE_PRESET;
    state.currentStepIndex = 0;
    ensureCaptureScaffold(getCapturePreset(state.selectedPreset));
    if (state.baseline) updateCurrentStepUi();
    renderOutput();
    updateButtonState();
  });
  els.backBtn.addEventListener('click', () => {
    const preset = getCapturePreset(state.selectedPreset);
    if (!preset.steps.length) return;
    state.currentStepIndex = Math.max(0, state.currentStepIndex - 1);
    updateCurrentStepUi();
    updateButtonState();
  });
  els.nextBtn.addEventListener('click', () => {
    const preset = getCapturePreset(state.selectedPreset);
    if (!preset.steps.length) return;
    state.currentStepIndex = Math.min(preset.steps.length - 1, state.currentStepIndex + 1);
    updateCurrentStepUi();
    updateButtonState();
  });
  els.redoBtn.addEventListener('click', () => {
    const preset = getCapturePreset(state.selectedPreset);
    ensureCaptureScaffold(preset);
    const step = preset.steps[state.currentStepIndex];
    const row = state.captures[state.currentStepIndex];
    if (step && row) {
      row.detected = null;
      row.matched = false;
      row.skipped = false;
      row.label = step.label;
      row.expectedCode = step.expectedCode;
      row.instruction = step.instruction;
      renderOutput();
      updateCurrentStepUi();
    }
  });
  els.captureBtn.addEventListener('click', () => {
    captureCurrentStep().catch((err) => {
      setStatus(`Capture failed: ${err?.message || String(err)}`);
      state.isRunning = false;
      updateButtonState();
    });
  });
  els.copyBtn.addEventListener('click', copyJson);
  els.downloadBtn.addEventListener('click', downloadJson);
  els.closeBtn.addEventListener('click', close);
  wireProfileControls({
    controls: profileControls,
    resolveGamepadIndex: () => state.activeGamepadIndex,
    onChange: () => renderOutput(),
  });
  addWindowListener('bm-gamepad-profile-changed', refreshProfileUi);
  addWindowListener('bm-gamepad-connected', refreshProfileUi);
  addWindowListener('bm-gamepad-disconnected', refreshProfileUi);
  els.modal.addEventListener('click', (ev) => {
    if (ev.target === els.modal) close();
  });

  function open() {
    state.opener = document.activeElement instanceof HTMLElement && !els.modal.contains(document.activeElement) ? document.activeElement : null;
    state.isOpen = true;
    // Escape and Tab are handled for the topmost tool dialog wherever focus is.
    state.releaseDialog ??= pushDialog(els.panel, close);
    state.cancel = false;
    state.activeGamepadIndex = resolvePreferredGamepadIndex(state.activeGamepadIndex);
    els.modal.classList.add('bm-debug-open');
    els.modal.setAttribute('aria-hidden', 'false');
    setStatus('Ready. Press Start Debug to run the guided controller capture.');
    setProgress('No active step. Press Start Debug to initialize baseline and step navigation.');
    setCountdown('');
    state.currentStepIndex = 0;
    ensureCaptureScaffold(getCapturePreset(state.selectedPreset));
    // The JSON follows the current pad and run state (it was last rendered at mount).
    renderOutput();
    updateLayoutNote(getGamepadByIndex(state.activeGamepadIndex) || pickGamepad());
    startLiveMonitor();
    refreshProfileUi();
    updateButtonState();
    els.panel.focus();
  }

  function close() {
    const wasOpen = state.isOpen;
    const hadFocus = els.modal.contains(document.activeElement) || document.activeElement === document.body;
    state.isOpen = false;
    state.releaseDialog?.();
    state.releaseDialog = null;
    state.cancel = true;
    state.task?.cancel();
    state.task = null;
    state.isRunning = false;
    els.modal.classList.remove('bm-debug-open');
    els.modal.setAttribute('aria-hidden', 'true');
    stopLiveMonitor();
    updateButtonState();
    if (wasOpen && hadFocus) restoreFocusAfterClose(state.opener);
    state.opener = null;
  }

  async function runDebug() {
    if (state.isRunning) return;
    const gp = pickGamepad();
    const preset = getCapturePreset(state.selectedPreset);
    if (!gp) {
      setStatus('No controller detected. Connect a controller and try again.');
      return;
    }

    state.isRunning = true;
    state.cancel = false;
    state.activeGamepadIndex = gp.index;
    state.currentStepIndex = 0;
    ensureCaptureScaffold(preset);
    updateButtonState();

    setStatus('Release all buttons and sticks now. Capturing baseline in 2 seconds...');
    setProgress('Normalization');
    setCountdown('');

    const task = createTask();
    state.task = task;
    state.baseline = await captureBaseline(gp.index, 2000, {
      shouldCancel: () => state.cancel,
      onTick: (secondsLeft) => setCountdown(`Normalization: ${secondsLeft}s`),
      task,
    });
    if (state.task === task) state.task = null;
    if (task.cancelled) return;
    if (!state.baseline || state.cancel) {
      setStatus('Debug cancelled during normalization.');
      state.isRunning = false;
      updateButtonState();
      return;
    }

    state.lastProfileSignature = null;
    refreshProfileControls(profileControls, gp.index);
    state.isRunning = false;
    setCountdown('');
    renderOutput();
    updateCurrentStepUi();
    setStatus('Baseline captured. Use Back/Redo/Capture/Next to walk through steps at your own pace.');
    updateButtonState();
  }

  function ensureCaptureScaffold(preset) {
    if (!Array.isArray(preset?.steps)) {
      state.captures = [];
      return;
    }
    if (state.captures.length === preset.steps.length) return;
    state.captures = preset.steps.map((step, idx) => ({
      step: idx + 1,
      label: step.label,
      expectedCode: step.expectedCode,
      instruction: step.instruction,
      optional: step.optional === true,
      skipped: false,
      matched: false,
      detected: null,
    }));
  }

  function updateCurrentStepUi() {
    const preset = getCapturePreset(state.selectedPreset);
    ensureCaptureScaffold(preset);
    if (!preset.steps.length) {
      setProgress('No steps configured for this preset.');
      return;
    }
    const idx = Math.max(0, Math.min(state.currentStepIndex, preset.steps.length - 1));
    state.currentStepIndex = idx;
    const step = preset.steps[idx];
    const row = state.captures[idx];
    setProgress(`Step ${idx + 1}/${preset.steps.length}: ${step.label}${step.optional ? ' (optional)' : ''}`);
    if (row?.detected) {
      setStatus(`${step.instruction} Captured: ${row.detected.code}. Use Redo to recapture or Next to continue.`);
    } else {
      setStatus(`${step.instruction} Click Capture to record this step.`);
    }
  }

  async function captureCurrentStep() {
    const preset = getCapturePreset(state.selectedPreset);
    ensureCaptureScaffold(preset);
    if (!preset.steps.length) return;
    const gp = state.activeGamepadIndex == null ? pickGamepad() : getGamepadByIndex(state.activeGamepadIndex);
    if (!gp) {
      setStatus('No controller detected. Connect a controller first.');
      return;
    }
    state.activeGamepadIndex = gp.index;
    if (!state.baseline) {
      setStatus('No baseline yet. Press Start Debug first.');
      return;
    }

    state.isRunning = true;
    updateButtonState();
    const step = preset.steps[state.currentStepIndex];
    const task = createTask();
    state.task = task;
    const detected = await captureWithMiniModal({
      title: `Capture ${step.label}`,
      instruction: step.instruction,
      gamepadIndex: gp.index,
      baseline: state.baseline,
      durationMs: 5000,
      task,
      returnFocus: els.panel,
    });
    if (state.task === task) state.task = null;
    // Closed or unmounted meanwhile: record nothing.
    if (task.cancelled) return;
    state.isRunning = false;

    const row = state.captures[state.currentStepIndex];
    row.detected = detected;
    row.matched = !!detected;
    row.skipped = false;
    renderOutput();
    updateCurrentStepUi();
    updateButtonState();
    if (document.activeElement === els.panel && !els.captureBtn.disabled) els.captureBtn.focus();
  }

  function renderOutput() {
    const preset = getCapturePreset(state.selectedPreset);
    const gp = getGamepadByIndex(state.activeGamepadIndex) || pickGamepad();
    const byExpected = {};
    const controllerDefinition = {
      sourceControllerId: gp?.id || null,
      profileHint: preset.family,
      family: preset.family,
      buttons: {},
      axes: {},
    };

    for (const item of state.captures) {
      byExpected[item.expectedCode] = item;
      if (!item.detected) continue;
      if (item.detected.kind === 'button') {
        controllerDefinition.buttons[item.expectedCode] = {
          buttonIndex: item.detected.index,
          peakDelta: item.detected.peakDelta,
        };
      } else if (item.detected.kind === 'axis') {
        controllerDefinition.axes[item.expectedCode] = {
          axisIndex: item.detected.index,
          direction: item.detected.direction,
          peakDelta: item.detected.peakDelta,
        };
      }
    }

    const payload = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      runMeta: {
        // mapping: the layout the browser reports ('standard' or ''), so the generator
        // can tell a raw layout from a remapped one.
        targetController: gp ? { index: gp.index, id: gp.id, mapping: typeof gp.mapping === 'string' ? gp.mapping : '', buttons: gp.buttons.length, axes: gp.axes.length } : null,
        baseline: state.baseline,
        totalSteps: preset.steps.length,
        completedSteps: state.captures.filter((entry) => !!entry?.detected).length,
      },
      sequence: preset.steps,
      captures: state.captures,
      byExpected,
      controllerDefinition,
    };

    const validation = validateCapturePayload(payload);
    els.validation.textContent = formatValidationSummary(validation, payload);
    els.validation.title = els.validation.textContent;
    els.output.value = JSON.stringify(payload, null, 2);
    setSharedCapturePayload(payload);
  }

  function syncFromSharedPayload() {
    if (!ctx.shared.capturePayload) return;
    const payload = cloneJson(ctx.shared.capturePayload);
    const validation = validateCapturePayload(payload);
    els.validation.textContent = formatValidationSummary(validation, payload);
    els.validation.title = els.validation.textContent;
    els.output.value = JSON.stringify(payload, null, 2);
  }

  function setStatus(text) { els.status.textContent = text; els.status.title = text; }
  function setProgress(text) { els.progress.textContent = text; }
  function setCountdown(text) { els.countdown.textContent = text; }

  /**
   * Up front, before a 28-step run: a pad the browser already reports in the
   * standard layout needs no exact profile (the capture would be refused).
   */
  function updateLayoutNote(gp) {
    const standard = isStandardMapping(gp?.mapping);
    els.layoutNote.hidden = !standard;
    writer.text(els.layoutNote, standard ? STANDARD_LAYOUT_NOTE : '');
    writer.attr(els.layoutNote, 'title', standard ? STANDARD_LAYOUT_NOTE : null);
  }

  function updateLiveView() {
    const gp = state.activeGamepadIndex == null ? pickGamepad() : getGamepadByIndex(state.activeGamepadIndex);
    const index = gp?.index ?? state.activeGamepadIndex;
    const signature = gp ? `${gp.index}:${profileSignature(manager.getResolvedGamepadProfile(gp.index))}` : 'none';
    if (signature !== state.lastProfileSignature) {
      state.lastProfileSignature = signature;
      refreshProfileControls(profileControls, index);
      updateLayoutNote(gp);
    }
    if (!gp || !state.baseline) {
      writer.text(els.liveState, '(idle)');
      liveGrid.set(formatSignalFields(null));
      return;
    }

    const strongest = getStrongestSignal(gp, state.baseline);
    writer.text(els.liveState, strongest ? 'Strongest signal' : 'No signal above threshold.');
    liveGrid.set(formatSignalFields(strongest));
  }

  /** Live box polls once per animation frame while open; writes are change-only. */
  function startLiveMonitor() {
    stopLiveMonitor();
    const loop = () => {
      state.liveTimer = null;
      if (!state.isOpen) return;
      updateLiveView();
      if (state.isOpen) state.liveTimer = requestAnimationFrame(loop);
    };
    state.liveTimer = requestAnimationFrame(loop);
  }

  function stopLiveMonitor() {
    if (state.liveTimer != null) {
      cancelAnimationFrame(state.liveTimer);
      state.liveTimer = null;
    }
  }

  async function copyJson() {
    const text = els.output.value.trim();
    if (!text) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      setStatus('JSON copied to clipboard.');
      return;
    }
    els.output.focus();
    els.output.select();
    document.execCommand('copy');
    setStatus('JSON copied using selection fallback.');
  }

  function downloadJson() {
    const text = els.output.value.trim();
    if (!text) return;
    const fileName = suggestCaptureFileName(text);
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus(`Downloaded ${fileName}. Place it in src/input/controller_definitions/captures/ and run npm run process_controller_defs.`);
  }

  function updateButtonState() {
    const preset = getCapturePreset(state.selectedPreset);
    const hasSteps = Array.isArray(preset.steps) && preset.steps.length > 0;
    const hasBaseline = !!state.baseline;
    els.startBtn.disabled = state.isRunning;
    els.captureBtn.disabled = state.isRunning || !hasBaseline || !hasSteps;
    els.backBtn.disabled = state.isRunning || !hasBaseline || state.currentStepIndex <= 0;
    els.nextBtn.disabled = state.isRunning || !hasBaseline || !hasSteps || state.currentStepIndex >= preset.steps.length - 1;
    els.redoBtn.disabled = state.isRunning || !hasBaseline || !hasSteps;
    // A control that just disabled itself (Start Debug, Capture) hands focus to the panel.
    if (state.isOpen) keepFocusInPanel(els.panel);
  }

  ctx.shared.syncInputDebugger = syncFromSharedPayload;
  renderOutput();
  return { open, close, isOpen: () => state.isOpen };
}

