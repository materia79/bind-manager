import { injectStyles } from './styles.js';

const CAPTURE_PRESETS = {
  dualsense: {
    id: 'dualsense',
    label: 'DualSense / PlayStation Layout',
    family: 'dualsense',
    steps: [
      { label: 'Cross', expectedCode: 'GP_B0', instruction: 'Press and hold Cross.' },
      { label: 'Circle', expectedCode: 'GP_B1', instruction: 'Press and hold Circle.' },
      { label: 'Square', expectedCode: 'GP_B2', instruction: 'Press and hold Square.' },
      { label: 'Triangle', expectedCode: 'GP_B3', instruction: 'Press and hold Triangle.' },
      { label: 'L1', expectedCode: 'GP_B4', instruction: 'Press and hold L1.' },
      { label: 'R1', expectedCode: 'GP_B5', instruction: 'Press and hold R1.' },
      { label: 'L2 (digital)', expectedCode: 'GP_B6', instruction: 'Press L2 lightly until it clicks (digital threshold only).' },
      { label: 'L2 (analog)', expectedCode: 'GP_B6A', instruction: 'Press L2 fully past the click to record the full analog axis signal.' },
      { label: 'R2 (digital)', expectedCode: 'GP_B7', instruction: 'Press R2 lightly until it clicks (digital threshold only).' },
      { label: 'R2 (analog)', expectedCode: 'GP_B7A', instruction: 'Press R2 fully past the click to record the full analog axis signal.' },
      { label: 'Create', expectedCode: 'GP_B8', instruction: 'Press and hold Create.' },
      { label: 'Options', expectedCode: 'GP_B9', instruction: 'Press and hold Options.' },
      { label: 'L3', expectedCode: 'GP_B10', instruction: 'Press and hold L3 (left stick click).' },
      { label: 'R3', expectedCode: 'GP_B11', instruction: 'Press and hold R3 (right stick click).' },
      { label: 'D-Pad Up', expectedCode: 'GP_B12', instruction: 'Press and hold D-Pad Up.' },
      { label: 'D-Pad Down', expectedCode: 'GP_B13', instruction: 'Press and hold D-Pad Down.' },
      { label: 'D-Pad Left', expectedCode: 'GP_B14', instruction: 'Press and hold D-Pad Left.' },
      { label: 'D-Pad Right', expectedCode: 'GP_B15', instruction: 'Press and hold D-Pad Right.' },
      { label: 'PS', expectedCode: 'GP_B16', instruction: 'Press and hold the PS button.' },
      { label: 'Left Stick Left', expectedCode: 'GP_A0N', instruction: 'Move and hold the left stick fully left.' },
      { label: 'Left Stick Right', expectedCode: 'GP_A0P', instruction: 'Move and hold the left stick fully right.' },
      { label: 'Left Stick Up', expectedCode: 'GP_A1N', instruction: 'Move and hold the left stick fully up.' },
      { label: 'Left Stick Down', expectedCode: 'GP_A1P', instruction: 'Move and hold the left stick fully down.' },
      { label: 'Right Stick Left', expectedCode: 'GP_A2N', instruction: 'Move and hold the right stick fully left.' },
      { label: 'Right Stick Right', expectedCode: 'GP_A2P', instruction: 'Move and hold the right stick fully right.' },
      { label: 'Right Stick Up', expectedCode: 'GP_A3N', instruction: 'Move and hold the right stick fully up.' },
      { label: 'Right Stick Down', expectedCode: 'GP_A3P', instruction: 'Move and hold the right stick fully down.' },
    ],
  },
};

