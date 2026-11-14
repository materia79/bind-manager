import { _esc } from './esc.js';
import {
  getStrongestSignal,
  toGpCode,
  resolveStrongestSignalToLogicalCode,
  getActiveLogicalCodes,
  createNeutralBaseline,
  getLogicalAxisValueFromMapping,
  getTriggerFillValue,
  toProfileMappingEntry,
  formatSignalFields,
  formatActiveCodes,
  formatRawButton,
  formatRawAxis,
} from './signals.js';
import { createDomWriter } from './dom-writer.js';
import { createPadView } from './pad-view.js';
import { getStickLayoutForFamily } from './pad-layout.js';
import { profileSignature } from './profile-options.js';
import { trapTab, restoreFocusAfterClose } from './focus.js';

const DEFAULT_HINT = 'Press any button, trigger, d-pad direction or stick.';
const NO_PAD_HINT = 'Connect a controller to begin.';
/** A transient hint shows this long, or until the connection state changes. */
const HINT_TTL_MS = 4000;
/** Edit-mode auto capture counts hold frames at this pace, independent of the display rate. */
const EDIT_SAMPLE_MS = 100;

/**
 * Controller Tester tool: live controller view with one status line, a Debug
 * panel (last signal, active codes, raw input) and a Profile editor panel
 * (calibration, edit mode, capture update, JSON export). The panel has a fixed
 * size; the side panels open inside it.
 * @param {ReturnType<import('./tool-context.js').createToolContext>} ctx
 */
