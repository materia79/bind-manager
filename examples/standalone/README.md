# Bind Manager in a Standalone Web App

This guide shows Bind Manager without ThreeJS, useful for tools, browser games, and interactive web apps.

## Run It

[index.html](index.html) in this folder is the example below as a runnable page. From the repository root:

```bash
npm run demo
```

and open `http://localhost:3001/examples/standalone/`. It imports the library from `../../src/index.js`; in your own project, import from `bind-manager` (or load the [bundle](../../dist/README.md) with a script tag).

## Minimal Example

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Bind Manager Standalone Example</title>
    <style>
      /* Optional: cap the UI scale. Min/max of the unit work on :root only;
         "html:root" wins over the library's :root rule, injected later. */
      html:root { --bm-u-max: 1.5px; }
    </style>
  </head>
  <body>
    <button id="open-binds">Key Bindings</button>
    <button id="open-tester">Controller Test</button>
    <pre id="log"></pre>

    <script type="module">
      import { createBindManager } from '../../src/index.js';

      const logEl = document.getElementById('log');
      const log = (...args) => {
        logEl.textContent += args.join(' ') + '\n';
      };

      const binds = createBindManager({
        namespace: 'standalone-example',
        debug: true,
        debugKey: 'F5',
        // Input Remap and Controller Test, opened from the bindings modal's footer
        builtInTools: true,
      });

      const save = binds.registerAction({
        id: 'save',
        label: 'Save',
        description: 'Save document',
        group: 'File',
        slots: 2,
        defaultBindings: ['KeyS', null],
        gamepadSlots: 1,
        defaultGamepadBindings: ['GP_B9'],
      });

      const open = binds.registerAction({
        id: 'open',
        label: 'Open',
        description: 'Open document',
        group: 'File',
        slots: 1,
        defaultBindings: ['KeyO'],
        gamepadSlots: 1,
        defaultGamepadBindings: ['GP_B0'],
      });

      save.showHint();
      open.showHint();

      save.onPressed(() => log('[action] save pressed'));
      open.onPressed(() => log('[action] open pressed'));

      binds.subscribe((event) => {
        if (event.type === 'binding-changed') {
          log('[bind]', event.actionId, event.device, 'slot', String(event.slot), '=>', String(event.newCode));
        }
      });

      document.getElementById('open-binds').addEventListener('click', () => binds.open());
      document.getElementById('open-tester').addEventListener('click', () => binds.openControllerTest());

      log('Example ready. Press F5 or click "Key Bindings".');
    </script>
  </body>
</html>
```

The runnable page adds a few page styles around this.

## Common App Patterns

- Register actions during app boot.
- Use action handlers (`onPressed`, `onReleased`, `onHeld`) instead of direct key code checks in feature modules, or poll `isActionPressed(actionId)` in a loop.
- Listen to `subscribe` when your app needs to persist custom control presets elsewhere; `exportBindings()` / `importBindings()` move them as JSON.
- Use `clearBinding(actionId, slot, device)` to remove a secondary key (or a gamepad binding with `'gamepad'`) without resetting defaults.
- Read `getStorageStatus()` if your app must know that saving failed (private mode, full storage).

## Programmatic Operations

```js
// open/close/toggle modal, open a built-in tool
binds.open();
binds.close();
binds.toggle();
binds.openInputRemap();
binds.openControllerTest();

// inspect and mutate bindings ('keyboard' covers keyboard and mouse codes)
const saveSlots = binds.getBinding('save');             // ['KeyS', null]
const savePad = binds.getBinding('save', 'gamepad');    // ['GP_B9']
const all = binds.getBindings();

binds.setBinding('save', 1, 'ControlLeft+KeyS');
binds.setBinding('save', 0, 'GP_B3', 'gamepad');
binds.clearBinding('save', 1);
binds.resetAction('save');
binds.resetAll();

// hints
binds.showHint('save');
binds.hideHint('save');
binds.showAllHints();
binds.hideAllHints();

// cleanup
binds.destroy();
```

`subscribe` receives `binding-changed` events (`device`, `actionId`, `slot`, `oldCode`, `newCode`, `conflicts`) and `reset` events.

## Accessibility and UX Tips

- Add your own settings/menu button that calls `binds.open()` so users do not rely only on debug hotkeys.
- Keep action labels short and descriptive; these labels are used in modal and hint UI.
- Group related actions (`Movement`, `Combat`, `UI`) for easier rebinding navigation.
- The UI scales with the viewport (`--bm-u`); set `--bm-u: 1px` on an ancestor for fixed sizes, or `--bm-font-*` for your own text sizes (root README, "Sizing and Theming").
  <!-- STATUS AT THIS VERSION: being changed; replace this note when it is. -->
  Status at this version: the built-in tools' text follows only a `--bm-u` set on `:root` and ignores `--bm-font-*`.
  <!-- END STATUS -->
