/**
 * Bind Manager Demo — main.js
 *
 * Registers a set of sample actions across multiple groups to exercise:
 *  - registerAction() and the per-action handle
 *  - Default bindings, multi-slot bindings
 *  - Hint visibility per action
 *  - Runtime pressed / released / held events
 *  - Binding change subscription
 *  - Manager-controlled open/close/toggle
 *  - Debug mode: F5 toggles the modal (prevents browser refresh)
 *  - Reset All
 *
 * Bindings are persisted in localStorage under namespace "bind-manager-demo".
 */

import { createBindManager } from '../src/index.js';

const DUALSENSE_DEBUG_SEQUENCE = [
  { label: 'Cross', expectedCode: 'GP_B0', instruction: 'Press and hold Cross.' },
  { label: 'Circle', expectedCode: 'GP_B1', instruction: 'Press and hold Circle.' },
  { label: 'Square', expectedCode: 'GP_B2', instruction: 'Press and hold Square.' },
  { label: 'Triangle', expectedCode: 'GP_B3', instruction: 'Press and hold Triangle.' },
  { label: 'L1', expectedCode: 'GP_B4', instruction: 'Press and hold L1.' },
  { label: 'R1', expectedCode: 'GP_B5', instruction: 'Press and hold R1.' },
  { label: 'L2', expectedCode: 'GP_B6', instruction: 'Press and hold L2 fully.' },
  { label: 'R2', expectedCode: 'GP_B7', instruction: 'Press and hold R2 fully.' },
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
];

// ── 1. Create the manager ────────────────────────────────────────────────────

const manager = createBindManager({
  namespace: 'bind-manager-demo',
  debug: true,      // enables F5 toggle
  debugKey: 'F5',
  // container defaults to document.body
});

// ── 2. Register actions ──────────────────────────────────────────────────────

// Movement
const moveForward = manager.registerAction({
  id: 'move-forward',
  label: 'Move Forward',
  description: 'Move the character forward',
  group: 'Movement',
  slots: 2,
  defaultBindings: ['KeyW', 'ArrowUp'],
});

const moveBackward = manager.registerAction({
  id: 'move-backward',
  label: 'Move Backward',
  description: 'Move the character backward',
  group: 'Movement',
  slots: 2,
  defaultBindings: ['KeyS', 'ArrowDown'],
});

const moveLeft = manager.registerAction({
  id: 'move-left',
  label: 'Move Left',
  description: 'Strafe left',
  group: 'Movement',
  slots: 2,
  defaultBindings: ['KeyA', 'ArrowLeft'],
});

const moveRight = manager.registerAction({
  id: 'move-right',
  label: 'Move Right',
  description: 'Strafe right',
  group: 'Movement',
  slots: 2,
  defaultBindings: ['KeyD', 'ArrowRight'],
});

const jump = manager.registerAction({
  id: 'jump',
  label: 'Jump',
  description: 'Make the character jump',
  group: 'Movement',
  slots: 2,
  defaultBindings: ['Space', null],
});

// Combat
const attack = manager.registerAction({
  id: 'attack',
  label: 'Attack',
  description: 'Primary attack',
  group: 'Combat',
  slots: 1,
  defaultBindings: ['KeyF'],
});

const block = manager.registerAction({
  id: 'block',
  label: 'Block',
  description: 'Raise shield / block',
  group: 'Combat',
  slots: 1,
  defaultBindings: ['KeyG'],
});

const interact = manager.registerAction({
  id: 'interact',
  label: 'Interact',
  description: 'Interact with objects or NPCs',
  group: 'Combat',
  slots: 1,
  defaultBindings: ['KeyE'],
});

// UI
const openMap = manager.registerAction({
  id: 'open-map',
  label: 'Open Map',
  description: 'Toggle the world map',
  group: 'Interface',
  slots: 1,
  defaultBindings: ['KeyM'],
});

const openInventory = manager.registerAction({
  id: 'open-inventory',
  label: 'Open Inventory',
  description: 'Toggle the inventory screen',
  group: 'Interface',
  slots: 1,
  defaultBindings: ['KeyI'],
});