export function createControllerTester(ctx) {
  const { manager, q, addWindowListener, pickGamepad, resolvePreferredGamepadIndex, getGamepadByIndex, createTask, captureBaseline, captureWithMiniModal, bindSignalGrid, refreshProfileControls, wireProfileControls } = ctx;

  const els = {
    modal: q('.bm-tester-modal'),
    panel: q('.bm-tester-panel'),
    controller: q('.bm-tester-pad'),
    body: q('.bm-tester-body'),
    device: q('.bm-tester-device'),
    profileChip: q('.bm-tester-profile-chip'),
    profileSelect: q('.bm-tester-profile-select'),
    status: q('.bm-tester-status'),
    debugBtn: q('.bm-tester-debug-btn'),
    editorBtn: q('.bm-tester-editor-btn'),
    debugSection: q('.bm-tester-debug'),
    editorSection: q('.bm-tester-editor'),
    signal: q('.bm-tester-signal'),
    activeCodes: q('.bm-tester-active-codes'),
    rawButtons: q('.bm-tester-raw-buttons'),
    rawAxes: q('.bm-tester-raw-axes'),
    closeBtn: q('.bm-tester-close-btn'),
    calibrateBtn: q('.bm-tester-calibrate-btn'),
    editToggleBtn: q('.bm-tester-edit-toggle-btn'),
    captureUpdateBtn: q('.bm-tester-capture-update-btn'),
    downloadUpdatedBtn: q('.bm-tester-download-updated-btn'),
    editTarget: q('.bm-tester-edit-target'),
    editStatus: q('.bm-tester-edit-status'),
    bindingsSection: q('.bm-tester-bindings-section'),
    bindingsList: q('.bm-tester-bindings-list'),
    triggerEditSection: q('.bm-tester-trigger-edit'),
  };
  const codeButtons = [...els.triggerEditSection.querySelectorAll('.bm-tester-code-btn')];
  const profileControls = { select: els.profileSelect, chip: els.profileChip, device: els.device };

  const writer = createDomWriter();
  const pad = createPadView(els.controller, writer);
  pad.setLayout('offset');
  pad.setEmpty(true);
  const signalGrid = bindSignalGrid(els.signal, writer);
  const raw = { buttons: [], axes: [] };

  const AUTO_CAPTURE_FRAMES = 2;
  const HIGH_DELTA_THRESHOLD = 0.85;
  const state = {
    isOpen: false,
    frameId: null,
    lastEditSample: 0,
    activeGamepadIndex: null,
    baseline: null,
    calibrating: false,
    lastProfileSignature: null,
    hint: null,
    connection: 'none',
    debugOpen: false,
    editorOpen: false,
    editMode: false,
    selectedCode: null,
    captureUpdateInProgress: false,
    editAutoCapture: { key: null, signal: null, frames: 0 },
    editCooldown: false,
    tasks: new Set(),
    opener: null,
  };

  /** Start a cancellable task that close() and unmount cancel. */
  function startTask() {
    const task = createTask();
    state.tasks.add(task);
    return task;
  }

  function endTask(task) {
    state.tasks.delete(task);
  }

  function cancelTasks() {
    for (const task of state.tasks) task.cancel();
    state.tasks.clear();
  }

  const refreshProfileUi = () => {
    if (!state.isOpen) return;
    const activeIndex = resolvePreferredGamepadIndex(state.activeGamepadIndex);
    state.activeGamepadIndex = activeIndex;
    refreshProfileControls(profileControls, activeIndex);
  };

  els.closeBtn.addEventListener('click', close);
  els.calibrateBtn.addEventListener('click', calibrateBaseline);
  els.debugBtn.addEventListener('click', () => setPanels(!state.debugOpen, state.editorOpen));
  els.editorBtn.addEventListener('click', () => setPanels(state.debugOpen, !state.editorOpen));
  els.triggerEditSection.addEventListener('click', (ev) => {
    if (!state.editMode) return;
    const btn = ev.target.closest('.bm-tester-code-btn');
    if (!btn) return;
    state.selectedCode = btn.dataset.code || null;
    updateEditUiState();
  });
  els.bindingsList.addEventListener('click', (ev) => {
    const removeBtn = ev.target.closest('[data-remove-binding]');
    if (!removeBtn || !state.editMode || !state.selectedCode) return;
    removeSelectedBinding(removeBtn.dataset.removeBinding);
  });
  els.editToggleBtn.addEventListener('click', () => {
    state.editMode = !state.editMode;
    if (!state.editMode) state.selectedCode = null;
    updateEditUiState();
  });
  els.captureUpdateBtn.addEventListener('click', () => {
    captureSelectedUpdate().catch((err) => {
      setEditStatus(`Update failed: ${err?.message || String(err)}`);
      state.captureUpdateInProgress = false;
      updateEditUiState();
    });
  });
  els.downloadUpdatedBtn.addEventListener('click', downloadUpdatedPayload);
  wireProfileControls({
    controls: profileControls,
    resolveGamepadIndex: () => state.activeGamepadIndex,
    onChange: () => {
      state.lastProfileSignature = null;
      updateFrame();
    },
  });
  addWindowListener('bm-gamepad-profile-changed', refreshProfileUi);
  addWindowListener('bm-gamepad-connected', refreshProfileUi);
  addWindowListener('bm-gamepad-disconnected', refreshProfileUi);
  els.modal.addEventListener('click', (ev) => {
    if (ev.target === els.modal) close();
  });
  els.controller.addEventListener('click', (ev) => {
    if (!state.editMode) return;
    const node = ev.target.closest('[data-code]');
    if (!node) return;
    state.selectedCode = node.getAttribute('data-code') || null;
    updateEditUiState();
  });
  els.modal.addEventListener('keydown', (ev) => {
    if (ev.code === 'Escape') {
      ev.preventDefault();
      close();
    } else if (ev.key === 'Tab') {
      trapTab(els.panel, ev);
    }
  });

  function open() {
    state.opener = document.activeElement instanceof HTMLElement && !els.modal.contains(document.activeElement) ? document.activeElement : null;
    state.isOpen = true;
    state.activeGamepadIndex = resolvePreferredGamepadIndex(state.activeGamepadIndex);
    els.modal.classList.add('bm-tester-open');
    els.modal.setAttribute('aria-hidden', 'false');
    state.hint = null;
    state.lastProfileSignature = null;
    updateLastSignal(null);
    setActiveCodes([]);
    clearVisuals();
    refreshProfileUi();
    updateEditUiState();
    startPolling();
    els.panel.focus();
  }

  function close() {
    const wasOpen = state.isOpen;
    const hadFocus = els.modal.contains(document.activeElement) || document.activeElement === document.body;
    state.isOpen = false;
    cancelTasks();
    state.calibrating = false;
    state.captureUpdateInProgress = false;
    els.modal.classList.remove('bm-tester-open');
    els.modal.setAttribute('aria-hidden', 'true');
    stopPolling();
    clearVisuals();
    updateEditUiState();
    if (wasOpen && hadFocus) restoreFocusAfterClose(state.opener);
    state.opener = null;
  }

  /** Show or hide the Debug and Profile editor panels; the tester panel keeps its size. */
  function setPanels(debugOpen, editorOpen) {
    const opened = debugOpen && !state.debugOpen ? els.debugSection : editorOpen && !state.editorOpen ? els.editorSection : null;
    state.debugOpen = debugOpen;
    state.editorOpen = editorOpen;
    els.debugSection.hidden = !debugOpen;
    els.editorSection.hidden = !editorOpen;
    els.debugBtn.setAttribute('aria-pressed', String(debugOpen));
    els.editorBtn.setAttribute('aria-pressed', String(editorOpen));
    els.panel.classList.toggle('bm-debug-on', debugOpen);
    els.panel.classList.toggle('bm-editor-on', editorOpen);
    els.panel.classList.toggle('bm-side-open', debugOpen || editorOpen);
    if (state.isOpen) updateFrame();
    if (opened) revealInBody(opened);
  }

  /** In the one-column layout, scroll a just-opened section into view inside the body (the panel stays put). */
  function revealInBody(section) {
    const body = els.body;
    if (!body || body.scrollHeight <= body.clientHeight) return;
    const delta = section.getBoundingClientRect().top - body.getBoundingClientRect().top;
    if (delta > 0 && delta < body.clientHeight - 40) return;
    body.scrollTop += delta;
  }

  async function captureSelectedUpdate() {
    if (!state.editMode || !state.selectedCode || state.captureUpdateInProgress) return;
    const gp = state.activeGamepadIndex == null ? pickGamepad() : getGamepadByIndex(state.activeGamepadIndex);
    if (!gp) {
      setEditStatus('No controller detected for update capture.');
      return;
    }

    state.captureUpdateInProgress = true;
    updateEditUiState();

    const task = startTask();
    try {
      await runCaptureUpdate(gp, task);
    } finally {
      endTask(task);
    }
    if (!task.cancelled && document.activeElement === els.panel && !els.captureUpdateBtn.disabled) els.captureUpdateBtn.focus();
  }

  async function runCaptureUpdate(gp, task) {
    const baseline = state.baseline || await captureBaseline(gp.index, 1000, {
      shouldCancel: () => !state.isOpen,
      task,
    });
    if (task.cancelled) return;
    if (!baseline) {
      state.captureUpdateInProgress = false;
      setEditStatus('Unable to capture baseline for update.');
      updateEditUiState();
      return;
    }

    const detected = await captureWithMiniModal({
      title: `Capture ${state.selectedCode}`,
      instruction: `Press and hold the input to map ${state.selectedCode}.`,
      gamepadIndex: gp.index,
      baseline,
      durationMs: 5000,
      task,
      returnFocus: els.panel,
    });
    // Closed or unmounted meanwhile: write nothing.
    if (task.cancelled) return;
    state.captureUpdateInProgress = false;
    if (!detected) {
      setEditStatus(`No signal captured for ${state.selectedCode}.`);
      updateEditUiState();
      return;
    }

    const mappingEntry = toProfileMappingEntry(detected);
    if (!mappingEntry) {
      setEditStatus(`Captured signal for ${state.selectedCode} could not be converted to a profile mapping.`);
      updateEditUiState();
      return;
    }

    const ok = manager.setGamepadProfileMappingEntry(gp.index, state.selectedCode, mappingEntry, {
      label: manager.getGamepadLabel(state.selectedCode, gp.index),
    });
    if (!ok) {
      setEditStatus(`Failed to update in-memory profile for ${state.selectedCode}.`);
      updateEditUiState();
      return;
    }

    profileEdited(gp.index);
    updateEditUiState();
    setEditStatus(`Updated ${state.selectedCode} in active in-memory profile mapping.`);
  }

  function downloadUpdatedPayload() {
    const gp = state.activeGamepadIndex == null ? pickGamepad() : getGamepadByIndex(state.activeGamepadIndex);
    if (!gp) {
      setEditStatus('No controller detected for profile export.');
      return;
    }
    const definition = manager.getGamepadProfileDefinition(gp.index);
    if (!definition) {
      setEditStatus('No in-memory profile definition is available to export.');
      return;
    }

    const payloadText = JSON.stringify(definition, null, 2);
    const key = definition.key || 'gamepad-profile';
    const fileName = `${key}.json`;
    const blob = new Blob([payloadText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setEditStatus(`Downloaded ${fileName} from the current in-memory profile mapping.`);
  }

  async function calibrateBaseline() {
    if (state.calibrating) return;
    const gp = state.activeGamepadIndex == null ? pickGamepad() : getGamepadByIndex(state.activeGamepadIndex);
    if (!gp) {
      setHint('No controller detected. Connect one, then calibrate.');
      return;
    }

    state.calibrating = true;
    els.calibrateBtn.disabled = true;
    const task = startTask();
    setHint('Calibrating baseline. Release all controls...', { sticky: true });

    try {
      const baseline = await captureBaseline(gp.index, 1500, {
        shouldCancel: () => !state.isOpen,
        task,
        onTick: (secondsLeft) => setHint(`Calibrating baseline. Release all controls... ${secondsLeft}s`, { sticky: true }),
      });

      if (task.cancelled) return;
      if (baseline) {
        state.baseline = baseline;
        state.activeGamepadIndex = gp.index;
        setHint('Calibration complete. Baseline locked for this session.');
      } else {
        setHint('Calibration cancelled or controller disconnected.');
      }
    } finally {
      endTask(task);
      state.calibrating = false;
      els.calibrateBtn.disabled = false;
    }
  }

  /** Poll once per animation frame while open; every DOM write is change-only. */
  function startPolling() {
    stopPolling();
    const loop = () => {
      state.frameId = null;
      if (!state.isOpen) return;
      updateFrame();
      if (state.isOpen) state.frameId = requestAnimationFrame(loop);
    };
    updateFrame();
    state.frameId = requestAnimationFrame(loop);
  }

  function stopPolling() {
    if (state.frameId != null) {
      cancelAnimationFrame(state.frameId);
      state.frameId = null;
    }
  }

  function updateFrame() {
    if (!state.isOpen) return;
    const gp = state.activeGamepadIndex == null ? pickGamepad() : getGamepadByIndex(state.activeGamepadIndex) || pickGamepad();
    state.connection = gp ? `pad:${gp.index}` : 'none';
    const hint = currentHint(gp ? DEFAULT_HINT : NO_PAD_HINT);
    if (!gp) {
      if (state.activeGamepadIndex != null || state.lastProfileSignature !== 'none') {
        state.lastProfileSignature = 'none';
        refreshProfileControls(profileControls, null);
      }
      state.activeGamepadIndex = null;
      pad.setEmpty(true);
      writeStatus(`No controller · ${hint}`);
      setActiveCodes([]);
      updateLastSignal(null);
      updateRawTable(null, null);
      clearVisuals();
      return;
    }

    state.activeGamepadIndex = gp.index;
    const resolvedProfile = manager.getResolvedGamepadProfile(gp.index);
    const signature = `${gp.index}:${gp.id}:${profileSignature(resolvedProfile)}`;
    if (signature !== state.lastProfileSignature) {
      state.lastProfileSignature = signature;
      refreshProfileControls(profileControls, gp.index);
      applyControllerLabels(gp.index);
    }
    pad.setEmpty(false);

    const mapping = resolvedProfile?.definition?.mapping;
    const baseline = state.baseline || createNeutralBaseline(gp);
    const activeCodes = getActiveLogicalCodes(gp, baseline, mapping);
    applyHighlights(activeCodes);
    updateSticks(gp, baseline, mapping);
    updateTriggers(gp, baseline, mapping);

    const strongest = getStrongestSignal(gp, baseline);
    if (state.debugOpen) {
      setActiveCodes(activeCodes, gp.index);
      updateRawTable(gp, baseline);
      updateLastSignal(strongest, resolveStrongestSignalToLogicalCode(strongest, gp, baseline, mapping), gp.index);
    }

    const now = performance.now();
    if (state.editMode && state.selectedCode && !state.captureUpdateInProgress && now - state.lastEditSample >= EDIT_SAMPLE_MS) {
      state.lastEditSample = now;
      if (!strongest) {
        state.editAutoCapture = { key: null, signal: null, frames: 0 };
        if (state.editCooldown) {
          state.editCooldown = false;
          if (state.selectedCode) setEditStatus(`${state.selectedCode} selected — press and hold the controller input to assign it.`);
        }
      } else if (!state.editCooldown) {
        const signalKey = `${strongest.kind}:${strongest.index}:${strongest.direction || 'none'}`;
        if (signalKey !== state.editAutoCapture.key) {
          state.editAutoCapture = { key: signalKey, signal: strongest, frames: 1 };
        } else {
          state.editAutoCapture.frames += strongest.delta >= HIGH_DELTA_THRESHOLD ? 2 : 1;
          state.editAutoCapture.signal = strongest;
        }
        const progress = Math.min(state.editAutoCapture.frames, AUTO_CAPTURE_FRAMES);
        setEditStatus(`Hold the control... (${progress}/${AUTO_CAPTURE_FRAMES})`);
        if (state.editAutoCapture.frames >= AUTO_CAPTURE_FRAMES) {
          const capturedSignal = state.editAutoCapture.signal;
          state.editAutoCapture = { key: null, signal: null, frames: 0 };
          applyEditCapture(capturedSignal, gp);
        }
      }
    }

    writeStatus(`Slot ${gp.index} · Connected · ${hint}`);
  }

  function applyEditCapture(strongest, gp) {
    if (!state.editMode || !state.selectedCode || state.captureUpdateInProgress) return;
    state.editCooldown = true;
    const mappingEntry = toProfileMappingEntry(strongest);
    const rawCode = toGpCode(strongest);
    const ok = mappingEntry
      ? manager.setGamepadProfileMappingEntry(gp.index, state.selectedCode, mappingEntry, {
          label: manager.getGamepadLabel(state.selectedCode, gp.index),
        })
      : false;
    profileEdited(gp.index);
    const successMsg = ok
      ? `Updated ${state.selectedCode} → ${rawCode} in active in-memory profile. Release button, then press again or click another node.`
      : `Failed to map ${state.selectedCode} from captured signal ${rawCode}.`;
    updateEditUiState();
    setEditStatus(successMsg);
  }

  /** The in-memory profile changed: refresh the header and the pad labels. */
  function profileEdited(gamepadIndex) {
    state.lastProfileSignature = null;
    refreshProfileControls(profileControls, gamepadIndex);
    applyControllerLabels(gamepadIndex);
  }

  function applyControllerLabels(gamepadIndex = 0) {
    const family = manager.getResolvedGamepadProfile(gamepadIndex)?.family ?? 'generic';
    if (pad.setLayout(getStickLayoutForFamily(family))) updateEditUiState();
    pad.setLabels((code) => manager.getGamepadLabel(code, gamepadIndex), family);
  }

  function applyHighlights(activeCodes) {
    const active = new Set(activeCodes);
    pad.setActive(active);
    for (const btn of codeButtons) writer.cls(btn, 'bm-active', active.has(btn.dataset.code));
  }

  function updateSticks(gamepad, baseline, mapping = null) {
    pad.setStick('left', getLogicalAxisValueFromMapping(gamepad, baseline, mapping, 0, 0), getLogicalAxisValueFromMapping(gamepad, baseline, mapping, 1, 1));
    pad.setStick('right', getLogicalAxisValueFromMapping(gamepad, baseline, mapping, 2, 2), getLogicalAxisValueFromMapping(gamepad, baseline, mapping, 3, 3));
  }

  function updateTriggers(gamepad, baseline, mapping = null) {
    pad.setTrigger('left', getTriggerFillValue(gamepad, baseline, mapping, 'GP_B6A', 6));
    pad.setTrigger('right', getTriggerFillValue(gamepad, baseline, mapping, 'GP_B7A', 7));
  }

  /** Rebuild the raw table cells only when the button/axis count changes; write values per cell. */
  function updateRawTable(gamepad, baseline) {
    const buttonCount = gamepad?.buttons?.length ?? 0;
    const axisCount = gamepad?.axes?.length ?? 0;
    if (raw.buttons.length !== buttonCount) {
      els.rawButtons.innerHTML = '<span></span>'.repeat(buttonCount);
      raw.buttons = [...els.rawButtons.children];
    }
    if (raw.axes.length !== axisCount) {
      els.rawAxes.innerHTML = '<div class="bm-tester-raw-axis"></div>'.repeat(axisCount);
      raw.axes = [...els.rawAxes.children];
    }
    for (let i = 0; i < buttonCount; i++) writer.text(raw.buttons[i], formatRawButton(gamepad, baseline, i));
    for (let i = 0; i < axisCount; i++) writer.text(raw.axes[i], formatRawAxis(gamepad, baseline, i));
  }

  /**
   * Show a hint in the status line. It expires after HINT_TTL_MS (sticky ones when replaced)
   * or when the connection state changes, then the default hint of the state shows.
   */
  function setHint(text, { sticky = false } = {}) {
    state.hint = { text, connection: state.connection, until: sticky ? Infinity : performance.now() + HINT_TTL_MS };
    if (state.isOpen) updateFrame();
  }

  function currentHint(fallback) {
    const h = state.hint;
    if (h && (h.connection !== state.connection || performance.now() > h.until)) state.hint = null;
    return state.hint?.text ?? fallback;
  }

  function writeStatus(text) {
    writer.text(els.status, text);
    writer.attr(els.status, 'title', text);
  }

  function setEditStatus(text) {
    writer.text(els.editStatus, text);
    writer.attr(els.editStatus, 'title', text);
  }

  function setActiveCodes(codes, gamepadIndex = 0) {
    const text = formatActiveCodes(codes, (code) => manager.getGamepadLabel(code, gamepadIndex));
    writer.text(els.activeCodes, `Active: ${text}`);
    writer.attr(els.activeCodes, 'title', text);
  }

  function updateLastSignal(signal, resolvedCode = null, gamepadIndex = 0) {
    const fields = formatSignalFields(signal);
    fields.resolved = signal
      ? `${resolvedCode || '(none)'} (${resolvedCode ? manager.getGamepadLabel(resolvedCode, gamepadIndex) : '(none)'})`
      : '—';
    signalGrid.set(fields);
  }

  function describeBindingEntry(entry) {
    if (entry.kind === 'button') return `Button ${entry.index} (${entry.code})`;
    if (entry.kind === 'axis') return `Axis ${entry.index} ${entry.direction === 'negative' ? 'negative' : 'positive'} (${entry.code})`;
    return entry.code || '(unknown)';
  }

  function getEffectiveBindingForCode(code) {
    if (state.activeGamepadIndex == null) return null;
    const resolved = manager.getResolvedGamepadProfile(state.activeGamepadIndex);
    const mapping = resolved?.definition?.mapping;
    const entry = mapping?.[code];
    if (!entry || typeof entry !== 'object') return null;
    if (entry.kind === 'button' && typeof entry.index === 'number') {
      return { source: 'effective-mapping', kind: 'button', index: entry.index, direction: null, code: `GP_B${entry.index}` };
    }
    if (entry.kind === 'axis' && typeof entry.index === 'number') {
      const direction = entry.direction === 'negative' ? 'negative' : 'positive';
      return { source: 'effective-mapping', kind: 'axis', index: entry.index, direction, code: `GP_A${entry.index}${direction === 'negative' ? 'N' : 'P'}` };
    }
    return null;
  }

  function getSelectedBindingEntries() {
    const code = state.selectedCode;
    if (!code) return [];
    const entries = [];
    const seen = new Set();
    const addEntry = (entry) => {
      if (!entry) return;
      const key = `${entry.kind}:${entry.index}:${entry.direction || 'none'}`;
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({ ...entry, key });
    };
    addEntry(getEffectiveBindingForCode(code));
    return entries;
  }

  function refreshSelectedBindingsList() {
    const shouldShow = state.editMode && !!state.selectedCode;
    els.bindingsSection.dataset.empty = String(!shouldShow);
    if (!shouldShow) {
      els.bindingsList.innerHTML = '';
      return;
    }
    const entries = getSelectedBindingEntries();
    if (!entries.length) {
      els.bindingsList.innerHTML = '<li class="bm-tester-binding-empty">No binding currently recorded for this target.</li>';
      return;
    }
    els.bindingsList.innerHTML = entries.map((entry) => {
      const sourceLabel = entry.source === 'effective-mapping' ? 'active tester mapping' : entry.source;
      return `
          <li class="bm-tester-binding-item">
            <div>
              <div>${_esc(describeBindingEntry(entry))}</div>
              <div class="bm-tester-binding-meta">Source: ${_esc(sourceLabel)}</div>
            </div>
            <button class="bm-tool-btn bm-tester-binding-remove" data-remove-binding="${_esc(entry.key)}">Remove</button>
          </li>`;
    }).join('');
  }

  function removeSelectedBinding(bindingKey) {
    if (!bindingKey || !state.selectedCode) return;
    const gp = state.activeGamepadIndex == null ? pickGamepad() : getGamepadByIndex(state.activeGamepadIndex);
    if (!gp) {
      setEditStatus('No controller detected to remove mapping from in-memory profile.');
      refreshSelectedBindingsList();
      return;
    }
    const activeBinding = getEffectiveBindingForCode(state.selectedCode);
    const activeKey = activeBinding ? `${activeBinding.kind}:${activeBinding.index}:${activeBinding.direction || 'none'}` : null;
    if (!activeKey || activeKey !== bindingKey) {
      setEditStatus(`Binding ${bindingKey} was not found for ${state.selectedCode}.`);
      refreshSelectedBindingsList();
      return;
    }
    const removed = manager.removeGamepadProfileMappingEntry(gp.index, state.selectedCode);
    if (!removed) {
      setEditStatus(`Failed to remove ${bindingKey} from ${state.selectedCode}.`);
      refreshSelectedBindingsList();
      return;
    }
    profileEdited(gp.index);
    refreshSelectedBindingsList();
    updateEditUiState();
    setEditStatus(`Removed binding ${bindingKey} from ${state.selectedCode}.`);
  }

  function updateEditUiState() {
    els.editToggleBtn.setAttribute('aria-pressed', String(state.editMode));
    pad.setEdit(state.editMode, state.selectedCode);
    els.triggerEditSection.dataset.disabled = String(!state.editMode);
    for (const btn of codeButtons) {
      btn.classList.toggle('bm-selected', state.editMode && state.selectedCode === btn.dataset.code);
    }
    writer.text(els.editTarget, `Edit target: ${state.selectedCode || '(none)'}`);
    if (!state.editMode) {
      setEditStatus('Edit mode is off.');
      state.editAutoCapture = { key: null, signal: null, frames: 0 };
      state.editCooldown = false;
    } else if (!state.selectedCode) {
      setEditStatus('Click a control on the controller view to select a target code.');
      state.editAutoCapture = { key: null, signal: null, frames: 0 };
      state.editCooldown = false;
    } else if (state.captureUpdateInProgress) {
      setEditStatus(`Capturing update for ${state.selectedCode}...`);
    } else if (!state.editCooldown) {
      setEditStatus(`${state.selectedCode} selected — press and hold the controller input to assign it.`);
      state.editAutoCapture = { key: null, signal: null, frames: 0 };
    }
    const canCapture = state.editMode && state.selectedCode && !state.captureUpdateInProgress;
    els.captureUpdateBtn.disabled = !canCapture;
    els.downloadUpdatedBtn.disabled = state.activeGamepadIndex == null;
    refreshSelectedBindingsList();
  }

  function clearVisuals() {
    applyHighlights([]);
    pad.clear();
  }

  return { open, close, isOpen: () => state.isOpen };
}