const DEFAULT_CAPTURE_PRESET = 'dualsense';
const DPAD_CODES = ['GP_B12', 'GP_B13', 'GP_B14', 'GP_B15'];
const BUILT_IN_TOOLS_CSS = `
.bm-debug-modal,
.bm-tester-modal,
.bm-capture-mini-modal {
  position: fixed;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  pointer-events: all;
}

.bm-debug-modal { z-index: 10020; background: rgba(0, 0, 0, 0.78); backdrop-filter: blur(4px); }
.bm-debug-modal.bm-debug-open { display: flex; }
.bm-tester-modal { z-index: 10030; background: rgba(2, 10, 18, 0.82); backdrop-filter: blur(4px); }
.bm-tester-modal.bm-tester-open { display: flex; }
.bm-capture-mini-modal { z-index: 10040; background: rgba(0, 0, 0, 0.55); }
.bm-capture-mini-modal.bm-open { display: flex; }

.bm-debug-panel,
.bm-tester-panel,
.bm-capture-mini-panel {
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
}

.bm-debug-panel {
  width: min(880px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #111526;
  border: 1px solid #38446b;
  border-radius: 10px;
}

.bm-debug-head,
.bm-tester-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 14px 16px;
}

.bm-debug-head h2,
.bm-tester-head h2 { font-size: 15px; color: #f0f2ff; }
.bm-tester-head h2 { color: #e8f8ff; }

.bm-debug-body {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 12px;
  padding: 12px;
  overflow: auto;
}

.bm-debug-card,
.bm-tester-card {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  padding: 10px;
}

.bm-debug-card h3,
.bm-tester-card h3 {
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.bm-debug-card h3 { color: #9ab0ff; }
.bm-tester-card h3 { color: #86dfff; }

.bm-debug-status { min-height: 44px; color: #cfd8ff; line-height: 1.45; }
.bm-debug-progress { margin-top: 8px; font-size: 12px; color: #9fb2f5; }
.bm-debug-countdown { margin-top: 8px; font-size: 12px; color: #ffc177; font-weight: 600; }
.bm-debug-live,
.bm-tester-last-signal,
.bm-tester-active-codes,
.bm-capture-mini-live {
  margin-top: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.24);
  padding: 8px;
  font-size: 12px;
  line-height: 1.4;
  white-space: pre-wrap;
}

.bm-debug-live { max-height: 180px; overflow: auto; color: #b8c4ff; }
.bm-tester-last-signal,
.bm-tester-active-codes { color: #b8def8; }
.bm-capture-mini-live { color: #a7eaff; border-color: rgba(100, 180, 220, 0.2); background: rgba(9, 18, 27, 0.8); }

.bm-debug-results {
  width: 100%;
  min-height: 260px;
  resize: vertical;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.3);
  color: #dfe5ff;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  padding: 10px;
}

.bm-debug-actions,
.bm-tester-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.bm-debug-small,
.bm-tester-help { font-size: 12px; margin-top: 6px; }
.bm-debug-small { color: #98a6d8; }
.bm-tester-help { color: #8eb8d4; }

.bm-debug-profile-select,
.bm-tester-profile-select {
  min-width: 220px;
  max-width: 100%;
  height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid rgba(92, 124, 250, 0.4);
  background: rgba(15, 24, 38, 0.85);
  color: #dce6ff;
}

.bm-tool-btn {
  background: rgba(92, 124, 250, 0.2);
  border: 1px solid rgba(92, 124, 250, 0.5);
  border-radius: 7px;
  color: #c0ccff;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  padding: 7px 16px;
  transition: background 0.15s, border-color 0.15s;
}

.bm-tool-btn:hover { background: rgba(92, 124, 250, 0.4); border-color: #5c7cfa; }

.bm-tester-panel {
  width: min(940px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #0f1a26;
  border: 1px solid #35506d;
  border-radius: 10px;
}

.bm-tester-body {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 12px;
  padding: 12px;
  overflow: auto;
}

.bm-tester-status { min-height: 24px; color: #daf2ff; line-height: 1.45; margin-bottom: 6px; }
.bm-tester-detail { font-size: 12px; color: #9fc0d8; min-height: 36px; line-height: 1.4; }

.bm-tester-controller {
  position: relative;
  width: min(540px, 100%);
  height: 320px;
  margin: 0 auto;
  border-radius: 160px;
  border: 1px solid rgba(150, 210, 240, 0.2);
  background:
    radial-gradient(circle at 50% 45%, rgba(66, 164, 212, 0.22), rgba(14, 28, 42, 0.94) 64%),
    linear-gradient(165deg, rgba(40, 80, 110, 0.45), rgba(9, 16, 25, 0.95));
  overflow: hidden;
}

.bm-tester-controller::before {
  content: '';
  position: absolute;
  inset: 14px;
  border-radius: 150px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  pointer-events: none;
}

.bm-tester-node {
  position: absolute;
  min-width: 24px;
  min-height: 24px;
  border-radius: 999px;
  border: 1px solid rgba(191, 223, 244, 0.35);
  color: #d9edfa;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(12, 25, 36, 0.9);
  transition: transform 0.08s ease, box-shadow 0.08s ease, border-color 0.08s ease;
  padding: 4px 6px;
  text-align: center;
  pointer-events: none;
}

.bm-tester-controller.bm-tester-edit-mode .bm-tester-node.bm-editable {
  pointer-events: auto;
  cursor: pointer;
  border-style: dashed;
}

.bm-tester-controller.bm-tester-edit-mode .bm-tester-node.bm-editable:hover {
  transform: scale(1.06);
  border-color: rgba(236, 248, 255, 0.86);
}

.bm-tester-node.bm-selected {
  border-color: #ffd56a;
  box-shadow: 0 0 14px rgba(255, 213, 106, 0.7);
  background: rgba(62, 41, 8, 0.92);
  color: #fff8e5;
}

.bm-tester-node.bm-active {
  border-color: #7cf0ff;
  box-shadow: 0 0 14px rgba(124, 240, 255, 0.75);
  transform: scale(1.06);
  background: rgba(18, 55, 78, 0.95);
  color: #f2fcff;
}

.bm-tester-node.bm-wide { border-radius: 8px; min-width: 46px; min-height: 22px; }

.bm-tester-stick {
  position: absolute;
  width: 88px;
  height: 88px;
  border-radius: 50%;
  border: 1px solid rgba(178, 214, 236, 0.36);
  background: rgba(6, 12, 20, 0.55);
  pointer-events: none;
}

.bm-tester-stick::before,
.bm-tester-stick::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  background: rgba(180, 210, 228, 0.18);
  transform: translate(-50%, -50%);
}

.bm-tester-stick::before { width: 1px; height: 100%; }
.bm-tester-stick::after { width: 100%; height: 1px; }

.bm-tester-stick-dot {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid rgba(200, 232, 250, 0.7);
  background: rgba(78, 157, 208, 0.55);
  transform: translate(-50%, -50%);
  transition: transform 0.08s linear;
}

.bm-tester-trigger-meter {
  position: absolute;
  width: 18px;
  height: 58px;
  border-radius: 8px;
  border: 1px solid rgba(180, 220, 245, 0.32);
  background: rgba(8, 14, 22, 0.66);
  overflow: hidden;
}

.bm-tester-trigger-fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 0%;
  background: linear-gradient(180deg, rgba(83, 178, 233, 0.72), rgba(30, 105, 158, 0.95));
  transition: height 0.08s linear;
}

.bm-tester-raw-section { margin-top: 6px; text-align: left; }
.bm-tester-raw-pre {
  font-family: 'Courier New', Courier, monospace;
  font-size: 10px;
  line-height: 1.5;
  color: #7cc8ea;
  background: rgba(7, 15, 23, 0.88);
  border: 1px solid rgba(100, 180, 220, 0.18);
  border-radius: 6px;
  padding: 8px 10px;
  margin-top: 6px;
  max-height: 220px;
  overflow-y: auto;
  white-space: pre;
  text-align: left;
}

.bm-tester-trigger-edit {
  position: absolute;
  left: 50%;
  top: 94px;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid rgba(100, 180, 220, 0.25);
  background: rgba(7, 15, 23, 0.82);
  font-size: 11px;
  color: #b8def8;
  z-index: 3;
}

.bm-tester-trigger-edit span { opacity: 0.9; white-space: nowrap; }
.bm-tester-code-btn { font-size: 11px; padding: 2px 8px; height: 26px; }
.bm-tester-code-btn.bm-active { border-color: #4dd; background: rgba(0, 30, 40, 0.9); color: #aff; }
.bm-tester-code-btn.bm-selected { border-color: #ffd56a; background: rgba(62, 41, 8, 0.9); color: #fff8e5; }

.bm-tester-bindings-section {
  margin-top: 8px;
  border: 1px solid rgba(100, 180, 220, 0.2);
  border-radius: 8px;
  background: rgba(8, 16, 24, 0.75);
  padding: 8px;
}

.bm-tester-bindings-head { font-size: 12px; color: #b8def8; margin-bottom: 6px; }
.bm-tester-bindings-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }

.bm-tester-binding-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(100, 180, 220, 0.15);
  border-radius: 6px;
  padding: 6px 8px;
  background: rgba(11, 20, 30, 0.8);
  font-size: 12px;
  color: #d6ecff;
}

.bm-tester-binding-meta { color: #8eb8d4; font-size: 11px; }
.bm-tester-binding-remove { height: 24px; padding: 2px 8px; font-size: 11px; flex-shrink: 0; }
.bm-tester-binding-empty {
  color: #8eb8d4;
  font-size: 12px;
  font-style: italic;
  border: 1px dashed rgba(100, 180, 220, 0.2);
  border-radius: 6px;
  padding: 6px 8px;
}

.bm-capture-mini-panel {
  width: min(560px, 92vw);
  max-height: 80vh;
  overflow: auto;
  border-radius: 12px;
  border: 1px solid rgba(110, 200, 230, 0.35);
  background: linear-gradient(180deg, rgba(10, 22, 34, 0.98), rgba(8, 16, 24, 0.98));
  color: #d6ecff;
  padding: 12px 14px;
}

.bm-capture-mini-instruction { margin-top: 6px; font-size: 14px; color: #d6ecff; }
.bm-capture-mini-countdown { margin-top: 6px; font-size: 13px; color: #8fd6ff; }

@media (max-width: 860px) {
  .bm-debug-body { grid-template-columns: 1fr; }
  .bm-tester-body { grid-template-columns: 1fr; }
  .bm-tester-controller { height: 300px; }
}
`;

