# /src/input

This folder contains the runtime input layer for Bind Manager.

It is responsible for turning raw browser keyboard, mouse and gamepad signals into the logical input codes and action events that the core layer consumes.

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

1. `/src/core/bind-manager.js` creates `KeyboardRuntime`, `MouseRuntime`, `GamepadRuntime` and the `BrowserShortcutGuard`.
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
- During capture mode, keys are consumed for rebinding instead of normal gameplay. The binding commits when the non-modifier key is released, as a combo with the modifiers held when it was pressed (`ShiftLeft+KeyW`); a modifier released with no other key pressed binds the modifiers held at that moment: that modifier alone, or a modifier-only chord such as `ControlLeft+ShiftLeft`.
- A modifier `keydown` dispatches the chord of exactly the modifiers then held (canonical order, `buildChordCode`) when an action is bound to it, otherwise the modifier's own code, the way a key dispatches its combo when bound, otherwise its own code. Keys other than modifiers that are held do not count. The chord's `held` follows the auto-repeat of the key that completed it, and its `released` comes when the first of its keys goes up (`_resolveModifierCode`, `_releaseChordsWith`). Without a chord bound this is the 0.2.2 behaviour.
- Pressing `Escape` during keyboard capture cancels it at once (on keydown) and returns `null`.

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
- `getKeyLabel(code)` (combo codes become "Left Shift + W")
- `isKnownCode(code)` (a combo is known when every part is)
- `MODIFIER_ORDER`, `MODIFIER_CODES`
- `buildComboCode(modifiers, primaryCode)`: the canonical combo string, modifiers in `MODIFIER_ORDER`
- `buildChordCode(modifiers)`: the canonical modifier-only chord string (`ControlLeft+ShiftLeft`), `isModifierChord(code)`, and `normalizeChordCode(code)` (public since 0.2.4: a chord in another order put in canonical order, anything else unchanged)

All of them are exported from `src/index.js`.

The UI layer uses this file whenever it needs to render a keyboard binding label.

### `mouse-runtime.js`

This file defines `MouseRuntime`, the mouse counterpart of `KeyboardRuntime`.

- buttons become `MouseButton0`–`MouseButton4` (`pressed` on mousedown, `released` on mouseup)
- wheel notches become `MouseWheelUp` / `MouseWheelDown`, dispatched as a `pressed` + `released` pulse per notch
- held keyboard modifiers (from `KeyboardRuntime.getHeldModifiers()`) form combos such as `ControlLeft+MouseWheelUp`
- capture commits on mouseup for buttons and on the first full notch for the wheel
- bound non-primary buttons cancel the browser default (back/forward, autoscroll)
- window blur and the page going hidden release every held button (`released` events) and reset the wheel notch counter
- a right press inside a text field or the bind-manager UI dispatches nothing (the native context menu opens there and would swallow the release)
- during gameplay the context menu is cancelled only for right clicks (`button === 2`) outside text fields and the bind-manager UI, and only while `MouseButton2` (bare or with the held modifiers) is bound; keyboard-opened menus are left alone
- the window wheel listener is passive by default and becomes non-passive only while a capture runs, or while a wheel code is bound and gameplay is not suppressed (so capture and host handlers can cancel scrolling)

### `wheel-notches.js`

`WheelNotchCounter` normalises raw `WheelEvent`s into notches:

- pixel events of at least 30 px (`wheelPixelThreshold`), line events of at least one whole line, and every page event count as **one** notch
- smaller deltas (trackpads, high-resolution wheels) accumulate per direction. The total resets on a direction change or after 200 ms idle
- Shift+wheel on `deltaX` (Chromium/Safari) is treated as vertical. Pure horizontal motion is ignored

### `browser-shortcut-guard.js`

`BrowserShortcutGuard` cancels browser shortcuts and default actions while the game owns input. It is opt-in through the `browserGuard` option and exposed as `manager.browserGuard`.

- capture-phase `window` listeners for keydown/keyup, mousedown/mouseup/auxclick, wheel and contextmenu; the non-passive wheel listener exists only while the guard is started and enabled
- engagement: enabled, bind-manager UI closed (bindings modal, capture, built-in tools), no text field focused, and pointer lock / fullscreen / focus on the target, or `setGameOwnsInput(true)` (`when: 'auto'`)
- patterns (`Mod+KeyR`, `Shift+MouseWheel`, `Alt`, …) match with *at least* their modifiers, `allow` wins over block, and bound actions are cancelled too (`blockBound`)
- Keyboard Lock (`navigator.keyboard.lock`) while JS fullscreen is active, feature-detected, released on exit
- optional `beforeunload` leave-site prompt

