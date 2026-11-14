# /src/core

This folder is the heart of Bind Manager.

Related docs:

- [../../README.md](../../README.md) for package-level usage, install, and public API overview.
- [../input/README.md](../input/README.md) for the runtime layer that feeds this core system.
- [../input/controller_definitions/README.md](../input/controller_definitions/README.md) for exact controller profile generation and mapping data.

It contains the code that turns a set of declared actions such as `jump`, `pause`, or `move-left` into a working input system with:

- registered action definitions
- current keyboard and gamepad bindings
- runtime input events
- persistence
- import/export support
- UI integration for rebinding and hints

If you want to understand how the library works end to end, this folder is the best starting point.

## At a glance

The core layer is made of three pieces:

1. `action-registry.js`
	 Stores action definitions (plain objects; they are not frozen, but treat them as read-only).
2. `binding-store.js`
	 Stores the current bindings for those actions and emits change events.
3. `bind-manager.js`
	 Wires everything together into the public manager API that applications use.

In practice, the flow looks like this:

1. Your app creates a manager with `createBindManager(...)`.
2. The manager loads saved bindings and saved gamepad profile overrides.
3. Your app registers actions.
4. The store creates keyboard and gamepad slots for each action using saved values or defaults.
5. Keyboard, mouse and gamepad runtimes listen for browser input.
6. When a code is pressed, the runtimes ask the store which action IDs are bound to that code.
7. The manager and UI react to those action events.
8. When bindings change, the store emits an event and the manager persists the new state.

That means `/src/core` owns the application-facing behavior, while the neighboring folders provide support:

- `/src/input` translates browser keyboard, mouse and gamepad signals into logical codes.
- `/src/storage` persists bindings and gamepad profile overrides.
- `/src/ui` renders the binding modal, capture overlay, hints, and built-in debugging tools.

## File-by-file contents

### `action-registry.js`

This file defines `ActionRegistry`, which is responsible for keeping track of all declared actions.

An action definition contains the metadata the rest of the system needs, including:

- `id`: stable unique identifier
- `label`: display name shown in the UI
- `description`: optional UI/help text
- `group`: grouping label for the modal
- `slots`: number of keyboard binding slots
- `defaultBindings`: keyboard defaults
- `gamepadSlots`: number of gamepad binding slots
- `defaultGamepadBindings`: gamepad defaults
- `analog`: whether the action accepts continuous analog events
- `playerIndex`: optional gamepad index restriction

Important behavior:

- Registration order is preserved because actions are stored in a `Map`.
- Duplicate IDs throw immediately.
- A missing id, a duplicate id, or a `slots` / `gamepadSlots` value that is not a positive integer throws (`undefined` / `null` mean the default).
- Default bindings beyond the slot count are dropped with a console warning; other missing fields get defaults.
- Actions are treated as definitions, not state. The registry does not track what the current binding is.

Conceptually, the registry answers the question:

"What actions exist in this application, and what are their allowed defaults and metadata?"

### `binding-store.js`

This file defines `BindingStore`, which holds the mutable binding state for every registered action.

It keeps two independent maps:

- keyboard bindings: `actionId -> (string|null)[]`
- gamepad bindings: `actionId -> (string|null)[]`

Each action can therefore have different slot counts and different defaults on keyboard vs gamepad.

Its responsibilities are:

- initialize from saved data before actions are registered
- create per-action slot arrays when each action is registered
- read current bindings
- set and clear individual slots
- reset one action or all actions to defaults
- return all bindings in a serializable structure (`getAll()`, registered actions only)
- return what is persisted (`getAllForStorage()`: the registered snapshot plus the saved entries of actions not registered yet, carried through unchanged)
- find which actions are bound to a given code
- emit events when bindings change, and one commit per change for persistence

One subtle but important design detail is startup ordering.

Saved bindings are loaded first through `init(savedBindings)`, but they are not fully applied until `initAction(action)` is called after each action is registered. This allows the store to merge persisted data with the slot counts and defaults defined by the action itself.

The store supports two persisted formats:

- legacy v1: `actionId -> [keyboardSlot0, keyboardSlot1, ...]`
- current v2: `actionId -> { keyboard: [...], gamepad: [...] }`

Legacy array data is treated as keyboard-only data.

Conflict handling is intentionally permissive.

If you bind the same code to multiple actions, the store does not block it. Instead, `set(...)` returns a list of conflicts and emits them in the change event so the UI can warn the user. Both actions remain active.

This file is the source of truth for the current binding table.

### `bind-manager.js`

This file exports `createBindManager`, which is the main public entry point of the library.

It constructs and connects all major subsystems:

- `ActionRegistry`
- `BindingStore`
- `KeyboardRuntime`
- `MouseRuntime`
- `GamepadRuntime`
- `BrowserShortcutGuard` (inert until enabled)
- `LocalStorageAdapter` or a custom storage adapter
- `ModalController`
- `CaptureModalController`
- `HintsController`
- `createBuiltInToolsController(...)`

This file is where the library becomes a usable product rather than a collection of pieces.

It exposes the high-level API applications call, including:

- action registration
- opening and closing the modal
- reading and mutating bindings
- resetting bindings
- subscribing to binding changes
- listening to any action events
- checking whether an action is currently pressed
- import/export of bindings
- gamepad profile queries and overrides
- access to built-in tools
- destruction and cleanup

This file also owns several important lifecycle rules:

- persisted bindings are loaded before action registration
- runtimes are started immediately after manager creation
- binding changes are automatically saved through the storage adapter, once per commit; a failed save is retried on the next change and reported by `getStorageStatus()`
- optional debug mode binds a keyboard shortcut that toggles the modal
- the UI is mounted into `options.container` or `document.body`

## How the core layer works in detail

### 1. Manager creation

When `createBindManager(options)` is called, the following happens:

1. A namespace, storage adapter, and runtime thresholds (`deadband` 0.12, `analogThreshold` 0.5 unless given) are resolved.
2. `ActionRegistry` and `BindingStore` are created.
3. The storage adapter loads saved bindings.
4. The storage adapter loads saved gamepad profile overrides if supported.
5. `KeyboardRuntime`, `GamepadRuntime`, `MouseRuntime` and the `BrowserShortcutGuard` are created.
6. All four are started (the guard stays inert until enabled).
7. The store's commit hook is subscribed so every committed change triggers persistence.
8. UI controllers are created and mounted.
9. A manager object with the public API is returned.

The returned manager is a facade over the entire system.

### 2. Action registration

Applications usually register actions right after manager creation.

When `manager.registerAction(def)` runs:

1. The definition is validated and stored in `ActionRegistry`.
2. `BindingStore.initAction(action)` creates keyboard and gamepad slot arrays.
3. Saved bindings are merged in if present.
4. Otherwise defaults from the action definition are used.
5. The modal and hints UI are refreshed so the new action appears.
6. A per-action handle is returned.

That handle provides convenience methods such as:

- `showHint()`
- `hideHint()`
- `setHintVisible(...)`
- `onPressed(...)`
- `onReleased(...)`
- `onHeld(...)`
- `onAnalog(...)`

The handle is intentionally lightweight. It does not own data itself; it delegates back to the central manager and runtimes.

### 3. Input dispatch

The core layer itself does not listen to raw DOM input directly. It delegates that to the runtime layer in `/src/input`.

#### Keyboard path

`KeyboardRuntime` listens to browser `keydown`, `keyup`, and `blur` events.

It converts them into logical events:

- first keydown: `pressed`
- repeated keydown: `held`
- keyup: `released`

It uses `KeyboardEvent.code`, not `KeyboardEvent.key`, which means bindings are based on physical key position and remain layout-independent.

When a keyboard code is detected, the runtime asks the binding store:

`getActionsByCode(code, 'keyboard')`

For every matching action ID, it fires listeners registered for that action and listeners registered for any action.

#### Mouse path

`MouseRuntime` turns mouse buttons into `MouseButton0`–`MouseButton4` and wheel notches into `MouseWheelUp` / `MouseWheelDown` (one `pressed` + `released` pulse per notch), combined with held keyboard modifiers (`ControlLeft+MouseWheelUp`). It releases every held button on window blur or when the page goes hidden, and dispatches nothing for a right press inside a text field or the bind-manager UI. Its bindings live in the keyboard slots.

#### Gamepad path

`GamepadRuntime` polls the Web Gamepad API on every animation frame.

It converts raw controller state into logical Bind Manager codes such as:

- `GP_B0` through `GP_B23` for buttons (`GP_B17` and up are the extra buttons some pads report)
- `GP_A0N`, `GP_A0P`, `GP_A1N`, `GP_A1P`, and so on for axis directions

It then resolves which actions are bound to those codes by calling the binding store with the `gamepad` device.

Gamepad dispatch has additional rules that matter to the core layer:

- it applies an axis deadband to ignore resting drift
- it uses a threshold to convert analog axes into digital press/hold/release events
- it can also emit continuous `analog` events for actions marked `analog: true`
- it respects `action.playerIndex`, so an action can be restricted to one controller index
- suppressing gameplay (the modal opens) and a disconnect fire `released` for every pressed code and one final analog 0; inputs still held when gameplay resumes stay silent until released and pressed anew (latches)