let builtInToolsStylesInjected = false;

export function createBuiltInToolsController(manager, options = {}) {
  const enabledTools = normalizeBuiltInToolsOption(options.builtInTools);
  let root = null;
  let container = null;
  let cleanupFns = [];
  let inputDebug = null;
  let controllerTester = null;
  let sharedCapturePayload = null;
  let syncInputDebuggerFromSharedPayload = null;

  function injectToolStyles() {
    if (builtInToolsStylesInjected || typeof document === 'undefined') return;
    builtInToolsStylesInjected = true;
    const style = document.createElement('style');
    style.dataset.bindManager = 'built-in-tools';
    style.textContent = BUILT_IN_TOOLS_CSS;
    document.head.appendChild(style);
  }

  function mount(target) {
    if (!enabledTools.inputRemap && !enabledTools.controllerTest) return;
    if (root || !target) return;
    injectStyles();
    injectToolStyles();
    container = target;
    root = document.createElement('div');
    root.className = 'bm-built-in-tools-root';
    root.innerHTML = getBuiltInToolsHtml();
    container.appendChild(root);
    inputDebug = createInputDebugger();
    controllerTester = createControllerTester();
  }

  function unmount() {
    inputDebug?.close?.();
    controllerTester?.close?.();
    for (const fn of cleanupFns) fn();
    cleanupFns = [];
    root?.remove();
    root = null;
    container = null;
    inputDebug = null;
    controllerTester = null;
    syncInputDebuggerFromSharedPayload = null;
    sharedCapturePayload = null;
  }

  function openInputRemap() {
    if (!enabledTools.inputRemap) return;
    inputDebug?.open();
  }

  function openControllerTest() {
    if (!enabledTools.controllerTest) return;
    controllerTester?.open();
  }

  function getFooterActions() {
    const actions = [];
    if (enabledTools.inputRemap) {
      actions.push({
        id: 'input-debug',
        label: 'Input Remap',
        className: 'debug',
        onClick: () => openInputRemap(),
      });
    }
    if (enabledTools.controllerTest) {
      actions.push({
        id: 'controller-test',
        label: 'Controller Test',
        className: 'test',
        onClick: () => openControllerTest(),
      });
    }
    return actions;
  }

  function q(selector) {
    return root?.querySelector(selector) ?? null;
  }

  function addWindowListener(type, listener) {
    window.addEventListener(type, listener);
    cleanupFns.push(() => window.removeEventListener(type, listener));
  }

  function cloneJson(value) {
    return value == null ? null : JSON.parse(JSON.stringify(value));
  }

  function setSharedCapturePayload(payload) {
    sharedCapturePayload = cloneJson(payload);
  }

  function createInputDebugger() {
    const els = {
      modal: q('.bm-debug-modal'),
      profileStatus: q('.bm-debug-profile-status'),
      profileSelect: q('.bm-debug-profile-select'),
      profileAutoBtn: q('.bm-debug-profile-auto-btn'),
      presetSelect: q('.bm-debug-preset-select'),
      status: q('.bm-debug-status'),
      progress: q('.bm-debug-progress'),
      countdown: q('.bm-debug-countdown'),
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
    };

    const refreshProfileUi = () => {
      if (!state.isOpen) return;
      const activeIndex = resolvePreferredGamepadIndex(state.activeGamepadIndex);
      state.activeGamepadIndex = activeIndex;
      refreshProfileControls(els.profileSelect, els.profileAutoBtn, els.profileStatus, activeIndex);
    };

    els.presetSelect.innerHTML = Object.values(CAPTURE_PRESETS)
      .map((preset) => `<option value="${preset.id}">${preset.label}</option>`)
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
      selectEl: els.profileSelect,
      autoBtn: els.profileAutoBtn,
      statusEl: els.profileStatus,
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
      state.isOpen = true;
      state.cancel = false;
      state.activeGamepadIndex = resolvePreferredGamepadIndex(state.activeGamepadIndex);
      els.modal.classList.add('bm-debug-open');
      els.modal.setAttribute('aria-hidden', 'false');
      setStatus('Ready. Press Start Debug to run the guided controller capture.');
      setProgress('No active step. Press Start Debug to initialize baseline and step navigation.');
      setCountdown('');
      state.currentStepIndex = 0;
      ensureCaptureScaffold(getCapturePreset(state.selectedPreset));
      syncFromSharedPayload();
      startLiveMonitor();
      refreshProfileUi();
      updateButtonState();
    }

    function close() {
      state.isOpen = false;
      state.cancel = true;
      state.isRunning = false;
      els.modal.classList.remove('bm-debug-open');
      els.modal.setAttribute('aria-hidden', 'true');
      stopLiveMonitor();
      updateButtonState();
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

      state.baseline = await captureBaseline(gp.index, 2000, {
        shouldCancel: () => state.cancel,
        onTick: (secondsLeft) => setCountdown(`Normalization: ${secondsLeft}s`),
      });
      if (!state.baseline || state.cancel) {
        setStatus('Debug cancelled during normalization.');
        state.isRunning = false;
        updateButtonState();
        return;
      }

      refreshProfileControls(els.profileSelect, els.profileAutoBtn, els.profileStatus, gp.index);
      state.isRunning = false;
      setCountdown('');
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
      setProgress(`Step ${idx + 1}/${preset.steps.length}: ${step.label}`);
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
      const detected = await captureWithMiniModal({
        title: `Capture ${step.label}`,
        instruction: step.instruction,
        gamepadIndex: gp.index,
        baseline: state.baseline,
        durationMs: 5000,
      });
      state.isRunning = false;

      const row = state.captures[state.currentStepIndex];
      row.detected = detected;
      row.matched = !!detected;
      row.skipped = false;
      renderOutput();
      updateCurrentStepUi();
      updateButtonState();
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
          targetController: gp ? { index: gp.index, id: gp.id, buttons: gp.buttons.length, axes: gp.axes.length } : null,
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
      els.output.value = JSON.stringify(payload, null, 2);
      setSharedCapturePayload(payload);
    }

    function syncFromSharedPayload() {
      if (!sharedCapturePayload) return;
      const payload = cloneJson(sharedCapturePayload);
      const validation = validateCapturePayload(payload);
      els.validation.textContent = formatValidationSummary(validation, payload);
      els.output.value = JSON.stringify(payload, null, 2);
    }

    function setStatus(text) { els.status.textContent = text; }
    function setProgress(text) { els.progress.textContent = text; }
    function setCountdown(text) { els.countdown.textContent = text; }

    function updateLiveView() {
      const gp = state.activeGamepadIndex == null ? pickGamepad() : getGamepadByIndex(state.activeGamepadIndex);
      refreshProfileControls(els.profileSelect, els.profileAutoBtn, els.profileStatus, gp?.index ?? state.activeGamepadIndex);
      if (!gp || !state.baseline) {
        els.live.textContent = '(idle)';
        return;
      }

      const strongest = getStrongestSignal(gp, state.baseline);
      if (!strongest) {
        els.live.textContent = 'No signal above threshold.';
        return;
      }

      els.live.textContent = [
        `kind: ${strongest.kind}`,
        `index: ${strongest.index}`,
        `direction: ${strongest.direction || 'n/a'}`,
        `delta: ${strongest.delta.toFixed(4)}`,
        `raw: ${strongest.rawValue.toFixed(4)}`,
        `code: ${toGpCode(strongest)}`,
      ].join('\n');
    }

    function startLiveMonitor() {
      stopLiveMonitor();
      state.liveTimer = setInterval(updateLiveView, 120);
    }

    function stopLiveMonitor() {
      if (state.liveTimer) {
        clearInterval(state.liveTimer);
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
    }

    syncInputDebuggerFromSharedPayload = syncFromSharedPayload;
    renderOutput();
    return { open, close };
  }

  function createControllerTester() {
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

    function toProfileMappingEntry(signal) {
      if (!signal || typeof signal !== 'object') return null;
      if (signal.kind === 'button' && Number.isInteger(signal.index)) {
        return { kind: 'button', index: signal.index };
      }
      if (signal.kind === 'axis' && Number.isInteger(signal.index)) {
        return { kind: 'axis', index: signal.index, direction: signal.direction === 'negative' ? 'negative' : 'positive' };
      }
      return null;
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

    function readMappingMagnitude(gamepad, baseline, entry) {
      if (!entry || typeof entry !== 'object') return 0;
      if (entry.kind === 'button') {
        const raw = gamepad.buttons?.[entry.index]?.value || 0;
        const base = baseline.buttons?.[entry.index] || 0;
        return Math.max(0, raw - base);
      }
      if (entry.kind === 'axis') {
        const shifted = shiftedAxis(gamepad, baseline, entry.index);
        if (entry.direction === 'negative') return Math.max(0, -shifted);
        return Math.max(0, shifted);
      }
      if (entry.kind === 'hat') {
        const raw = gamepad.axes?.[entry.index] || 0;
        const tolerance = typeof entry.tolerance === 'number' ? Math.abs(entry.tolerance) : 0.2;
        return Math.abs(raw - entry.value) <= tolerance ? 1 : 0;
      }
      return 0;
    }

    function getLogicalAxisValueFromMapping(gamepad, baseline, mapping, axisIndex, fallbackRawAxisIndex) {
      const codeN = `GP_A${axisIndex}N`;
      const codeP = `GP_A${axisIndex}P`;
      const nEntry = mapping?.[codeN];
      const pEntry = mapping?.[codeP];
      if (!nEntry && !pEntry) {
        return shiftedAxis(gamepad, baseline, fallbackRawAxisIndex);
      }
      const neg = nEntry ? readMappingMagnitude(gamepad, baseline, nEntry) : 0;
      const pos = pEntry ? readMappingMagnitude(gamepad, baseline, pEntry) : 0;
      return Math.max(-1, Math.min(1, pos - neg));
    }

    function updateSticks(gamepad, baseline, mapping = null) {
      const lx = getLogicalAxisValueFromMapping(gamepad, baseline, mapping, 0, 0);
      const ly = getLogicalAxisValueFromMapping(gamepad, baseline, mapping, 1, 1);
      const rx = getLogicalAxisValueFromMapping(gamepad, baseline, mapping, 2, 2);
      const ry = getLogicalAxisValueFromMapping(gamepad, baseline, mapping, 3, 3);
      els.leftStickDot.style.transform = `translate(calc(-50% + ${Math.round(lx * 14)}px), calc(-50% + ${Math.round(ly * 14)}px))`;
      els.rightStickDot.style.transform = `translate(calc(-50% + ${Math.round(rx * 14)}px), calc(-50% + ${Math.round(ry * 14)}px))`;
    }

    function getTriggerFillValue(gamepad, baseline, mapping, analogCode, fallbackButtonIndex) {
      const mappedEntry = mapping?.[analogCode];
      if (mappedEntry) return clamp01(readMappingMagnitude(gamepad, baseline, mappedEntry));
      return clamp01(readButtonDelta(gamepad, baseline, fallbackButtonIndex));
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
              <div>${describeBindingEntry(entry)}</div>
              <div class="bm-tester-binding-meta">Source: ${sourceLabel}</div>
            </div>
            <button class="bm-tool-btn bm-tester-binding-remove" data-remove-binding="${entry.key}">Remove</button>
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

    return { open, close };
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

  function getStrongestSignal(gamepad, baseline) {
    let strongest = null;
    const minDelta = 0.12;
    for (let i = 0; i < gamepad.buttons.length; i++) {
      const raw = gamepad.buttons[i]?.value || 0;
      const base = baseline.buttons[i] || 0;
      const delta = raw - base;
      if (delta > minDelta && (!strongest || delta > strongest.delta)) {
        strongest = { kind: 'button', index: i, delta, rawValue: raw };
      }
    }
    for (let i = 0; i < gamepad.axes.length; i++) {
      const raw = gamepad.axes[i] || 0;
      const base = baseline.axes[i] || 0;
      const shifted = raw - base;
      const pos = shifted > 0 ? shifted : 0;
      const neg = shifted < 0 ? -shifted : 0;
      if (pos > minDelta && (!strongest || pos > strongest.delta)) strongest = { kind: 'axis', index: i, direction: 'positive', delta: pos, rawValue: raw };
      if (neg > minDelta && (!strongest || neg > strongest.delta)) strongest = { kind: 'axis', index: i, direction: 'negative', delta: neg, rawValue: raw };
    }
    return strongest;
  }

  function toGpCode(signal) {
    if (signal.kind === 'button') return `GP_B${signal.index}`;
    if (signal.kind === 'axis') return `GP_A${signal.index}${signal.direction === 'negative' ? 'N' : 'P'}`;
    return null;
  }

  function resolveStrongestSignalToLogicalCode(signal, gamepad, baseline, mapping) {
    if (!signal) return null;
    if (!mapping || typeof mapping !== 'object') return toGpCode(signal);
    const candidates = [];
    for (const [code, entry] of Object.entries(mapping)) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.kind === 'button' && signal.kind === 'button' && entry.index === signal.index) candidates.push(code);
      if (entry.kind === 'axis' && signal.kind === 'axis' && entry.index === signal.index && entry.direction === signal.direction) candidates.push(code);
      if (entry.kind === 'hat' && signal.kind === 'axis' && entry.index === signal.index) {
        const tolerance = typeof entry.tolerance === 'number' ? Math.abs(entry.tolerance) : 0.2;
        const raw = gamepad.axes?.[entry.index] || 0;
        if (Math.abs(raw - entry.value) <= tolerance) candidates.push(code);
      }
    }
    if (candidates.length > 0) {
      candidates.sort();
      return candidates[0];
    }
    return toGpCode(signal);
  }

  function getActiveCodes(gamepad, baseline) {
    const activeCodes = [];
    const buttonThreshold = 0.35;
    const axisThreshold = 0.42;
    for (let i = 0; i <= 16; i++) {
      const raw = gamepad.buttons?.[i]?.value || 0;
      const pressed = gamepad.buttons?.[i]?.pressed === true;
      const delta = raw - (baseline.buttons[i] || 0);
      if (pressed || delta > buttonThreshold) activeCodes.push(`GP_B${i}`);
    }
    for (let i = 0; i <= 3; i++) {
      const shifted = shiftedAxis(gamepad, baseline, i);
      if (shifted < -axisThreshold) activeCodes.push(`GP_A${i}N`);
      if (shifted > axisThreshold) activeCodes.push(`GP_A${i}P`);
    }
    return activeCodes;
  }

  function getActiveLogicalCodes(gamepad, baseline, mapping) {
    if (!mapping || typeof mapping !== 'object') return getActiveCodes(gamepad, baseline);
    const active = new Set();
    const buttonThreshold = 0.35;
    const axisThreshold = 0.42;
    for (const [code, entry] of Object.entries(mapping)) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.kind === 'button') {
        const raw = gamepad.buttons?.[entry.index]?.value || 0;
        const pressed = gamepad.buttons?.[entry.index]?.pressed === true;
        const delta = raw - (baseline.buttons?.[entry.index] || 0);
        if (pressed || delta > buttonThreshold) active.add(code);
        continue;
      }
      if (entry.kind === 'axis') {
        const shifted = shiftedAxis(gamepad, baseline, entry.index);
        if (entry.direction === 'negative' && shifted < -axisThreshold) active.add(code);
        if (entry.direction === 'positive' && shifted > axisThreshold) active.add(code);
        continue;
      }
      if (entry.kind === 'hat') {
        const raw = gamepad.axes?.[entry.index] || 0;
        const tolerance = typeof entry.tolerance === 'number' ? Math.abs(entry.tolerance) : 0.2;
        if (Math.abs(raw - entry.value) <= tolerance) active.add(code);
      }
    }
    const l2A = (gamepad.buttons?.[6]?.value ?? 0) - (baseline?.buttons?.[6] ?? 0);
    const r2A = (gamepad.buttons?.[7]?.value ?? 0) - (baseline?.buttons?.[7] ?? 0);
    if (l2A > 0.25) active.add('GP_B6A');
    if (r2A > 0.25) active.add('GP_B7A');
    return [...active];
  }

  function buildAxisBar(value, width) {
    const center = Math.floor(width / 2);
    const pos = Math.min(width - 1, Math.max(0, Math.round(((value + 1) / 2) * width)));
    return Array.from({ length: width }, (_, i) => {
      if (i === pos) return '●';
      if (i === center) return '│';
      return '·';
    }).join('');
  }

  function updateRawInputDisplay(preEl, gamepad, baseline) {
    if (!preEl || preEl.hidden) return;
    if (!gamepad) { preEl.textContent = ''; return; }
    const BTH = 0.05;
    const ATH = 0.05;
    const bRows = [];
    for (let i = 0; i < gamepad.buttons.length; i++) {
      const raw = gamepad.buttons[i]?.value ?? 0;
      const pressed = gamepad.buttons[i]?.pressed ?? false;
      const delta = raw - (baseline?.buttons[i] ?? 0);
      const active = pressed || delta > BTH;
      bRows.push(`${active ? '●' : '○'}B${String(i).padStart(2, '0')}:${raw.toFixed(2)}`);
    }
    const bLines = [];
    for (let i = 0; i < bRows.length; i += 5) bLines.push(bRows.slice(i, i + 5).join('  '));
    const aLines = [];
    for (let i = 0; i < gamepad.axes.length; i++) {
      const raw = gamepad.axes[i] ?? 0;
      const delta = raw - (baseline?.axes[i] ?? 0);
      const active = Math.abs(delta) > ATH;
      const rawFmt = (raw >= 0 ? '+' : '') + raw.toFixed(3);
      const dFmt = (delta >= 0 ? '+' : '') + delta.toFixed(3);
      aLines.push(`${active ? '→' : ' '}A${String(i).padStart(2, '0')}: ${rawFmt}  Δ${dFmt}  [${buildAxisBar(raw, 15)}]`);
    }
    preEl.textContent = [bLines.join('\n') || '(no buttons)', '', aLines.join('\n') || '(no axes)'].join('\n');
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

  function toDetectedFromMappingEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    if (entry.kind === 'button' && Number.isInteger(entry.index) && entry.index >= 0) return { code: `GP_B${entry.index}`, kind: 'button', index: entry.index, direction: null, score: 1, frames: 1, peakDelta: 1, peakRaw: 1 };
    if (entry.kind === 'axis' && Number.isInteger(entry.index) && entry.index >= 0) {
      const direction = entry.direction === 'negative' ? 'negative' : 'positive';
      return { code: `GP_A${entry.index}${direction === 'negative' ? 'N' : 'P'}`, kind: 'axis', index: entry.index, direction, score: 1, frames: 1, peakDelta: 1, peakRaw: 1 };
    }
    return null;
  }

  function getResolvedMappingForGamepad(gamepad) {
    if (!gamepad) return {};
    const resolved = manager.getResolvedGamepadProfile(gamepad.index);
    const mapping = resolved?.definition?.mapping;
    return mapping && typeof mapping === 'object' ? mapping : {};
  }

  function getPayloadOverrideMapping(payload) {
    const mapping = {};
    const buttonEntries = payload?.controllerDefinition?.buttons || {};
    for (const [code, entry] of Object.entries(buttonEntries)) {
      if (!entry || typeof entry.buttonIndex !== 'number') continue;
      mapping[code] = { kind: 'button', index: entry.buttonIndex };
    }
    const axisEntries = payload?.controllerDefinition?.axes || {};
    for (const [code, entry] of Object.entries(axisEntries)) {
      if (!entry || typeof entry.axisIndex !== 'number') continue;
      const direction = entry.direction === 'negative' ? 'negative' : 'positive';
      mapping[code] = { kind: 'axis', index: entry.axisIndex, direction };
    }
    return mapping;
  }

  function normalizePayloadForProcessing(payload, gamepad) {
    if (!payload || typeof payload !== 'object') return;
    const preset = getCapturePreset(DEFAULT_CAPTURE_PRESET);
    payload.sequence = Array.isArray(payload.sequence) && payload.sequence.length > 0 ? payload.sequence : cloneJson(preset.steps);
    payload.controllerDefinition = payload.controllerDefinition && typeof payload.controllerDefinition === 'object' ? payload.controllerDefinition : { buttons: {}, axes: {} };
    payload.controllerDefinition.buttons = payload.controllerDefinition.buttons && typeof payload.controllerDefinition.buttons === 'object' ? payload.controllerDefinition.buttons : {};
    payload.controllerDefinition.axes = payload.controllerDefinition.axes && typeof payload.controllerDefinition.axes === 'object' ? payload.controllerDefinition.axes : {};
    const existingByExpected = payload.byExpected && typeof payload.byExpected === 'object' ? { ...payload.byExpected } : {};
    for (const item of Array.isArray(payload.captures) ? payload.captures : []) {
      if (!item || typeof item.expectedCode !== 'string') continue;
      existingByExpected[item.expectedCode] = item;
    }
    const removedCodes = new Set(Array.isArray(payload?.testerOverrides?.removedCodes) ? payload.testerOverrides.removedCodes : []);
    const resolvedMapping = getResolvedMappingForGamepad(gamepad);
    const payloadOverrideMapping = getPayloadOverrideMapping(payload);
    const captures = [];
    const byExpected = {};
    for (let i = 0; i < payload.sequence.length; i++) {
      const step = payload.sequence[i] || {};
      const expectedCode = step.expectedCode;
      if (typeof expectedCode !== 'string') continue;
      const existing = existingByExpected[expectedCode] && typeof existingByExpected[expectedCode] === 'object' ? existingByExpected[expectedCode] : null;
      let detected = existing?.detected ?? null;
      if (!detected && !removedCodes.has(expectedCode)) {
        const mappingEntry = payloadOverrideMapping[expectedCode] || resolvedMapping[expectedCode] || null;
        detected = toDetectedFromMappingEntry(mappingEntry);
      }
      const capture = { step: i + 1, label: step.label || existing?.label || expectedCode, expectedCode, instruction: step.instruction || existing?.instruction || `Captured from tester update for ${expectedCode}.`, skipped: false, matched: !!detected, detected };
      captures.push(capture);
      byExpected[expectedCode] = cloneJson(capture);
    }
    payload.captures = captures;
    payload.byExpected = byExpected;
    if (!payload.runMeta || typeof payload.runMeta !== 'object') payload.runMeta = {};
    payload.runMeta.totalSteps = payload.sequence.length;
    payload.runMeta.completedSteps = captures.filter((entry) => !!entry.detected).length;
  }

  function createNeutralBaseline(gamepad) {
    return { buttons: new Array(gamepad.buttons?.length || 0).fill(0), axes: new Array(gamepad.axes?.length || 0).fill(0) };
  }

  function shiftedAxis(gamepad, baseline, axisIndex) {
    const raw = gamepad.axes?.[axisIndex] || 0;
    const base = baseline.axes?.[axisIndex] || 0;
    return raw - base;
  }

  function readButtonDelta(gamepad, baseline, buttonIndex) {
    const raw = gamepad.buttons?.[buttonIndex]?.value || 0;
    const base = baseline.buttons?.[buttonIndex] || 0;
    return raw - base;
  }

  function clamp01(value) { return Math.max(0, Math.min(1, value)); }
  function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
  function getCapturePreset(presetId) { return CAPTURE_PRESETS[presetId] ?? CAPTURE_PRESETS[DEFAULT_CAPTURE_PRESET]; }

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
    const exactOptions = options.exactProfiles.map((option) => `<option value="${serialiseProfileOverrideValue(option)}" ${selectedValue === serialiseProfileOverrideValue(option) ? 'selected' : ''}>Exact: ${option.label}</option>`).join('');
    const familyOptions = options.families.map((option) => `<option value="${serialiseProfileOverrideValue(option)}" ${selectedValue === serialiseProfileOverrideValue(option) ? 'selected' : ''}>Family: ${option.label}</option>`).join('');
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

  function serialiseProfileOverrideValue(override) {
    if (!override || typeof override !== 'object') return '__auto__';
    if (override.type === 'profile') return `profile:${override.key}`;
    if (override.type === 'family') return `family:${override.family}`;
    return '__auto__';
  }

  function parseProfileOverrideValue(value) {
    if (typeof value !== 'string') return null;
    if (value.startsWith('profile:')) return { type: 'profile', key: value.slice('profile:'.length) };
    if (value.startsWith('family:')) return { type: 'family', family: value.slice('family:'.length) };
    return null;
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

  function abbreviateTesterLabel(label) {
    if (!label) return '—';
    if (label.length <= 8) return label;
    const initials = label.split(/\s+/).map((part) => part[0]).join('');
    return initials.length >= 2 ? initials.toUpperCase() : label.slice(0, 8);
  }

  function validateCapturePayload(payload) {
    const errors = [];
    const warnings = [];
    const target = payload?.runMeta?.targetController;
    if (!target?.id) {
      errors.push('Missing targetController.id.');
      return { errors, warnings };
    }
    const idInfo = parseControllerId(target.id);
    if (!idInfo.vendorId || !idInfo.productId) errors.push('Controller id does not expose a vendor/product pair.');
    const captures = Array.isArray(payload?.captures) ? payload.captures : [];
    if (captures.length === 0) {
      errors.push('No capture steps recorded yet.');
      return { errors, warnings };
    }
    const expectedSeen = new Set();
    const dpadPhysicalKeys = new Set();
    for (const entry of captures) {
      if (typeof entry?.expectedCode !== 'string') {
        errors.push('A capture entry is missing expectedCode.');
        continue;
      }
      if (expectedSeen.has(entry.expectedCode)) warnings.push(`Duplicate expectedCode ${entry.expectedCode}; last one wins.`);
      expectedSeen.add(entry.expectedCode);
      if (!entry.detected) continue;
      const { kind, index, direction } = entry.detected;
      if (kind !== 'button' && kind !== 'axis') { errors.push(`${entry.expectedCode} resolved to an unsupported kind.`); continue; }
      if (!Number.isInteger(index) || index < 0) { errors.push(`${entry.expectedCode} resolved to an invalid index.`); continue; }
      if (kind === 'axis' && direction !== 'negative' && direction !== 'positive') { errors.push(`${entry.expectedCode} axis detection is missing direction.`); continue; }
      const physicalKey = kind === 'button' ? `button:${index}` : `axis:${index}:${direction}`;
      if (DPAD_CODES.includes(entry.expectedCode)) dpadPhysicalKeys.add(physicalKey);
      if (/^GP_A\d+[NP]$/.test(entry.expectedCode) && kind !== 'axis') warnings.push(`${entry.expectedCode} looks like an axis code but was detected as ${kind}.`);
    }
    for (const code of DPAD_CODES) if (!expectedSeen.has(code)) errors.push(`Missing required D-Pad capture ${code}.`);
    if (dpadPhysicalKeys.size > 0 && dpadPhysicalKeys.size < 3) warnings.push('D-Pad mappings are not distinct enough yet for reliable processing.');
    return { errors, warnings };
  }

  function formatValidationSummary(validation, payload) {
    const fileName = suggestCaptureFileName(JSON.stringify(payload));
    if (validation.errors.length > 0) return `Validation: ${validation.errors.join(' ')} Suggested filename: ${fileName}`;
    if (validation.warnings.length > 0) return `Validation warnings: ${validation.warnings.join(' ')} Suggested filename: ${fileName}`;
    return `Validation: ready to export. Suggested filename: ${fileName}. After download, place it in src/input/controller_definitions/captures/ and run npm run process_controller_defs.`;
  }

  function suggestCaptureFileName(payloadText) {
    try {
      const payload = JSON.parse(payloadText);
      const idInfo = parseControllerId(payload?.runMeta?.targetController?.id || '');
      const family = payload?.controllerDefinition?.family || payload?.controllerDefinition?.profileHint || 'controller';
      if (idInfo.vendorId && idInfo.productId) return `${idInfo.vendorId}-${idInfo.productId}_${family}.json`;
    } catch {
      // ignore
    }
    return 'controller_capture.json';
  }

  function parseControllerId(controllerId) {
    if (!controllerId || typeof controllerId !== 'string') return { vendorId: null, productId: null };
    const trimmed = controllerId.trim();
    const directMatch = trimmed.match(/^([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-/);
    if (directMatch) return { vendorId: directMatch[1].toLowerCase(), productId: directMatch[2].toLowerCase() };
    const vendorMatch = trimmed.match(/vendor\D*([0-9a-fA-F]{4})/i);
    const productMatch = trimmed.match(/product\D*([0-9a-fA-F]{4})/i);
    return { vendorId: vendorMatch ? vendorMatch[1].toLowerCase() : null, productId: productMatch ? productMatch[1].toLowerCase() : null };
  }

  return { mount, unmount, getFooterActions, openInputRemap, openControllerTest, enabledTools };
}

function normalizeBuiltInToolsOption(value) {
  if (value === true) return { inputRemap: true, controllerTest: true };
  if (!value || typeof value !== 'object') return { inputRemap: false, controllerTest: false };
  return { inputRemap: value.inputRemap === true, controllerTest: value.controllerTest === true };
}

function getBuiltInToolsHtml() {
  return `
    <div class="bm-debug-modal" aria-hidden="true">
      <div class="bm-debug-panel" role="dialog" aria-modal="true" aria-label="Input Debugger">
        <div class="bm-debug-head">
          <h2>Input Debugger</h2>
          <button class="bm-tool-btn bm-debug-close-btn">Close</button>
        </div>
        <div class="bm-debug-body">
          <div class="bm-debug-card">
            <h3>Guided Test</h3>
            <div class="bm-debug-small">Resolved controller profile</div>
            <div class="bm-debug-profile-status">Profile: waiting for controller</div>
            <div class="bm-debug-actions">
              <select class="bm-debug-profile-select"></select>
              <button class="bm-tool-btn bm-debug-profile-auto-btn">Auto</button>
            </div>
            <div class="bm-debug-small">Capture preset</div>
            <div class="bm-debug-actions"><select class="bm-debug-preset-select"></select></div>
            <div class="bm-debug-status">Press Start Debug to begin the controller mapping routine.</div>
            <div class="bm-debug-progress"></div>
            <div class="bm-debug-countdown"></div>
            <div class="bm-debug-small">Live strongest input delta from baseline</div>
            <div class="bm-debug-live">(idle)</div>
            <div class="bm-debug-actions">
              <button class="bm-tool-btn bm-debug-start-btn">Start Debug</button>
              <button class="bm-tool-btn bm-debug-back-btn">Back</button>
              <button class="bm-tool-btn bm-debug-redo-btn">Redo</button>
              <button class="bm-tool-btn bm-debug-capture-btn">Capture</button>
              <button class="bm-tool-btn bm-debug-next-btn">Next</button>
              <button class="bm-tool-btn bm-debug-copy-btn">Copy JSON</button>
              <button class="bm-tool-btn bm-debug-download-btn">Download JSON</button>
            </div>
            <div class="bm-debug-validation"></div>
            <div class="bm-debug-small">Release all controls during normalization when prompted. Each control step records for 5 seconds.</div>
          </div>
          <div class="bm-debug-card">
            <h3>Generated Controller Definition JSON</h3>
            <textarea class="bm-debug-results" spellcheck="false" readonly></textarea>
          </div>
        </div>
      </div>
    </div>

    <div class="bm-tester-modal" aria-hidden="true">
      <div class="bm-tester-panel" role="dialog" aria-modal="true" aria-label="Controller Tester" tabindex="-1">
        <div class="bm-tester-head">
          <h2>Controller Tester</h2>
          <button class="bm-tool-btn bm-tester-close-btn">Close</button>
        </div>
        <div class="bm-tester-body">
          <div class="bm-tester-card">
            <h3>Live Controller View</h3>
            <div class="bm-tester-controller">
              <div class="bm-tester-node bm-wide" data-code="GP_B4" style="left: 82px; top: 20px;">L1</div>
              <div class="bm-tester-node bm-wide" data-code="GP_B5" style="right: 82px; top: 20px;">R1</div>
              <div class="bm-tester-trigger-meter" style="left: 96px; top: 48px;"><div class="bm-tester-trigger-fill bm-tester-l2-fill"></div></div>
              <div class="bm-tester-trigger-meter" style="right: 96px; top: 48px;"><div class="bm-tester-trigger-fill bm-tester-r2-fill"></div></div>
              <div class="bm-tester-node bm-wide" data-code="GP_B6" style="left: 78px; top: 112px;">L2</div>
              <div class="bm-tester-node bm-wide" data-code="GP_B7" style="right: 78px; top: 112px;">R2</div>
              <div class="bm-tester-trigger-edit" style="display:none;">
                <span>Trigger analog targets</span>
                <button class="bm-tool-btn bm-tester-code-btn" data-code="GP_B6">L2</button>
                <button class="bm-tool-btn bm-tester-code-btn" data-code="GP_B7">R2</button>
                <button class="bm-tool-btn bm-tester-code-btn" data-code="GP_B6A">L2A</button>
                <button class="bm-tool-btn bm-tester-code-btn" data-code="GP_B7A">R2A</button>
              </div>
              <div class="bm-tester-node" data-code="GP_B12" style="left: 56px; top: 132px;">U</div>
              <div class="bm-tester-node" data-code="GP_B13" style="left: 56px; top: 190px;">D</div>
              <div class="bm-tester-node" data-code="GP_B14" style="left: 26px; top: 162px;">L</div>
              <div class="bm-tester-node" data-code="GP_B15" style="left: 86px; top: 162px;">R</div>
              <div class="bm-tester-stick" style="left: 130px; top: 170px;"><div class="bm-tester-stick-dot bm-tester-left-stick-dot"></div></div>
              <div class="bm-tester-node" data-code="GP_A1N" style="left: 165px; top: 146px;">Up</div>
              <div class="bm-tester-node" data-code="GP_A1P" style="left: 165px; top: 258px;">Down</div>
              <div class="bm-tester-node" data-code="GP_A0N" style="left: 108px; top: 202px;">Left</div>
              <div class="bm-tester-node" data-code="GP_A0P" style="left: 222px; top: 202px;">Right</div>
              <div class="bm-tester-node" data-code="GP_B10" style="left: 166px; top: 204px;">L3</div>
              <div class="bm-tester-node" data-code="GP_B2" style="right: 86px; top: 132px;">Sq</div>
              <div class="bm-tester-node" data-code="GP_B3" style="right: 56px; top: 104px;">Tr</div>
              <div class="bm-tester-node" data-code="GP_B0" style="right: 56px; top: 162px;">Cr</div>
              <div class="bm-tester-node" data-code="GP_B1" style="right: 26px; top: 132px;">Ci</div>
              <div class="bm-tester-stick" style="right: 130px; top: 170px;"><div class="bm-tester-stick-dot bm-tester-right-stick-dot"></div></div>
              <div class="bm-tester-node" data-code="GP_A3N" style="right: 165px; top: 146px;">Up</div>
              <div class="bm-tester-node" data-code="GP_A3P" style="right: 165px; top: 258px;">Down</div>
              <div class="bm-tester-node" data-code="GP_A2N" style="right: 222px; top: 202px;">Left</div>
              <div class="bm-tester-node" data-code="GP_A2P" style="right: 108px; top: 202px;">Right</div>
              <div class="bm-tester-node" data-code="GP_B11" style="right: 166px; top: 204px;">R3</div>
              <div class="bm-tester-node bm-wide" data-code="GP_B8" style="left: 214px; top: 134px;">Create</div>
              <div class="bm-tester-node" data-code="GP_B16" style="left: 256px; top: 160px;">PS</div>
              <div class="bm-tester-node bm-wide" data-code="GP_B9" style="left: 292px; top: 134px;">Options</div>
            </div>
            <div class="bm-tester-raw-section">
              <button type="button" class="bm-tool-btn bm-tester-raw-toggle-btn" style="font-size:11px;padding:2px 10px;height:26px;margin-top:6px;">Show raw input</button>
              <pre class="bm-tester-raw-pre" hidden></pre>
            </div>
          </div>
          <div class="bm-tester-card">
            <h3>Signal Details</h3>
            <div class="bm-tester-profile-status">Profile: waiting for controller</div>
            <div class="bm-tester-actions">
              <select class="bm-tester-profile-select"></select>
              <button class="bm-tool-btn bm-tester-profile-auto-btn">Auto</button>
            </div>
            <div class="bm-tester-status">Connect a gamepad and press controls to test input mapping.</div>
            <div class="bm-tester-detail">Idle.</div>
            <div class="bm-tester-actions"><button class="bm-tool-btn bm-tester-calibrate-btn">Calibrate Baseline</button></div>
            <div class="bm-tester-actions">
              <button class="bm-tool-btn bm-tester-edit-toggle-btn">Enable Edit Mode</button>
              <button class="bm-tool-btn bm-tester-capture-update-btn" disabled>Capture Update</button>
              <button class="bm-tool-btn bm-tester-download-updated-btn" disabled>Download Updated JSON</button>
            </div>
            <div class="bm-tester-edit-target">Edit target: (none)</div>
            <div class="bm-tester-edit-status">Edit mode is off.</div>
            <div class="bm-tester-bindings-section" style="display:none;">
              <div class="bm-tester-bindings-head">Current bindings for selected target</div>
              <ul class="bm-tester-bindings-list"></ul>
            </div>
            <div class="bm-tester-last-signal">Last strongest signal: (none)</div>
            <div class="bm-tester-active-codes">Active codes: (none)</div>
            <div class="bm-tester-help">Tip: keep sticks centered during calibration. Escape closes this modal.</div>
          </div>
        </div>
      </div>
    </div>

    <div class="bm-capture-mini-modal" aria-hidden="true">
      <div class="bm-capture-mini-panel" role="dialog" aria-modal="true" aria-label="Input Capture" tabindex="-1">
        <div class="bm-debug-head">
          <h3 class="bm-capture-mini-title">Capture Input</h3>
          <button class="bm-tool-btn bm-capture-mini-cancel-btn">Cancel</button>
        </div>
        <div class="bm-capture-mini-instruction">Press and hold input now.</div>
        <div class="bm-capture-mini-countdown"></div>
        <div class="bm-capture-mini-live">Waiting for strongest signal...</div>
        <div class="bm-debug-small">Capture window uses strongest stable input over 5 seconds.</div>
      </div>
    </div>
  `;
}