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

document.getElementById('input-debug-btn').addEventListener('click', () => {
  inputDebug.open();
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

    state.baseline = await captureBaseline(gp.index, 2000);
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

  async function captureBaseline(gamepadIndex, durationMs) {
    const samples = { buttonSums: [], axisSums: [], count: 0 };
    const start = performance.now();

    while (performance.now() - start < durationMs) {
      if (state.cancel) return null;
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
      setCountdown(`Normalization: ${secondsLeft}s`);
      await wait(50);
    }

    const buttonMeans = samples.buttonSums.map((sum) => sum / Math.max(1, samples.count));
    const axisMeans = samples.axisSums.map((sum) => sum / Math.max(1, samples.count));
    return { buttons: buttonMeans, axes: axisMeans };
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

  function pickGamepad() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    if (!pads.length) return null;
    return pads.find((p) => /dualsense|dualshock|playstation|wireless controller|054c/i.test(p.id)) || pads[0];
  }

  function getGamepadByIndex(index) {
    if (index == null || !navigator.getGamepads) return null;
    return [...navigator.getGamepads()].find((g) => g && g.connected && g.index === index) || null;
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
