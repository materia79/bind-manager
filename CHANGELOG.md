# Changelog

All notable changes to bind-manager are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/) (in 0.x, a minor version may change behaviour).

## [Unreleased]

## [0.2.2] - 2026-11-21

### Added

- **Search in the Key Bindings modal.** A field between the header and the list filters it while the player types: every word must occur in the action's label, description or group, or in a binding label as its button shows it (keyboard, mouse and gamepad, under the active profile). Case and accents do not count. Rows and empty groups are hidden in place, out of the Tab order and the focus trap; a line names the text when nothing matches, and a polite live region announces the number of matches. Escape clears the text first and closes the modal on an empty field. The text survives `refresh()` and is cleared on close. On touch screens the field's text is at least 16px (no iOS focus zoom). See the README, section [Searching the bindings](README.md#searching-the-bindings).
- **New option** `bindSearch` (default `true`); `false` renders the modal as in 0.2.1.
- **Foldable groups in the Key Bindings modal.** Each group title is a button (`aria-expanded`, `aria-controls`) that folds its rows, with a marker and a bound / total count that follows binding changes. The player's choice is remembered per namespace in its own key, `bind-manager:<namespace>:collapsed-groups` (`{ version: 1, groups: { name: boolean } }`); the bindings key is unchanged. A search shows matches inside folded groups, and a header click during a search lasts for that search only. Reset All keeps the fold state; `clearStorage()` deletes the stored one. See the README, section [Folding groups](README.md#folding-groups).
- **New options** `groupFolding` (default `true`) and `collapsedGroups` (default `[]`, groups that start folded; the player's choice wins). **New methods** `manager.setGroupCollapsed(group, collapsed)` and `manager.isGroupCollapsed(group)`; `LocalStorageAdapter` gains `loadCollapsedGroups()` and `saveCollapsedGroups(groups)`, which custom adapters may implement too.

### Fixed

- **Escape that closes the Key Bindings modal no longer fires a game action.** An action bound to Escape (a pause menu, say) fired as the modal closed, because gameplay was live again by the time the key reached the keyboard runtime. The modal now stops that Escape there; this holds with the search off too. A host's own window-level `keydown` listener therefore no longer sees the Escape that closes the modal; use `onActiveChange` to learn that it closed.
- A debug toggle key that types a character (`debugKey: 'KeyK'`, for example) no longer toggles the modal while the player types into its search field.

## [0.2.1] - 2026-11-21

### Added

- **Reserved keys.** The rebind dialog adds a note when the player binds a key the browser or the operating system keeps for itself; binding is still allowed. A conflict note, if any, comes first, and the note's full text is in its title. There are three levels:
  - `blocked`: never reaches the page.
  - `fullscreen-only`: reaches the page only while it is fullscreen in a Chromium browser. This covers Chromium's tab and window shortcuts, and Alt+Tab (exactly Alt, on a platform known not to be a Mac) while the browser guard's Keyboard Lock locks Tab.
  - `unreliable`: works in some browsers or situations only.
- **New API:**
  - `getReservedInfo(code, { guard, platform, bound })` and `isReservedCode(code, options)`;
  - `manager.getReservedBindings()`;
  - the option `reservedKeyWarnings` (default `true`);
  - `FULLSCREEN_ONLY_SHORTCUTS`, the browser guard's tab and window shortcuts. It is part of `DEFAULT_BLOCKED_SHORTCUTS`, which is unchanged.
- **The browser guard's real decision counts:**
  - its lists, `allow`, and `blockBound` for a bound key;
  - whether it is enabled at all (the default is disabled, and then nothing is cancelled);
  - its Keyboard Lock settings, through a new read-only method of the guard class, `getKeyboardLockSettings()`. The manager uses it internally; the `browserGuard` facade is unchanged.

  A shortcut the guard lets through reads "The browser guard lets X through, so the browser also acts on it."
- **Other rules:**
  - Browser commands nothing cancels (Ctrl+S, Ctrl+R, F5, Ctrl+wheel, …, and Cmd combos on a Mac) are `unreliable`. One rule decides this for every platform: the guard is disabled, or it lets the key through.
  - Under the guard's Keyboard Lock, exactly the combos the README's Keyboard Lock section names change level while their key is locked, only with exactly their modifiers and only on their platform: on a Mac, Cmd+Tab becomes `unreliable`; on a platform known not to be a Mac, Alt+Tab becomes `fullscreen-only`, and Alt+F4 and the bare Windows key (no other modifier held) become `unreliable`. When the platform is unknown the lock changes no level. Everything else keeps the level it has without the lock; for example Alt+Shift+Tab, Ctrl+Alt+Tab, Ctrl+Alt+F4, Cmd+Shift+Tab, Alt+Tab on a Mac, Win + any key (also Win+Alt+Tab), Ctrl+Shift+Q, Cmd+Q, the Esc combos, Cmd+Space, Cmd+H and Ctrl+Alt+Del stay `blocked`.
  - Windows-key combos depend on the detected platform: on a Mac, Cmd through the guard's `Mod` logic, and the bare Command key is `unreliable`; elsewhere `blocked`; when the platform is unknown, `unreliable`, except a combo that holds one of the `blocked` combos (its key with at least its modifiers): Win/Cmd + Q, Tab, Space or H, or any other `blocked` combo with the Windows / Command key added, such as Win+Alt+F4, Ctrl+Win+Esc or Ctrl+Alt+Win+Del. Those stay `blocked` there, also with more modifiers held.
  - The browser's tab and window shortcuts never count as `fullscreen-only` with Alt held (Ctrl+Alt is AltGr on many layouts). The only Alt combo that can be `fullscreen-only` is Alt+Tab with exactly Alt held, under the guard's Keyboard Lock, on a platform known not to be a Mac.
  - Escape, F11 and F12 count with any modifiers.
- **With the default setup (browser guard disabled), common game keys now get a note.** A bound F1, F3, F5, F6, F7 or F10, Ctrl+S, Ctrl+R, Ctrl+L, Ctrl+D, Ctrl+P, Ctrl+F, Ctrl+G, Ctrl+H, Ctrl+J, Ctrl+U, Ctrl+O, the zoom keys Ctrl+= / Ctrl+− / Ctrl+0 (also on the numpad) and Ctrl+wheel get an `unreliable` note in the rebind dialog ("The browser may have its own shortcut on it. Nothing cancels it…"). This holds also with Shift held (Ctrl+Shift+J and Ctrl+Shift+P get their own `unreliable` note instead), and for the function keys also with Ctrl held, but not with Alt held. On a Mac the Cmd versions get the note, and so does every other Cmd combo nothing cancels. Binding still works. `reservedKeyWarnings: false` turns the notes off; enabling the browser guard, which cancels bound keys by default, removes the browser-command notes.

  See the README, section [Reserved keys](README.md#reserved-keys). The macOS entries are not verified on a real Mac.

## [0.2.0] - 2026-11-19

The first release after 0.1.0. The UI and the built-in tools were rebuilt, the gamepad support grew from three families to eight, and many input bugs were fixed. The public API only gained exports: none were removed. Several behaviours a host can notice did change, though, so read the upgrade notes first. The full list is in the README, section [Upgrading from 0.1.0](README.md#upgrading-from-010).

### Upgrade notes

- **Analog events carry `code`, and half-axis analog actions get only their half.**
  - An analog action bound to one half of an axis (`GP_A0N` or `GP_A0P`) now gets only that half: the value is clamped to `[-1, 0]` or `[0, 1]`. An action bound to both halves gets the full value. 0.1.0 sent the full signed value to every action on either half.
  - Its `analog` events carry `code` (the half's code). For an action bound to both halves, `code` is present but `undefined`.
  - Within one poll, `analog` events come before the `pressed`/`held` of the same axis. A manager-wide `onAnyAction` handler that treats every type other than `pressed`/`held` as "up" and keys its state by `e.code` therefore sees that half go up and down on every frame. Skip `type === 'analog'` in such a handler, and read analog values with the action handle's `onAnalog()`.
- **A final analog 0.** An analog action whose value returns to 0 gets exactly one `analog` event with value 0. So does every non-zero analog action when the bindings modal opens or the pad disconnects. 0.1.0 left the last value standing.
- **Releases and latching.** Opening the bindings modal and disconnecting a pad fire `released` for every pressed gamepad code. An input still held when gameplay resumes stays silent until it is released and pressed again. `destroy()` fires `released` (with `originalEvent: null`) for held keyboard and mouse bindings.
- **Controller families and labels.**
  - DualShock 4 pads are no longer labelled as DualSense.
  - Xbox 360-era pads get the new `xbox360` family.
  - An unknown Microsoft or Sony vendor/product pair is `generic`.
  - Xbox labels changed: View, Menu, LS and RS instead of Back, Start, L3 and R3.
  - `GP_CODES` and `GAMEPAD_PROFILES` have more entries (32 codes and 8 families). Code that iterates them sees the new ones.
- **Exact profiles apply only to a pad they fit**: not standard-mapped, with equal raw button and axis counts. A manual exact override saved by 0.1.0 that does not fit is ignored (reported in `ignoredOverride`), and the pad uses its family. Profile overrides are stored under a `vendor-product` key. Overrides saved by 0.1.0 are still read.
- **Import.**
  - `importBindings()` accepts payload versions 1 and 2 only.
  - Merge mode no longer clears a device whose field is missing from an entry.
  - Replace mode reports unregistered ids in the new `storedUnregisteredActions` / `droppedUnregisteredActions` lists instead of `skippedUnknownActions`.
- **`registerAction()` throws** when `slots` or `gamepadSlots` is not a positive integer.
- **Styling.**
  - Every size is on the viewport scale unit `--bm-u`.
  - `--bm-modal-width`, `--bm-modal-max-h` and `--bm-modal-radius` are no longer declared on `:root` and have new defaults.
  - Borders are box-shadows, so `border-color` overrides no longer apply.
  - Some modal and tool classes were removed (listed in the README under "Removed classes and markup").
  - Host CSS written against the 0.1.0 markup needs a look.
- **Built-in tools instead of the demo's copies.** The demo's legacy hand-written copies of the input debugger and the controller tester are gone. If you copied them from the demo, switch to the library's built-in tools (`builtInTools`, with `openInputRemap()` and `openControllerTest()`). The Input Debugger is now titled "Input Remap".
- **Mouse.** The window wheel listener is passive unless a wheel code is bound during gameplay or a capture runs. Wheel bindings fire once per notch instead of once per raw wheel event. Window blur releases held mouse buttons.
- **Packaging.** `package.json` now declares `files`, `sideEffects: false` and `engines` (`node` `^20.19.0 || >=22.12.0`).

### Added

- **The UI/UX round:**
  - A viewport scale unit (`--bm-u`, with `--bm-font-*` overrides) that sizes the modal, the hint bar and the tools from 390x844 up to 2560x1440.
  - Three row layouts for the bindings modal, chosen by width.
  - A centred hint bar capped at three rows.
  - Visible focus outlines.
- **Controller Test, rebuilt** with an SVG controller view per family, and Debug and Profile editor toggles. The Profile editor edits mappings in memory, with "Reset edits". It shows exactly what the runtime dispatches while gameplay is active.
- **Input Remap** (the guided controller capture):
  - It records the browser's `mapping`, and refuses and explains a pad that already reports the standard layout.
  - It follows the pad that is connected, and drops a stale run when the pad changes.
  - It has an optional Touchpad click step.
- **Five new controller families** (`xbox360`, `dualshock4`, `switch-pro`, `steam`, `stadia`), detected by vendor/product id in both Chrome and Firefox id forms. Elite controllers label their paddles; 24 buttons (`GP_B0`..`GP_B23`) are read and dispatched.
- **New exports and methods:** `getGamepadThresholds()`, `getGamepadLogicalState(index)`, `resetGamepadProfileMapping()`, `getStorageStatus()`, `clearStorage()`, `isGamepadLabelUnverified(code, family, variant)`, and the new resolved-profile fields (`displayName`, `vendorId`, `productId`, `labelVariant`, `ignoredOverride`).
- **An opt-in browser shortcut guard** (`browserGuard`) with Keyboard Lock and a leave-site guard. Nothing changes unless you enable it.
- **Wheel notches:** `WheelNotchCounter`, `DEFAULT_WHEEL_PIXEL_THRESHOLD` and the `wheelPixelThreshold` option.
- **When an action gains slots** after its bindings were saved, the new slots take their defaults.

### Changed

- **The bindings modal** is 1080u wide and fits small screens. `open()` on an open modal does nothing. Tab stays inside the modal and the capture dialog, and focus returns to the opener on close.
- **While a built-in tool is open,** Escape and Tab go to the topmost tool dialog, and only one tool is open at a time.
- **Gamepad capture** ignores inputs already held when it starts.
- **Hat D-pad diagonals** press both directions.
- **A mapped button** counts as pressed by the same rule as an unmapped one.
- **`getGamepadLabel(code)`** without an index uses the first connected pad.
- **Failed saves are visible:** one console warning, and `getStorageStatus()`. `LocalStorageAdapter.save()` returns `true` or `false`.
- **The minified bundle** grew from 134,734 to 205,235 bytes (about 56.8 kB with `gzip -9`).

### Fixed

- **Input state:** no lone `released` after the modal or a capture; Escape cancelling a keyboard capture clears the held keys; holding the debug key no longer toggles the modal on every key repeat.
- **Lifecycle:** `isActionPressed()` honours `playerIndex`; `destroy()` closes the modal first, so `active` ends `false`.
- **Storage:** `resetAll()` writes storage once; saved bindings of actions that register later are kept; action ids such as `__proto__` or `constructor` work.
- **Gamepad:** gamepad listeners are registered once; stored profile overrides are validated on load; a profile edit on a pad without an exact profile no longer unmaps the rest of the pad.
- **Tools:** dynamic values in the tools' markup are escaped.
- **Input Remap and the generator:**
  - The generator reads existing profiles whose data contains a `;`.
  - It refuses a capture that would change an existing profile's raw layout unless `--replace-layout` is given.
  - An unchanged regeneration leaves files untouched.
- **Mouse:** the context menu no longer swallows a bound right button's release; a right press inside a text field or the bind-manager UI dispatches nothing.

### Removed

- **From the demo:** the unused legacy copies of the debugger and the controller tester. The library's built-in tools are unchanged; use them instead.

### For contributors

- **A pre-push hygiene guard** (`npm run setup:git`, `scripts/pre-push.mjs`). It scans everything that would become public for secrets, private paths, private names and unlisted e-mails.
  - It asks the public remote what it already has.
  - It refuses a push when that question would go to another repository.
  - It refuses a push when the installed guard is older than the checkout's.
  - `npm run hygiene` runs its tests and the tree, bundle and package scans.
- **`docs/RELEASING.md`** describes the release gate and its limits.
- **CI** runs on pull requests to `main` and publishes the `main-latest` build only on pushes to `main`.

## [0.1.0] - 2026-08-10

The last public build before this changelog: the `main-latest` bundle of the public `main` branch.