### 4. UI capture and rebinding

The core layer relies on the UI layer for user-driven rebinding, but the core behavior is coordinated from here.

When a user chooses to rebind an input in the modal:

1. `ModalController` enters capture mode for a specific action, slot, and device.
2. `CaptureModalController` opens a blocking overlay.
3. The relevant runtime starts a one-shot capture.
4. The next meaningful input becomes the new code.
5. The binding store updates that slot.
6. The UI refreshes labels and shows conflict warnings if needed.
7. The store event triggers persistence automatically.

Cancellation rules are deliberate:

- Escape cancels either capture, keyboard or gamepad
- the UI cancel button cancels either capture type
- starting a new gamepad capture cancels the previous one with `null`
- disconnecting a controller during capture also cancels the capture

### 5. Persistence

Persistence is intentionally simple.

The core layer subscribes to the store's commit hook (one commit per change; `resetAll()` is one commit) and calls `storageAdapter.save(store.getAllForStorage())`. That snapshot includes the saved entries of actions that are not registered yet, so a lazily registered action keeps its saved bindings.

A save that throws or returns `false` counts as failed: the manager warns once, keeps trying on every later commit, and exposes `getStorageStatus()` → `{ ok, failedSaves, lastError, lastFailure }`.

The default implementation is `LocalStorageAdapter` in `/src/storage`, which stores:

- bindings under `bind-manager:{namespace}`
- gamepad profile overrides under `bind-manager:{namespace}:gamepad-profile-overrides`

The current exported binding payload format from the manager is version `2`:

```js
{
	version: 2,
	namespace: 'your-game',
	bindings: {
		jump: {
			keyboard: ['Space', null],
			gamepad: ['GP_B0']
		}
	},
	metadata: {
		exportedAt: '...ISO timestamp...'
	}
}
```

Import supports two modes:

- `merge`: only imported actions are changed
- `replace`: imported actions are applied; registered actions missing from the payload are cleared (keyboard, and gamepad for v2 payloads); in a v2 entry a missing device field clears that device; the saved entries of unregistered actions are made to match the payload

Import is defensive:

- invalid payloads return a report instead of crashing; an invalid `mode` throws
- merge mode skips unknown action IDs and reports them in `skippedUnknownActions`
- replace mode stores valid entries of unregistered IDs (`storedUnregisteredActions`) and drops what exceeds the caps (`droppedUnregisteredActions`): ids up to 128 characters, at most 512 ids per import, 16 slots per device
- unknown codes keep the slot and slot value type errors clear it; both are reported in `invalidEntries`
- v1 payloads are normalized into the v2 shape and never touch gamepad slots

## How `/src/core` depends on the rest of `/src`

This README lives in `/src/core`, but this folder only makes full sense in the context of the rest of the source tree.

### `/src/index.js`

This is the package entry point.

It re-exports:

- `createBindManager` from this folder
- keyboard label and combo helpers, the wheel notch counter
- the browser guard's default lists and pattern helpers
- gamepad code constants and helpers (`GP_B0`..`GP_B23`, `GP_BUTTON_COUNT`, `GP_AXIS_COUNT`)
- the gamepad family tables, label helpers and `parseGamepadId`
- profile resolvers (`resolveGamepadProfile`, `isControllerProfileApplicable`, …) and the hat/mapping helpers

The full list is in the root README's "Exports" section.

So while `/src/core` implements the system, `/src/index.js` is what consumers import from.

### `/src/input`

This folder supplies the runtime and labeling mechanics that the core layer depends on.

#### `keyboard-runtime.js`

Provides keyboard listening, capture mode, pressed-state tracking, and gameplay suppression while the modal is open.

Important behaviors:

- window blur releases all pressed keys to avoid stuck input
- capture intercepts the next key instead of firing gameplay actions
- suppressed gameplay still allows capture to function

#### `key-names.js`

Maps `KeyboardEvent.code` values to readable UI labels such as `Space`, `Left Shift`, or `ArrowUp -> Up`.

The core UI uses this for all keyboard display text.

#### `gamepad-codes.js`

Defines the logical gamepad code vocabulary used by the entire system.

Without these codes, the store and manager would have no device-independent way to refer to gamepad inputs.

#### `gamepad-profiles.js`

Defines family-level label sets for eight families (`xbox`, `xbox360`, `dualshock4`, `dualsense`, `switch-pro`, `steam`, `stadia`, `generic`), the Xbox Elite label variant, the hardware-unverified label list, and family detection by vendor/product id (`parseGamepadId`, `detectGamepadProfile`).

