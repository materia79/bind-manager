# dist

Browser-ready builds of Bind Manager for pages without a bundler: one `<script>` tag, one global (`window.BindManager`).

Only this README and `standalone-demo.html` are tracked in git. The bundles are build output: run `npm run build` to create them, or download `bind-manager.min.js` from the rolling `main-latest` GitHub release (see "Release Automation" in the [root README](../README.md#release-automation)).

## Contents

| File | What it is |
| --- | --- |
| `bind-manager.js` | Readable bundle for development and debugging. Exposes `window.BindManager`. |
| `bind-manager.js.map` | Source map for `bind-manager.js`; host it next to that file during development. |
| `bind-manager.min.js` | Minified bundle for production. Also exposes `window.BindManager`. |
| `standalone-demo.html` | A one-file demo page that loads `./bind-manager.min.js` from the same folder. |

`window.BindManager` carries every export of `src/index.js`: `createBindManager`, the key and gamepad code helpers, the gamepad family tables and the profile helpers (listed in the [root README](../README.md#exports)).

## Script tag usage

```html
<script src="/path/to/bind-manager.min.js"></script>
<script>
	const binds = window.BindManager.createBindManager({
		namespace: 'my-game',
		builtInTools: true, // Input Remap and Controller Test in the bindings modal's footer
	});

	const jump = binds.registerAction({
		id: 'jump',
		label: 'Jump',
		group: 'Movement',
		slots: 2,
		defaultBindings: ['Space', null],
		gamepadSlots: 1,
		defaultGamepadBindings: ['GP_B0'],
	});

	jump.onPressed(() => console.log('Jump pressed'));
	jump.showHint();
</script>
```

The bundle injects its stylesheets into `<head>` when the manager mounts its UI. To size or theme the UI, see "Sizing and theming" in the [root README](../README.md#sizing-and-theming).

## Standalone demo

[standalone-demo.html](standalone-demo.html) is the page that is published as the online demo (the online copy changes only when the owner republishes it). It needs nothing but `bind-manager.min.js` next to it. This version shows:

- the bindings modal (button or F5), the hint bar and the event log
- the built-in tools, opened from the modal's footer or from the "Controller Test" and "Input Remap" buttons
- a **Fake controller** panel for visitors without a gamepad (new in this version; the online demo has it once it is republished): pick a family (Xbox, Xbox Elite, Xbox 360, DualShock 4, DualSense, Switch Pro, Steam Deck, Stadia, an unknown USB pad) and the page installs a simulated pad with that pad's real browser id, plus on-screen buttons that press its inputs while held. It is off by default and labelled as simulated; while it is on, real pads are hidden from the page.

To run it locally, from the repository root:

```bash
npm run build
npm run demo
```

and open `http://localhost:3001/dist/standalone-demo.html` (`npm run demo` serves the repository root on port 3001).

To publish it, copy `standalone-demo.html` and `bind-manager.min.js` into the same folder of any static host. Nothing deploys it automatically.

## Bundle size

`bind-manager.min.js` is 201,755 bytes minified (55,734 bytes gzip -9) at this version, up from 134,734 bytes (34,486 gzip) in 0.1.0, the last public build (`main-latest` of 2026-08-10). The growth is the built-in tools (the SVG controller view, the Debug and Profile editor panels), the eight gamepad families, the scale-unit stylesheet, the browser shortcut guard and the wheel notch counter. Measure your own build with `npm run build`; the numbers above are from the build of this tree.

## Rebuilding

```bash
npm run build        # both bundles, once
npm run build:watch  # rebuild on every source change
```

Details of the build (esbuild, IIFE, global name, target `es2020`) are in [scripts/README.md](../scripts/README.md#1-buildjs).

## Troubleshooting

- `window.BindManager` is undefined: the script path is wrong or the script runs after your own code. Check the network tab for a 404 and load the bundle first.
- The standalone demo logs "bind-manager.min.js is missing or invalid": build first, or copy the bundle next to the page.
- Source maps are not used in devtools: host `bind-manager.js.map` next to `bind-manager.js` and enable source maps in devtools.
- Nothing responds to input: check that the actions are registered and bound, and that the page has focus (keyboard events only reach a focused page). Gamepads only appear after a button press on most browsers.
