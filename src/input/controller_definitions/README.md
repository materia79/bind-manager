# Controller Definitions

This folder contains the exact controller-profile layer for Bind Manager.

It exists to make gamepad input more accurate and more readable than family-only or generic fallback labeling can provide.

Related docs:

- [../../../README.md](../../../README.md) for package-level usage.
- [../README.md](../README.md) for the full input-layer architecture.
- [../../core/README.md](../../core/README.md) for how the manager and UI consume these profiles.
- [../../../scripts/README.md](../../../scripts/README.md) for the `process_controller_defs` generation pipeline.

## What this folder is for

The rest of the input system works with logical gamepad codes such as:

- `GP_B0`
- `GP_B12`
- `GP_A0N`
- `GP_A3P`

Those codes are stable across the project, but real controllers do not always expose raw browser button and axis data in a way that lines up cleanly with the standard mapping assumptions.

This folder solves that problem by storing exact per-device controller definitions that can map:

- raw button indices
- raw axis indices
- hat-axis directions

into Bind Manager's logical gamepad code system.

That improves two things:

1. Mapping correctness
	The runtime can translate unusual raw device layouts into the expected logical code set.
2. UI label quality
	The modal, hints, and controller tester can show labels such as `Cross`, `Circle`, or `D-Pad Up` instead of generic labels like `Btn 0`.

## Folder contents

### `captures/`

This folder contains raw JSON captures produced by the demo tooling.

These files are the source material for exact controller definitions. They are not loaded directly by the browser runtime.

Instead, they are processed into generated JavaScript modules so the runtime can import them.

### `profiles/`

This folder contains generated controller definition modules such as `054c-0ce6.js`.

Each generated file exports a `controllerDefinition` object and a default export with the same value.

These generated files are the exact profiles the runtime uses when a connected controller matches their device identity.

### `index.js`

This is a generated registry file that imports every generated profile and exposes helpers for looking them up.

It provides functions such as:

- `getControllerProfiles()`
- `getControllerProfile(key)`
- `findControllerProfilesByFamily(family)`
- `findControllerProfile(vendorId, productId)`
- `findControllerProfileByGamepadId(gamepadId)`

This registry is what `gamepad-profile-resolver.js` uses to find an exact match for a connected controller.

### `TODO.md`

This file tracks known issues and follow-up tasks for controller capture quality, processor hardening, validation, and hardware verification.

At the time of writing, the TODO file highlights an important current issue with the DualSense capture data: the sequence metadata and capture metadata can disagree on `expectedCode`, and the processor currently uses the capture entries for generation.

## How exact controller profiles are used at runtime

When a gamepad is connected, Bind Manager resolves labels and mapping using a layered approach.

The resolution order is:

1. Manual exact profile override selected by the user.
2. Manual family override selected by the user.
3. Exact generated profile matched from the browser `Gamepad.id`.
4. Family fallback such as `xbox` or `dualsense`.
5. Generic fallback.

This folder is responsible for step 3.

If an exact match exists, the runtime can use:

- exact labels from `definition.labels`
- exact raw-to-logical mappings from `definition.mapping`

That profile data then flows into:

- `GamepadRuntime` for logical state translation
- `gamepad-profile-resolver.js` for resolution metadata
- the bindings modal for gamepad slot labels
- the hints bar for gamepad prompts
- the built-in controller tester for visualization and debugging

## Controller definition structure

Each generated controller definition is plain serializable data.

A typical definition includes:

- `key`
- `vendorId`
- `productId`
- `sourceName`
- `sourceId`
- `sourceButtons`
- `sourceAxes`
- `capturedAt`
- `profileHint`
- `family`
- `labels`
- `mapping`

### Identity fields

These fields help identify which controller the definition belongs to:

- `key`: usually `vendorId-productId`
- `vendorId`
- `productId`
- `sourceId`: the original browser-reported gamepad ID string or related capture identifier

### Label fields

The `labels` object maps logical Bind Manager codes to the text the UI should display.

Examples:

- `GP_B0 -> Cross`
- `GP_B1 -> Circle`
- `GP_B12 -> D-Pad Up`
- `GP_A0N -> Left Stick Left`

### Mapping fields

The `mapping` object maps logical Bind Manager codes to physical controller inputs.

Supported entry kinds in the generated data include:

- `button`
- `axis`
- `hat`

Examples:

- button mapping: logical code reads a physical button index
- axis mapping: logical code reads a specific axis in a positive or negative direction
- hat mapping: logical code reads a hat-style D-pad value from a shared axis with a tolerance

This is what lets the runtime reconstruct a normalized 17-button, 4-axis logical state from device-specific raw browser data.

## Generation pipeline

The generation pipeline is driven by:

- `npm run process_controller_defs`
- `node scripts/process-controller-defs.js`

The script reads capture JSON files from `captures/`, validates them, converts them into normalized controller definitions, writes generated profile files into `profiles/`, and regenerates `index.js`.

The pipeline exists because:

- capture data is produced as JSON
- the runtime imports JavaScript modules in the browser
- the generation step is where validation, normalization, and code generation happen

The current high-level pipeline is:

1. Discover `.json` capture files.
2. Parse them and run sanity validation.
3. Derive device identity metadata.
4. Build `labels` and `mapping` data.
5. Merge with existing generated profile data when appropriate.
6. Deduplicate by device key.
7. Write generated profile modules.
8. Regenerate `index.js`.

See [../../../scripts/README.md](../../../scripts/README.md) for the full processing details.

## Typical workflow for adding or updating a controller profile

The current operator workflow is:

1. Open the demo and launch the `Input Remap` or related controller capture flow.
2. Capture the controller inputs and review the generated JSON and validation output.
3. Download the JSON and place it into `src/input/controller_definitions/captures/`.
4. Run `npm run process_controller_defs`.
5. Verify that `profiles/` and `index.js` were regenerated correctly.
6. Reconnect the controller and verify labels and mappings in the bindings modal, hints, and controller tester.

## Validation and quality rules

The processor performs sanity checks before generation.

From the current script documentation, validation includes checks for:

- expected capture structure
- usable target controller metadata
- D-pad presence
- valid mapping entry kinds and indices
- duplicate expected codes
- multiple logical codes resolving to the same physical input
- sequence/capture expected-code mismatch

Warnings do not necessarily stop generation, but they should be treated as real quality signals.

The current TODO list also makes it clear that capture QA still matters, especially for ambiguous triggers, the PS button, and D-pad/hat mappings.

## Current generated profile coverage

At the moment, this repository includes a generated exact profile for a DualSense controller:

- `054c-0ce6`

That generated profile includes:

- exact labels for face buttons, shoulders, D-pad, sticks, and guide button
- mappings for button-backed controls
- mappings for axis-backed controls
- hat mappings for D-pad directions

This provides a concrete example of the data shape expected by the runtime.

## How this folder interacts with the rest of the system

### With `/src/input/gamepad-profile-resolver.js`

The resolver asks the generated registry for exact matches and then combines that with manual overrides and family fallback logic.

### With `/src/input/gamepad-runtime.js`

The runtime uses exact profile mappings to build a normalized logical gamepad state before dispatching action events.

### With `/src/ui`

The UI uses the resolved profile's labels so users see familiar controller terminology in the binding modal, hint bar, and tester tools.

### With `/src/core`

The core manager does not need to know raw hardware details. It relies on this folder to provide a stable, normalized view of controller identity, labels, and mappings.

## Important invariants and caveats

### These files are generated assets, not hand-maintained runtime logic

The files in `profiles/` and `index.js` should be treated as outputs of the processing pipeline.

### Exact profiles are optional but valuable

Bind Manager still works without an exact profile because it can fall back to family or generic behavior. Exact profiles mainly improve correctness and user-facing clarity.

### Capture quality directly affects runtime quality

If a capture is ambiguous or mislabeled, the generated profile can be wrong even if the runtime code is correct.

### Family fallback is not the same as exact mapping

Family-level labels help readability, but only exact profiles can fully correct non-standard raw button and axis arrangements.

## Recommended reading order

If you want to understand this folder in the order data flows, read:

1. `captures/` sample files
2. [../../../scripts/README.md](../../../scripts/README.md)
3. `profiles/` generated modules
4. `index.js`
5. [../gamepad-profile-resolver.js](../gamepad-profile-resolver.js)
6. [../gamepad-runtime.js](../gamepad-runtime.js)

## Summary

This folder is the exact-profile layer for gamepad support in Bind Manager.

It turns captured controller data into generated runtime modules so the rest of the system can resolve controllers more precisely, display accurate labels, and normalize hardware-specific layouts into Bind Manager's stable logical code model.