const sprint = manager.registerAction({
  id: 'sprint',
  label: 'Sprint',
  description: 'Hold to sprint',
  group: 'Movement',
  slots: 1,
  defaultBindings: ['ShiftLeft'],
});

// ── 3. Configure which hints are visible by default ──────────────────────────

moveForward.showHint();
moveBackward.showHint();
moveLeft.showHint();
moveRight.showHint();
jump.showHint();
attack.showHint();
interact.showHint();

// ── 4. Runtime action event listeners ────────────────────────────────────────

moveForward.onPressed(() => log('move-forward pressed', 'pressed'));
moveForward.onReleased(() => log('move-forward released', 'released'));
moveForward.onHeld(() => log('move-forward held', 'held'));

moveBackward.onPressed(() => log('move-backward pressed', 'pressed'));
moveLeft.onPressed(() => log('move-left pressed', 'pressed'));
moveRight.onPressed(() => log('move-right pressed', 'pressed'));
jump.onPressed(() => log('jump!', 'pressed'));
attack.onPressed(() => log('attack!', 'pressed'));
block.onPressed(() => log('block start', 'pressed'));
block.onReleased(() => log('block stop', 'released'));
interact.onPressed(() => log('interact', 'pressed'));
openMap.onPressed(() => log('open-map toggled', 'pressed'));
openMap.onReleased(() => log('open-map released', 'released'));
openInventory.onPressed(() => log('open-inventory toggled', 'pressed'));
openInventory.onReleased(() => log('open-inventory released', 'released'));
sprint.onPressed(() => log('sprint start', 'pressed'));
sprint.onReleased(() => log('sprint stop', 'released'));

// ── 5. Binding change subscription ───────────────────────────────────────────

manager.subscribe((event) => {
  if (event.type === 'binding-changed') {
    const newLabel = event.newCode ?? 'unbound';
    const conflictNote = event.conflicts?.length
      ? ` (⚠ conflicts with ${event.conflicts.map(c => c.actionId).join(', ')})`
      : '';
    log(`${event.actionId} slot ${event.slot} → ${newLabel}${conflictNote}`, 'changed');
  } else if (event.type === 'reset') {
    log(`${event.actionId} reset to defaults`, 'info');
  }
});

// ── 6. HUD button wiring ─────────────────────────────────────────────────────

document.getElementById('open-btn').addEventListener('click', () => manager.open());

let hintsVisible = true;
document.getElementById('hint-toggle-btn').addEventListener('click', () => {
  hintsVisible = !hintsVisible;
  if (hintsVisible) {
    manager.showAllHints();
  } else {
    manager.hideAllHints();
  }
  log(`Hints ${hintsVisible ? 'shown' : 'hidden'}`, 'info');
});

document.getElementById('reset-btn').addEventListener('click', () => {
  manager.resetAll();
  log('All bindings reset', 'info');
});

// ── 7. Input debugger (guided controller mapping) ───────────────────────────

const inputDebug = createInputDebugger();
const controllerTester = createControllerTester();

document.getElementById('input-debug-btn').addEventListener('click', () => {
  inputDebug.open();
});

document.getElementById('test-btn').addEventListener('click', () => {
  controllerTester.open();
});

