# Bind Manager

Bind Manager is a browser-first key binding system for games and interactive applications.

It provides:
- A modal for rebinding keyboard, mouse and gamepad inputs (grouped by action category)
- A bottom-screen hint bar for action prompts
- Persistent bindings via localStorage
- Runtime action events (pressed, held, released, analog)
- Built-in tools to test a controller and to capture a new controller profile
- A framework-agnostic API that works in ThreeJS and non-ThreeJS apps

Input support: keyboard, mouse buttons, mouse wheel and the browser Gamepad API, including modifier key combos (e.g. `ShiftLeft+KeyW`, `ControlLeft+MouseButton0`) with capture-on-release semantics. Gamepads are labelled per controller family (eight families, detected by vendor/product id), with exact generated profiles for controllers whose raw layout needs remapping.

Coming from the last public build? Read [Upgrading from 0.1.0](#upgrading-from-010) first.

## Online Demo

A [demo page](https://materia79.github.io/projects/bind-manager/standalone-demo.html) is available that exercises all features and serves as a testbed during development. It is a copy of [dist/standalone-demo.html](dist/standalone-demo.html), which now has a **Fake controller** panel so the gamepad features can be tried without a pad; the online copy shows it once it is republished.

## Features

- Action registration with labels, descriptions, groups, slots, and defaults (keyboard/mouse and gamepad)
- Multiple bindings per action (for example primary + secondary)
- Per-slot clear (delete) support from the modal
- Reset action to defaults and reset all actions
- Conflict warnings when the same key is bound to multiple actions (allowed, not blocked)
- Change subscriptions so host apps can react to rebinds
- Optional debug modal toggle key (default: F5)
- Bottom hint overlay with per-action and bulk visibility controls
- Gamepad binding capture and runtime action events, logical buttons `GP_B0`..`GP_B23`
- Eight controller label families detected by vendor/product id, an Xbox Elite paddle variant, exact generated device profiles
- Manual gamepad profile override and family/generic fallback behavior
- Built-in tools (opt-in): Controller Test (live controller view, Debug panel, Profile editor) and Input Remap (guided capture into a controller profile)
- UI sized on a viewport scale unit (`--bm-u`), so it looks the same between 1280x720 and 3840x2160 at the same aspect ratio
- Mouse button and wheel bindings (buttons 0–4, wheel up/down, one notch = one press, Ctrl/Shift/Alt + wheel chords)
- Opt-in browser shortcut guard: cancels reload/find/save/zoom/scroll/context-menu/… while the game owns input, Keyboard Lock in fullscreen, optional "leave site?" prompt
- Modifier key combos for keyboard and mouse (e.g. `ShiftLeft+KeyW`, `ControlLeft+MouseButton0`)
- Capture-on-release: binding commits when the primary key/button is released, allowing modifier selection
- Cancel button fires on pointer-down to prevent accidental bind commits
- `active` getter and `onActiveChange` subscription for host cursor management
- Visible storage failures (`getStorageStatus()`)

## Documentation Map

Use these internal docs when you want implementation details rather than package-level usage guidance.

- [src/core/README.md](src/core/README.md)
	- Core architecture, state model, manager lifecycle, import/export, persistence, and invariants.
- [src/input/README.md](src/input/README.md)
	- Input runtime architecture, code formats, keyboard/mouse/gamepad event flow, and profile-dependent labeling.
- [src/input/controller_definitions/README.md](src/input/controller_definitions/README.md)
	- Generated controller profiles, the capture workflow, the processing pipeline, and when a profile applies.
- [scripts/README.md](scripts/README.md)
	- The build and the controller-profile generator.
- [dist/README.md](dist/README.md)
	- The browser bundles and the standalone demo page.

## Install and Run

The package is not published on npm. Get the code from the public repository:

```bash
git clone https://github.com/materia79/bind-manager.git
cd bind-manager
npm install    # Node ^20.19.0 or >=22.12.0 (package.json "engines"); needed for the build and the tests
npm run demo   # serves the repository root on port 3001
```

Then open `http://localhost:3001/demo/`.

To use it in a game, either:

- copy `src/` into your project and import from your copy of `src/index.js` (plain ES modules: load your script with `<script type="module">` from a page served over http, not opened as a `file://` URL), or
- run `npm run build` and load `dist/bind-manager.min.js` with a `<script>` tag; it exposes everything as `window.BindManager` (see [dist/README.md](dist/README.md)).

The demo page registers fourteen actions with keyboard, mouse and gamepad defaults. Its event log shows `pressed` for every action, `released` for Move Forward, Block, Open Map, Open Inventory and Sprint, and `held` for Move Forward, plus binding changes, resets and the guard's pointer-lock and fullscreen state. Its HUD has the buttons Key Bindings, Controller Test, Input Remap, Toggle Hints, Reset All, Fullscreen + Keyboard Lock and Arm/Disarm Leave Guard, and a guard status line. Its **Fake controller** panel (off by default, labelled as simulated) installs a pretend gamepad of a chosen family (Xbox, Xbox Elite, Xbox 360, DualShock 4, DualSense, Switch Pro, Steam Deck, Stadia, unknown) with on-screen buttons, for trying the gamepad features without a pad.

A runnable minimal page is in [examples/standalone/index.html](examples/standalone/index.html) (`http://localhost:3001/examples/standalone/`).

## Build Single-File Library

Generate browser-ready single-file bundles:

```bash
npm run build
```

Build output:
- `dist/bind-manager.js` readable bundle (global `window.BindManager`)
- `dist/bind-manager.min.js` minified bundle for hosting (205,235 bytes at this version)

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

Load this as a module (`<script type="module">`) from a page served over http; `./src/index.js` is your copy of the library's `src/index.js` (see [Install and Run](#install-and-run)). The `GP_*` strings are gamepad codes, listed under [Gamepads](#gamepads).

```js
import { createBindManager } from './src/index.js';

const binds = createBindManager({
	namespace: 'my-game',
	debug: true,      // F5 toggles the modal and no longer reloads the page
	debugKey: 'F5',
	builtInTools: true, // Input Remap and Controller Test in the modal's footer
});

const moveForward = binds.registerAction({
	id: 'move-forward',
	label: 'Move Forward',
	description: 'Move character forward',
	group: 'Movement',
	slots: 2,
	defaultBindings: ['KeyW', 'ArrowUp'],
	gamepadSlots: 1,
	defaultGamepadBindings: ['GP_A1N'], // left stick up
});

const jump = binds.registerAction({
	id: 'jump',
	label: 'Jump',
	group: 'Movement',
	slots: 2,
	defaultBindings: ['Space', null],
	defaultGamepadBindings: ['GP_B0'], // A / Cross / B (Switch), see Gamepads
});

moveForward.showHint();
jump.showHint();

moveForward.onPressed(() => {
	// game logic
});

binds.subscribe((event) => {
	if (event.type === 'binding-changed') {
		console.log('Binding updated', event.actionId, event.device, event.slot, event.newCode);
	}
});

// Your own settings button: open the bindings modal without the debug key.
document.querySelector('#settings').addEventListener('click', () => binds.open());
```

With `debug: true`, the debug key (F5) toggles the modal and its default (page reload) is cancelled; leave `debug` off in production and call `binds.open()` from your own menu. Browsers expose a gamepad only after one of its buttons is pressed while the page is open, so a pad appears in the modal and the hints after the first press.

## API

### `createBindManager(options)`

Options:
- `namespace?: string` storage namespace, default `default`
- `debug?: boolean` enable debug toggle key listener
- `debugKey?: string` `KeyboardEvent.code` used for modal toggle, default `F5`. A key that types a character (a letter, a digit, Space, punctuation) or edits text (Backspace, Delete, the arrows, Home, End) does not toggle while the modal's search field has the focus; it types there instead (see [Searching the bindings](#searching-the-bindings))
- `container?: HTMLElement | null` mount target for modal, hints and tools, default `document.body`
- `storage?: { load, save, clear?, loadGamepadProfileOverrides?, saveGamepadProfileOverrides?, loadCollapsedGroups?, saveCollapsedGroups? } | null` custom persistence adapter (see [Persistence](#persistence))
- `builtInTools?: true | { inputRemap?: boolean, controllerTest?: boolean } | null` enable the bundled Input Remap and Controller Test tools (`true` enables both; see [Built-in tools](#built-in-tools))
- `footerActions?: { id, label, className?, onClick }[]` extra buttons in the bindings modal's footer, before the built-in tools
- `browserGuard?: boolean | BrowserGuardOptions` cancel browser shortcuts while the game owns input, default `false` (see [Browser shortcut guard](#browser-shortcut-guard))
- `wheelPixelThreshold?: number` pixel delta that counts as one wheel notch, default `30` (see [Mouse wheel bindings](#mouse-wheel-bindings))
- `reservedKeyWarnings?: boolean` note in the rebind dialog when the player binds a key the browser or the operating system keeps, default `true` (see [Reserved keys](#reserved-keys))
- `bindSearch?: boolean` search field above the bindings list that filters it while the player types, default `true` (see [Searching the bindings](#searching-the-bindings))
- `groupFolding?: boolean` group headers of the bindings list fold and unfold their rows, default `true` (see [Folding groups](#folding-groups))
- `collapsedGroups?: string[]` groups that start folded, default `[]` (all open); the player's remembered choice wins
- `deadband?: number` gamepad axis values at or below this are treated as rest, default `0.12`
- `analogThreshold?: number` an axis direction counts as pressed past this value, default `0.5`

Returns a manager object with methods below.

### Registration

- `registerAction(def)`
- `registerActions(defs)`

Action definition fields:
- `id: string` required stable action id
- `label?: string` human-friendly name
- `description?: string` action description
- `group?: string` modal section grouping, default `General`
- `slots?: number` keyboard/mouse bindings count, default `2`
- `defaultBindings?: (string|null)[]` `KeyboardEvent.code`, mouse or combo codes per slot
- `gamepadSlots?: number` gamepad bindings count, default `1`
- `defaultGamepadBindings?: (string|null)[]` `GP_*` codes per gamepad slot
- `analog?: boolean` receive continuous `analog` events from axes, default `false`
- `playerIndex?: number` only this gamepad index triggers the action; omitted = any pad

`registerAction` returns an action handle:
- `showHint()`
- `hideHint()`
- `setHintVisible(boolean)`
- `onPressed(callback)`
- `onReleased(callback)`
- `onHeld(callback)`
- `onAnalog(callback)` (actions with `analog: true`)

### Modal and tool controls

- `open()`
- `close()`
- `toggle()`
- `isOpen()`
- `setGroupCollapsed(group, collapsed)` — fold or unfold a group of the bindings list and remember it, like the player's click (no-op with `groupFolding: false`)
- `isGroupCollapsed(group)` — the remembered fold state of a group: the player's choice, else `collapsedGroups`
- `openInputRemap()` — opens the Input Remap tool when `builtInTools` enables it (no-op otherwise)
- `openControllerTest()` — opens the Controller Test tool when `builtInTools` enables it (no-op otherwise)

The built-in tools are always part of the library (and of the bundle); `builtInTools` decides whether they are mounted and shown as footer buttons in the bindings modal.

### Active state and cursor persistence

- `active` (getter) — `true` when the binding modal or capture session is open. Use this to show/hide your game cursor.
- `keepCursorAfterClose` (getter/setter) — a flag kept for host use: the library stores it but never reads it. bind-manager never changes the cursor or pointer lock itself; use `active` / `onActiveChange` to do that in your game.
- `onActiveChange(callback)` — subscribe to active-state transitions. Callback receives `(active: boolean)`. Returns an unsubscribe function.

### Browser guard API

- `browserGuard` (getter) — always present; inert until enabled. Methods:
  - `enabled`, `setEnabled(boolean)`, `setTarget(element | null)`
  - `isEngaged()` — `true` while shortcuts are being cancelled
  - `setGameOwnsInput(boolean)` — tell the guard the game has the cursor (for games without pointer lock)
  - `block(patterns)`, `allow(patterns)`, `getShortcutPolicy()` — opt shortcuts in / out at runtime
  - `keyboardLockSupported`, `isKeyboardLocked()`
  - `enterFullscreen(element?)` → `Promise<{ fullscreen, keyboardLocked, error? }>`, `exitFullscreen()`
  - `armLeaveGuard()`, `disarmLeaveGuard()`, `isLeaveGuardArmed()`

See [Browser Shortcut Guard](#browser-shortcut-guard) for the guide.

### Binding queries and mutations

- `getBinding(actionId, device = 'keyboard')` — `device` is `'keyboard'` (keyboard and mouse codes) or `'gamepad'`
- `getBindings()`
- `exportBindings(options?)`
- `importBindings(payload, options?)`
- `setBinding(actionId, slot, code, device = 'keyboard')`
- `clearBinding(actionId, slot, device = 'keyboard')`
- `resetAction(actionId)`
- `resetAll()`
- `clearStorage()` — delete the persisted bindings (including the saved entries of actions not registered yet) and gamepad profile overrides for this namespace (live bindings are kept; call `resetAll()` first to also restore defaults). Returns `false` if a custom storage adapter has no `clear()`.
- `getStorageStatus()` — `{ ok, failedSaves, lastError, lastFailure }`, see [Persistence](#persistence)

### Gamepad queries and profiles

- `getConnectedGamepads()` — `{ index, id, profile, resolvedProfile }[]`
- `getActiveGamepadProfile(gamepadIndex = 0)` — the resolved family key
- `getResolvedGamepadProfile(gamepadIndex = 0)` — the full resolved profile (see [Gamepads](#gamepads))
- `getGamepadLabel(code, gamepadIndex = null)` — label of a `GP_*` code on that pad; `null` = the first connected pad (generic labels when none is connected)
- `getGamepadThresholds()` — `{ deadband, analogThreshold, buttonThreshold }` the runtime dispatches with
- `getGamepadLogicalState(gamepadIndex = 0)` — `{ buttons: boolean[24], axes: number[4] }` exactly as the runtime reads the pad for dispatch, or `null` when that pad is not connected
- `getAvailableGamepadProfileOptions(gamepadIndex = 0)` — `{ exactProfiles, families, autoResolved }` for a profile picker
- `setGamepadProfileOverride(gamepadIndex, override)` / `clearGamepadProfileOverride(gamepadIndex)` — persisted manual override `{ type: 'family', family }` or `{ type: 'profile', key }`
- `setGamepadProfileMappingEntry(gamepadIndex, code, entry, options?)`, `removeGamepadProfileMappingEntry(gamepadIndex, code)`, `resetGamepadProfileMapping(gamepadIndex)`, `getGamepadProfileDefinition(gamepadIndex)` — in-memory mapping edits, see [In-memory mapping edits](#in-memory-mapping-edits)

### Reserved keys

Some keys never reach a web page, some only while it is fullscreen, and some only in some browsers. The rebind dialog adds a note when the player binds one of them; binding is still allowed. When the key is also bound to another action, the conflict note comes first, and the note's full text is in its title. The note stays 8 seconds when it includes a reserved-key note, 5 seconds for a conflict alone.

The levels:

| Level | Meaning | Examples |
| --- | --- | --- |
| `blocked` | never reaches the page | the Windows key and every Windows-key combo when the platform is known and not a Mac; Ctrl+Alt+Del, Ctrl+Shift+Esc, Ctrl+Esc, Alt+Esc, Ctrl+Shift+Q; Cmd+Q, Cmd+Tab, Cmd+Space, Cmd+H; Alt+Tab and Alt+F4. Under the guard's Keyboard Lock exactly four of them change, each only with exactly the modifiers shown and only on its platform: Cmd+Tab on a Mac, and Alt+Tab, Alt+F4 and the bare Windows key on a platform known not to be a Mac (below) |
| `fullscreen-only` | reaches the page only while it is fullscreen in a Chromium browser | Ctrl+W, Ctrl+T, Ctrl+N, Ctrl+Q, Ctrl+Tab, Ctrl+PageUp, Ctrl+PageDown, Ctrl+F4 (also with Shift; Ctrl+Shift+Q excepted; never with Alt, since Ctrl+Alt is AltGr on many layouts); Cmd+W, Cmd+T, Cmd+N on a Mac; **Alt+Tab** (exactly Alt, on a platform known not to be a Mac) while the browser guard is enabled with Keyboard Lock on and Tab among its lock keys |
| `unreliable` | works in some browsers or situations only | Escape (with any modifiers), F11 and F12 (with any modifiers), Ctrl+Shift+I/J/C, Ctrl+1..9, Ctrl+Shift+P, Shift + right click, Alt+Space; the bare Command key on a Mac; Windows-key combos when the platform is unknown (except those that hold a `blocked` combo, which stay `blocked`; see Platform below); while the guard's Keyboard Lock locks their key, the bare Windows key and Alt+F4 (exactly Alt) on a platform known not to be a Mac, and Cmd+Tab (exactly Cmd) on a Mac; a browser command nothing cancels (below); a fullscreen-only shortcut the browser guard lets through |

In Firefox and Safari the tab and window shortcuts are generally not cancellable at all (see the table in [What a page cannot block, and Keyboard Lock](#what-a-page-cannot-block-and-keyboard-lock)); `fullscreen-only` describes Chromium.

The [browser shortcut guard](#browser-shortcut-guard) is the single source of truth, and its real decision counts:

- `fullscreen-only` is the guard's `FULLSCREEN_ONLY_SHORTCUTS`, matched with the guard's own pattern logic (`Mod` is Ctrl or the Windows / Command key; a pattern matches with at least its modifiers).
- **Guard disabled (the default):** nothing cancels the browser's action. Tab and window shortcuts stay `fullscreen-only`, and the note says that in fullscreen the game has to cancel the browser's action itself, with the browser guard as the way to do it. Alt+Tab is `blocked`.
- **Browser commands nothing cancels:** the guard's default patterns with a Ctrl / `Mod` modifier or on a function key (Ctrl+S, Ctrl+R, Ctrl+L, Ctrl+D, F5, F1, Ctrl+wheel, zoom, …; on a Mac the same with Cmd, and any other Cmd combo) are `unreliable` when nothing cancels them: the guard is disabled, or it lets the key through. One rule decides this for every platform. When the guard cancels them there is no note. For F1, F3, F6 and F7 the note says that whether they can be cancelled at all is up to each browser (see [Browser shortcut guard](#browser-shortcut-guard)). Scrolling keys, the mouse buttons (the mouse runtime cancels bound ones itself) and AltGr combos get no note.
- **Guard enabled:** a key it cancels is fine: through its lists (`shortcuts`, `block`), or because it is bound and `blockBound` is on (the default). A shortcut it really lets through (`allow`, or `blockBound: false` and not in its lists) gets "The browser guard lets X through, so the browser also acts on it." (level `unreliable`).
- **Keyboard Lock:** a level changes only where [What a page cannot block, and Keyboard Lock](#what-a-page-cannot-block-and-keyboard-lock) plainly says Keyboard Lock delivers the combo, only with exactly the modifiers it names, and only on its platform. While the guard is enabled, `keyboardLock` is on and the key is among its effective lock keys (`keyboardLockKeys: null` locks every key), exactly these change: on a Mac, Cmd+Tab with only Cmd held (Tab locked) becomes `unreliable`; on a platform known not to be a Mac, Alt+Tab with only Alt held (Tab locked) becomes `fullscreen-only`, Alt+F4 with only Alt held (F4 locked) becomes `unreliable`, and the bare Windows key (no other modifier held; MetaLeft / MetaRight locked) becomes `unreliable`. When the platform is unknown the lock changes no level. Everything else keeps the level it has without the lock, so these stay `blocked` whatever is locked: Alt+Tab, Alt+F4 and Cmd+Tab with another modifier held (such as Alt+Shift+Tab, Ctrl+Alt+Tab, Ctrl+Alt+F4 or Cmd+Shift+Tab), Alt+Tab and Alt+F4 on a Mac, Win + any key (such as Win+Alt+Tab and Win+Alt+F4), Ctrl+Shift+Q and Cmd+Q (the browser keeps quit even in fullscreen), Ctrl+Esc, Alt+Esc, Ctrl+Shift+Esc, Cmd+Space, Cmd+H, and Ctrl+Alt+Del.
- **Platform:** the Windows / Command key is read from what a page can see (`navigator.userAgentData.platform`, then `navigator.platform`, then the user agent; anything unreadable counts as unknown). On a Mac it is Cmd, handled through the guard's `Mod` logic, and the bare Command key is `unreliable`; elsewhere the Windows key and every Windows-key combo are `blocked`. When the platform is unknown, the bare key and its combos are `unreliable`, except a combo that holds one of the `blocked` combos above (its key with at least its modifiers): Win/Cmd + Q, Tab, Space or H, which macOS and Windows both keep, or any other `blocked` combo with the Windows / Command key added, such as Win+Alt+F4, Ctrl+Win+Esc or Ctrl+Alt+Win+Del. Those stay `blocked`, also with more modifiers held.

- `getReservedInfo(code, { guard, platform, bound })` returns `{ level, reason }` (plus `guardLetsThrough: true` in the case above) or `null`. All options are optional:
  - `guard` is a guard's effective state `{ enabled, shortcuts, block, allow, blockBound, keyboardLock, keyboardLockKeys }`. Values are read the way the guard reads them (a missing `blockBound` or `keyboardLock` means `true`, otherwise truthiness). Without `guard`, or with a falsy `enabled`, nothing is cancelled. Note that `browserGuard.getShortcutPolicy()` alone has no `enabled` field, so passing it counts as a disabled guard; `manager.getReservedBindings()` builds the full state for you.
  - `platform` is `'mac'`, `'other'` or `'unknown'` (default: detected).
  - `bound` defaults to `true`.
- `isReservedCode(code, options)` is `true` for any level.
- `manager.getReservedBindings()` lists current keyboard and mouse bindings that are affected, `{ actionId, slot, code, level, reason, guardLetsThrough? }[]`, for example to check your defaults. It and the rebind dialog use the manager's guard and the detected platform.
- `reservedKeyWarnings: false` turns the note in the rebind dialog off.

The macOS entries are not verified on a real Mac.

### Hint controls

- `showHint(actionId)`
- `hideHint(actionId)`
- `showAllHints()`
- `hideAllHints()`

### Runtime input and subscriptions

- `onAnyAction(callback)` — every action event of every device: `pressed`, `held`, `released`, and the gamepad's `analog` events too (with `code` naming the half for an action bound to one half of an axis). Skip `type === 'analog'` in a handler that tracks up/down state; read analog values with the action handle's `onAnalog()`.
- `isActionPressed(actionId)` — `true` while a bound key, mouse button or gamepad input is held. Gamepad bindings only count on the action's `playerIndex` controller when one is set. Mouse wheel bindings always read `false` here: the wheel has no held state and fires a pressed+released pulse, so listen with `onPressed` instead.
- `subscribe(callback)` for binding-change events (`binding-changed` with `device`, `actionId`, `slot`, `oldCode`, `newCode`, `conflicts`; `reset`)

### Cleanup

- `destroy()` remove listeners and UI from the page

## Exports

Everything below is exported from `src/index.js` (and is a property of `window.BindManager` in the [bundles](dist/README.md)):

| Area | Exports |
| --- | --- |
| Manager | `createBindManager` |
| Keyboard and mouse | `getKeyLabel`, `isKnownCode`, `KEY_DISPLAY_NAMES`, `MODIFIER_ORDER`, `MODIFIER_CODES`, `buildComboCode`, `WheelNotchCounter`, `DEFAULT_WHEEL_PIXEL_THRESHOLD`, `getReservedInfo`, `isReservedCode` |
| Browser guard | `DEFAULT_BLOCKED_SHORTCUTS`, `DEFAULT_KEYBOARD_LOCK_KEYS`, `FULLSCREEN_ONLY_SHORTCUTS`, `parseShortcutPattern`, `matchesShortcutPattern` |
| Gamepad codes | `GP_CODES`, `GP_B0`..`GP_B23`, `GP_A0N`..`GP_A3P`, `GP_BUTTON_COUNT` (24), `GP_AXIS_COUNT` (4), `isGamepadCode`, `getGamepadCodeType` |
| Families and labels | `GAMEPAD_PROFILES`, `GAMEPAD_FAMILIES`, `GAMEPAD_FAMILY_NAMES`, `GAMEPAD_DEVICE_FAMILIES`, `GAMEPAD_LABEL_VARIANTS`, `GAMEPAD_UNVERIFIED_LABELS`, `detectGamepadProfile`, `getGamepadLabel`, `getGamepadFamilyName`, `getGamepadLabelVariant`, `isGamepadLabelUnverified`, `parseGamepadId` |
| Profile resolution | `getControllerFamily`, `getResolvedGamepadLabel`, `isControllerProfileApplicable`, `resolveGamepadProfile` |
| Mapping helpers | `decodeHatValue`, `isHatEntryActive`, `isHatGridLayout`, `readMappingEntryMagnitude` |

New since 0.1.0: `GP_B17`..`GP_B23`, `GP_BUTTON_COUNT`, `GP_AXIS_COUNT`, `GAMEPAD_FAMILIES`, `GAMEPAD_FAMILY_NAMES`, `GAMEPAD_DEVICE_FAMILIES`, `GAMEPAD_LABEL_VARIANTS`, `GAMEPAD_UNVERIFIED_LABELS`, `getGamepadFamilyName`, `getGamepadLabelVariant`, `isGamepadLabelUnverified`, `parseGamepadId`, `isControllerProfileApplicable`, `decodeHatValue`, `isHatEntryActive`, `isHatGridLayout`, `readMappingEntryMagnitude`. Nothing was removed.

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
| `leaveGuard` | `false` | arm a `beforeunload` prompt when the guard first engages |

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
import { DEFAULT_BLOCKED_SHORTCUTS } from './src/index.js'; // your copy of src/index.js, or window.BindManager
createBindManager({ browserGuard: { shortcuts: DEFAULT_BLOCKED_SHORTCUTS.filter(p => p !== 'MouseWheel') } });
```

The primary mouse button is never cancelled (focus and `requestPointerLock()` need it). Escape and F11 are not in the default list, so they keep their browser behaviour unless you bind them to an action (with `blockBound`) or add them with `block`; then they are cancelled too. DevTools combos other than F12 (Ctrl+Shift+I/J/C) are not in the default list; add them with `block` if you want. Whether F1/F3/F6/F7/F12 can be cancelled is up to each browser.

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

With `leaveGuard: true`, the guard arms a `beforeunload` "Leave site?" prompt as soon as it first engages: pointer lock on the target, focus moving into the target, fullscreen containing the target, `setGameOwnsInput(true)`, or the first input event it handles while engaged. It stays armed after the cursor is released, so clicking the tab's close button still asks. Call `disarmLeaveGuard()` right before your app's own navigation (it re-arms on the next engagement), or arm and disarm it by hand with `armLeaveGuard()` and `disarmLeaveGuard()`. Browsers only show the prompt after the user has interacted with the page, and they use their own fixed text.

## Mouse Wheel Bindings

Wheel directions can be bound like keys: `MouseWheelUp` and `MouseWheelDown`, plus chords such as `ControlLeft+MouseWheelUp` or `ShiftLeft+MouseWheelDown`. In the bindings modal, click a slot and scroll. Labels read "Wheel Up" / "Left Ctrl + Wheel Up", and wheel bindings persist and import/export like any other code.

Each **notch** dispatches one `pressed` followed by one `released` (wheels have no `held`). Raw `WheelEvent`s are normalised by `WheelNotchCounter` (exported):

- pixel mode (`deltaMode` 0, Chromium/Safari): an event of at least `wheelPixelThreshold` (30) px is one notch
- line mode (`deltaMode` 1, Firefox): an event of one or more whole lines is one notch. Firefox usually reports 3 lines per detent, which still counts as one notch
- page mode (`deltaMode` 2): every event is one notch
- smaller deltas from trackpads and high-resolution or free-spinning wheels add up per direction, and each 30 px (or 1 line) of travel emits a notch. The running total resets on a direction change or after 200 ms without wheel input
- one event never produces more than one notch
- Shift+wheel: Chromium and Safari report it on `deltaX`, which is used when `deltaY` is 0 and Shift is held, so Shift+wheel chords work everywhere. Pure horizontal scrolling (tilt wheel, sideways trackpad) is ignored

The window wheel listener is passive by default. It becomes non-passive only while a capture runs (so capture can stop the modal from scrolling) or while a wheel code is bound and gameplay is not suppressed (so a host handler can cancel through `originalEvent`). During gameplay, page scrolling is only cancelled by the browser guard.

## Gamepads

### Codes

Gamepad bindings use logical codes:

- `GP_B0`..`GP_B16`: the 17 buttons of the browser's standard layout (face buttons 0–3, bumpers 4–5, triggers 6–7, the two centre buttons 8–9, stick clicks 10–11, D-pad 12–15, home 16).
- `GP_B17`..`GP_B23`: extra buttons a pad reports after the standard 17 (Share, touchpad click, paddles, back grips). `GP_BUTTON_COUNT` is 24.
- `GP_A0N`/`GP_A0P` .. `GP_A3N`/`GP_A3P`: the four stick axes, split into a negative and a positive direction (`GP_A1N` is left stick up).

A button counts as pressed when the browser reports `pressed: true` or its value is above 0.5; an axis direction counts as pressed past `analogThreshold` (default 0.5). Axis values within `deadband` (default 0.12) are rest. Actions with `analog: true` also get continuous `analog` events, and exactly one `analog` event with value 0 when the axis returns into the deadband. Read the values in use with `getGamepadThresholds()`.

### Families and labels

Labels come from the family the pad is detected as. `getGamepadLabel(code, family, variant?)` (module function) and `manager.getGamepadLabel(code, gamepadIndex?)` return them; a family without a label for a code returns the code itself, which is how the UI knows a pad lacks that button.

| Family (`GAMEPAD_FAMILY_NAMES`) | `GP_B0`..`GP_B3` | `GP_B8` / `GP_B9` | `GP_B10` / `GP_B11` | `GP_B16` | `GP_B17`.. |
| --- | --- | --- | --- | --- | --- |
| `xbox` (Xbox) | A, B, X, Y | View / Menu | LS / RS | Xbox | Share |
| `xbox360` (Xbox 360) | A, B, X, Y | Back / Start | LS / RS | Guide | — |
| `dualshock4` (DualShock 4) | Cross, Circle, Square, Triangle | Share / Options | L3 / R3 | PS | Touchpad |
| `dualsense` (DualSense) | Cross, Circle, Square, Triangle | Create / Options | L3 / R3 | PS | Touchpad |
| `switch-pro` (Switch Pro) | B, A, Y, X (positional) | Minus / Plus | LS / RS | Home | Capture |
| `steam` (Steam) | A, B, X, Y | View / Menu | L3 / R3 | Steam | Quick Access, Left Pad, Right Pad, L4, L5, R4, R5 |
| `stadia` (Stadia) | A, B, X, Y | Options / Menu | L3 / R3 | Stadia | Assistant, Capture |
| `generic` (Generic) | Btn 0..Btn 3 | Btn 8 / Btn 9 | Btn 10 / Btn 11 | Btn 16 | Btn 17..Btn 23 |

Bumpers and triggers are LB/RB/LT/RT (Xbox families), L1/R1/L2/R2 (PlayStation, Steam, Stadia) and L/R/ZL/ZR (Switch Pro). Every named family labels the D-pad `D-Up`/`D-Down`/`D-Left`/`D-Right` and the sticks `LS-Up`, `RS-Left` and so on; generic labels axes `Axis 0-`, `Axis 0+`, ….

**Xbox Elite variant.** `GAMEPAD_LABEL_VARIANTS['xbox-elite']` relabels `GP_B17`..`GP_B20` as Paddle 1..4 for the Elite controllers (`045e-02e3`, `045e-0b00`, `045e-0b05`, `045e-0b22`); the rest of the pad keeps the Xbox labels. Per research, only Chrome on Windows reports the paddles. The resolved profile names the variant in `labelVariant`.

**Labels not verified on hardware.** `GAMEPAD_UNVERIFIED_LABELS` lists entries no device was available for: Xbox `GP_B17` (Share is confirmed only for Chrome on Windows), Steam `GP_B17`..`GP_B23` (back-button order, the 2026 Steam Controller layout), Stadia `GP_B17`/`GP_B18` (Assistant and Capture may be swapped). `isGamepadLabelUnverified(code, family)` checks one.

### Detection

`parseGamepadId(id)` reads `{ vendorId, productId, key, name }` from both browser id forms: Firefox `054c-0ce6-DualSense Wireless Controller` (also with leading zeros dropped) and Chrome `DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)`. `detectGamepadProfile(id)` then decides:

- With a vendor/product pair, only the device table `GAMEPAD_DEVICE_FAMILIES` decides; a pair not in the table is `generic`.
- Without one, name patterns apply: any `XInput` id is `xbox`; "Xbox 360" is `xbox360`; "Xbox Wireless/One/Series/Elite/Adaptive" is `xbox`; "DualSense", "DualShock", a bare "Wireless Controller" (DualShock 4 on older setups), "Pro Controller"/"Joy-Con", "Steam Deck/Controller", "Stadia" pick their family; anything else is `generic`.

### Resolution and exact profiles

`getResolvedGamepadProfile(index)` (and the module function `resolveGamepadProfile(gamepad, { override })`) resolves a pad in this order: a manual exact-profile override that fits the pad, a manual family override, an exact generated profile that fits the pad, the detected family, generic. In-memory mapping edits replace the result (source `memory-edit`). The result has `source` (`manual`, `exact`, `family`, `generic`, `memory-edit`), `family`, `profileHint`, `profileKey`, `definition`, `override`, `ignoredOverride`, `gamepadId`, `displayName`, `vendorId`, `productId` and `labelVariant`.

An **exact profile** (generated from a capture, see [src/input/controller_definitions/README.md](src/input/controller_definitions/README.md)) remaps raw buttons and axes and brings its own labels. It applies only when `isControllerProfileApplicable(profile, gamepad)` holds: the browser did not remap the pad (`gamepad.mapping !== 'standard'`) and the pad's raw button and axis counts equal the profile's `sourceButtons` and `sourceAxes`. With a bare id string it never applies. A manual exact override that does not fit is stored anyway (the pad may report a raw layout later) but not applied: the resolved profile reports it in `ignoredOverride`, the manager warns once in the console, and the bindings modal and the tools show "saved profile does not fit this controller's layout" next to the profile select ("saved profile is not available for this controller" when no profile with that key exists at all).

The one shipped exact profile is `054c-0ce6` (DualSense), captured from the raw layout Firefox reports (14 buttons, 12 axes, no remap). Chrome reports a DualSense with `mapping: 'standard'`, so there the `dualsense` family labels apply instead.

**Hat D-pads.** A raw D-pad reported as one hat axis is decoded on the 2/7 grid (up -1, right -3/7, down 1/7, left 5/7): when a profile's four hat entries sit on the four cardinal grid positions (`isHatGridLayout`), a cardinal entry is also active on its two neighbouring diagonals, so up-right presses both `GP_B12` and `GP_B15`, and a value off the grid (the resting value) is neutral. Other hat entries match their own `value` ± `tolerance` (default 0.2). `decodeHatValue(raw)` returns `{ up, right, down, left }`.

### In-memory mapping edits

`setGamepadProfileMappingEntry(index, code, entry)` maps one logical code to a raw `{ kind: 'button', index }`, `{ kind: 'axis', index, direction }` or `{ kind: 'hat', index, value, tolerance }` input on that controller model. On a pad without an exact profile, editing one code keeps the rest of the pad on its standard layout. `removeGamepadProfileMappingEntry(index, code)` gives the code its base entry back (the exact profile's, or the standard layout's); `resetGamepadProfileMapping(index)` discards every edit of that pad and returns `true` when there were any. Edits apply to every pad of the same model, survive a reconnect, and are **not persisted**: they are gone on reload. `getGamepadProfileDefinition(index)` returns the edited (or exact) definition, or `null` for a pad on family or generic labels without edits. The Controller Test's Profile editor is a UI for these calls.

## Sizing and Theming

### The scale unit

Every length in the UI is a multiple of `--bm-u` and every text size one of four font tokens, so between 1280x720 and 3840x2160 the UI looks the same at any resolution with the same aspect ratio. Below that range it keeps its 1280x720 size (and is capped at the viewport); above it, its 3840x2160 size. Small text also has px floors (9px and 10px), so near the floor the smallest text does not shrink with the rest.

```css
:root {
  --bm-u-min: 0.6667px;
  --bm-u-max: 2px;
  --bm-u: clamp(var(--bm-u-min), min(100vw / 1920, 100vh / 1080), var(--bm-u-max));
}
```

`--bm-u` is 1px at 1920x1080. It reaches its floor (0.6667px) at 1280 wide or 720 tall and its ceiling (2px) at 3840x2160.

The library injects its stylesheet into `<head>` when the manager mounts (inside `createBindManager()`), after your own styles. Its `:root` rule therefore wins a tie with a host `:root` rule, so write root-level overrides as `html:root { … }`:

| Variable | Where a host may set it | Default |
| --- | --- | --- |
| `--bm-u` | `html:root` or any ancestor of the UI (e.g. `body { --bm-u: 1px }` for fixed sizes) | the clamp above |
| `--bm-u-min`, `--bm-u-max` | `html:root` only (read only by the `:root` declaration of `--bm-u`) | `0.6667px`, `2px` |
| `--bm-font-xs`, `--bm-font-s`, `--bm-font-m`, `--bm-font-l` | `html:root` or any ancestor | `max(9px, 14u)`, `max(10px, 15u)`, `17u`, `21u` |
| `--bm-modal-width` | `html:root` or any ancestor | `calc(1080 * var(--bm-u))` |
| `--bm-modal-max-h` | `html:root` or any ancestor | `calc(880 * var(--bm-u))` |
| `--bm-modal-radius` | `html:root` or any ancestor | `calc(12 * var(--bm-u))` |

The bindings modal is capped at the viewport whatever these say: at most `100vw - min(32u, 4vw)` wide and `100dvh - min(32u, 4dvh)` tall. The three size variables are no longer declared on `:root` (their defaults are fallbacks where they are used), so `getComputedStyle(document.documentElement)` returns nothing for them. Set the font tokens through `--bm-font-*`; a host value for the internal `--bm-fs-*` tokens is replaced on the library's roots.

The built-in tools (Input Remap, Controller Test) follow the same rules: an ancestor's `--bm-u` and the `--bm-font-*` variables size their text as they size the modal's.

At 1280x720 and below, the smallest text is 9.33px (`--bm-fs-xs`), the others 10px, 11.33px and 14px.

### Colours

| Variable | Default |
| --- | --- |
| `--bm-z-modal`, `--bm-z-capture`, `--bm-z-hints` | `9000`, `9010`, `8000` |
| `--bm-overlay-bg` | `rgba(0, 0, 0, 0.75)` |
| `--bm-modal-bg`, `--bm-modal-border` | `#1e1e2e`, `#3a3a5c` |
| `--bm-text-primary`, `--bm-text-secondary`, `--bm-text-desc` | `#e0e0f0`, `#b0b0d0`, `#9898c0` |
| `--bm-group-bg`, `--bm-group-border`, `--bm-row-hover` | `#16162a`, `#2a2a44`, `#252540` |
| `--bm-accent`, `--bm-accent-hover`, `--bm-accent-active` | `#5c7cfa`, `#748cfb`, `#4a6ae8` |
| `--bm-btn-bg`, `--bm-btn-hover`, `--bm-btn-border` | `#2a2a44`, `#343460`, `#3a3a60` |
| `--bm-capture-bg`, `--bm-capture-border`, `--bm-capture-text` | `#3a2a00`, `#c89000`, `#ffd060` |
| `--bm-reset-color`, `--bm-reset-hover` | `#e06060`, `#f07070` |
| `--bm-warn-bg`, `--bm-warn-border`, `--bm-warn-text` | `#2e1e00`, `#a06000`, `#ffa040` |
| `--bm-hints-bg`, `--bm-hints-border` | `rgba(10, 10, 25, 0.85)`, `rgba(255, 255, 255, 0.08)` |
| `--bm-hint-key-bg`, `--bm-hint-key-border` | `rgba(255, 255, 255, 0.12)`, `rgba(255, 255, 255, 0.22)` |

Changed defaults since 0.1.0: `--bm-text-secondary` (`#9090b0` → `#b0b0d0`) and `--bm-text-desc` (`#6a6a90` → `#9898c0`), so both reach 4.5:1 contrast on every default background.

**Borders are box-shadows.** Hairlines are drawn as `box-shadow` rings (outer for the modal, the capture modal and the hint pill; inset for buttons, the profile panel, the select, the warning), so they never shift the layout. Library buttons and selects have `border: 0`. A host `border-color` override therefore has no visible effect any more; recolour the hairlines through the variables above (`--bm-modal-border`, `--bm-btn-border`, `--bm-capture-border`, `--bm-group-border`, `--bm-warn-border`, `--bm-hints-border`, `--bm-hint-key-border`, `--bm-accent` on hover) or override `box-shadow`. In the built-in tools, the hairline colours are `--bm-tool-line` and `--bm-btn-line`, declared on the tool panels and on `.bm-tool-btn` themselves (set them on those elements; an ancestor value is overridden). Tool overlays use fixed z-indexes (10020, 10030, 10040).

### Row layouts of the bindings modal

The modal picks one of three row layouts from the body's measured width (in `u`) and the widest slot counts of all registered actions (`kb` keyboard slots, `gp` gamepad slots), and re-checks on resize:

- `bm-layout-inline` (body at least `388 + 154 × (kb + gp)` u): one line per action, label, keyboard slots, a divider, gamepad slots, reset.
- `bm-layout-stacked` (body at least `334 + 154 × max(kb, gp)` u): label, then the keyboard row above the gamepad row, reset.
- `bm-layout-narrow` (otherwise): the label on its own line above the stacked rows.

Slot columns line up across all rows in every layout. At the default width (body about 1070u), the inline layout holds up to four slots in total. The layout class sits on `.bm-modal`.

### Below 1280x720

`--bm-u` stays at its floor, so the UI keeps its 1280x720 size. The bindings modal is capped at the viewport, its body scrolls, and its rows fall back to stacked or narrow; nothing overflows sideways. The capture modal (480u) is capped the same way. The two built-in tools (Controller Test 1400u x 800u and Input Remap 1200u x 760u at normal sizes) fill the viewport minus 16px below 1280 wide or 720 tall and become one scrolling column; below 800px wide their header takes two rows. Their capture window (640u x 420u) does not fill the viewport; it is capped at the viewport minus 16px. The Controller Test's controller view keeps a minimum width of 780u (520px) and scrolls sideways when narrower, starting at its centre.

### Hint bar

The hint bar is a centred pill near the bottom edge (`min(16u, 2vh)` above it), at most the viewport width minus a margin, and at most three rows tall; further rows are clipped. Each hint label is at most 240u wide with an ellipsis; the full text is in its `title`.

### Removed classes and markup

Styles written for 0.1.0 against these no longer match:

- Bindings modal: `bm-with-gamepad` (CSS only), `bm-profile-summary`, `bm-profile-meta`, `bm-profile-subtitle` (now `bm-profile-name` with the raw id in its `title`, and `bm-profile-chip` with `bm-profile-chip--exact|family|generic|manual|memory-edit`), `bm-profile-controls`, and the **Auto** button `bm-profile-auto-btn` (use the select's "Auto detect" option). New: `bm-profile-note`, `bm-empty`, `bm-device-row--keyboard` / `--gamepad`, `bm-layout-*`.
- Built-in tools: the card classes `bm-debug-card` / `bm-tester-card` (now `bm-tool-section`), `bm-debug-small` / `bm-tester-help` (now `bm-tool-note`), `bm-debug-actions` / `bm-tester-actions`, the profile status lines and Auto buttons (now `bm-tool-device`, `bm-tool-chip`, `bm-tool-select`), the DOM controller view (`bm-tester-controller`, `bm-tester-node` with its `bm-wide` modifier, `bm-tester-stick`, `bm-tester-stick-dot` with `bm-tester-left-stick-dot` / `bm-tester-right-stick-dot`, `bm-tester-trigger-meter`, `bm-tester-trigger-fill`, `bm-tester-l2-fill`, `bm-tester-r2-fill`, `bm-tester-edit-mode`; now one SVG `bm-tester-pad` with `bm-pad-*` classes; `bm-tester-trigger-edit` still exists), the raw-input toggle and its section (`bm-tester-raw-section`, `bm-tester-raw-toggle-btn`, `bm-tester-raw-pre`; now the Debug panel's `bm-tester-raw`), `bm-tester-last-signal`, `bm-tester-detail`.

## Built-in Tools

Enable them with `builtInTools: true` (or `{ inputRemap: true, controllerTest: true }`). They appear as **Input Remap** and **Controller Test** buttons in the bindings modal's footer and open from code with `openInputRemap()` / `openControllerTest()`. One tool is open at a time: opening one closes the other. While a tool is open, Escape and Tab are handled at window capture for the topmost tool dialog wherever focus is (Escape closes it, Tab stays inside) and never reach the page or the bindings modal underneath; the browser shortcut guard is disengaged. Closing a tool returns focus to what opened it.

### Controller Test

Opened by the footer button **Controller Test** (its dialog title reads the same). A fixed-size panel with a header (title, the device's own name with the raw id in its tooltip, a profile chip such as "Family · DualSense", "Exact · DualSense", "Manual · Stadia", "Generic" or "Edited", the profile select with "Auto detect", **Debug**, **Profile editor**, **Close**), a live SVG view of the controller in the family's layout, and one status line.

- The view lights a control exactly when the game gets `pressed` for it (it reads `getGamepadLogicalState()` and the runtime's thresholds); movement below the threshold shows as a faint partial fill. Sticks show a dot, triggers a 0.00–1.00 bar; extra buttons (`GP_B17`..) show only when the pad has them, Elite paddles in a row of small keys.
- **Debug** opens the last strongest signal (kind, index, direction, delta, raw, code, and the logical code it resolves to with its label), the active codes (`Active: GP_B0=Cross, …`) and a raw table of every button and axis.
- **Profile editor** opens **Calibrate baseline** (1.5 s; keep the controls released), **Edit mode** (click a control in the view, then hold the physical input you want for it: it is assigned after about two 100 ms samples; **Trigger targets** L2/R2/L2A/R2A pick the trigger codes; L2A/R2A are `GP_B6A`/`GP_B7A`, the analog trigger readings, which exist only in this editor and in captures: they cannot be bound to actions), **Capture update** (a 5 s capture window for the selected control), **Download JSON** (the current exact or edited profile definition as `<key>.json`), **Reset edits** (discard this controller's in-memory edits), and the selected control's current binding with **Remove**. Edits are the [in-memory mapping edits](#in-memory-mapping-edits) above: not saved.

### Input Remap

A guided capture of a controller into the capture JSON that `npm run process_controller_defs` turns into an exact profile. Pick the preset (only "DualSense / PlayStation Layout" exists: 27 steps for `GP_B0`..`GP_B16`, the analog triggers `GP_B6A`/`GP_B7A` (capture-only codes; they cannot be bound) and the eight stick directions, then an optional "Touchpad click" step for `GP_B17` that a pad without one skips with **Next**), press **Start Debug** and release everything for the 2 s baseline, then walk the steps with **Back**, **Redo**, **Capture** (each capture window is 5 s; the strongest stable input wins) and **Next**. The panel shows the live strongest signal, a validation line and the JSON (`schemaVersion`, `runMeta.targetController { index, id, mapping, buttons, axes }`, `runMeta.baseline`, `sequence`, `captures`, `byExpected`, `controllerDefinition`), with **Copy JSON** and **Download JSON** (file name `<vendor>-<product>_dualsense.json`). `mapping` is the layout the browser reports (`'standard'` or `''`). For a pad the browser already reports in the standard layout, a note under the profile line says so when the tool opens, and the validation line is an error instead of "ready to export": no exact profile is needed there, the family labels apply (Copy and Download still work, for debugging).

The full workflow, and what it needs from the pad, is in [src/input/controller_definitions/README.md](src/input/controller_definitions/README.md#adding-a-controller-profile).

## UI Behavior

- Only one key-capture session can be active at a time.
- While capturing, conflicting UI actions are disabled.
- Canceling capture (Escape) restores the button without applying changes.
- Per-slot clear buttons remove a binding without resetting the entire action.
- Duplicate bindings are allowed and shown as warnings.
- Tab stays inside the bindings modal and the capture dialog; closing returns focus to the opener. Reset, Reset All and profile changes update the modal in place and keep its scroll position and focus.
- A tap or click on Cancel (or Close) never reaches the control underneath, also with touch and pen and on a double tap.
- The Escape that closes the modal ends there: it does not reach window listeners, so an action bound to Escape does not fire as the modal closes.

### Searching the bindings

A search field sits between the modal's header and the list, so it stays in view while the list scrolls. What the player types filters the list at once:

- The text is split at spaces; a row is shown when every word occurs in its label, its description, its group name, or the label of one of its current bindings as its button shows it ("Space", "Ctrl", "Wheel Up", and gamepad buttons under the active profile, such as "Cross" on a DualSense). Internal codes (`KeyW`, `GP_B0`) are not matched. Case and accents do not count ("saute" finds "Sauté").
- Rows that do not match are hidden in place (the `hidden` attribute; no re-render), and so is a group with no row left. Hidden rows are out of the Tab order and the focus trap. When nothing matches, one line says so and names the text; a polite live region tells screen readers the number of matches.
- The filter follows binding changes and gamepad profile changes, since binding labels are matched. A row that holds the focus stays shown until the text changes, so rebinding a key in a filtered list never removes the control in use.
- While a filter is active the list starts at its top; clearing the text returns to the scroll position from before the search.
- Escape with text in the field clears it and keeps the modal open; the next Escape closes the modal. Enter does nothing. Tab moves on to the clear button and the list. The clear button (×) appears when there is text.
- Typing in the field never fires an action or starts a capture, and the browser guard leaves it alone (actions are suppressed while the modal is open). The debug toggle key is ignored while it would type into the field (a letter, digit or other character, Backspace, Delete, the arrows, Home, End), so it may be a letter key; F5 and other non-typing keys still toggle.
- The text survives `refresh()` (value, focus and caret) and is cleared when the modal closes. Opening the modal puts the focus on the modal, not in the field. During a capture the field is disabled like the other controls.
- On touch screens (`any-pointer: coarse`) the field's text is at least 16px whatever `--bm-u` is, so iOS Safari does not zoom the page when it takes focus. The list body keeps a minimum height (`min(120u, 40vh)`), so a short viewport, such as one with an on-screen keyboard, cuts the footer before the list.
- `bindSearch: false` removes the field; the modal's markup is then as in 0.2.1.

Classes: `bm-search` (the row), `bm-search-input`, `bm-search-clear`, `bm-search-status` (the live region, visually hidden with `bm-visually-hidden`) and `bm-search-empty` (the no-match line, also a `bm-empty`).

### Folding groups

Each group title of the bindings list is a button that folds and unfolds the group's rows (click, tap, Enter or Space). It shows a marker, the group name and a count of bound actions out of all, for example "3 / 64" (read as "3 of 64 bound"); an action counts as bound when any keyboard, mouse or gamepad slot is set. The count follows binding changes in place.

- **Defaults.** All groups start open. `collapsedGroups: ['Spells']` starts the named groups folded; `manager.setGroupCollapsed(group, collapsed)` folds or unfolds one from code.
- **Remembered.** The player's choice, open or folded, is kept per namespace and wins over `collapsedGroups`. `LocalStorageAdapter` keeps it in its own key, `bind-manager:<namespace>:collapsed-groups`, as `{ "version": 1, "groups": { "<group name>": true | false } }` (`true` folded, `false` opened by the player); the bindings key `bind-manager:<namespace>` is not touched. At most 256 groups are kept; the oldest choices go first. A custom storage adapter may add `loadCollapsedGroups()` (returns that `groups` object) and `saveCollapsedGroups(groups)`; without them the state lives in memory for the page's lifetime. Reading and saving never throw.
- **Reset and clear.** Reset All leaves the fold state alone. `clearStorage()` deletes the stored fold state with the rest (the adapter's `clear()`); the groups folded on screen stay as they are until the next reload.
- **With the search.** While the search field holds text, every group with a match is shown open, so matches inside folded groups appear. A header click during a search folds or unfolds that group for the current search only; clearing the search brings back the fold state from before, unchanged.
- **Focus.** Rows of a folded group are out of the Tab order and the focus trap. When a group folds with the focus inside it, the focus goes to its header. Headers are disabled during a capture. `refresh()` keeps fold state, focus (also on a header) and scroll.
- **Warnings.** Rows carry no lasting conflict or reserved-key marker (those notes are the temporary line in the footer), so a folded header shows none.
- `groupFolding: false` renders plain group titles; with `bindSearch: false` as well, the modal's markup is as in 0.2.1.

Classes: `bm-group-toggle` (the header button, also a `bm-group-title`), `bm-group-marker`, `bm-group-name`, `bm-group-count` (with `bm-group-count-short` and the screen-reader `bm-group-count-long`), `bm-group-rows` (the rows, `hidden` when folded) and `bm-group-folded` on a folded `bm-group`.

With 400 actions in 16 groups, `open()` took about 117 ms to the second painted frame in desktop Chromium (0.2.1: about 130–150 ms), and about 33 ms with every group folded; one keystroke in the search field took about 33 ms (two frames). With 4x CPU throttling these were about 920 ms, 180 ms and 115 ms. Rows of folded groups are built but not laid out.

## Persistence

Bindings are persisted under the localStorage key `bind-manager:<namespace>`, manual gamepad profile overrides under `bind-manager:<namespace>:gamepad-profile-overrides`, the folded groups of the bindings list under `bind-manager:<namespace>:collapsed-groups` (see [Folding groups](#folding-groups)). The payloads are versioned internally.

- Saved bindings of actions that are not registered (yet) are kept on every save, so an action registered later still gets its saved bindings. `clearStorage()` drops them too.
- Saving happens once per committed change (`resetAll()` is one commit). A failed save (quota exceeded, storage unavailable) never stops later saves: every later change tries again, the manager warns once in the console, and `getStorageStatus()` returns `{ ok, failedSaves, lastError, lastFailure }`. `ok` and `lastError` describe the latest save (`lastError` is `null` again after a successful save); `failedSaves` counts failures and `lastFailure` (`{ error, at }`) keeps the most recent one.
- A custom `storage` adapter needs `load()` and `save(bindings)`; `clear()`, `loadGamepadProfileOverrides()`, `saveGamepadProfileOverrides(overrides)`, `loadCollapsedGroups()` and `saveCollapsedGroups(groups)` are optional. A `save()` that throws or returns `false` counts as a failed save (the built-in `LocalStorageAdapter` returns `true`/`false` and keeps `lastSaveError`); a `save()` that returns nothing counts as a success.
- In-memory gamepad mapping edits are never saved.

## JSON Export and Import

Export:

```js
const payload = binds.exportBindings();
// { version: 2, namespace, bindings: { jump: { keyboard: ['Space', null], gamepad: ['GP_B0'] } }, metadata: { exportedAt } }
```

Only registered actions are exported. Pass `{ includeMetadata: false }` to leave out `metadata`.

Import (merge mode, default):

```js
const report = binds.importBindings(payload);
// {
//   mode: 'merge',
//   appliedActions,
//   appliedSlots,
//   skippedUnknownActions,      // ids ignored (merge mode: every unregistered id)
//   storedUnregisteredActions,  // replace mode: ids stored for later registration
//   droppedUnregisteredActions, // replace mode: ids not stored because of a cap
//   invalidEntries,             // messages: unknown codes, wrong types, cuts
//   conflictCount
// }
```

Import (replace mode):

```js
binds.importBindings(payload, { mode: 'replace' });
```

In `replace` mode:

- A registered action missing from the payload has its keyboard slots cleared and, for a version 2 payload, its gamepad slots too. In a version 2 entry, a missing `keyboard` or `gamepad` field clears that device. Version 1 payloads (and legacy array entries) cannot express gamepad bindings and leave gamepad slots untouched.
- The saved entries of all unregistered actions are made to match the payload: valid entries are stored (and apply when the action registers), saved ids missing from the payload are dropped, and an unrecognisable entry keeps the saved one. Stored data is capped: ids up to 128 characters, at most 512 unregistered ids per import, at most 16 slots per device; what is cut or dropped is reported.

An unknown code keeps the slot's current value and is reported in `invalidEntries`; a wrong value type clears the slot and is reported. An invalid `mode` throws.

## Upgrading from 0.1.0

The baseline is the last public build: the `main-latest` bundle of the public `main` branch as of 2026-08-10, package version 0.1.0. This release is 0.2.0 (see [CHANGELOG.md](CHANGELOG.md)). Below, "0.1.0" means that build.

Everything a host will notice, in one list. Nothing was removed from the public API.

**Events**

- Opening the bindings modal (gameplay suppressed) and disconnecting a pad now fire `released` for every gamepad code that fired `pressed`, and one final `analog` event with value 0 to every analog action whose value (its half of the axis, or the whole axis) was non-zero. 0.1.0 left them pressed.
- An input still held when gameplay resumes (modal closed) or after a capture is *latched*: it stays silent until it is released and pressed anew, so no `held` arrives without a `pressed`. Analog events are not latched. A code released while the modal was open is unlatched at once.
- An analog action whose value returns to 0 (the axis back in the deadband, or the stick on its other half) gets exactly one `analog` event with value 0; 0.1.0 left the last non-zero value standing.
- `analog` events of an action bound to one half of an axis now carry `code` (`GP_A0N` / `GP_A0P`, the same string as that half's `pressed`/`held`/`released`; for an action bound to both halves `code` is present but `undefined`), and within one poll they come before the `pressed`/`held` of the same axis. A manager-wide `onAnyAction` handler that treats every type other than `pressed`/`held` as "up" and keys its state by `e.code` (or `e.code ?? e.actionId`) therefore sees that half go up and down again on every frame the stick is past the threshold — also for a non-analog action bound to the same code. Skip `type === 'analog'` in such a handler and read analog values with `onAnalog()`. A handler keyed by `actionId` already saw this for analog actions in 0.1.0.
- Hat D-pad diagonals now press both directions (up-right = `GP_B12` and `GP_B15`); a hat value between grid positions (the resting value) is neutral.
- A button in an exact or edited mapping counts as pressed by the same rule as an unmapped one (`pressed` or value above 0.5); 0.1.0 used the analog threshold for mapped buttons and ignored `pressed`.
- `destroy()` fires `released` (with `originalEvent: null`) for every keyboard and mouse binding still held; 0.1.0's teardown released nothing. Gamepad bindings still get no `released` from `destroy()`.

**Gamepad families and labels**

- Five new families (`xbox360`, `dualshock4`, `switch-pro`, `steam`, `stadia`) and detection by vendor/product id in both Chrome and Firefox id forms. 0.1.0 knew `xbox`, `dualsense` and `generic` and matched ids by substring.
- DualShock 4 pads (`054c-05c4`, `054c-09cc`, `054c-0ba0`, and a bare "Wireless Controller" id) are no longer labelled as DualSense: they get the `dualshock4` family (`GP_B8` is Share, not Create).
- Xbox 360-era ids (`045e-028e`, `028f`, `0291`, `02a1`, `02a9`, `0719`, Logitech F310/F510/F710 in X mode, the Steam virtual pad `28de-11ff`, Amazon Luna `1949-041a`) get the `xbox360` family (Back, Start, Guide). XInput ids without vendor/product stay `xbox`.
- An unknown Microsoft or Sony vendor/product pair is now `generic` (`Btn 0`, …); 0.1.0 labelled every Microsoft id Xbox and every Sony id DualSense.
- Xbox labels changed: `GP_B8` Back → View, `GP_B9` Start → Menu, `GP_B10` L3 → LS, `GP_B11` R3 → RS; `GP_B17` is Share. Elite controllers label `GP_B17`..`GP_B20` Paddle 1..4. DualSense and DualShock 4 label `GP_B17` Touchpad; generic labels go up to `Btn 23`.
- `GP_B17`..`GP_B23` exist: the runtime reads, captures and dispatches 24 buttons. `GP_CODES` lists 32 codes (0.1.0: 25) and `isGamepadCode('GP_B17')` is `true`; `GAMEPAD_PROFILES` has 8 families (0.1.0: 3). Code that iterates them sees the new entries.
- `manager.getGamepadLabel(code)` without an index uses the first connected pad; 0.1.0 used pad 0, so with pad 0 unplugged every label fell back to generic.
- New: `getGamepadThresholds()` and `getGamepadLogicalState(index)` (what the runtime dispatches with and reads).

**Exact profiles and overrides**

- An exact profile applies only to a pad it fits (`mapping !== 'standard'` and equal raw button/axis counts). 0.1.0 also handed the DualSense raw profile to any Sony pad (vendor-only fallback) and applied it to remapped pads. A manual exact override saved by 0.1.0 that does not fit is now ignored (reported in `ignoredOverride`, no warning on load) and the pad uses its family.
- `getAvailableGamepadProfileOptions()` lists only exact profiles that fit the pad, and every named family with its display name.
- The resolved profile (`getResolvedGamepadProfile()`, `resolveGamepadProfile()`) has new fields: `displayName`, `vendorId`, `productId`, `labelVariant` and `ignoredOverride`.
- `removeGamepadProfileMappingEntry()` restores the code's base entry; 0.1.0 left the code mapped to nothing. An edit on a pad without an exact profile no longer unmaps the rest of the pad. Edits survive a reconnect. New: `resetGamepadProfileMapping()`.
- Profile overrides are stored per controller model under a `vendor-product` key now, also for Chrome-form ids (0.1.0 used `id:<lowercased id>` for those). Overrides saved by 0.1.0 are still read and are rewritten under the new key on their next change. **Downgrade:** overrides set or changed by this version for Chrome-form ids do not apply in 0.1.0 (the localStorage key is the same, the key inside it is not), overrides naming a new family show generic labels there, and saved `GP_B17`+ bindings never fire there.

**Import and storage**

- Replace-mode import clears the gamepad slots of missing actions (version 2 payloads) and the device fields missing from an entry, and makes the saved entries of unregistered actions match the payload (stored, dropped, capped at ids of 128 characters, 512 ids per import, 16 slots per device). The report has two new fields, `storedUnregisteredActions` and `droppedUnregisteredActions`, and in replace mode an unregistered id is listed in one of them instead of `skippedUnknownActions` (0.1.0 listed every unregistered id there; merge mode still does). See [JSON Export and Import](#json-export-and-import).
- Merge-mode import no longer clears a device whose field is missing from an entry (an entry with only `keyboard` leaves the gamepad slots alone), nor the gamepad slots of a version 1 array entry; 0.1.0 read a missing field as an empty list and cleared that device.
- Saved bindings of unregistered actions are kept; 0.1.0 wiped them on the first save before the action registered.
- Failed saves are visible: one console warning and `getStorageStatus()`. `LocalStorageAdapter.save()` returns `true`/`false`; a custom adapter whose `save()` throws or returns `false` is counted as failing.

**Mouse**

- Window blur and the page going hidden release every held mouse button (`released` events) and reset the wheel notch counter.
- During gameplay, the context menu is cancelled for right clicks while `MouseButton2` (bare or as a combo with the held modifiers) is bound, except in text fields and the bind-manager UI; keyboard-opened menus are left alone. Without the browser guard, 0.1.0 never cancelled it, so the menu could open on the press and swallow the release.
- A right press inside a text field or the bind-manager UI dispatches nothing.
- 0.1.0 registered the window wheel listener without options (passive in Chromium for window targets), so `originalEvent.preventDefault()` in a wheel action had no effect there; now the listener is non-passive while a wheel code is bound during gameplay. It is also non-passive while a capture runs and passive otherwise; the browser guard's non-passive wheel listener exists only while the guard is enabled.

**Packaging**

- `package.json` declares `files` (`src/` without the raw controller captures), `sideEffects: false` and `engines` (`node` `^20.19.0 || >=22.12.0`); 0.1.0 declared none of them.

**Built-in tools**

- Rebuilt: fixed-size panels on the scale unit, an SVG controller view, the Debug and Profile editor panels, Reset edits. The Auto buttons are gone (use "Auto detect" in the select). The Input Remap dialog is titled "Input Remap" (was "Input Debugger").
- While a tool is open, Escape and Tab are stopped at window capture and handled by the topmost tool dialog, wherever focus is. One tool is open at a time.

**Bindings modal behaviour**

- `open()` while the modal is open does nothing (no re-render, focus and scroll stay). Tab is trapped inside the modal and the capture dialog; closing returns focus to the element that opened it.
- After a pointer cancel of the capture dialog (Cancel pressed by mouse, touch or pen), the click that follows is swallowed, so it never reaches the bind button underneath; for 350 ms a tap on that spot starts no new capture.

**Look and layout**

- Every size is on `--bm-u`. The bindings modal is 1080u wide (1080px at 1920x1080; 0.1.0: 660px) and picks one of three row layouts; the hint bar is a centred pill capped at three rows (0.1.0: a full-width bar at the bottom edge). See [Sizing and Theming](#sizing-and-theming).
- `--bm-modal-width`, `--bm-modal-max-h` and `--bm-modal-radius` are no longer declared on `:root` and have new defaults: 1080u (was 660px), 880u (was 80vh) and 12u (was 10px); `--bm-text-secondary` and `--bm-text-desc` have new defaults; borders are box-shadows, so `border-color` overrides no longer apply; several classes were removed (listed under [Removed classes and markup](#removed-classes-and-markup)), among them the tools classes `bm-wide`, `bm-tester-raw-section`, `bm-tester-left-stick-dot` and `bm-tester-right-stick-dot`. Focused controls in the bindings modal and the capture dialog get a 2u accent outline.
- `bind-manager.min.js` grew from 134,734 bytes in 0.1.0 to 205,235 bytes (with `gzip -9`: 34,471 bytes → about 56.8 kB), mostly the rebuilt tools, the families, the stylesheet and the browser guard.

**Also new since 0.1.0 (made before the UI round)**

- The opt-in browser shortcut guard: `browserGuard` option, `manager.browserGuard`, and the exports `DEFAULT_BLOCKED_SHORTCUTS`, `DEFAULT_KEYBOARD_LOCK_KEYS`, `parseShortcutPattern`, `matchesShortcutPattern`. Nothing changes unless you enable it.
- Wheel bindings fire one `pressed` + `released` per notch (`WheelNotchCounter`, `DEFAULT_WHEEL_PIXEL_THRESHOLD`, the `wheelPixelThreshold` option); 0.1.0 fired one per raw `WheelEvent`, so trackpads produced dozens. Shift+wheel chords work in Chromium and Safari; pure horizontal scrolling no longer counts as Wheel Down.
- `registerAction()` throws when `slots` or `gamepadSlots` is not a positive integer (`undefined`/`null` still mean the default); default bindings beyond the slot count are dropped with a console warning.
- `importBindings()` accepts only payload versions 1 and 2 and validates the device arrays and codes: an unknown code keeps the slot and is reported in `invalidEntries`.
- `isActionPressed()` honours the action's `playerIndex`.
- New: `clearStorage()`. `resetAll()` writes storage once.
- Half-axis analog actions: an analog action bound to one half of an axis (`GP_A0N` or `GP_A0P`) gets only that half, the signed value clamped to `[-1, 0]` or `[0, 1]` (`code` names the half); an action bound to both halves gets the full value; one `value: 0` event fires when the value returns to 0. 0.1.0 sent the full signed value to every action on either half. When an action gains slots after its bindings were saved, the new slots take their defaults (unless that code is already saved in another slot); 0.1.0 left them empty. These came from the public branch `two-half-axis-analog` (commit 4efef61), which was not in `main`.
- `destroy()` closes the modal first, so `active` ends `false` and `onActiveChange` listeners get `false`.
- A key or mouse button pressed while the modal was open or during a capture no longer produces a lone `released` when it is let go; Escape cancelling a keyboard capture clears the held keys.
- Holding the debug key no longer toggles the modal on every key repeat.
- Gamepad capture ignores inputs already held when it starts, and the captured input stays silent until released.
- Stored profile overrides are normalised on load; invalid ones are dropped.
- Action ids such as `__proto__` or `constructor` work.

## Known Gaps

- The shipped DualSense exact profile (`054c-0ce6`) has no touchpad mapping: its capture predates the optional "Touchpad click" step, so the touchpad click is not mapped on a raw (Firefox) DualSense until someone re-captures the real pad in a browser that reports the raw layout. A binding on `GP_B17` still shows the family label "Touchpad" there, although it cannot fire. With Chrome's standard mapping `GP_B17` works and is labelled Touchpad.
- Labels in `GAMEPAD_UNVERIFIED_LABELS` (Xbox Share, the Steam back buttons, Stadia Assistant/Capture, and the Xbox Elite paddles Paddle 1..4 under the `xbox-elite` variant) are not verified on hardware; `isGamepadLabelUnverified(code, family, variant)` checks a code against them.
- The Controller Test's controller view keeps a minimum width of 780u (520px); on phone-sized viewports it scrolls sideways.
- The smallest text is about 9.3 CSS px at 1280x720 and below.
- The guided capture has one preset (DualSense layout) and tags every capture with the `dualsense` family.

## ThreeJS and Standalone Examples

- ThreeJS integration guide: [examples/threejs/README.md](examples/threejs/README.md)
- Standalone web app guide: [examples/standalone/README.md](examples/standalone/README.md), runnable page [examples/standalone/index.html](examples/standalone/index.html)
- Full runnable demo used during development: [demo/index.html](demo/index.html)
- The published single-file demo: [dist/standalone-demo.html](dist/standalone-demo.html)

## Controller Profiles

Exact profile generation and runtime matching are described in [src/input/controller_definitions/README.md](src/input/controller_definitions/README.md), the generator in [scripts/README.md](scripts/README.md#2-process-controller-defsjs). An exact profile is only for a browser that reports the controller's **raw** layout (`gamepad.mapping` is not `'standard'`); where the browser already reports the standard layout (most pads in Chrome), no profile is needed, the family labels apply, and Input Remap says so when it opens. In short: in a browser that reports the raw layout, capture the controller with the built-in Input Remap tool, put the downloaded JSON into `src/input/controller_definitions/captures/`, run

```bash
npm run process_controller_defs
```

and the generator writes a profile module under [src/input/controller_definitions/profiles](src/input/controller_definitions/profiles) and refreshes the registry in [src/input/controller_definitions/index.js](src/input/controller_definitions/index.js).

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

Run E2E tests (install Chromium for Playwright once with `npx playwright install chromium`):

```bash
npm run test:e2e
```

The e2e server port defaults to 3001; set `BM_E2E_PORT` to run the e2e server on another port. `tests/e2e/demo.spec.js` checks the demo page, the standalone demo (run `npm run build` first) and the runnable example.

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

## Contributing / pushing

bind-manager works with two remotes:

- `origin`: the **public** repository, `https://github.com/materia79/bind-manager`. It receives only finished work: the `main` branch and tags. Every push to `main` publishes `dist/bind-manager.min.js` as the `main-latest` release.
- `private`: your **private work repository** (`git remote add private <its url>`). Work branches, experiments and plans live there.

Once per clone, and again after every update of the guard scripts, run:

```bash
npm run setup:git
```

It installs a copy of the guard into this clone's shared git directory (`.git/hygiene-hooks/`) and points `core.hooksPath` there, so the hook runs for every worktree of the clone whatever commit is checked out, and no checkout can replace it. It leaves another `core.hooksPath` (husky and the like) alone unless you add `-- --force`. **Re-run it after every update of the guard scripts**; until then the hook warns that the installed copy differs from the checkout and keeps scanning with the installed one. The installed copy is verified by hash before every push; `npm run setup:git -- --check` tells whether it is in place and intact, and `npm test` / `npm run hygiene` warn when it is not. It also sets `remote.pushDefault` to `private` when that remote exists (a bare `git push` then never goes public), adds your `user.email` and GitHub noreply addresses to `hygiene.allowedEmail` (the e-mails new public commits may carry; add others with `git config --add hygiene.allowedEmail <address>`), checks that `origin` is the public repository, and creates the untracked `.hygiene-denylist` from `.hygiene-denylist.example`. It is safe to run again.

What the pre-push guard checks, for pushes to the public remote only:

- only `main` and tags may be pushed; other branches, deleting `main` and rewriting `main` (a push that is not a fast-forward) are refused (a release is `git push origin <branch>:main`);
- tag and branch names are scanned too;
- the author and committer e-mail of every new commit must be in `hygiene.allowedEmail`;
- what is already public is asked from the remote at push time (`git ls-remote`), not taken from local tracking refs; so a public push needs the network, and without an answer from the remote it is refused (also when a `url.*.insteadOf` rule would send that question to another repository than the push goes to);
- an installed guard (version 5 or later) older than the checkout's refuses public pushes; before the first public push of a release, re-run `npm run setup:git` in every clone; `npm run setup:git -- --check` must report the guard as current;
- every commit that would become public is scanned: its message, every added line, every file path (merges and annotated tag messages included; binary, `-diff` and UTF-16 content too), for secrets (private-key blocks; GitHub, Anthropic, OpenAI, AWS, Google, Stripe, Slack and npm keys; JWTs; bearer and basic auth; credentials in URLs; password, secret, token and api-key assignments, quoted or in env/YAML files), home, worktree and UNC paths, private IPv4 addresses, and private names.

Some checks run everywhere, some only on your machine:

- **everywhere** (pre-push hook, `npm run hygiene`, and CI before the `main-latest` upload): secrets, private-key blocks, home, drive and UNC paths, private IPv4 addresses;
- **local only** (pre-push hook and `npm run hygiene` on your machine): this machine's host name, user name and home directory, the GitHub account `gh` is signed in to, the names in this repository's non-public remotes (owner/repo, the repository name, a private host), your git `user.email` and its domain (unless it is a webmail provider), the commit e-mail allowlist, and the entries of `.hygiene-denylist`.

`.hygiene-denylist` holds private names that no machine property reveals (other projects, codenames, ticket prefixes), one per line, plain strings or `/regex/flags`. It is untracked and never published; the format is explained in `.hygiene-denylist.example`.

On a hit the push is refused and the guard prints the commit, `file:line` (paths masked where they match) and the pattern name, never the matched text. Remove the text from the commit that added it (amend or rebuild the branch; a later deleting commit is not enough). For a deliberate false positive, add `hygiene-allow: <pattern-name>` on that line. Never use `git push --no-verify` for the public remote.

Examples of hits that are defensible in documentation, and the marker that keeps each one (the marker covers exactly that pattern on exactly that line):

```text
postgres://user:pass@localhost/db      # hygiene-allow: url-credentials
password: hunter22                     # hygiene-allow: env-secret-assignment
192.168.1.10                           # hygiene-allow: private-ipv4
```

A binary file (an image, a font) that trips a pattern by chance cannot carry a marker: after review, list it in `.hygiene-allow-binaries` as `<sha256>  <path>` (`sha256sum <path>` prints the first part). The entry holds for exactly that content at exactly that path, and every push that includes the file prints `allowed binary: <path>`. It exempts the identity, path and denylist patterns only: private-key blocks and the provider token shapes (GitHub, Anthropic, OpenAI, AWS access key id, Slack, npm, Google, Stripe, JWT) are still matched inside a listed binary, so a real secret in it is refused anyway.

Every public step (push to `origin`, tag, `main-latest` release, `npm publish`, the GitHub Pages copy of the demo) goes through the release gate described in [docs/RELEASING.md](docs/RELEASING.md).
