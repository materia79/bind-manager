import { _esc } from './esc.js';
import {
  getStrongestSignal,
  toGpCode,
  resolveStrongestSignalToLogicalCode,
  getActiveLogicalCodes,
  createNeutralBaseline,
  updateRawInputDisplay,
  getLogicalAxisValueFromMapping,
  getTriggerFillValue,
  toProfileMappingEntry,
} from './signals.js';

/**
 * Controller Tester tool: live controller view, signal details and the in-memory
 * profile editor.
 * @param {ReturnType<import('./tool-context.js').createToolContext>} ctx
 */
export function createControllerTester(ctx) {
  const { manager, q, addWindowListener, setSharedCapturePayload, pickGamepad, resolvePreferredGamepadIndex, getGamepadByIndex, captureBaseline, captureWithMiniModal, refreshProfileControls, wireProfileControls, formatResolvedProfileSummary, applyControllerLabels } = ctx;

  const els = {
    modal: q('.bm-tester-modal'),
    panel: q('.bm-tester-panel'),
    controller: q('.bm-tester-controller'),
    profileStatus: q('.bm-tester-profile-status'),
    profileSelect: q('.bm-tester-profile-select'),
    profileAutoBtn: q('.bm-tester-profile-auto-btn'),
    status: q('.bm-tester-status'),
    detail: q('.bm-tester-detail'),
    lastSignal: q('.bm-tester-last-signal'),
    activeCodes: q('.bm-tester-active-codes'),
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
    rawToggleBtn: q('.bm-tester-raw-toggle-btn'),
    rawPre: q('.bm-tester-raw-pre'),
    leftStickDot: q('.bm-tester-left-stick-dot'),
    rightStickDot: q('.bm-tester-right-stick-dot'),
    l2Fill: q('.bm-tester-l2-fill'),
    r2Fill: q('.bm-tester-r2-fill'),
  };

  const controllerNodes = [...els.controller.querySelectorAll('[data-code]')];
  const AUTO_CAPTURE_FRAMES = 2;
  const HIGH_DELTA_THRESHOLD = 0.85;
  const state = {
    isOpen: false,
    pollTimer: null,
    activeGamepadIndex: null,
    baseline: null,
    calibrating: false,
    lastProfileSignature: null,
    editMode: false,
    selectedCode: null,
    captureUpdateInProgress: false,
    editAutoCapture: { key: null, signal: null, frames: 0 },
    editCooldown: false,
  };

  const refreshProfileUi = () => {
    if (!state.isOpen) return;
    const activeIndex = resolvePreferredGamepadIndex(state.activeGamepadIndex);
    state.activeGamepadIndex = activeIndex;
    refreshProfileControls(els.profileSelect, els.profileAutoBtn, els.profileStatus, activeIndex);
  };

  els.closeBtn.addEventListener('click', close);
  els.calibrateBtn.addEventListener('click', calibrateBaseline);
  els.rawToggleBtn.addEventListener('click', () => {
    const nowHidden = !els.rawPre.hidden;
    els.rawPre.hidden = nowHidden;
    els.rawToggleBtn.textContent = nowHidden ? 'Show raw input' : 'Hide raw input';
  });
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
      els.editStatus.textContent = `Update failed: ${err?.message || String(err)}`;
      state.captureUpdateInProgress = false;
      updateEditUiState();
    });
  });
  els.downloadUpdatedBtn.addEventListener('click', downloadUpdatedPayload);
  wireProfileControls({
    selectEl: els.profileSelect,
    autoBtn: els.profileAutoBtn,
    statusEl: els.profileStatus,
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
    state.selectedCode = node.dataset.code || null;
    updateEditUiState();
  });
  els.modal.addEventListener('keydown', (ev) => {
    if (ev.code === 'Escape') {
      ev.preventDefault();
      close();
    }
  });

  function open() {
    state.isOpen = true;
    state.activeGamepadIndex = resolvePreferredGamepadIndex(state.activeGamepadIndex);
    els.modal.classList.add('bm-tester-open');
    els.modal.setAttribute('aria-hidden', 'false');
    setStatus('Listening for controller input.');
    setDetail('Press any button, trigger, d-pad direction, or stick direction.');
    updateLastSignal(null);
    setActiveCodes([]);
    clearVisuals();
    refreshProfileUi();
    updateEditUiState();
    startPolling();
    els.panel.focus();
  }

  function close() {
    state.isOpen = false;
    state.calibrating = false;
    els.modal.classList.remove('bm-tester-open');
    els.modal.setAttribute('aria-hidden', 'true');
    stopPolling();
    clearVisuals();
    setDetail('Idle.');
    updateEditUiState();
  }

  async function captureSelectedUpdate() {
    if (!state.editMode || !state.selectedCode || state.captureUpdateInProgress) return;
    const gp = state.activeGamepadIndex == null ? pickGamepad() : getGamepadByIndex(state.activeGamepadIndex);
    if (!gp) {
      els.editStatus.textContent = 'No controller detected for update capture.';
      return;
    }

    state.captureUpdateInProgress = true;
    updateEditUiState();

    const baseline = state.baseline || await captureBaseline(gp.index, 1000, {
      shouldCancel: () => !state.isOpen,
    });
    if (!baseline) {
      state.captureUpdateInProgress = false;
      els.editStatus.textContent = 'Unable to capture baseline for update.';
      updateEditUiState();
      return;
    }

    const detected = await captureWithMiniModal({
      title: `Capture ${state.selectedCode}`,
      instruction: `Press and hold the input to map ${state.selectedCode}.`,
      gamepadIndex: gp.index,
      baseline,
      durationMs: 5000,
    });
    state.captureUpdateInProgress = false;
    if (!detected) {
      els.editStatus.textContent = `No signal captured for ${state.selectedCode}.`;
      updateEditUiState();
      return;
    }

    const mappingEntry = toProfileMappingEntry(detected);
    if (!mappingEntry) {
      els.editStatus.textContent = `Captured signal for ${state.selectedCode} could not be converted to a profile mapping.`;
      updateEditUiState();
      return;
    }

    const ok = manager.setGamepadProfileMappingEntry(gp.index, state.selectedCode, mappingEntry, {
      label: manager.getGamepadLabel(state.selectedCode, gp.index),
    });
    if (!ok) {
      els.editStatus.textContent = `Failed to update in-memory profile for ${state.selectedCode}.`;
      updateEditUiState();
      return;
    }

    state.lastProfileSignature = null;
    refreshProfileControls(els.profileSelect, els.profileAutoBtn, els.profileStatus, gp.index);
    applyControllerLabels(gp.index);
    els.editStatus.textContent = `Updated ${state.selectedCode} in active in-memory profile mapping.`;
    updateEditUiState();
  }

  function downloadUpdatedPayload() {
    const gp = state.activeGamepadIndex == null ? pickGamepad() : getGamepadByIndex(state.activeGamepadIndex);
    if (!gp) {
      els.editStatus.textContent = 'No controller detected for profile export.';
      return;
    }
    const definition = manager.getGamepadProfileDefinition(gp.index);
    if (!definition) {
      els.editStatus.textContent = 'No in-memory profile definition is available to export.';
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
    els.editStatus.textContent = `Downloaded ${fileName} from the current in-memory profile mapping.`;
  }

  async function calibrateBaseline() {
    if (state.calibrating) return;
    const gp = state.activeGamepadIndex == null ? pickGamepad() : getGamepadByIndex(state.activeGamepadIndex);
    if (!gp) {
      setStatus('No controller detected. Connect one, then calibrate.');
      return;
    }

    state.calibrating = true;
    els.calibrateBtn.disabled = true;
    setStatus('Calibrating baseline. Release all controls...');

    try {
      const baseline = await captureBaseline(gp.index, 1500, {
        shouldCancel: () => !state.isOpen,
        onTick: (secondsLeft) => setDetail(`Calibrating... ${secondsLeft}s remaining`),
      });

      if (baseline) {
        state.baseline = baseline;
        state.activeGamepadIndex = gp.index;
        setStatus('Calibration complete. Baseline locked for this session.');
      } else {
        setStatus('Calibration cancelled or controller disconnected.');
      }
    } finally {
      state.calibrating = false;
      els.calibrateBtn.disabled = false;
    }
  }

  function startPolling() {
    stopPolling();
    updateFrame();
    state.pollTimer = setInterval(updateFrame, 100);
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function updateFrame() {
    if (!state.isOpen) return;
    const gp = state.activeGamepadIndex == null ? pickGamepad() : getGamepadByIndex(state.activeGamepadIndex) || pickGamepad();
    if (!gp) {
      state.activeGamepadIndex = null;
      setStatus('No controller detected. Connect a controller to begin.');
      setDetail('Waiting for gamepad connection...');
      setActiveCodes([]);
      updateLastSignal(null);
      clearVisuals();
      return;
    }

    state.activeGamepadIndex = gp.index;
    const resolvedProfile = manager.getResolvedGamepadProfile(gp.index);
    const profileSignature = JSON.stringify({
      source: resolvedProfile.source,
      family: resolvedProfile.family,
      profileKey: resolvedProfile.profileKey,
      override: resolvedProfile.override,
    });
    if (profileSignature !== state.lastProfileSignature) {
      state.lastProfileSignature = profileSignature;
      refreshProfileControls(els.profileSelect, els.profileAutoBtn, els.profileStatus, gp.index);
      applyControllerLabels(gp.index);
    }

    const baseline = state.baseline || createNeutralBaseline(gp);
    const activeCodes = getActiveLogicalCodes(gp, baseline, resolvedProfile?.definition?.mapping);
    applyHighlights(activeCodes);
    updateSticks(gp, baseline, resolvedProfile?.definition?.mapping);
    updateTriggers(gp, baseline, resolvedProfile?.definition?.mapping);
    setActiveCodes(activeCodes, gp.index);
    updateRawInputDisplay(els.rawPre, gp, baseline);

    const strongest = getStrongestSignal(gp, baseline);
    const resolvedStrongest = resolveStrongestSignalToLogicalCode(strongest, gp, baseline, resolvedProfile?.definition?.mapping);
    updateLastSignal(strongest, resolvedStrongest, gp.index);

    if (state.editMode && state.selectedCode && !state.captureUpdateInProgress) {
      if (!strongest) {
        state.editAutoCapture = { key: null, signal: null, frames: 0 };
        if (state.editCooldown) {
          state.editCooldown = false;
          if (state.selectedCode) {
            els.editStatus.textContent = `${state.selectedCode} selected — press and hold the controller input to assign it.`;
          }
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
        els.editStatus.textContent = `Hold the control... (${progress}/${AUTO_CAPTURE_FRAMES})`;
        if (state.editAutoCapture.frames >= AUTO_CAPTURE_FRAMES) {
          const capturedSignal = state.editAutoCapture.signal;
          state.editAutoCapture = { key: null, signal: null, frames: 0 };
          applyEditCapture(capturedSignal, gp, baseline);
        }
      }
    }

    setStatus(`Controller connected on slot ${gp.index}.`);
    setDetail(`${formatResolvedProfileSummary(gp.index)}\n${gp.id}`);
  }

  function applyEditCapture(strongest, gp, baseline) {
    if (!state.editMode || !state.selectedCode || state.captureUpdateInProgress) return;
    state.editCooldown = true;
    const mappingEntry = toProfileMappingEntry(strongest);
    const rawCode = toGpCode(strongest);
    const ok = mappingEntry
      ? manager.setGamepadProfileMappingEntry(gp.index, state.selectedCode, mappingEntry, {
          label: manager.getGamepadLabel(state.selectedCode, gp.index),
        })
      : false;
    state.lastProfileSignature = null;
    refreshProfileControls(els.profileSelect, els.profileAutoBtn, els.profileStatus, gp.index);
    applyControllerLabels(gp.index);
    const successMsg = ok
      ? `Updated ${state.selectedCode} → ${rawCode} in active in-memory profile. Release button, then press again or click another node.`
      : `Failed to map ${state.selectedCode} from captured signal ${rawCode}.`;
    updateEditUiState();
    els.editStatus.textContent = successMsg;
  }

  function applyHighlights(activeCodes) {
    const active = new Set(activeCodes);
    for (const node of controllerNodes) {
      node.classList.toggle('bm-active', active.has(node.dataset.code));
    }
    for (const btn of els.triggerEditSection.querySelectorAll('.bm-tester-code-btn')) {
      btn.classList.toggle('bm-active', active.has(btn.dataset.code));
    }
  }

  function updateSticks(gamepad, baseline, mapping = null) {
    const lx = getLogicalAxisValueFromMapping(gamepad, baseline, mapping, 0, 0);
    const ly = getLogicalAxisValueFromMapping(gamepad, baseline, mapping, 1, 1);
    const rx = getLogicalAxisValueFromMapping(gamepad, baseline, mapping, 2, 2);
    const ry = getLogicalAxisValueFromMapping(gamepad, baseline, mapping, 3, 3);
    els.leftStickDot.style.transform = `translate(calc(-50% + ${Math.round(lx * 14)}px), calc(-50% + ${Math.round(ly * 14)}px))`;
    els.rightStickDot.style.transform = `translate(calc(-50% + ${Math.round(rx * 14)}px), calc(-50% + ${Math.round(ry * 14)}px))`;
  }

  function updateTriggers(gamepad, baseline, mapping = null) {
    const left = getTriggerFillValue(gamepad, baseline, mapping, 'GP_B6A', 6);
    const right = getTriggerFillValue(gamepad, baseline, mapping, 'GP_B7A', 7);
    els.l2Fill.style.height = `${Math.round(left * 100)}%`;
    els.r2Fill.style.height = `${Math.round(right * 100)}%`;
  }

  function setStatus(text) { els.status.textContent = text; }
  function setDetail(text) { els.detail.textContent = text; }

  function setActiveCodes(codes, gamepadIndex = 0) {
    els.activeCodes.textContent = `Active codes: ${codes.length ? codes.map((code) => `${code}=${manager.getGamepadLabel(code, gamepadIndex)}`).join(', ') : '(none)'}`;
  }

  function updateLastSignal(signal, resolvedCode = null, gamepadIndex = 0) {
    if (!signal) {
      els.lastSignal.textContent = 'Last strongest signal: (none)';
      return;
    }
    const resolvedLabel = resolvedCode ? manager.getGamepadLabel(resolvedCode, gamepadIndex) : '(none)';
    els.lastSignal.textContent = [
      'Last strongest signal:',
      `kind: ${signal.kind}`,
      `index: ${signal.index}`,
      `direction: ${signal.direction || 'n/a'}`,
      `delta: ${signal.delta.toFixed(4)}`,
      `raw: ${signal.rawValue.toFixed(4)}`,
      `code: ${toGpCode(signal)}`,
      `resolved: ${resolvedCode || '(none)'} (${resolvedLabel})`,
    ].join('\n');
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
    els.bindingsSection.style.display = shouldShow ? '' : 'none';
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
      els.editStatus.textContent = 'No controller detected to remove mapping from in-memory profile.';
      refreshSelectedBindingsList();
      return;
    }
    const activeBinding = getEffectiveBindingForCode(state.selectedCode);
    const activeKey = activeBinding ? `${activeBinding.kind}:${activeBinding.index}:${activeBinding.direction || 'none'}` : null;
    if (!activeKey || activeKey !== bindingKey) {
      els.editStatus.textContent = `Binding ${bindingKey} was not found for ${state.selectedCode}.`;
      refreshSelectedBindingsList();
      return;
    }
    const removed = manager.removeGamepadProfileMappingEntry(gp.index, state.selectedCode);
    if (!removed) {
      els.editStatus.textContent = `Failed to remove ${bindingKey} from ${state.selectedCode}.`;
      refreshSelectedBindingsList();
      return;
    }
    state.lastProfileSignature = null;
    refreshProfileControls(els.profileSelect, els.profileAutoBtn, els.profileStatus, gp.index);
    applyControllerLabels(gp.index);
    refreshSelectedBindingsList();
    updateEditUiState();
    els.editStatus.textContent = `Removed binding ${bindingKey} from ${state.selectedCode}.`;
  }

  function updateEditUiState() {
    els.editToggleBtn.textContent = state.editMode ? 'Disable Edit Mode' : 'Enable Edit Mode';
    els.controller.classList.toggle('bm-tester-edit-mode', state.editMode);
    for (const node of controllerNodes) {
      const isSelected = state.editMode && state.selectedCode === node.dataset.code;
      node.classList.toggle('bm-selected', isSelected);
      node.classList.toggle('bm-editable', state.editMode);
    }
    els.triggerEditSection.style.display = state.editMode ? '' : 'none';
    for (const btn of els.triggerEditSection.querySelectorAll('.bm-tester-code-btn')) {
      btn.classList.toggle('bm-selected', state.editMode && state.selectedCode === btn.dataset.code);
    }
    els.editTarget.textContent = `Edit target: ${state.selectedCode || '(none)'}`;
    if (!state.editMode) {
      els.editStatus.textContent = 'Edit mode is off.';
      state.editAutoCapture = { key: null, signal: null, frames: 0 };
      state.editCooldown = false;
    } else if (!state.selectedCode) {
      els.editStatus.textContent = 'Click a control on the controller view to select a target code.';
      state.editAutoCapture = { key: null, signal: null, frames: 0 };
      state.editCooldown = false;
    } else if (state.captureUpdateInProgress) {
      els.editStatus.textContent = `Capturing update for ${state.selectedCode}...`;
    } else if (!state.editCooldown) {
      els.editStatus.textContent = `${state.selectedCode} selected — press and hold the controller input to assign it.`;
      state.editAutoCapture = { key: null, signal: null, frames: 0 };
    }
    const canCapture = state.editMode && state.selectedCode && !state.captureUpdateInProgress;
    els.captureUpdateBtn.disabled = !canCapture;
    els.downloadUpdatedBtn.disabled = state.activeGamepadIndex == null;
    refreshSelectedBindingsList();
  }

  function clearVisuals() {
    applyHighlights([]);
    els.leftStickDot.style.transform = 'translate(-50%, -50%)';
    els.rightStickDot.style.transform = 'translate(-50%, -50%)';
    els.l2Fill.style.height = '0%';
    els.r2Fill.style.height = '0%';
  }

  return { open, close, isOpen: () => state.isOpen };
}