These are the labels shown when no exact controller definition applies.

#### `gamepad-profile-resolver.js`

Resolves how a connected controller should be labeled.

It supports:

- exact profile selection
- family fallback
- generic fallback
- manual override by exact profile or family
- stable identity keys: `vendor-product` parsed from Chrome or Firefox ids, else `id:<lowercased id>` (also read as a legacy key for stored overrides)
- the applicability check of exact profiles (`mapping !== 'standard'` and equal raw button/axis counts)

This matters to `/src/core` because the modal and hints need human-friendly labels for gamepad bindings.

#### `gamepad-runtime.js`

This is the gamepad equivalent of `KeyboardRuntime`, but it is more advanced because it must translate noisy, device-specific hardware state into logical actions.

Important behaviors:

- polls every frame
- tracks button and axis state per connected gamepad index
- emits digital events and optional analog events
- supports capture mode with haptic feedback
- dispatches custom window events when controllers connect, disconnect, or change profile
- applies exact controller mapping definitions when available
- allows temporary in-memory edits to the active profile definition (per controller model, kept across reconnects, never persisted; remove restores the base entry, reset drops all edits)
- exposes the dispatch thresholds and the logical state of a pad (`getThresholds()`, `getLogicalState()`) for the Controller Test

#### `/src/input/controller_definitions`

This folder provides generated exact controller profiles.

Today it includes a generated DualSense profile built from a captured JSON input sample of the raw (unmapped) layout. The generated files map physical buttons and axes to logical Bind Manager codes and provide exact labels.

An exact profile matters where the browser does not remap the pad: it corrects the raw layout. Most labels the modal shows (`Cross` instead of `Btn 0`) come from the family label sets, which apply whenever no exact profile fits the pad.

### `/src/storage`

`local-storage-adapter.js` is the default persistence backend.

The core layer depends on its contract:

- `load()`
- `save(bindings)`: returns `true`, or `false` on failure (keeping the error in `lastSaveError`); it never throws
- `clear()` (optional for custom adapters; `clearStorage()` returns `false` without it)
- `loadGamepadProfileOverrides()` (optional)
- `saveGamepadProfileOverrides(overrides)` (optional)

If you provide a custom storage adapter through `createBindManager({ storage })`, it must provide `load()` and `save()`. A `save()` that throws or returns `false` is counted as a failed save; one that returns nothing counts as a success.

### `/src/ui`

This folder contains the controllers that present core state to the user.

#### `modal-controller.js`

Renders the main bindings modal and is the primary UI surface for interacting with the core store.

It shows:

- grouped actions
- keyboard slots
- gamepad slots
- reset buttons
- a one-line gamepad profile panel (device name, source chip, profile select with "Auto detect", a note when a saved exact profile does not fit)
- optional footer actions such as built-in tools

