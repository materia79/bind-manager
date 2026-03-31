# Bind Manager

Bind Manager is a browser-first key binding system for games and interactive applications.

It provides:
- A modal for rebinding keys (grouped by action category)
- A bottom-screen hint bar for action prompts
- Persistent bindings via localStorage
- Runtime action events (pressed, held, released)
- A framework-agnostic API that works in ThreeJS and non-ThreeJS apps

Current input support in this MVP: keyboard only.

## Features

- Action registration with labels, descriptions, groups, slots, and defaults
- Multiple bindings per action (for example primary + secondary)
- Per-slot clear (delete) support from the modal
- Reset action to defaults and reset all actions
- Conflict warnings when the same key is bound to multiple actions (allowed, not blocked)
- Change subscriptions so host apps can react to rebinds
- Optional debug modal toggle key (default: F5)
- Bottom hint overlay with per-action and bulk visibility controls

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

## Quick Start

```js
import { createBindManager } from './src/index.js';

const binds = createBindManager({
	namespace: 'my-game',
	debug: true,      // enables F5 modal toggle
	debugKey: 'F5',
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

- Keyboard device only
- Browser environment only (DOM required for built-in UI)
- No mouse/gamepad binding yet

## QA

Release checklist: [QA_CHECKLIST.md](QA_CHECKLIST.md)

## License

MIT
