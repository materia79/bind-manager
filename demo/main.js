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
interact.onPressed(() => log('interact', 'pressed'));
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