It also manages capture initiation, warning messages, gameplay suppression while open, the Tab trap and focus return, and the row layout (`bm-layout-inline`, `-stacked` or `-narrow`, chosen from the body's measured width in `--bm-u` and the widest slot counts).

#### `capture-modal-controller.js`

Renders a smaller blocking overlay used during active keyboard or gamepad capture.

Its job is simple but important: make the capture state explicit and prevent accidental interaction with the main modal while the system is waiting for input.

#### `hints-controller.js`

Renders the bottom-of-screen hint bar.

It listens to store changes and gamepad profile changes so that hint labels stay current when bindings or controller labels change.

#### `built-in-tools-controller.js`

Provides optional built-in tools that the manager can mount into the modal footer.

From the current code, these tools include:

- `Input Remap` (guided capture into the capture JSON, `src/ui/tools/input-debugger.js`)
- `Controller Test` (live SVG controller view, Debug panel, Profile editor, `src/ui/tools/controller-tester.js`)

Only one is open at a time; while one is open, Escape and Tab are handled at window capture for the topmost tool dialog (`src/ui/tools/focus.js`). The modules under `src/ui/tools/` hold the markup, CSS, shared context, signal helpers and the capture payload format.

These tools are not part of the minimal binding loop, but they are part of the complete runtime environment created by `bind-manager.js`.

#### `styles.js`

Injects the shared stylesheet once, into `<head>`, when the first UI controller mounts. Every length is a multiple of `--bm-u`, every text size a font token; see "Sizing and Theming" in the root README. The built-in tools inject a second stylesheet when they mount.

<!-- STATUS AT THIS VERSION: being changed; replace this note when it is. -->
Status at this version: the built-in tools' text follows only a `--bm-u` set on `:root` and ignores `--bm-font-*` and an ancestor's `--bm-u` (their lengths do follow an ancestor's `--bm-u`).
<!-- END STATUS -->

This matters because the core-created UI controllers assume the styles have been injected before rendering.

## Core data model

The most useful mental model is:

- the registry stores definitions
- the store stores current state
- the runtimes emit events
- the manager exposes a stable public API

For a single action, the effective data looks like this:

```js
{
	definition: {
		id: 'jump',
		label: 'Jump',
		group: 'Movement',
		slots: 2,
		defaultBindings: ['Space', null],
		gamepadSlots: 1,
		defaultGamepadBindings: ['GP_B0'],
		analog: false,
		playerIndex: null
	},
	currentBindings: {
		keyboard: ['Space', 'KeyJ'],
		gamepad: ['GP_B0']
	}
}
```

The definition and the current bindings are intentionally separate.

That separation is what makes reset, import/export, and persistence predictable.

## Public API surface created here

The manager returned by `createBindManager(...)` currently covers these responsibilities:

- register one or many actions
- open, close, toggle, and inspect the modal
- open built-in tools when enabled
- get one action's bindings or all bindings
- set, clear, reset, or reset all bindings
- subscribe to binding-change events
- show or hide action hints
- listen to any action events
- query whether an action is currently active
- export and import bindings
- inspect connected gamepads and resolved profiles
- override gamepad profile resolution
- edit mapping entries in the active gamepad profile definition, and reset those edits
- read the gamepad dispatch thresholds and a pad's logical state
- report the storage status
- cancel browser shortcuts while the game owns input, enter fullscreen with Keyboard Lock, and arm a leave-site prompt (`browserGuard`, opt-in)
- tear everything down with `destroy()`

This means `/src/core/bind-manager.js` is the single best reference for the supported capabilities of the library.

## Important invariants and edge cases

These rules are easy to miss but are essential to correct usage.

### Actions must be registered before their bindings can matter

Saved data is only materialized when an action is registered. Unknown or never-registered action IDs are not active, but their saved entries are kept in storage until they register (or `clearStorage()` / a replace import drops them).

### Conflicts are allowed

Two actions can share the same code. The store reports the conflict, but it does not enforce exclusivity.

### Keyboard and gamepad state are separate

Each action has independent slot arrays for keyboard and gamepad. Reset and import logic respects that split.

### Analog events are opt-in

Axis movement can trigger digital-style events through threshold crossing, but continuous `analog` callbacks only fire for actions marked `analog: true`.

### Player routing is explicit

If an action sets `playerIndex`, only that controller index will trigger it. If `playerIndex` is `null`, any controller can trigger it.

### Modal suppression prevents accidental gameplay input

When the binding modal opens, gameplay dispatch is suppressed. Currently pressed keys are released; on gamepads every pressed code gets `released` and every moved axis one final analog 0, and inputs still held when the modal closes stay silent until released and pressed anew. Held mouse buttons are released too (`released` events), when the modal opens and when the window loses focus.

### Capture behaves differently from gameplay dispatch

While capture is active, the next input is consumed by rebinding logic instead of normal action listeners.

### Gamepad labels are layered

The label shown for a gamepad binding is resolved in this order:

1. exact label from an edited definition, or from a generated definition that applies to the pad
2. the label variant of the pad (Xbox Elite paddles)
3. the family label (a family without the code returns the code itself)

A pad with no family match resolves to the `generic` family (`Btn 0`, …).

### Built-in profile edits are in memory

`GamepadRuntime` can edit mapping entries in the active profile definition in memory. That affects label resolution and logical mapping during the current session, but it is separate from the normal binding persistence model. Edits apply to every pad of the same model, survive a reconnect, start from the pad's standard layout when it has no exact profile, and are gone on reload. `removeGamepadProfileMappingEntry()` restores a code's base entry; `resetGamepadProfileMapping()` drops all edits.

## Recommended reading order

If you are new to the project, read the files in this order:

1. `bind-manager.js`
2. `action-registry.js`
3. `binding-store.js`
4. `/src/input/keyboard-runtime.js`
5. `/src/input/gamepad-runtime.js`
6. `/src/ui/modal-controller.js`
7. `/src/storage/local-storage-adapter.js`

That path follows the actual runtime flow from public API to state to input to UI to persistence.

## Summary

`/src/core` is not just a utility folder.

It defines the architecture of Bind Manager:

- what an action is
- how bindings are stored
- how they are loaded and saved
- how browser input is turned into action events
- how the modal and hints stay synchronized with state
- how gamepad profiles affect labels and mapping quality

If you need to change the public behavior of the library, there is a high chance the change will begin here.