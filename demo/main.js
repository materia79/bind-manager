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
 *  - Gamepad defaults, including an extra button (GP_B17)
 *  - The built-in tools (Input Remap, Controller Test), opened from the
 *    bindings modal's footer or from the HUD buttons
 *  - The browser shortcut guard (focus, pointer lock, fullscreen, leave guard)
 *
 * Bindings are persisted in localStorage under namespace "bind-manager-demo".
 */

import { createBindManager } from '../src/index.js';

// ── 1. Create the manager ────────────────────────────────────────────────────

const manager = createBindManager({
  namespace: 'bind-manager-demo',
  debug: true,      // enables F5 toggle
  debugKey: 'F5',
  builtInTools: {
    inputRemap: true,
    controllerTest: true,
  },
  // Cancel browser shortcuts (reload, find, zoom, scroll, context menu, …) while
  // the game area has focus, pointer lock or fullscreen.
  browserGuard: {
    target: document.getElementById('game-canvas'),
  },
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
  defaultGamepadBindings: ['GP_A1N'],
});

const moveBackward = manager.registerAction({
  id: 'move-backward',
  label: 'Move Backward',
  description: 'Move the character backward',
  group: 'Movement',
  slots: 2,
  defaultBindings: ['KeyS', 'ArrowDown'],
  defaultGamepadBindings: ['GP_A1P'],
});

const moveLeft = manager.registerAction({
  id: 'move-left',
  label: 'Move Left',
  description: 'Strafe left',
  group: 'Movement',
  slots: 2,
  defaultBindings: ['KeyA', 'ArrowLeft'],
  defaultGamepadBindings: ['GP_A0N'],
});

const moveRight = manager.registerAction({
  id: 'move-right',
  label: 'Move Right',
  description: 'Strafe right',
  group: 'Movement',
  slots: 2,
  defaultBindings: ['KeyD', 'ArrowRight'],
  defaultGamepadBindings: ['GP_A0P'],
});

const jump = manager.registerAction({
  id: 'jump',
  label: 'Jump',
  description: 'Make the character jump',
  group: 'Movement',
  slots: 2,
  defaultBindings: ['Space', null],
  defaultGamepadBindings: ['GP_B0'],
});

// Combat
const attack = manager.registerAction({
  id: 'attack',
  label: 'Attack',
  description: 'Primary attack',
  group: 'Combat',
  slots: 1,
  defaultBindings: ['KeyF'],
  defaultGamepadBindings: ['GP_B7'],
});

const block = manager.registerAction({
  id: 'block',
  label: 'Block',
  description: 'Raise shield / block',
  group: 'Combat',
  slots: 1,
  defaultBindings: ['KeyG'],
  defaultGamepadBindings: ['GP_B6'],
});

const interact = manager.registerAction({
  id: 'interact',
  label: 'Interact',
  description: 'Interact with objects or NPCs',
  group: 'Combat',
  slots: 1,
  defaultBindings: ['KeyE'],
  defaultGamepadBindings: ['GP_B2'],
});

// UI
const openMap = manager.registerAction({
  id: 'open-map',
  label: 'Open Map',
  description: 'Toggle the world map',
  group: 'Interface',
  slots: 1,
  defaultBindings: ['KeyM'],
  defaultGamepadBindings: ['GP_B17'],
});

const openInventory = manager.registerAction({
  id: 'open-inventory',
  label: 'Open Inventory',
  description: 'Toggle the inventory screen',
  group: 'Interface',
  slots: 1,
  defaultBindings: ['KeyI'],
  defaultGamepadBindings: ['GP_B3'],
});

const sprint = manager.registerAction({
  id: 'sprint',
  label: 'Sprint',
  description: 'Hold to sprint',
  group: 'Movement',
  slots: 1,
  defaultBindings: ['ShiftLeft'],
  defaultGamepadBindings: ['GP_B10'],
});

// Mouse wheel (one notch = one press) and a Ctrl+wheel chord
const nextItem = manager.registerAction({
  id: 'next-item',
  label: 'Next Item',
  group: 'Inventory',
  slots: 2,
  defaultBindings: ['MouseWheelDown', 'BracketRight'],
  defaultGamepadBindings: ['GP_B5'],
});

