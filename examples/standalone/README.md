# Bind Manager in a Standalone Web App

This guide shows Bind Manager without ThreeJS, useful for tools, browser games, and interactive web apps.

## Minimal Example

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Bind Manager Standalone Example</title>
  </head>
  <body>
    <button id="open-binds">Key Bindings</button>
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
      });

      const save = binds.registerAction({
        id: 'save',
        label: 'Save',
        description: 'Save document',
        group: 'File',
        slots: 2,
        defaultBindings: ['ControlLeft', null],
      });

      const open = binds.registerAction({
        id: 'open',
        label: 'Open',
        description: 'Open document',
        group: 'File',
        slots: 1,
        defaultBindings: ['KeyO'],
      });

      save.showHint();
      open.showHint();

      save.onPressed(() => log('[action] save pressed'));
      open.onPressed(() => log('[action] open pressed'));

      binds.subscribe((event) => {
        if (event.type === 'binding-changed') {
          log('[bind]', event.actionId, 'slot', String(event.slot), '=>', String(event.newCode));
        }
      });

      document.getElementById('open-binds').addEventListener('click', () => binds.open());
    </script>
  </body>
</html>
```

## Common App Patterns

- Register actions during app boot.
- Use action handlers (`onPressed`, `onReleased`) instead of direct key code checks in feature modules.
- Listen to `subscribe` when your app needs to persist custom control presets elsewhere.
- Use `clearBinding(actionId, slot)` to remove secondary keys without resetting defaults.

## Programmatic Operations

```js
// open/close/toggle modal
binds.open();
binds.close();
binds.toggle();

// inspect and mutate bindings
const jumpSlots = binds.getBinding('jump');
const all = binds.getBindings();

binds.setBinding('jump', 0, 'Space');
binds.clearBinding('jump', 1);
binds.resetAction('jump');
binds.resetAll();

// hints
binds.showHint('jump');
binds.hideHint('jump');
binds.showAllHints();
binds.hideAllHints();

// cleanup
binds.destroy();
```

## Accessibility and UX Tips

- Add your own settings/menu button that calls `binds.open()` so users do not rely only on debug hotkeys.
- Keep action labels short and descriptive; these labels are used in modal and hint UI.
- Group related actions (`Movement`, `Combat`, `UI`) for easier rebinding navigation.
