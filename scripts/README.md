# Scripts

This directory contains project automation scripts that are run through npm scripts in `package.json`.

## Quick Reference

- `npm run build`
	- Runs `node scripts/build.js`
	- Creates production-ready browser bundles in `dist/`
- `npm run build:watch`
	- Runs `node scripts/build.js --watch`
	- Rebuilds automatically while you develop
- `npm run process_controller_defs`
	- Runs `node scripts/process-controller-defs.js`
	- Converts controller capture JSON files into generated JS profile modules and an index registry
- `npm run demo`
	- Runs `npx --yes serve . -p 3001 --no-clipboard`: serves the repository root, the demo at `http://localhost:3001/demo/`

---

## 1) `build.js`

### What `build.js` does

Builds the library into browser-consumable bundles using esbuild.

It always produces two outputs:

- `dist/bind-manager.js`
	- Readable bundle
	- Sourcemap enabled
	- Not minified
- `dist/bind-manager.min.js`
	- Minified bundle
	- No sourcemap

### How it works

`build.js` defines one shared esbuild config and then applies two output variants.

Shared build settings:

- Entry point: `src/index.js`
- `bundle: true` (pulls dependencies into one file)
- `platform: 'browser'`
- `target: 'es2020'`
- `format: 'iife'`
- `globalName: 'BindManager'`
- `legalComments: 'none'`

The `iife` + `globalName` combination is what allows script-tag usage through:

- `window.BindManager`

### Execution modes

#### Build mode (default)

When you run:

```bash
npm run build
```

the script:

1. Runs esbuild for both output configs in parallel.
2. Exits with code `0` on success.
3. Exits with code `1` on error.

#### Watch mode

When you run:

```bash
npm run build:watch
```

the script detects `--watch` and:

1. Creates persistent esbuild contexts for both output configs.
2. Starts `ctx.watch()` for each target.
3. Keeps the process alive and rebuilds on source changes.
4. Handles `SIGINT` and `SIGTERM` to dispose contexts cleanly.

### Why this design is useful

- Fast iteration: watch mode updates both outputs continuously.
- Distribution-ready artifacts: readable and minified versions are always emitted together.
- Browser-native consumption: no runtime module loader required.

---

## 2) `process-controller-defs.js`

### What `process-controller-defs.js` does

Transforms controller capture JSON files into runtime-importable controller profile modules.

This script powers the generated files under:

- `src/input/controller_definitions/profiles/*.js`
- `src/input/controller_definitions/index.js`

### Why this script exists

The runtime imports profile modules as JavaScript. Capture data is produced as JSON by the built-in Input Remap tool (guided capture). This script is the normalization and code-generation step between those two worlds.

The Controller Test's "Download JSON" is not a capture (it is a profile definition, without `captures`); this script rejects it.

### Input and output paths

- Input captures directory:
	- `src/input/controller_definitions/captures`
- Output profile modules directory:
	- `src/input/controller_definitions/profiles`
- Output profile registry file:
	- `src/input/controller_definitions/index.js`

### End-to-end pipeline

When you run:

```bash
npm run process_controller_defs
```

the script performs the following stages.

1. Pre-flight checks
	 - Verifies `captures/` exists (error `capture directory missing: …` otherwise).

2. Capture discovery
	 - Reads all `.json` files in `captures/`.
	 - Sorts filenames for deterministic processing.

3. Parse and sanity validation per file
	 - Parses JSON.
	 - Runs `validateCaptureSanity()`.
	 - Collects errors and warnings.
	 - If any capture has an error, the run stops here and writes nothing at all.

4. Convert capture to definition
	 - Runs `toControllerDefinition()`.
	 - Derives `vendorId` and `productId` from `runMeta.targetController.id`.
	 - Falls back to the file name (`vvvv-pppp.json`, `vvvv-pppp_name.json` or `vvvv-pppp-name.json`, 4 hex digits each) when the id has no pair.
	 - Takes `sourceButtons` / `sourceAxes` from `runMeta.targetController.buttons` / `.axes` (else from the existing profile of that device).
	 - Builds `mapping` and `labels` objects.
	 - Merges with any existing generated profile content for that same device key.