const prevItem = manager.registerAction({
  id: 'prev-item',
  label: 'Previous Item',
  group: 'Inventory',
  slots: 2,
  defaultBindings: ['MouseWheelUp', 'BracketLeft'],
  defaultGamepadBindings: ['GP_B4'],
});

const zoomCamera = manager.registerAction({
  id: 'zoom-camera',
  label: 'Zoom Camera',
  description: 'Ctrl + wheel would zoom the page without the browser guard',
  group: 'Camera',
  slots: 2,
  defaultBindings: ['ControlLeft+MouseWheelUp', 'ControlLeft+MouseWheelDown'],
  gamepadSlots: 2,
  defaultGamepadBindings: ['GP_B12', 'GP_B13'],
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
nextItem.onPressed(() => log('next item (wheel notch)', 'pressed'));
prevItem.onPressed(() => log('previous item (wheel notch)', 'pressed'));
zoomCamera.onPressed((e) => log(`zoom camera ${e.code === 'GP_B12' || e.code?.endsWith('Up') ? 'in' : 'out'}`, 'pressed'));

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
// The built-in tools: also reachable from the bindings modal's footer.
document.getElementById('open-tester-btn').addEventListener('click', () => manager.openControllerTest());
document.getElementById('open-remap-btn').addEventListener('click', () => manager.openInputRemap());

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

// ── 6b. Browser shortcut guard ──────────────────────────────────────────────

const gameArea = document.getElementById('game-canvas');
const guardStatus = document.getElementById('guard-status');
const leaveGuardBtn = document.getElementById('leave-guard-btn');

function updateGuardStatus() {
  const guard = manager.browserGuard;
  const parts = [`Guard: ${guard.isEngaged() ? 'engaged' : 'idle'}`];
  if (document.pointerLockElement) parts.push('pointer lock');
  if (document.fullscreenElement) parts.push('fullscreen');
  parts.push(guard.keyboardLockSupported
    ? `keyboard lock ${guard.isKeyboardLocked() ? 'on' : 'off'}`
    : 'keyboard lock n/a');
  guardStatus.textContent = parts.join(' · ');
  leaveGuardBtn.textContent = guard.isLeaveGuardArmed() ? '🚪 Disarm Leave Guard' : '🚪 Arm Leave Guard';
}

gameArea.addEventListener('click', () => {
  gameArea.focus();
  gameArea.requestPointerLock?.();
});
document.addEventListener('pointerlockchange', () => {
  log(document.pointerLockElement ? 'Cursor captured (Esc releases)' : 'Cursor released', 'info');
  updateGuardStatus();
});
document.addEventListener('fullscreenchange', () => setTimeout(updateGuardStatus, 50));
gameArea.addEventListener('focus', updateGuardStatus);
gameArea.addEventListener('blur', updateGuardStatus);
manager.onActiveChange((active) => {
  // Free the cursor so the bindings modal can be used (debug key opens it in-game)
  if (active && document.pointerLockElement) document.exitPointerLock();
  updateGuardStatus();
});

document.getElementById('fullscreen-btn').addEventListener('click', async () => {
  if (document.fullscreenElement) {
    await manager.browserGuard.exitFullscreen();
    return;
  }
  const result = await manager.browserGuard.enterFullscreen(document.documentElement);
  gameArea.focus();
  log(`Fullscreen: ${result.fullscreen}, keyboard lock: ${result.keyboardLocked}`, 'info');
  updateGuardStatus();
});

leaveGuardBtn.addEventListener('click', () => {
  const guard = manager.browserGuard;
  if (guard.isLeaveGuardArmed()) guard.disarmLeaveGuard(); else guard.armLeaveGuard();
  log(`Leave guard ${guard.isLeaveGuardArmed() ? 'armed' : 'disarmed'}`, 'info');
  updateGuardStatus();
});

updateGuardStatus();

// ── 7. Logging utility ───────────────────────────────────────────────────────

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
