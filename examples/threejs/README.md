# Bind Manager in a ThreeJS Game

This guide shows how to use Bind Manager with a ThreeJS scene loop while keeping game logic decoupled from raw keyboard and gamepad events.

This example is a guide only: there is no runnable page in this folder, `three` is not a dependency of this repository, and the code below has not been executed here (it was checked against the current API by reading). In your project, import the library from `bind-manager` (or load the [bundle](../../dist/README.md)); the relative `../../src/index.js` path below is for a page placed in this folder of the repository.

## Goals

- Register gameplay actions once
- Let players rebind in a built-in modal
- Use action events inside your update loop
- Show/hide bottom hints without touching your canvas render pipeline
- Drive movement from a gamepad stick as well as from keys

## Minimal Integration

```js
import * as THREE from 'three';
import { createBindManager } from '../../src/index.js';

// 1) Create ThreeJS app
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 1.8, 5);

// 2) Create Bind Manager
const binds = createBindManager({
  namespace: 'threejs-fps',
  debug: true,
  debugKey: 'F5',
  builtInTools: true, // Controller Test and Input Remap in the modal's footer
  // container defaults to body; you can also pass a custom overlay root
});

// 3) Register actions
const moveForward = binds.registerAction({
  id: 'move-forward',
  label: 'Move Forward',
  description: 'Walk forward',
  group: 'Movement',
  slots: 2,
  defaultBindings: ['KeyW', 'ArrowUp'],
  defaultGamepadBindings: ['GP_A1N'], // left stick up
});

const moveBackward = binds.registerAction({
  id: 'move-backward',
  label: 'Move Backward',
  group: 'Movement',
  slots: 2,
  defaultBindings: ['KeyS', 'ArrowDown'],
  defaultGamepadBindings: ['GP_A1P'],
});

const moveLeft = binds.registerAction({
  id: 'move-left',
  label: 'Move Left',
  group: 'Movement',
  slots: 2,
  defaultBindings: ['KeyA', 'ArrowLeft'],
  defaultGamepadBindings: ['GP_A0N'],
});

const moveRight = binds.registerAction({
  id: 'move-right',
  label: 'Move Right',
  group: 'Movement',
  slots: 2,
  defaultBindings: ['KeyD', 'ArrowRight'],
  defaultGamepadBindings: ['GP_A0P'],
});

const jump = binds.registerAction({
  id: 'jump',
  label: 'Jump',
  group: 'Movement',
  slots: 2,
  defaultBindings: ['Space', null],
  defaultGamepadBindings: ['GP_B0'], // A / Cross / B (Switch Pro)
});

// 4) Optional: show hints
moveForward.showHint();
moveBackward.showHint();
moveLeft.showHint();
moveRight.showHint();
jump.showHint();

// 5) Movement state
const inputState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jumpQueued: false,
};

moveForward.onPressed(() => { inputState.forward = true; });
moveForward.onReleased(() => { inputState.forward = false; });
moveBackward.onPressed(() => { inputState.backward = true; });
moveBackward.onReleased(() => { inputState.backward = false; });
moveLeft.onPressed(() => { inputState.left = true; });
moveLeft.onReleased(() => { inputState.left = false; });
moveRight.onPressed(() => { inputState.right = true; });
moveRight.onReleased(() => { inputState.right = false; });
jump.onPressed(() => { inputState.jumpQueued = true; });

binds.subscribe((e) => {
  if (e.type === 'binding-changed') {
    console.log('Rebound:', e.actionId, 'slot', e.slot, '->', e.newCode);
  }
});

// 6) Example ThreeJS update loop
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();
  const speed = 4.0;

  if (inputState.forward) camera.position.z -= speed * dt;
  if (inputState.backward) camera.position.z += speed * dt;
  if (inputState.left) camera.position.x -= speed * dt;
  if (inputState.right) camera.position.x += speed * dt;
  if (inputState.jumpQueued) {
    console.log('Jump triggered');
    inputState.jumpQueued = false;
  }

  renderer.render(scene, camera);
}
animate();

// 7) Optional custom toggle key from your app UI
window.addEventListener('keydown', (e) => {
  if (e.code === 'F1') {
    e.preventDefault();
    binds.toggle();
  }
});
```

## Notes for ThreeJS Projects

- The modal and hints are DOM overlays, so they work regardless of WebGL renderer state.
- When the modal is open, gameplay key dispatch is suppressed to avoid accidental movement while rebinding.
- When the modal opens, every gamepad input that was pressed gets a `released` event (and analog actions a final 0), so `inputState` above never stays stuck; an input still held when the modal closes stays silent until it is pressed again.
- Stick directions dispatch `pressed`/`released` past the analog threshold (0.5). For smooth movement, register an action with `analog: true` and read `onAnalog((e) => …)` values instead; one final `analog` event with value 0 arrives when the stick returns to rest.
- If you use Pointer Lock, release it when the modal opens and re-lock on close: `binds.onActiveChange((active) => { if (active) document.exitPointerLock(); })`. bind-manager never changes the cursor or pointer lock itself; `binds.keepCursorAfterClose` is only a flag the library stores for your own code.
- `binds.isActionPressed('move-forward')` is an alternative to the `inputState` flags when you prefer polling in the loop.
- The optional browser shortcut guard (`browserGuard: { target: renderer.domElement }`) stops Space from scrolling and Ctrl+S from saving the page while the game owns input: while the canvas has pointer lock, has focus, or is inside the fullscreen element (or after `binds.browserGuard.setGameOwnsInput(true)`), and never while the bindings modal, a capture, a built-in tool or a text field is active (root README, "Browser Shortcut Guard").

## Suggested Pattern

Use Bind Manager for action intent and keep your movement/ability systems consuming action state, not raw keyboard codes. This makes rebinding and control presets much simpler.
