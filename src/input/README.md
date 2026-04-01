# /src/input

This folder contains the runtime input layer for Bind Manager.

It is responsible for turning raw browser keyboard and gamepad signals into the logical input codes and action events that the core layer consumes.

Related docs:

- [../../README.md](../../README.md) for package-level usage and public API examples.
- [../core/README.md](../core/README.md) for the manager, registry, store, and lifecycle that use this input layer.
- [controller_definitions/README.md](controller_definitions/README.md) for exact controller profiles and the capture-to-profile generation pipeline.

## What this folder does

The files in `/src/input` solve five distinct problems:

1. Define the logical input code vocabulary used by the whole library.
2. Listen to browser keyboard input and convert it into action events.
3. Poll browser gamepad input and convert it into action events.
4. Convert low-level input codes into human-readable labels for the UI.
5. Resolve exact, family, and generic controller profiles so gamepad labels are as accurate as possible.

This folder does not store the current binding state itself. That belongs to `/src/core/binding-store.js`.

Instead, this folder answers questions like:

- What key or gamepad signal just happened?
- Which logical code represents that signal?
- Is this a first press, a held input, a release, or a continuous analog value?
- What label should the UI show for this code on the active controller?

## How it fits into the full architecture

The full input path looks like this:

1. `/src/core/bind-manager.js` creates `KeyboardRuntime` and `GamepadRuntime`.
2. The runtimes listen to browser input sources.
3. The runtimes convert raw browser data into Bind Manager codes.
4. The runtimes ask `/src/core/binding-store.js` which actions are bound to those codes.
5. Matching action listeners are fired.
6. `/src/ui` uses the same code and profile helpers to display readable labels in the modal and hint bar.

That means `/src/input` is the translation layer between browser APIs and the action system.

## File-by-file contents

### `keyboard-runtime.js`

This file defines `KeyboardRuntime`.

It attaches global listeners for:

- `keydown`
- `keyup`
- `blur`

Its responsibilities are:

- track which keyboard codes are currently pressed
- emit `pressed`, `held`, and `released` action events
- support one-shot keyboard capture for rebinding
- suppress normal gameplay dispatch while the bindings modal is open
- clear pressed-state on window blur so keys do not get stuck

Important behavior:

- It uses `KeyboardEvent.code`, not `KeyboardEvent.key`.
- A first `keydown` becomes `pressed`.
- A repeated `keydown` becomes `held`.
- `keyup` becomes `released`.
- During capture mode, the next key is consumed for rebinding instead of normal gameplay.
- Pressing `Escape` during keyboard capture returns `null` to indicate cancellation.

This file is the authoritative source for keyboard runtime semantics in the project.

### `key-names.js`

This file maps `KeyboardEvent.code` values to readable UI labels.

Examples:

- `KeyW -> W`
- `ArrowUp -> Up`
- `ShiftLeft -> Left Shift`
- `NumpadEnter -> Num Enter`

It exports:

- `KEY_DISPLAY_NAMES`
- `getKeyLabel(code)`
- `isKnownCode(code)`

The UI layer uses this file whenever it needs to render a keyboard binding label.

### `gamepad-codes.js`

This file defines the logical code vocabulary for gamepad input.

Buttons are represented as:

- `GP_B0` through `GP_B16`

Axes are represented as split directional codes:

- `GP_A0N` and `GP_A0P`
- `GP_A1N` and `GP_A1P`
- `GP_A2N` and `GP_A2P`
- `GP_A3N` and `GP_A3P`

This split is important because it lets the binding store and action system treat stick directions like bindable inputs in the same way as buttons.

It exports:

- every button and axis-direction constant
- `GP_CODES`
- `isGamepadCode(code)`
- `getGamepadCodeType(code)`

Every other gamepad-related file in the project assumes this code format.

### `gamepad-profiles.js`

This file provides family-level label maps for three profile families:

- `xbox`
- `dualsense`
- `generic`

It exports:

- `GAMEPAD_PROFILES`
- `detectGamepadProfile(gamepadId)`
- `getGamepadLabel(code, profile)`

These are not exact device mappings.

They are fallback label sets used when the runtime knows the controller family but does not have an exact generated controller definition. For example, `GP_B0` can be shown as `A` on Xbox or `Cross` on PlayStation-family pads.

### `gamepad-profile-resolver.js`

This file decides how a connected controller should be interpreted for labeling and profile selection.

It exports helpers such as:

- `getGamepadIdentityKey(gamepadId)`
- `normaliseGamepadProfileOverride(override)`
- `getControllerFamily(profile, gamepadId)`
- `resolveGamepadProfile(gamepadId, options)`
- `getAvailableGamepadProfileOptions(gamepadId)`
- `getResolvedGamepadLabel(code, resolvedProfile)`

Its job is to layer multiple resolution strategies in a predictable order.

The current resolution order is:

1. Manual exact profile override.
2. Manual family override.
3. Exact generated controller profile matched from the browser gamepad ID.
4. Family detection fallback such as `xbox` or `dualsense`.
5. Generic fallback.

This file is the bridge between raw browser `Gamepad.id` strings, generated controller profiles, family label maps, and the UI labels users see.

### `gamepad-runtime.js`

This file defines `GamepadRuntime`.

It polls `navigator.getGamepads()` every animation frame and converts raw hardware state into logical Bind Manager events.

Its responsibilities are broader than the keyboard runtime because gamepads are more variable than keyboards.

It handles:

- per-frame polling
- connection and disconnection handling
- digital button dispatch
- digitalized axis-direction dispatch
- continuous analog dispatch for actions marked `analog: true`
- gamepad input capture for rebinding
- optional haptic feedback on successful capture
- profile resolution and manual overrides
- exact controller mapping from generated controller definitions
- temporary in-memory edits to the resolved profile definition

