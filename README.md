# Bind Manager

Bind Manager is a browser-first key binding system for games and interactive applications.

Architecture docs:
- [src/core/README.md](src/core/README.md) explains the manager, registry, store, lifecycle, and public API wiring.
- [src/input/README.md](src/input/README.md) explains keyboard/gamepad runtimes, logical codes, labels, and profile resolution.
- [src/input/controller_definitions/README.md](src/input/controller_definitions/README.md) explains exact controller profiles, capture processing, and generated mappings.

It provides:
- A modal for rebinding keys (grouped by action category)
- A bottom-screen hint bar for action prompts
- Persistent bindings via localStorage
- Runtime action events (pressed, held, released)
- A framework-agnostic API that works in ThreeJS and non-ThreeJS apps

Current input support in this MVP: keyboard, mouse buttons, mouse wheel, and browser Gamepad API input, including modifier key combos (e.g. `ShiftLeft+KeyW`, `ControlLeft+MouseButton0`) with capture-on-release semantics, and generated exact controller profiles with family and generic fallback labels.

## Online Demo

A [demo page](https://materia79.github.io/projects/bind-manager/standalone-demo.html) is available that exercises all features and serves as a testbed during development.

## Features

- Action registration with labels, descriptions, groups, slots, and defaults
- Multiple bindings per action (for example primary + secondary)
- Per-slot clear (delete) support from the modal
- Reset action to defaults and reset all actions
- Conflict warnings when the same key is bound to multiple actions (allowed, not blocked)
- Change subscriptions so host apps can react to rebinds
- Optional debug modal toggle key (default: F5)
- Bottom hint overlay with per-action and bulk visibility controls
- Gamepad binding capture and runtime action events
- Exact controller labels from generated device profiles when available
- Manual gamepad profile override and family/generic fallback behavior
- Mouse button and wheel bindings (buttons 0–4, wheel up/down, one notch = one press, Ctrl/Shift/Alt + wheel chords)
- Opt-in browser shortcut guard: cancels reload/find/save/zoom/scroll/context-menu/… while the game owns input, Keyboard Lock in fullscreen, optional "leave site?" prompt
- Modifier key combos for keyboard and mouse (e.g. `ShiftLeft+KeyW`, `ControlLeft+MouseButton0`)
- Capture-on-release: binding commits when the primary key/button is released, allowing modifier selection
- Cancel button fires on pointer-down to prevent accidental bind commits
- `active` getter and `onActiveChange` subscription for host cursor management

## Documentation Map

Use these internal docs when you want implementation details rather than package-level usage guidance.

- [src/core/README.md](src/core/README.md)
	- Core architecture, state model, manager lifecycle, import/export, persistence, and invariants.
- [src/input/README.md](src/input/README.md)
	- Input runtime architecture, code formats, keyboard/gamepad event flow, and profile-dependent labeling.
- [src/input/controller_definitions/README.md](src/input/controller_definitions/README.md)
	- Generated controller profiles, capture workflow, processing pipeline, and validation rules.

## Install and Run

This repository is currently browser-native ESM.

1. Start the demo server:

```bash
npm run demo
```

1. Open:

```text
http://localhost:3001/demo/
```

## Build Single-File Library

Generate browser-ready single-file bundles:

```bash
npm run build
```

Build output:
- `dist/bind-manager.js` readable bundle (global `window.BindManager`)
- `dist/bind-manager.min.js` minified bundle for hosting

Watch mode for local build iteration:

```bash
npm run build:watch
```

## Release Automation

This repository automatically publishes the latest minified bundle as a rolling GitHub Release asset.

Behavior:
- Trigger: every push to `main`
- CI gates: `npm test` and `npm run build`
- Release tag: `main-latest`
- Published asset: `dist/bind-manager.min.js`

Workflow file:
- [release-main-latest.yml](.github/workflows/release-main-latest.yml)

Notes:
- The `main-latest` release is updated in place on each push to `main`.
- `standalone-demo.html` is not auto-deployed; publish it manually to your pages repository when needed.

Script-tag usage:

```html
<script src="/path/to/dist/bind-manager.min.js"></script>
<script>
	const binds = window.BindManager.createBindManager({
		namespace: 'my-game',
		builtInTools: {
			inputRemap: true,
			controllerTest: true,
		},
	});
</script>
```

## Quick Start

```js
import { createBindManager } from './src/index.js';

const binds = createBindManager({
	namespace: 'my-game',
	debug: true,      // enables F5 modal toggle
	debugKey: 'F5',
	builtInTools: {
		inputRemap: true,
		controllerTest: true,
	},
});

const moveForward = binds.registerAction({
	id: 'move-forward',
	label: 'Move Forward',
	description: 'Move character forward',
	group: 'Movement',
	slots: 2,
	defaultBindings: ['KeyW', 'ArrowUp'],
});

const jump = binds.registerAction({
	id: 'jump',
	label: 'Jump',
	group: 'Movement',
	slots: 2,
	defaultBindings: ['Space', null],
});

moveForward.showHint();
jump.showHint();

moveForward.onPressed(() => {
	// game logic
});

binds.subscribe((event) => {
	if (event.type === 'binding-changed') {
		console.log('Binding updated', event.actionId, event.slot, event.newCode);
	}
});
```

## API

### `createBindManager(options)`

Options:
- `namespace?: string` storage namespace, default `default`
- `debug?: boolean` enable debug toggle key listener
- `debugKey?: string` `KeyboardEvent.code` used for modal toggle, default `F5`
- `container?: HTMLElement | null` mount target for modal and hints, default `document.body`
- `storage?: { load, save, clear } | null` custom persistence adapter
- `builtInTools?: { inputRemap?: boolean, controllerTest?: boolean } | null` enable the bundled Input Remap and Controller Test tools
- `browserGuard?: boolean | BrowserGuardOptions` cancel browser shortcuts while the game owns input, default `false` (see [Browser shortcut guard](#browser-shortcut-guard))
- `wheelPixelThreshold?: number` pixel delta that counts as one wheel notch, default `30` (see [Mouse wheel bindings](#mouse-wheel-bindings))

Returns a manager object with methods below.

### Registration

- `registerAction(def)`
- `registerActions(defs)`

Action definition fields:
- `id: string` required stable action id
- `label?: string` human-friendly name
- `description?: string` action description
- `group?: string` modal section grouping, default `General`
- `slots?: number` allowed bindings count, default `2`
- `defaultBindings?: (string|null)[]` `KeyboardEvent.code` values per slot

`registerAction` returns an action handle:
- `showHint()`
- `hideHint()`
- `setHintVisible(boolean)`
- `onPressed(callback)`
- `onReleased(callback)`
- `onHeld(callback)`

### Modal controls

- `open()`
- `close()`
- `toggle()`
- `isOpen()`
- `openInputRemap()`
- `openControllerTest()`

### Active state and cursor persistence

- `active` (getter) — `true` when the binding modal or capture session is open. Use this to show/hide your game cursor.
- `keepCursorAfterClose` (getter/setter) — when `true`, bind-manager will not force cursor teardown on close.
- `onActiveChange(callback)` — subscribe to active-state transitions. Callback receives `(active: boolean)`. Returns an unsubscribe function.

### Browser shortcut guard

- `browserGuard` (getter) — always present; inert until enabled. Methods:
  - `enabled`, `setEnabled(boolean)`, `setTarget(element | null)`
  - `isEngaged()` — `true` while shortcuts are being cancelled
  - `setGameOwnsInput(boolean)` — tell the guard the game has the cursor (for games without pointer lock)
  - `block(patterns)`, `allow(patterns)`, `getShortcutPolicy()` — opt shortcuts in / out at runtime
  - `keyboardLockSupported`, `isKeyboardLocked()`
  - `enterFullscreen(element?)` → `Promise<{ fullscreen, keyboardLocked, error? }>`, `exitFullscreen()`
  - `armLeaveGuard()`, `disarmLeaveGuard()`, `isLeaveGuardArmed()`

When `builtInTools` is enabled, these tools are bundled into the library output and surfaced as footer actions inside the bindings modal.

### Binding queries and mutations

- `getBinding(actionId)`
- `getBindings()`
- `exportBindings(options?)`
- `importBindings(payload, options?)`
- `setBinding(actionId, slot, code)`
- `clearBinding(actionId, slot)`
- `resetAction(actionId)`
- `resetAll()`
- `clearStorage()` — delete the persisted bindings and gamepad profile overrides for this namespace (live bindings are kept; call `resetAll()` first to also restore defaults). Returns `false` if a custom storage adapter has no `clear()`.

### Hint controls

- `showHint(actionId)`
- `hideHint(actionId)`
- `showAllHints()`
- `hideAllHints()`

### Runtime input and subscriptions

- `onAnyAction(callback)`
- `isActionPressed(actionId)` — `true` while a bound key, mouse button or gamepad input is held. Gamepad bindings only count on the action's `playerIndex` controller when one is set. Mouse wheel bindings always read `false` here: the wheel has no held state and fires a pressed+released pulse, so listen with `onPressed` instead.
- `subscribe(callback)` for binding-change events

### Cleanup

- `destroy()` remove listeners and UI from the page

## Browser Shortcut Guard

Games collide with browser shortcuts: Ctrl+S saves the page, Space scrolls it, Ctrl+wheel zooms, F5 reloads. The guard calls `preventDefault()` on those while the game owns input. It is **opt-in**:

```js
const binds = createBindManager({
	namespace: 'my-game',
	browserGuard: {
		target: canvas,          // game element (scopes pointer-lock / fullscreen / focus detection)
		allow: ['Mod+KeyF'],     // opt out: let the browser keep Ctrl/Cmd+F
		block: ['Tab'],          // opt in: also cancel Tab
		leaveGuard: true,        // "leave site?" prompt once the game was played
	},
});

canvas.addEventListener('click', () => canvas.requestPointerLock());
playButton.addEventListener('click', () => binds.browserGuard.enterFullscreen());
```

`browserGuard: true` enables it with all defaults. Options (`BrowserGuardOptions`):

| Option | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` (object form) | start enabled; toggle later with `setEnabled()` |
| `target` | `null` | game element; `null` = any pointer-lock / fullscreen element counts |
| `when` | `'auto'` | when the game owns input: `'auto'`, `'always'` or `() => boolean` |
| `shortcuts` | `DEFAULT_BLOCKED_SHORTCUTS` | replaces the default list |
| `block` / `allow` | `[]` | extra patterns to cancel / never cancel (`allow` wins) |
| `blockBound` | `true` | also cancel anything that resolves to a bound action (bare or combo, with any modifiers) |
| `contextMenu` | `true` | cancel the context menu |
| `keyboardLock` | `true` | request Keyboard Lock in JS fullscreen |
| `keyboardLockKeys` | `DEFAULT_KEYBOARD_LOCK_KEYS` | keys to lock; `null` = every key |
| `leaveGuard` | `false` | arm a `beforeunload` prompt on the first engaged input |

**When it is engaged.** Only while all of these hold: the guard is enabled; the bindings modal, a capture session and the built-in tools are closed; focus is not in a text field (`input`, `textarea`, `select`, contenteditable — those keep every browser default); and the game owns input. With `when: 'auto'` that means pointer lock on the target, fullscreen containing the target, focus inside the target, or `setGameOwnsInput(true)`. `when: 'always'` treats the whole page as the game, so Space on a focused page button is cancelled too. Events aimed at bind-manager UI are never touched. Listeners run on `window` in the capture phase, so a game's `stopPropagation()` cannot bypass them, and gameplay dispatch is unchanged.

**Patterns** use bind-manager codes with generic modifiers: `Ctrl`, `Shift`, `Alt`, `Meta`/`Cmd`, and `Mod` (Ctrl or Meta, so one entry covers Windows/Linux and macOS). A pattern matches when its key is pressed with *at least* its modifiers: `F5` also covers Ctrl+F5, `Mod+KeyR` covers Ctrl+Shift+R. `Alt` alone means either Alt key and `MouseWheel` means either wheel direction. Side-specific codes from bindings (`ControlLeft+KeyS`) work too.

**Default list** (`DEFAULT_BLOCKED_SHORTCUTS`, exported):

| Group | Patterns |
| --- | --- |
| Reload | `F5`, `Mod+KeyR` |
| Save, print, find, find next, bookmark, history, downloads, view source, open file, address bar | `Mod+KeyS`, `Mod+KeyP`, `Mod+KeyF`, `Mod+KeyG`, `Mod+KeyD`, `Mod+KeyH`, `Mod+KeyJ`, `Mod+KeyU`, `Mod+KeyO`, `Mod+KeyL` |
| Function keys | `F1`, `F3`, `F6`, `F7`, `F10`, `F12` |
| Menu bar focus | `Alt` (keydown and keyup) |
| Firefox quick find | `Slash`, `Quote` |
| Page zoom | `Mod+Equal`, `Mod+Minus`, `Mod+Digit0`, `Mod+NumpadAdd`, `Mod+NumpadSubtract`, `Mod+Numpad0` |
| Back navigation and page scroll | `Backspace`, `Space`, arrows, `PageUp`, `PageDown`, `Home`, `End` |
| Tab / window management (effective in fullscreen only, see below) | `Mod+KeyW`, `Mod+KeyT`, `Mod+KeyN`, `Mod+KeyQ`, `Ctrl+Tab`, `Ctrl+PageUp`, `Ctrl+PageDown`, `Ctrl+F4` |
| Wheel: page scroll, Ctrl+wheel zoom, Shift+wheel horizontal scroll | `MouseWheel`, `Mod+MouseWheel`, `Shift+MouseWheel` |
| Mouse: middle-click autoscroll/paste, back/forward thumb buttons | `MouseButton1`, `MouseButton3`, `MouseButton4` |
| Context menu | `contextMenu: true` |

Entries are kept separate so you can filter single ones out, e.g. keep plain wheel scrolling but still block Ctrl+wheel zoom:

```js
import { DEFAULT_BLOCKED_SHORTCUTS } from 'bind-manager';
createBindManager({ browserGuard: { shortcuts: DEFAULT_BLOCKED_SHORTCUTS.filter(p => p !== 'MouseWheel') } });
```

The primary mouse button is never cancelled (focus and `requestPointerLock()` need it), nor are Escape and F11. DevTools combos other than F12 (Ctrl+Shift+I/J/C) are not in the default list; add them with `block` if you want. Whether F1/F3/F6/F7/F12 can be cancelled is up to each browser.

### What a page cannot block, and Keyboard Lock

Outside fullscreen, Chromium handles a set of **reserved** shortcuts before the page sees them, so `preventDefault()` has no effect: close tab (Ctrl+W, Ctrl+F4), close window (Ctrl+Shift+W, Alt+F4), new tab (Ctrl+T), new window (Ctrl+N), new incognito window (Ctrl+Shift+N), reopen closed tab (Ctrl+Shift+T), next/previous tab (Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageDown, Ctrl+PageUp) and quit. These are `kReservedCommandIds` in [`chrome/browser/ui/accelerator_table.cc`](https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/ui/accelerator_table.cc). Per [`BrowserCommandController::IsReservedCommandOrKey`](https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/ui/browser_command_controller.cc), while the window is **fullscreen**, every command except exit and fullscreen toggling goes to the page first. That is why the guard's default list includes the tab and window shortcuts: they take effect in fullscreen.

Operating-system shortcuts (Alt+Tab, the Windows key, Cmd+Tab, Esc leaving fullscreen) never reach a page. The [Keyboard Lock API](https://wicg.github.io/keyboard-lock/) (`navigator.keyboard.lock()`, [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/lock), [Chrome docs](https://developer.chrome.com/docs/capabilities/web-apis/keyboard-lock)) changes that:

- It only takes effect while **JavaScript-initiated fullscreen** is active. User-initiated F11 fullscreen does not count.
- `lock(keyCodes)` captures the listed `KeyboardEvent.code` keys with **every modifier combination** ("registering `KeyW` ensures that W, Shift+W, Control+W, Control+Shift+W … are sent to the app"). `lock()` with no arguments captures every key.
- It captures only keys the OS lets go of. Secure attention sequences such as Ctrl+Alt+Del can never be captured.
- If Escape is locked, the user exits fullscreen by holding Esc for 2 seconds.
- It has to be called from the active top-level document (it rejects with `InvalidStateError` in iframes) and needs a secure context (HTTPS or localhost).
- Browser support: Chrome 68+, Edge 79+, Opera 55+ and other Chromium browsers. **No support in Firefox or Safari** ([caniuse](https://caniuse.com/mdn-api_keyboard_lock)). There the guard skips the lock (`keyboardLockSupported === false`).

How the guard uses it: it locks `DEFAULT_KEYBOARD_LOCK_KEYS` (`KeyW`, `KeyT`, `KeyN`, `KeyQ`, `Tab`, `PageUp`, `PageDown`, `F4`) when fullscreen containing the target starts, and unlocks when fullscreen ends. `enterFullscreen(element?)` requests the lock and then fullscreen in the same user gesture and returns `{ fullscreen, keyboardLocked }`. `exitFullscreen()` releases both. Escape is not locked by default, so one press still leaves fullscreen. Locking `Tab` also captures Alt+Tab on Windows while in fullscreen. Pass `keyboardLockKeys: null` to lock every key (Esc then has to be held), or your own list.

What remains unblockable:

| Situation | Not blockable |
| --- | --- |
| Chromium, not fullscreen | the reserved tab/window shortcuts above, all OS shortcuts |
| Chromium, JS fullscreen + Keyboard Lock | OS secure sequences (Ctrl+Alt+Del), anything the OS keeps; Esc exit when Esc is locked needs a 2 s hold |
| Chromium, F11 fullscreen | OS shortcuts (no Keyboard Lock); reserved shortcuts do reach the page |
| Firefox, Safari | no Keyboard Lock. Ctrl/Cmd+W, T, N, Q, Ctrl+Tab and OS shortcuts are generally not cancellable; this differs by version and platform, so verify on the target browser |

### Leave-site guard

With `leaveGuard: true`, the guard arms a `beforeunload` "Leave site?" prompt on the first engaged input. It stays armed after the cursor is released, so clicking the tab's close button still asks. Call `disarmLeaveGuard()` right before your app's own navigation (it re-arms on the next engaged input), or arm and disarm it by hand with `armLeaveGuard()` and `disarmLeaveGuard()`. Browsers only show the prompt after the user has interacted with the page, and they use their own fixed text.

## Mouse Wheel Bindings

Wheel directions can be bound like keys: `MouseWheelUp` and `MouseWheelDown`, plus chords such as `ControlLeft+MouseWheelUp` or `ShiftLeft+MouseWheelDown`. In the bindings modal, click a slot and scroll. Labels read "Wheel Up" / "Left Ctrl + Wheel Up", and wheel bindings persist and import/export like any other code.

Each **notch** dispatches one `pressed` followed by one `released` (wheels have no `held`). Raw `WheelEvent`s are normalised by `WheelNotchCounter` (exported):

- pixel mode (`deltaMode` 0, Chromium/Safari): an event of at least `wheelPixelThreshold` (30) px is one notch
- line mode (`deltaMode` 1, Firefox): an event of one or more whole lines is one notch. Firefox usually reports 3 lines per detent, which still counts as one notch
- page mode (`deltaMode` 2): every event is one notch
- smaller deltas from trackpads and high-resolution or free-spinning wheels add up per direction, and each 30 px (or 1 line) of travel emits a notch. The running total resets on a direction change or after 200 ms without wheel input
- one event never produces more than one notch
- Shift+wheel: Chromium and Safari report it on `deltaX`, which is used when `deltaY` is 0 and Shift is held, so Shift+wheel chords work everywhere. Pure horizontal scrolling (tilt wheel, sideways trackpad) is ignored

The wheel listener is non-passive so capture can stop the modal from scrolling. During gameplay, page scrolling is only cancelled by the browser guard.

## UI Behavior

- Only one key-capture session can be active at a time.
- While capturing, conflicting UI actions are disabled.
- Canceling capture (Escape) restores the button without applying changes.
- Per-slot clear buttons remove a binding without resetting the entire action.
- Duplicate bindings are allowed and shown as warnings.

## Persistence

Bindings are persisted under localStorage key:

```text
bind-manager:<namespace>
```

The payload is versioned internally to support future format upgrades.

## JSON Export and Import

Export:

```js
const payload = binds.exportBindings();
// { version, namespace, bindings, metadata }
```

Import (merge mode, default):

```js
const report = binds.importBindings(payload);
console.log(report);
// {
//   mode: 'merge',
//   appliedActions,
//   appliedSlots,
//   skippedUnknownActions,
//   invalidEntries,
//   conflictCount
// }
```

Import (replace mode):

```js
binds.importBindings(payload, { mode: 'replace' });
```

In `replace` mode, known actions missing from payload are cleared.

## ThreeJS and Standalone Examples

- ThreeJS integration guide: [examples/threejs/README.md](examples/threejs/README.md)
- Standalone web app guide: [examples/standalone/README.md](examples/standalone/README.md)
- Full runnable demo used during development: [demo/index.html](demo/index.html)

## Custom Styling

Bind Manager uses CSS custom properties prefixed with `--bm-`.
You can override them globally or on a wrapping container.

Common variables:
- `--bm-z-modal`
- `--bm-z-hints`
- `--bm-modal-bg`
- `--bm-accent`
- `--bm-hints-bg`

See style source in [src/ui/styles.js](src/ui/styles.js).

## Known Scope (Current MVP)

- Browser environment only (DOM required for built-in UI)

## Controller Profiles

Controller-specific profile generation and runtime matching live under [src/input/controller_definitions/README.md](src/input/controller_definitions/README.md).

Gamepad label resolution currently follows this order:
- Manual override
- Exact generated controller profile
- Family fallback
- Generic fallback

The demo includes an `Input Debug` flow that exports capture JSON for processing with:

```bash
npm run process_controller_defs
```

Processed captures generate profile modules under [src/input/controller_definitions/profiles](src/input/controller_definitions/profiles) and refresh the registry in [src/input/controller_definitions/index.js](src/input/controller_definitions/index.js).

## DualSense Advanced Input Strategy

Bind Manager keeps the browser Gamepad API as the primary runtime path.

Why this is primary:
- Works across Chromium, Firefox, and Safari with no additional permission prompt.
- Covers core binding needs (buttons, triggers, sticks, D-pad/hat mapping, profile labels).
- Keeps the normal binding flow simple and stable for most users.

WebHID is not part of the primary Bind Manager runtime input path.

Out of scope for the core runtime:
- Full migration from Gamepad API to WebHID.
- Requiring WebHID permissions for standard rebinding.
- Shipping adaptive trigger effect output as a default feature.

## QA

Run unit tests:

```bash
npm test
```

Run E2E tests (requires Chromium, auto-installed via Playwright):

```bash
npm run test:e2e
```

Release checklist: [QA_CHECKLIST.md](QA_CHECKLIST.md)

Manual checks for the browser guard and wheel bindings (desktop browsers; `npm run demo`, open `/demo/`, click the game area to capture the cursor):

- [ ] Before clicking the game area, Ctrl+S / Ctrl+F / Space behave normally.
- [ ] With the cursor captured (status shows "engaged · pointer lock"): Ctrl+S, Ctrl+P, Ctrl+F, Ctrl+G, Ctrl+D, Ctrl+H, Ctrl+J, Ctrl+U, Ctrl+O, Ctrl+L, Ctrl+R, Ctrl+Shift+R, F1, F3, F6, F7, F12 open nothing; Space, arrows and wheel do not scroll; Ctrl+wheel and Ctrl+± do not zoom.
- [ ] Firefox (Windows/Linux): tapping Alt does not show the menu bar; `/` and `'` do not open quick find.
- [ ] Right-click (after Esc released pointer lock, game area still focused) shows no context menu; middle-click does not start autoscroll; mouse back/forward buttons do not navigate.
- [ ] Opening the bindings modal (F5 debug key) disengages the guard: Ctrl+F opens find, the modal list scrolls.
- [ ] Bind "Previous Item" slot 2 by scrolling; label shows "Wheel Down"/"Wheel Up"; reload, binding persists; hint label updates.
- [ ] One mouse-wheel notch logs exactly one "next item" in Chrome and in Firefox; a slow trackpad swipe logs a few, not dozens per frame.
- [ ] Ctrl+wheel logs "zoom camera in/out" without zooming the page.
- [ ] Chrome/Edge: "⛶ Fullscreen + Keyboard Lock" → status "keyboard lock on"; Ctrl+W, Ctrl+T, Ctrl+N, Ctrl+Tab do nothing; a single Esc leaves fullscreen and the lock is released.
- [ ] Chrome/Edge outside fullscreen: Ctrl+W still closes the tab (documented limitation).
- [ ] Firefox/Safari: fullscreen works, status shows "keyboard lock n/a", nothing throws.
- [ ] "🚪 Arm Leave Guard", then close the tab: the browser asks "Leave site?"; after "Disarm" it closes without asking.

## License

This project is licensed under the MIT License.

See [LICENSE.md](LICENSE.md).