See the root README section "Browser Shortcut Guard" for the default list and the documented browser limits.

### `gamepad-codes.js`

This file defines the logical code vocabulary for gamepad input.

Buttons are represented as:

- `GP_B0` through `GP_B16`: the standard layout
- `GP_B17` through `GP_B23`: extra buttons reported after the standard 17 (Share, touchpad click, paddles, back grips)

Axes are represented as split directional codes:

- `GP_A0N` and `GP_A0P`
- `GP_A1N` and `GP_A1P`
- `GP_A2N` and `GP_A2P`
- `GP_A3N` and `GP_A3P`

This split is important because it lets the binding store and action system treat stick directions like bindable inputs in the same way as buttons.

It exports:

- every button and axis-direction constant
- `GP_CODES`
- `GP_BUTTON_COUNT` (24) and `GP_AXIS_COUNT` (4)
- `isGamepadCode(code)`
- `getGamepadCodeType(code)`

Every other gamepad-related file in the project assumes this code format.

### `gamepad-profiles.js`

This file provides family-level label maps for eight families: `xbox`, `xbox360`, `dualshock4`, `dualsense`, `switch-pro`, `steam`, `stadia` and `generic` (the label table is in the root README's "Gamepads" section).

It exports:

- `GAMEPAD_PROFILES`, `GAMEPAD_FAMILIES` (display order, generic last), `GAMEPAD_FAMILY_NAMES`, `getGamepadFamilyName(family)`
- `GAMEPAD_LABEL_VARIANTS` and `getGamepadLabelVariant(family, vendorId, productId)`: the Xbox Elite variant labels `GP_B17`..`GP_B20` Paddle 1..4 for `045e-02e3`, `045e-0b00`, `045e-0b05`, `045e-0b22`
- `GAMEPAD_UNVERIFIED_LABELS` and `isGamepadLabelUnverified(code, family, variant = null)`: entries not verified on hardware (Xbox `GP_B17`, Steam `GP_B17`..`GP_B23`, Stadia `GP_B17`/`GP_B18`, and under the `xbox-elite` variant the paddles `GP_B17`..`GP_B20`). With a variant, a code the variant labels is judged by the variant's list.
- `parseGamepadId(id)` → `{ vendorId, productId, key, name }` for Chrome (`… (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)`) and Firefox (`054c-0ce6-…`, also with leading zeros dropped) ids
- `GAMEPAD_DEVICE_FAMILIES`: the `vendor-product` → family table
- `detectGamepadProfile(gamepadId)`: with a vendor/product pair only the table decides (an unknown pair is `generic`); without one, name patterns apply (`XInput` → `xbox`, "Xbox 360", "DualSense", "DualShock", a bare "Wireless Controller" → `dualshock4`, "Pro Controller", "Steam Deck", "Stadia", …)
- `getGamepadLabel(code, profile = 'generic', variant = null)`: a family without a label for the code returns the code itself, which is how the UI knows the pad lacks that button

These are not exact device mappings.

They are the label sets used when no exact generated controller definition applies to the pad. For example, `GP_B0` can be shown as `A` on Xbox, `Cross` on PlayStation pads or `B` on a Switch Pro (positional).

### `gamepad-profile-resolver.js`

This file decides how a connected controller should be interpreted for labeling and profile selection.

It exports helpers such as:

- `getGamepadIdentityKey(gamepadId)` / `getGamepadIdentityKeys(gamepadId)`: `vendor-product` when the id carries the pair, else `id:<lowercased id>`; the legacy `id:` key is kept as a fallback so overrides stored by 0.1.0 for Chrome ids still apply
- `normaliseGamepadProfileOverride(override)`
- `getControllerFamily(profile, gamepadId)`
- `isControllerProfileApplicable(profile, gamepad)`: an exact profile fits only a pad the browser did not remap (`mapping !== 'standard'`) whose raw button and axis counts equal the profile's `sourceButtons` / `sourceAxes`
- `resolveGamepadProfile(gamepadOrId, options)`: pass the Gamepad itself; with a bare id string exact profiles never apply
- `getAvailableGamepadProfileOptions(gamepadOrId)`: only exact profiles that fit, and every named family with its display name
- `getResolvedGamepadLabel(code, resolvedProfile)`

Its job is to layer multiple resolution strategies in a predictable order.

The current resolution order is:

1. Manual exact profile override, if it fits the pad (otherwise it is kept, reported in `ignoredOverride`, and resolution continues).
2. Manual family override.
3. Exact generated controller profile matched by vendor/product, if it fits the pad (no vendor-only fallback).
4. Detected family such as `xbox` or `dualshock4`.
5. Generic fallback.

In-memory mapping edits replace the result (`source: 'memory-edit'`). The result also carries `displayName`, `vendorId`, `productId` and `labelVariant`.

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
- exact controller mapping from generated controller definitions, with hat D-pad decoding
- temporary in-memory edits to the resolved profile definition
- the dispatch thresholds and a pad's logical state for the Controller Test (`getThresholds()`, `getLogicalState(index)`)

Important runtime rules:

- Small axis drift is ignored using a deadband (default 0.12).
- Axis directions become digital `pressed`, `held`, and `released` events only after crossing an analog threshold (default 0.5).
- A raw button is pressed when the browser reports `pressed: true` or its value is above 0.5 (`BUTTON_PRESS_THRESHOLD`), mapped or not; an axis mapped to a button uses the analog threshold.
- Analog events are emitted independently of digital threshold crossings for actions that opt in. An action bound to one half of an axis (`GP_A0N` or `GP_A0P`) gets only that half (the signed value clamped to `[-1, 0]` or `[0, 1]`, with `code` naming the half), an action bound to both halves the full value; each action gets exactly one analog 0 when its value returns to 0 (the axis back in the deadband, or the stick on the other half).
- `held` fires on every polled frame while a code stays pressed.
- Suppressing gameplay (`setGameplaySuppressed(true)`, the modal opening) and a disconnect fire `released` for every code that fired `pressed` and a final analog 0 to every analog action whose value (its half of the axis, or the whole axis) was non-zero. Inputs still active when gameplay resumes, and a code just captured, are latched: they fire nothing until released and pressed anew.
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

If the window loses focus, all currently pressed keys are released internally and `released` events are fired for them. This avoids the classic stuck-key problem when users alt-tab away from the page. The keys are forgotten before the events are fired, so `isPressed()` (and `isActionPressed()`) already read `false` inside a `released` listener, as after a keyup; the same holds when suppression (the modal opening) or `stop()` releases them, and for the mouse runtime.

### Lost keyups (0.2.4)

A keyup can be lost while the window keeps its focus (another frame, a native menu or a host listener got it; on macOS the keyups of other keys while Cmd is held). Two repairs, both done as that keyup would have been handled (`_releaseKey()`), before the event itself:

- A trusted keydown that is not a repeat, for a key in `_trustedHeld`, releases the key first (its entry and, for a modifier, its chords), then presses it anew.
- `_releaseLostModifiers()`: a trusted key event whose flags (`ctrlKey`, `shiftKey`, `altKey`, `metaKey`) say a modifier in `_trustedHeld` is up releases it, in `MODIFIER_ORDER`. Never the event's own key; not the Ctrl and Alt flags while `getModifierState('AltGraph')` is true. A flag covers both sides: off releases Left and Right, on keeps both (a lost keyup of one side is not seen while the other is down). During a capture or while suppressed the modifier is only forgotten, with no dispatch and no commit.

Trusted means `_hasTrustedFlags()` (`isTrusted`). `_trustedHeld` holds the keys that only trusted keydowns pressed since they went down; a synthetic keydown of a held key takes it out until it leaves `_pressed`. A synthetic event never repairs and a key a synthetic keydown holds is never itself repaired, so synthetic events behave as in 0.2.3 as long as no keyup of a real key is lost. A modifier-only chord such a key completes with a real modifier still ends when that modifier is repaired (`_releaseChordsWith()` releases every chord with it), and the later synthetic keyup then sends nothing for it; a combo whose key a synthetic keydown pressed stays until that keyup.

The repairs trust the flags. Where trusted flags say a modifier is up although no keyup was lost, it is released early: automation that sets flags per key name and not per side, debugger-driven key events with empty flags, and (not verified in a real browser) Windows NumLock with Shift held and a numpad key, or a Meta key reported with `metaKey` false. `tests/input/keyboard-lost-keyup-diff.test.js` runs random sequences, trusted and synthetic events mixed, on this runtime and the released 0.2.3 one; with flags that match the held keys and no lost keyup it requires identical events and state.

The browser shortcut guard's capture listener runs before the runtime's and reads `getHeldModifiers()` before the repair, so the first key event after a lost keyup is still guarded as if the modifier were down.

### Keyboard capture

Keyboard capture is a one-shot mode.

While active:

- normal gameplay action dispatch is bypassed
- pressing a non-modifier key records it with the modifiers held at that moment; the binding commits when that key is released (capture-on-release), as a combo such as `ControlLeft+KeyS`
- a modifier released with no other key pressed commits at once, as the chord of every modifier held at that moment: the modifier itself when it is alone, otherwise a modifier-only chord such as `ControlLeft+ShiftLeft` (in canonical order, whatever order the keys went down in)
- `Escape` cancels capture on keydown and returns `null`
- a modifier already held when capture starts is not counted (its keydown came before; the flags of later events tell that Ctrl is down but not which Ctrl, so they are not used to add it)

## Gamepad behavior in detail

Gamepad handling is more layered because different controllers can expose different raw button and axis arrangements.

### Logical model

The runtime always tries to translate the raw device into the same logical code set:

- 24 logical buttons (`GP_B0`..`GP_B23`)
- 4 logical axes, each split into negative and positive direction codes

That normalization is what allows the rest of the system to remain stable even when raw controllers differ.

### Mapping path

For each connected gamepad, the runtime tries to build a logical state using this order:

1. Edited in-memory definition if the user has remapped profile entries in the current session (it starts from the exact definition, or from the identity mapping of the pad's standard layout).
2. Exact generated controller definition if one fits the pad.
3. Raw standard-layout fallback otherwise (button index = logical button, axis index = logical axis).

Hat entries (a D-pad on one axis) are decoded on the 2/7 grid when a profile's four hat entries sit on the four cardinal positions (`isHatGridLayout`): a cardinal entry is also active on its two neighbouring diagonals, and an off-grid value (the resting value) is neutral. Other hat entries match `value` ± `tolerance`. `decodeHatValue`, `isHatEntryActive`, `isHatGridLayout` and `readMappingEntryMagnitude` are exported for other callers.

### Digital and analog dispatch

Buttons are straightforward: they dispatch based on whether they are considered pressed.

Axes have two parallel interpretations:

- continuous value for analog-aware actions
- threshold-based directional digital events for normal bindable inputs

This lets the same stick support both:

- digital-style bindings such as `Left Stick Left`
- analog gameplay callbacks such as move speed or aim magnitude

### Gamepad capture

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

This is why the same logical code can be shown as `A`, `Cross`, or `Btn 0` depending on the connected controller and resolved profile. `getLabelForCode(code)` without an index uses the first connected pad.

## How `/src/input` supports the UI

The input folder does not render UI itself, but UI behavior depends heavily on it.

The bindings modal uses:

- `getKeyLabel(...)` for keyboard slots
- `getLabelForCode(...)` via `GamepadRuntime` for gamepad slots (variant-aware, first connected pad by default)
- capture methods from `KeyboardRuntime` and `GamepadRuntime`
- profile option helpers for the gamepad profile dropdown

The hints bar uses:

- keyboard labels from `key-names.js`
- resolved gamepad labels from the active profile

The built-in Input Remap and Controller Test tools also depend on these modules to interpret, label, and validate raw input. The Controller Test lights a control exactly when the runtime's logical state says it is pressed, and evaluates mappings (hats, magnitudes) with the runtime's own helpers.

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
   - then `wheel-notches.js`, `mouse-runtime.js`, `browser-shortcut-guard.js`
4. `gamepad-profiles.js`
5. `gamepad-profile-resolver.js`
6. `gamepad-runtime.js`
7. `controller_definitions/README.md`

## Summary

`/src/input` is the runtime translation layer of Bind Manager.

It defines the input code vocabulary, captures raw browser input, normalizes it into a stable event contract, and supplies the labels and profile resolution that make rebinding and hints understandable to users.
