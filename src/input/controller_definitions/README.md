# Controller Definitions

This folder contains the exact controller-profile layer for Bind Manager.

It exists for controllers whose raw browser layout does not match the standard gamepad layout: an exact profile maps their raw buttons, axes and hat D-pad onto Bind Manager's logical codes and brings its own labels.

Related docs:

- [../../../README.md](../../../README.md) for package-level usage (the "Gamepads" and "Built-in Tools" sections).
- [../README.md](../README.md) for the full input-layer architecture.
- [../../core/README.md](../../core/README.md) for how the manager and UI consume these profiles.
- [../../../scripts/README.md](../../../scripts/README.md) for the `process_controller_defs` generation pipeline.

## What this folder is for

The rest of the input system works with logical gamepad codes such as `GP_B0`, `GP_B12`, `GP_A0N` or `GP_A3P`. When the browser recognises a pad, it reports it with `mapping: 'standard'` and already arranges buttons and axes in the standard layout; then the family labels in `../gamepad-profiles.js` are all that is needed.

When the browser does not remap a pad (for example a DualSense in Firefox, reported with `mapping: ''`, 14 buttons and 12 axes), raw button 0 may be Square and the D-pad may be one hat axis. An exact profile from this folder maps:

- raw button indices
- raw axis indices and directions
- hat-axis values

into the logical codes, so bindings and labels stay the same as on a remapped pad.

## Folder contents

### `captures/`

