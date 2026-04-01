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

---

## 1) `build.js`

### Purpose

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

### Purpose

Transforms controller capture JSON files into runtime-importable controller profile modules.

This script powers the generated files under:

- `src/input/controller_definitions/profiles/*.js`
- `src/input/controller_definitions/index.js`

### Why this script exists

The runtime imports profile modules as JavaScript. Capture data is produced as JSON from the tester/debug workflow. This script is the normalization and code-generation step between those two worlds.

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
	 - Verifies `captures/` exists.
	 - Creates `profiles/` if needed.

2. Capture discovery
	 - Reads all `.json` files in `captures/`.
	 - Sorts filenames for deterministic processing.

3. Parse and sanity validation per file
	 - Parses JSON.
	 - Runs `validateCaptureSanity()`.
	 - Collects errors and warnings.
	 - Skips generation for captures with validation errors.

4. Convert capture to definition
	 - Runs `toControllerDefinition()`.
	 - Derives `vendorId` and `productId` from `runMeta.targetController.id`.
	 - Falls back to filename parsing (`####-####_name.json`) if needed.
	 - Builds `mapping` and `labels` objects.
	 - Merges with any existing generated profile content for that same device key.

5. Deduplicate by device key
	 - If multiple captures map to the same `vendorId-productId`, keeps the newest by `capturedAt`.
	 - Emits warnings for duplicates.

6. Generate files
	 - Writes one profile file per device key to `profiles/`.
	 - Removes stale profile files that are no longer represented by input captures.
	 - Regenerates `index.js` with imports and helper lookup functions.

7. Reporting and exit
	 - Prints warnings (if any).
	 - Prints summary counts and output locations.
	 - Exits non-zero if any hard errors occurred.

### Capture validation details

`validateCaptureSanity()` checks for important quality signals before generation.

It validates, among other things:

- Capture root shape and required arrays
- Presence and quality of `runMeta.targetController`
- Existence of expected D-pad codes (`GP_B12`, `GP_B13`, `GP_B14`, `GP_B15`)
- Mapping shape:
	- kind is `button` or `axis`
	- non-negative integer index
	- axis direction is `negative` or `positive`
- Duplicate expected codes (warning, last one wins)
- Multiple expected codes resolving to the same physical input (warning)
- Sequence/capture expected-code mismatch (warning; processor uses `captures` entries)

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
4. Merges with existing generated profile to preserve previously known data when new captures are partial.

### D-pad hat heuristic

Some controllers expose D-pad as a single hat axis where each direction is represented by a value rather than distinct button signals.

If all four D-pad expected codes resolve to the same axis and direction, the script rewrites those mappings to `hat` entries with default values:

- `GP_B12` (Up): `-1.0`
- `GP_B15` (Right): `-0.428571`
- `GP_B13` (Down): `0.142857`
- `GP_B14` (Left): `0.714286`

with default tolerance `0.2`.

This helps runtime resolve directional input correctly for hat-style D-pads.

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

This gives runtime code a consistent lookup API for exact and fallback profile resolution.

### Typical operator workflow

1. Capture controller data from the debug/tester flow.
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

- Error: unable to derive vendor/product ids
	- Ensure `runMeta.targetController.id` includes VID/PID info.
	- Or ensure filename starts with `####-####` (hex VID-PID).

- Warning: sequence expectedCode differs from captures expectedCode
	- The processor uses `captures[*].expectedCode` for mapping output.
	- Treat this as a capture QA issue and recapture or normalize data.

- Warning: D-pad mappings not distinct enough
	- Re-capture D-pad steps carefully.
	- Confirm distinct physical signals are recorded.

---

## Script Maintenance Notes

- `build.js` is build-system focused and intentionally small.
- `process-controller-defs.js` is domain logic plus code generation; changes should be validated with representative capture files.
- Generated files in `src/input/controller_definitions/` are outputs of the process script, not hand-authored sources.