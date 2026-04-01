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

Current input support in this MVP: keyboard plus browser Gamepad API input, including generated exact controller profiles with family and generic fallback labels.

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
http://localhost:3000/demo/
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

### Hint controls

- `showHint(actionId)`
- `hideHint(actionId)`
- `showAllHints()`
- `hideAllHints()`

### Runtime input and subscriptions

- `onAnyAction(callback)`
- `isActionPressed(actionId)`
- `subscribe(callback)` for binding-change events

### Cleanup

- `destroy()` remove listeners and UI from the page

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
- No mouse binding yet

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

WebHID remains optional and reference-only in this repo.

Current reference artifact:
- [docs/reference/dualsense-webhid-tester.html](docs/reference/dualsense-webhid-tester.html)

Scope of the reference file:
- It is a protocol/debugging reference for DualSense report parsing.
- It is not part of the primary Bind Manager runtime input path.
- It may be used later for optional advanced diagnostics (for example gyro/touch telemetry) behind explicit opt-in.

Out of scope for the core runtime:
- Full migration from Gamepad API to WebHID.
- Requiring WebHID permissions for standard rebinding.
- Shipping adaptive trigger effect output as a default feature.

## QA

Release checklist: [QA_CHECKLIST.md](QA_CHECKLIST.md)

## License

MIT
