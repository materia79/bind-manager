# Bind Manager in a ThreeJS Game

This guide shows how to use Bind Manager with a ThreeJS scene loop while keeping game logic decoupled from raw keyboard events.

## Goals

- Register gameplay actions once
- Let players rebind in a built-in modal
- Use action events inside your update loop
- Show/hide bottom hints without touching your canvas render pipeline

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
});

const moveBackward = binds.registerAction({
  id: 'move-backward',
  label: 'Move Backward',
  group: 'Movement',
  slots: 2,
  defaultBindings: ['KeyS', 'ArrowDown'],
});

const moveLeft = binds.registerAction({
  id: 'move-left',
  label: 'Move Left',
  group: 'Movement',
  slots: 2,
  defaultBindings: ['KeyA', 'ArrowLeft'],
});

const moveRight = binds.registerAction({
  id: 'move-right',
  label: 'Move Right',
  group: 'Movement',
  slots: 2,
  defaultBindings: ['KeyD', 'ArrowRight'],
});

const jump = binds.registerAction({
  id: 'jump',
  label: 'Jump',
  group: 'Movement',
  slots: 2,
  defaultBindings: ['Space', null],
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
- If you use Pointer Lock, consider unlocking before opening the modal and re-locking on close.

## Suggested Pattern

Use Bind Manager for action intent and keep your movement/ability systems consuming action state, not raw keyboard codes. This makes rebinding and control presets much simpler.