Important runtime rules:

- Small axis drift is ignored using a deadband.
- Axis directions become digital `pressed`, `held`, and `released` events only after crossing an analog threshold.
- Analog events are emitted independently of digital threshold crossings for actions that opt in.
- `playerIndex` filtering is respected before dispatching to an action.
- Capture mode consumes the next meaningful input and prevents normal action dispatch.
- Custom DOM events are emitted so the UI can react to controller connect, disconnect, and profile changes.

Those custom DOM events are:

- `bm-gamepad-connected`
- `bm-gamepad-disconnected`
- `bm-gamepad-profile-changed`

### `controller_definitions/`

This subfolder contains exact controller profiles and the generated registry used by `gamepad-profile-resolver.js` and `gamepad-runtime.js`.

See [controller_definitions/README.md](controller_definitions/README.md) for the full pipeline.

At a high level, it provides:

- capture JSON files under `captures/`
- generated exact profile modules under `profiles/`
- a generated registry in `index.js`
- notes about remaining profile quality work in `TODO.md`

## Keyboard behavior in detail

Keyboard handling in this project is intentionally simple and deterministic.

### Code model

Bindings use `KeyboardEvent.code` values, not typed characters.

That means:

- binding `KeyW` means the physical W-position key
- the meaning does not change with keyboard layout the way `event.key` can
- label rendering is kept separate through `key-names.js`

### Press lifecycle

For a bound keyboard code, the runtime emits:

- `pressed` when the key first goes down
- `held` for repeated keydown events
- `released` when the key goes up

### Blur behavior

If the window loses focus, all currently pressed keys are released internally and `released` events are fired for them. This avoids the classic stuck-key problem when users alt-tab away from the page.

### Capture behavior

Keyboard capture is a one-shot mode.

While active:

- normal gameplay action dispatch is bypassed for the captured key
- the next non-repeated key becomes the new binding code
- `Escape` cancels capture and returns `null`

## Gamepad behavior in detail

Gamepad handling is more layered because different controllers can expose different raw button and axis arrangements.

### Logical model

The runtime always tries to translate the raw device into the same logical code set:

- 17 logical buttons
- 4 logical axes, each split into negative and positive direction codes

That normalization is what allows the rest of the system to remain stable even when raw controllers differ.

### Mapping path

For each connected gamepad, the runtime tries to build a logical state using this order:

1. Exact generated controller definition if available.
2. Edited in-memory definition if the user has remapped profile entries in the current session.
3. Raw standard-layout fallback if no exact mapping exists.

### Digital and analog dispatch

Buttons are straightforward: they dispatch based on whether they are considered pressed.

Axes have two parallel interpretations:

- continuous value for analog-aware actions
- threshold-based directional digital events for normal bindable inputs

This lets the same stick support both:

- digital-style bindings such as `Left Stick Left`
- analog gameplay callbacks such as move speed or aim magnitude

### Capture behavior

Gamepad capture waits for the first new meaningful input:

- buttons are checked first
- then axes that cross threshold

When capture succeeds, the runtime triggers a best-effort haptic pulse and returns the logical code to the UI.

### Profile-dependent labels

Gamepad labels are not hard-coded at the binding-store level.

They depend on the currently resolved profile, which may come from:

- an exact generated device profile
- a manual override
- a family fallback
- generic fallback

This is why the same logical code can be shown as `A`, `Cross`, or `Btn 0` depending on the connected controller and resolved profile.

## How `/src/input` supports the UI

The input folder does not render UI itself, but UI behavior depends heavily on it.

The bindings modal uses:

- `getKeyLabel(...)` for keyboard slots
- `getLabelForCode(...)` via `GamepadRuntime` for gamepad slots
- capture methods from `KeyboardRuntime` and `GamepadRuntime`
- profile option helpers for the gamepad profile dropdown

The hints bar uses:

- keyboard labels from `key-names.js`
- resolved gamepad labels from the active profile

The built-in input remap and controller test tools also depend on these modules to interpret, label, and validate raw input.

## Important invariants and edge cases

### The input layer does not own bindings

Runtimes always ask the binding store which actions a code should trigger. They never decide bindings on their own.

### Keyboard and gamepad use different acquisition models

Keyboard is event-driven. Gamepad is frame-polled. The rest of the system works because both are normalized into the same action-event contract.

### Labeling and mapping are separate concerns

`gamepad-profiles.js` and `gamepad-profile-resolver.js` handle labels and profile choice. `gamepad-runtime.js` handles polling and dispatch. Exact device mappings live in `controller_definitions/`.

### Exact profiles improve both labels and mapping quality

Without a generated exact profile, Bind Manager can still function using standard/family/generic assumptions. Exact profiles mainly improve correctness and readability on controllers whose raw layout is non-obvious or vendor-specific.

### Capture is isolated from gameplay dispatch

Capture mode intentionally intercepts the next input so the user's rebinding action does not also trigger in-game behavior.

## Recommended reading order

If you want to understand this folder from simplest to most complex, read in this order:

1. `gamepad-codes.js`
2. `key-names.js`
3. `keyboard-runtime.js`
4. `gamepad-profiles.js`
5. `gamepad-profile-resolver.js`
6. `gamepad-runtime.js`
7. `controller_definitions/README.md`

## Summary

`/src/input` is the runtime translation layer of Bind Manager.

It defines the input code vocabulary, captures raw browser input, normalizes it into a stable event contract, and supplies the labels and profile resolution that make rebinding and hints understandable to users.