Raw capture JSON files produced by the built-in **Input Remap** tool (`builtInTools: { inputRemap: true }`, opened from the bindings modal's footer or with `manager.openInputRemap()`).

They are the source material for exact profiles. They are not loaded by the browser runtime, and they are excluded from the npm package (`package.json` `files`).

### `profiles/`

Generated controller definition modules such as `054c-0ce6.js`. Each exports a `controllerDefinition` object and a default export with the same value. Do not edit them by hand: the generator rewrites them, and deletes any `.js` file here that no capture produces.

### `index.js`

The generated registry. It imports every generated profile and exposes lookup helpers:

- `getControllerProfiles()`
- `getControllerProfile(key)`
- `findControllerProfilesByFamily(family)`
- `findControllerProfile(vendorId, productId)`
- `findControllerProfileByGamepadId(gamepadId)` (exact vendor/product match through `parseGamepadId`, Chrome and Firefox id forms; there is no vendor-only fallback)

`../gamepad-profile-resolver.js` uses it to find an exact profile for a connected controller.

### `TODO.md`

Known gaps and follow-up work for captures, the generator and hardware verification.

## When an exact profile applies

A profile found by vendor/product applies only when `isControllerProfileApplicable(profile, gamepad)` holds:

- the browser did not remap the pad: `gamepad.mapping !== 'standard'`, and
- the pad's raw button and axis counts equal the profile's `sourceButtons` and `sourceAxes`.

The same check gates a manual exact override chosen in the profile select. An override that does not fit is kept (the pad may report a raw layout later), reported in `ignoredOverride`, and shown in the UI as "saved profile does not fit this controller's layout". Setting such an override through `manager.setGamepadProfileOverride()` (or the profile select) warns once in the console; an override loaded from storage that does not fit is reported in `ignoredOverride` without a warning. With only an id string (no Gamepad object), an exact profile never applies.

The resolution order is:

1. Manual exact profile override that fits the pad.
2. Manual family override.
3. Exact generated profile that fits the pad.
4. Detected family such as `xbox` or `dualshock4`.
5. Generic.

In-memory mapping edits (the Controller Test's Profile editor, `setGamepadProfileMappingEntry()`) replace the result for that controller model until reload (`source: 'memory-edit'`).

When a profile applies, it provides:

- labels from `definition.labels`
- raw-to-logical mappings from `definition.mapping`

which flow into `GamepadRuntime` (logical state and dispatch), the bindings modal, the hint bar and the Controller Test.

## Controller definition structure

Each generated definition is plain serialisable data with these fields:

| Field | Meaning |
| --- | --- |
| `key` | `vendorId-productId`, lowercase |
| `vendorId`, `productId` | from the capture's `targetController.id`, else from the capture file name |
| `sourceName` | the device name from the id, else "Unknown Controller" |
| `sourceId` | the browser's `Gamepad.id` at capture time |
| `sourceButtons`, `sourceAxes` | the raw button and axis counts at capture time; the applicability check compares them |
| `capturedAt` | the capture's `generatedAt` |
| `profileHint`, `family` | the label family (`dualsense` for every capture of the current preset) |
| `labels` | logical code → label, from the capture's step labels (`Cross`, `L2 (digital)`, `Left Stick Left`, …) |
| `mapping` | logical code → raw entry |

Mapping entries:

- `{ kind: 'button', index }`
- `{ kind: 'axis', index, direction: 'negative' | 'positive' }`
- `{ kind: 'hat', index, value, tolerance }`

The runtime compiles `GP_B0`..`GP_B23` and `GP_A0N`..`GP_A3P`. The analog trigger codes of the capture (`GP_B6A`, `GP_B7A`) end up in the profile too; only the Controller Test reads them (for its trigger bars).

**Hat D-pads.** When all four D-pad captures land on the same axis and direction, the generator writes four `hat` entries with the grid values up -1, right -0.428571, down 0.142857, left 0.714286 and tolerance 0.2. The runtime recognises such a set as a 2/7 grid: a cardinal entry is also active on its two neighbouring diagonals, and an off-grid value (the hat's resting value) is neutral.

## Generation pipeline

`npm run process_controller_defs` (`node scripts/process-controller-defs.js`) reads every `.json` file in `captures/`, validates it, converts it into a definition, writes `profiles/<key>.js` per device and regenerates `index.js`. Any error in any capture stops the run before anything is written; warnings are printed and do not stop it. Several captures of one device are deduplicated (the newest `generatedAt` wins), and a new capture is merged over the existing profile of that device. Details: [../../../scripts/README.md](../../../scripts/README.md#2-process-controller-defsjs).

## Adding a controller profile

This workflow was run end to end with a simulated raw DualSense (a test fake pad reporting `mapping: ''`; the demo's Fake controller cannot be used for this, its pads are all standard-mapped): a full 27-step capture, the generator, and the applicability check of the result.

1. Use a browser that reports the controller's **raw** layout (`mapping` is not `'standard'`; older Firefox versions do for the DualSense). When the browser already reports the standard layout (most pads in Chrome; the id contains `STANDARD GAMEPAD`), Input Remap shows a note as soon as it opens: no exact profile is needed there, the family labels apply. A capture made anyway ends with that note as its validation error, and the generator refuses it.
2. Open **Input Remap** (bindings modal footer, or `manager.openInputRemap()`), keep the preset "DualSense / PlayStation Layout", release every control and press **Start Debug** (2 s baseline).
3. For each of the 27 steps, hold the named input and press **Capture** (5 s window, the strongest stable input wins), then **Next**. **Back** and **Redo** fix a step.
4. Check the validation line. "D-Pad mappings are not distinct enough yet for reliable processing." is expected for a hat D-pad (all four directions on one axis); the generator turns that case into hat entries.
5. **Download JSON** (the file is named `<vendor>-<product>_dualsense.json`) and put it into `src/input/controller_definitions/captures/`.
6. Run `npm run process_controller_defs` and check its warnings. The run writes `profiles/<vendor>-<product>.js` and `index.js`.
7. Reload the page with the controller connected. The profile chip reads "Exact · …" when the profile applies; verify the controls in the Controller Test.

**Remapped pads.** The capture records the layout the browser reported (`runMeta.targetController.mapping`, `'standard'` or `''`). A pad with `mapping: 'standard'` cannot get a working exact profile (exact profiles apply only to raw layouts), so:

- Input Remap shows a note when it opens with such a pad, and its validation line for such a capture is an error saying that this browser already reports the controller in the standard layout and no exact profile is needed (Download and Copy still work, for debugging; the "place it in captures/" instruction is not shown). The Controller Test's Profile editor shows the same note next to its Download JSON.
- The generator refuses a capture with `mapping: 'standard'` (error, nothing written), warns about an older capture without the field that has exactly 17 or 18 buttons and 4 axes, and refuses a capture that would change the raw layout of an existing profile of the same device unless it runs with `--replace-layout`.

What else to know before relying on it:

- **One preset.** The guided capture knows only the DualSense layout, tags every capture `family: 'dualsense'` and uses the step labels ("L2 (digital)") as exact labels. There is no step for `GP_B17` or above, so a touchpad, Share or paddles cannot be captured.
- **The tool's validation is weaker than the generator's.** A step without a detected input is skipped by the tool's check, so "ready to export" can show for an incomplete run that the generator then rejects (`<code>: detected mapping is missing`).
- **Without `targetController`** (a hand-edited capture), the vendor/product comes from the file name and the counts are `null`, so the profile never applies; nothing warns.
- **The Controller Test's Download JSON is not a capture.** It exports the current (exact or edited) profile definition; the generator cannot read it (it expects `captures`), and there is no supported path from that file to a shipped profile.
- **Profiles are generated assets.** Hand edits in `profiles/` are overwritten or deleted on the next run.

## Current generated profile coverage

The repository ships one exact profile:

- `054c-0ce6` (DualSense), captured from the raw layout Firefox reports: `sourceButtons: 14`, `sourceAxes: 12`. Face buttons are remapped (raw 1 is Cross, raw 0 is Square), PS is raw button 12, the D-pad is a hat on axis 9, the right stick is on axes 2 (X) and 5 (Y), the analog triggers are axes 3 and 4.

It has no touchpad mapping (`GP_B17`): its capture had no such step, so on a raw DualSense the touchpad click is not mapped. A DualSense that Chrome remaps (`mapping: 'standard'`) does not use this profile; the `dualsense` family labels apply there, including Touchpad for `GP_B17`.

## Important invariants and caveats

- `profiles/` and `index.js` are outputs of the generator, not hand-maintained logic.
- Exact profiles are optional: without one, a pad uses its family (or generic) labels and the standard layout.
- Capture quality directly affects runtime quality: an ambiguous or mislabelled capture gives a wrong profile even when the runtime is correct.
- Family labels are not exact mappings: only an exact profile corrects a non-standard raw layout, and only on a pad it fits.

## Recommended reading order

1. `captures/` sample file
2. [../../../scripts/README.md](../../../scripts/README.md)
3. `profiles/` generated modules
4. `index.js`
5. [../gamepad-profile-resolver.js](../gamepad-profile-resolver.js)
6. [../gamepad-runtime.js](../gamepad-runtime.js)