5. Deduplicate by device key
	 - If multiple captures map to the same `vendorId-productId`, keeps the newest by `capturedAt` (the capture's `generatedAt`; on a tie the later file name).
	 - Emits warnings for duplicates.

6. Generate files
	 - Creates `profiles/` if needed and writes one profile file per device key.
	 - Removes every other `.js` file in `profiles/` (stale or hand-written).
	 - Regenerates `index.js` with imports and helper lookup functions.

7. Reporting and exit
	 - On success, prints summary counts and output locations, then the warnings (if any).
	 - On errors, prints the warnings and the errors and exits with code `1`. Warnings alone exit `0`.

Re-running on the same captures produces the same output.

### Capture validation details

`validateCaptureSanity()` checks for important quality signals before generation.

It validates, among other things:

- Capture root shape and a non-empty `captures` array (error)
- Presence of `runMeta.targetController` (warning when missing: the vendor/product then comes from the file name, and the raw counts come only from an existing profile of that device; without one they stay `null` and the new profile can never apply)
- Every capture entry has an `expectedCode` and a `detected` input (error `<code>: detected mapping is missing` otherwise). Exception: when no entry has a `detected` input but `controllerDefinition.buttons` / `.axes` have entries, or `captures` is empty and those have entries, the generator only warns and builds the profile from `controllerDefinition` (the later checks are skipped)
- Existence of the D-pad codes `GP_B12`, `GP_B13`, `GP_B14`, `GP_B15` (error)
- Mapping shape (error):
	- kind is `button` or `axis`
	- non-negative integer index
	- axis direction is `negative` or `positive`
- Indices beyond the target controller's button/axis counts (warning)
- An axis code (`GP_A*`) detected as a button (warning)
- Duplicate expected codes (warning, last one wins)
- Multiple expected codes resolving to the same physical input (warning)
- Fewer than three distinct physical inputs for the D-pad (warning; a hat D-pad on one axis triggers it and is then converted, see below)
- Sequence/capture expected-code mismatch (warning; processor uses `captures` entries)
- After conversion, the generated mapping entries are checked again (button, axis, hat shapes)

**The browser's layout.** Input Remap records the layout the browser reported in `runMeta.targetController.mapping` (`'standard'` or `''`). The runtime applies exact profiles only to pads with `mapping !== 'standard'` and the captured raw counts (see [src/input/controller_definitions/README.md](../src/input/controller_definitions/README.md#when-an-exact-profile-applies)), so:

- A capture with `mapping: 'standard'` is an error for that file: the browser already reports the controller in the standard layout, no exact profile is needed (the family labels apply). Nothing is written and the script exits non-zero.
- A capture without the field (older captures) whose counts are exactly 17 or 18 buttons and 4 axes gets a warning that it looks standard-mapped.
- A capture that would change `sourceButtons` / `sourceAxes` of an existing generated profile with the same key is an error, unless the run is started with `--replace-layout` (`npm run process_controller_defs -- --replace-layout`; the importable `processControllerDefs()` takes `replaceLayout: true`). Without this, a capture from another browser would silently replace a working raw profile.

The script separates:

- Errors: fail the run
- Warnings: continue generation but print diagnostics

### Mapping generation behavior

`toControllerDefinition()` creates a normalized definition with:

- Device identity metadata (`vendorId`, `productId`, `sourceId`, etc.)
- Optional family/profile metadata (`family`, `profileHint`)
- `labels` map for human-friendly control names
- `mapping` map for logical code to physical control resolution

Fallback behavior is intentionally layered:

1. Uses direct `captures[*].detected` data when available.
2. Fills missing entries from `controllerDefinition.buttons` / `controllerDefinition.axes` in the capture payload.
3. Fills missing labels from `sequence` labels.
4. Merges with existing generated profile to preserve previously known data when new captures are partial. Codes a new capture lacks are never removed by the merge.

### D-pad hat heuristic

Some controllers expose D-pad as a single hat axis where each direction is represented by a value rather than distinct button signals.

If all four D-pad expected codes resolve to the same axis and direction, the script rewrites those mappings to `hat` entries with default values:

- `GP_B12` (Up): `-1.0`
- `GP_B15` (Right): `-0.428571`
- `GP_B13` (Down): `0.142857`
- `GP_B14` (Left): `0.714286`

with default tolerance `0.2`. The observed values are not used.

The runtime recognises four hat entries on the four cardinal positions of the 2/7 grid and decodes them as a grid: a cardinal direction is also active on its two neighbouring diagonals, and an off-grid value (the resting value) is neutral.

### Generated profile file format

Each generated file in `profiles/` exports:

- `export const controllerDefinition = { ... }`
- `export default controllerDefinition`

and includes metadata + mapping content as JSON-serializable data.

Files are marked as auto-generated and should not be edited manually.

### Generated index file behavior

`src/input/controller_definitions/index.js` is regenerated to:

- Import every generated profile
- Export a `controllerProfiles` object keyed by `vendorId-productId`
- Export helpers:
	- `getControllerProfiles()`
	- `getControllerProfile(key)`
	- `findControllerProfilesByFamily(family)`
	- `findControllerProfile(vendorId, productId)`
	- `findControllerProfileByGamepadId(gamepadId)`

Lookups match vendor and product exactly (Chrome and Firefox id forms through `parseGamepadId`); there is no vendor-only fallback. Whether a found profile applies to a connected pad is decided by the resolver (`isControllerProfileApplicable`).

### Module API

The script is importable; `main()` runs only when the file is executed directly.

- `processControllerDefs({ capturesDir?, defsDir?, outFile?, log? })` → `{ files, definitions, errors, warnings }` (the defaults are the paths above; it never throws for capture errors)
- `validateCaptureSanity(capture)`, `toControllerDefinition(capture, fileName, defsDir)`, `applyDpadHatHeuristic(mapping)`, `parseControllerId(id)`, `renderIndex(definitions, fileNames)`

There are no command-line options.

### Typical operator workflow

1. Capture the controller with the built-in Input Remap tool, from a browser that does not remap it (see [Adding a controller profile](../src/input/controller_definitions/README.md#adding-a-controller-profile)).
2. Save JSON capture(s) to `src/input/controller_definitions/captures/`.
3. Run:

```bash
npm run process_controller_defs
```

4. Confirm generated profile modules and index refresh.
5. Verify labels and mapping behavior in runtime/demo.

### Troubleshooting

- Error: capture directory missing
	- Ensure `src/input/controller_definitions/captures` exists.

- Error: `unable to derive vendorId/productId from targetController.id`
	- Ensure `runMeta.targetController.id` includes VID/PID info.
	- Or ensure filename starts with `vvvv-pppp` (4 hex digits each).

- Error: `captures array is missing or empty`
	- The file is not a capture (for example the Controller Test's Download JSON). Only Input Remap's capture JSON can be processed.

- The generated profile does not apply (no "Exact" chip)
	- The pad reports different raw button/axis counts (or a different `mapping`) than at capture time; see the status note under [Capture validation details](#capture-validation-details) for captures from remapped pads.

- Warning: sequence expectedCode differs from captures expectedCode
	- The processor uses `captures[*].expectedCode` for mapping output.
	- Treat this as a capture QA issue and recapture or normalize data.

- Warning: D-pad mappings not distinct enough
	- Expected for a hat D-pad: all four directions land on one axis, and the generator then writes four `hat` entries (see "D-pad hat heuristic").
	- Otherwise (for example two directions on one button), re-capture the D-pad steps and confirm that distinct physical signals are recorded.

---

## Script Maintenance Notes

- `build.js` is build-system focused and intentionally small.
- `process-controller-defs.js` is domain logic plus code generation; changes should be validated with representative capture files.
- Generated files in `src/input/controller_definitions/` are outputs of the process script, not hand-authored sources.