function createInputDebugger() {
  const els = {
    modal: document.getElementById('debug-modal'),
    status: document.getElementById('debug-status'),
    progress: document.getElementById('debug-progress'),
    countdown: document.getElementById('debug-countdown'),
    live: document.getElementById('debug-live'),
    output: document.getElementById('debug-results'),
    startBtn: document.getElementById('debug-start-btn'),
    skipBtn: document.getElementById('debug-skip-btn'),
    copyBtn: document.getElementById('debug-copy-btn'),
    closeBtn: document.getElementById('debug-close-btn'),
  };

  const state = {
    isOpen: false,
    isRunning: false,
    skipStep: false,
    cancel: false,
    activeGamepadIndex: null,
    baseline: null,
    captures: [],
    liveTimer: null,
  };

  els.startBtn.addEventListener('click', () => {
    runDebug().catch((err) => {
      setStatus(`Debug failed: ${err?.message || String(err)}`);
      state.isRunning = false;
      updateButtonState();
    });
  });
  els.skipBtn.addEventListener('click', () => {
    if (state.isRunning) state.skipStep = true;
  });
  els.copyBtn.addEventListener('click', copyJson);
  els.closeBtn.addEventListener('click', close);
  els.modal.addEventListener('click', (ev) => {
    if (ev.target === els.modal) close();
  });

  function open() {
    state.isOpen = true;
    state.cancel = false;
    els.modal.classList.add('debug-open');
    els.modal.setAttribute('aria-hidden', 'false');
    setStatus('Ready. Press Start Debug to run the guided DualSense capture.');
    startLiveMonitor();
    updateButtonState();
  }

  function close() {
    state.isOpen = false;
    state.cancel = true;
    state.isRunning = false;
    els.modal.classList.remove('debug-open');
    els.modal.setAttribute('aria-hidden', 'true');
    stopLiveMonitor();
    updateButtonState();
  }

  async function runDebug() {
    if (state.isRunning) return;
    const gp = pickGamepad();
    if (!gp) {
      setStatus('No controller detected. Connect a controller and try again.');
      return;
    }

    state.isRunning = true;
    state.cancel = false;
    state.skipStep = false;
    state.activeGamepadIndex = gp.index;
    state.captures = [];
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

    for (let i = 0; i < DUALSENSE_DEBUG_SEQUENCE.length; i++) {
      if (state.cancel) break;
      const step = DUALSENSE_DEBUG_SEQUENCE[i];
      state.skipStep = false;
      setProgress(`Step ${i + 1}/${DUALSENSE_DEBUG_SEQUENCE.length}: ${step.label}`);
      setStatus(`${step.instruction} Hold for up to 5 seconds.`);

      const capture = await captureStep(gp.index, step, state.baseline, 5000);
      const entry = {
        step: i + 1,
        label: step.label,
        expectedCode: step.expectedCode,
        instruction: step.instruction,
        skipped: state.skipStep,
        matched: capture.detected !== null,
        detected: capture.detected,
      };
      state.captures.push(entry);
      renderOutput();
    }

    state.isRunning = false;
    setCountdown('');
    setProgress(`Finished ${state.captures.length}/${DUALSENSE_DEBUG_SEQUENCE.length} steps.`);
    if (state.cancel) {
      setStatus('Debug cancelled. Partial JSON is available.');
    } else {
      setStatus('Debug completed. Review and copy the generated JSON definition.');
    }
    updateButtonState();
  }

  async function captureStep(gamepadIndex, step, baseline, durationMs) {
    const scoreMap = new Map();
    const start = performance.now();

    while (performance.now() - start < durationMs) {
      if (state.cancel) break;
      if (state.skipStep) break;

      const gp = getGamepadByIndex(gamepadIndex);
      if (!gp) break;

      const best = getStrongestSignal(gp, baseline);
      if (best) {
        const key = `${best.kind}:${best.index}:${best.direction || 'none'}`;
        const existing = scoreMap.get(key) || {
          ...best,
          score: 0,
          frames: 0,
          peakDelta: 0,
          peakRaw: best.rawValue,
        };
        existing.frames += 1;
        existing.score += best.delta;
        existing.peakDelta = Math.max(existing.peakDelta, best.delta);
        existing.peakRaw = Math.max(existing.peakRaw, Math.abs(best.rawValue));
        scoreMap.set(key, existing);
      }

      const secondsLeft = Math.max(0, Math.ceil((durationMs - (performance.now() - start)) / 1000));
      setCountdown(`Hold window: ${secondsLeft}s`);
      await wait(50);
    }

    const top = [...scoreMap.values()].sort((a, b) => b.score - a.score)[0] || null;
    if (!top || top.peakDelta < 0.2 || state.skipStep) {
      return { detected: null };
    }

    const detectedCode = toGpCode(top);
    return {
      detected: {
        code: detectedCode,
        kind: top.kind,
        index: top.index,
        direction: top.direction || null,
        score: Number(top.score.toFixed(4)),
        frames: top.frames,
        peakDelta: Number(top.peakDelta.toFixed(4)),
        peakRaw: Number(top.peakRaw.toFixed(4)),
      },
    };
  }

  function renderOutput() {
    const gp = getGamepadByIndex(state.activeGamepadIndex) || pickGamepad();
    const byExpected = {};
    const controllerDefinition = {
      sourceControllerId: gp?.id || null,
      profileHint: 'dualsense',
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
        targetController: gp
          ? { index: gp.index, id: gp.id, buttons: gp.buttons.length, axes: gp.axes.length }
          : null,
        baseline: state.baseline,
        totalSteps: DUALSENSE_DEBUG_SEQUENCE.length,
        completedSteps: state.captures.length,
      },
      sequence: DUALSENSE_DEBUG_SEQUENCE,
      captures: state.captures,
      byExpected,
      controllerDefinition,
    };

    els.output.value = JSON.stringify(payload, null, 2);
  }

  function setStatus(text) {
    els.status.textContent = text;
  }

  function setProgress(text) {
    els.progress.textContent = text;
  }

  function setCountdown(text) {
    els.countdown.textContent = text;
  }

  function updateLiveView() {
    const gp = state.activeGamepadIndex == null ? pickGamepad() : getGamepadByIndex(state.activeGamepadIndex);
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

  function updateButtonState() {
    els.startBtn.disabled = state.isRunning;
    els.skipBtn.disabled = !state.isRunning;
  }

  renderOutput();
  return { open, close };
}

function createControllerTester() {
  const els = {
    modal: document.getElementById('tester-modal'),
    panel: document.getElementById('tester-panel'),
    controller: document.getElementById('tester-controller'),
    status: document.getElementById('tester-status'),
    detail: document.getElementById('tester-detail'),
    lastSignal: document.getElementById('tester-last-signal'),
    activeCodes: document.getElementById('tester-active-codes'),
    closeBtn: document.getElementById('tester-close-btn'),
    calibrateBtn: document.getElementById('tester-calibrate-btn'),
    leftStickDot: document.getElementById('tester-left-stick-dot'),
    rightStickDot: document.getElementById('tester-right-stick-dot'),
    l2Fill: document.getElementById('tester-l2-fill'),
    r2Fill: document.getElementById('tester-r2-fill'),
  };

  const controllerNodes = [...els.controller.querySelectorAll('[data-code]')];

  const state = {
    isOpen: false,
    pollTimer: null,
    activeGamepadIndex: null,
    baseline: null,
    calibrating: false,
  };

  els.closeBtn.addEventListener('click', close);
  els.calibrateBtn.addEventListener('click', calibrateBaseline);
  els.modal.addEventListener('click', (ev) => {
    if (ev.target === els.modal) close();
  });
  els.modal.addEventListener('keydown', (ev) => {
    if (ev.code === 'Escape') {
      ev.preventDefault();
      close();
    }
  });

  function open() {
    state.isOpen = true;
    els.modal.classList.add('tester-open');
    els.modal.setAttribute('aria-hidden', 'false');
    setStatus('Listening for controller input.');
    setDetail('Press any button, trigger, d-pad direction, or stick direction.');
    updateLastSignal(null);
    setActiveCodes([]);
    clearVisuals();
    startPolling();
    els.panel.focus();
  }

  function close() {
    state.isOpen = false;
    state.calibrating = false;
    els.modal.classList.remove('tester-open');
    els.modal.setAttribute('aria-hidden', 'true');
    stopPolling();
    clearVisuals();
    setDetail('Idle.');
  }

  async function calibrateBaseline() {
    if (state.calibrating) return;
    const gp = state.activeGamepadIndex == null
      ? pickGamepad()
      : getGamepadByIndex(state.activeGamepadIndex);

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

    const gp = state.activeGamepadIndex == null
      ? pickGamepad()
      : getGamepadByIndex(state.activeGamepadIndex) || pickGamepad();

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
    const baseline = state.baseline || createNeutralBaseline(gp);
    const activeCodes = getActiveCodes(gp, baseline);
    applyHighlights(activeCodes);
    updateSticks(gp, baseline);
    updateTriggers(gp, baseline);
    setActiveCodes(activeCodes);

    const strongest = getStrongestSignal(gp, baseline);
    updateLastSignal(strongest);

    const profileHint = /dualsense|dualshock|playstation|wireless controller|054c/i.test(gp.id)
      ? 'DualSense-like profile detected'
      : 'Generic profile detected';
    setStatus(`Controller connected on slot ${gp.index}.`);
    setDetail(`${profileHint}\n${gp.id}`);
  }

  function applyHighlights(activeCodes) {
    const active = new Set(activeCodes);
    for (const node of controllerNodes) {
      node.classList.toggle('active', active.has(node.dataset.code));
    }
  }

  function updateSticks(gamepad, baseline) {
    const lx = shiftedAxis(gamepad, baseline, 0);
    const ly = shiftedAxis(gamepad, baseline, 1);
    const rx = shiftedAxis(gamepad, baseline, 2);
    const ry = shiftedAxis(gamepad, baseline, 3);

    els.leftStickDot.style.transform = `translate(calc(-50% + ${Math.round(lx * 14)}px), calc(-50% + ${Math.round(ly * 14)}px))`;
    els.rightStickDot.style.transform = `translate(calc(-50% + ${Math.round(rx * 14)}px), calc(-50% + ${Math.round(ry * 14)}px))`;
  }

  function updateTriggers(gamepad, baseline) {
    const left = clamp01(readButtonDelta(gamepad, baseline, 6));
    const right = clamp01(readButtonDelta(gamepad, baseline, 7));
    els.l2Fill.style.height = `${Math.round(left * 100)}%`;
    els.r2Fill.style.height = `${Math.round(right * 100)}%`;
  }

  function setStatus(text) {
    els.status.textContent = text;
  }

  function setDetail(text) {
    els.detail.textContent = text;
  }

  function setActiveCodes(codes) {
    els.activeCodes.textContent = `Active codes: ${codes.length ? codes.join(', ') : '(none)'}`;
  }

  function updateLastSignal(signal) {
    if (!signal) {
      els.lastSignal.textContent = 'Last strongest signal: (none)';
      return;
    }
    els.lastSignal.textContent = [
      'Last strongest signal:',
      `kind: ${signal.kind}`,
      `index: ${signal.index}`,
      `direction: ${signal.direction || 'n/a'}`,
      `delta: ${signal.delta.toFixed(4)}`,
      `raw: ${signal.rawValue.toFixed(4)}`,
      `code: ${toGpCode(signal)}`,
    ].join('\n');
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
  return pads.find((p) => /dualsense|dualshock|playstation|wireless controller|054c/i.test(p.id)) || pads[0];
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

    if (pos > minDelta && (!strongest || pos > strongest.delta)) {
      strongest = { kind: 'axis', index: i, direction: 'positive', delta: pos, rawValue: raw };
    }
    if (neg > minDelta && (!strongest || neg > strongest.delta)) {
      strongest = { kind: 'axis', index: i, direction: 'negative', delta: neg, rawValue: raw };
    }
  }

  return strongest;
}

function toGpCode(signal) {
  if (signal.kind === 'button') return `GP_B${signal.index}`;
  if (signal.kind === 'axis') return `GP_A${signal.index}${signal.direction === 'negative' ? 'N' : 'P'}`;
  return null;
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

function createNeutralBaseline(gamepad) {
  return {
    buttons: new Array(gamepad.buttons?.length || 0).fill(0),
    axes: new Array(gamepad.axes?.length || 0).fill(0),
  };
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

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 8. Logging utility ───────────────────────────────────────────────────────

const MAX_LOG_ENTRIES = 40;

function log(message, type = 'info') {
  const container = document.getElementById('log');
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = message;
  container.appendChild(entry);

  // Keep log bounded
  const entries = container.querySelectorAll('.log-entry');
  if (entries.length > MAX_LOG_ENTRIES) {
    entries[0].remove();
  }

  // Auto-scroll to bottom
  container.scrollTop = container.scrollHeight;
}

log('Bind Manager demo ready', 'info');
log('Press F5 to toggle the key bindings modal', 'info');
