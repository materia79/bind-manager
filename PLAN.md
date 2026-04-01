# Bind Manager Plan and Status

## Goal

Build a universal browser bind manager that works for ThreeJS and non-ThreeJS apps, with a built-in modal and hints overlay, while keeping the core API renderer-agnostic.

## Current Status (April 2026)

### Done

- Core API implemented via `createBindManager`.
- Action registration supports:
	- `id`, `label`, `description`, `group`
	- `slots` per action
	- default bindings
- Runtime input manager implemented for keyboard:
	- `pressed`, `held`, `released` action events
	- query support via `isActionPressed`
- Runtime input manager implemented for browser Gamepad API:
	- logical action events for digital buttons and analog axes
	- generated exact controller profiles with family and generic fallback labels
	- controller-specific label rendering in modal and hints when profile matches
	- import/export flow for bindings including gamepad codes
- Modal UI implemented:
	- grouped action rows
	- per-slot rebinding capture
	- conflict warnings (warn, do not block)
	- per-action reset and reset-all
	- per-slot clear (delete binding without resetting action)
	- capture locking (single active capture session)
	- capture-safe controls (reset and clear actions disabled while capturing)
	- capture cancel visual state fixed (no stale yellow glow)
- Bottom hints overlay implemented:
	- per-action show/hide handle
	- manager-level show/hide all
	- updates after rebinding
- Persistence implemented:
	- localStorage adapter
	- namespaced keys
	- versioned payload
- Debug mode implemented:
	- configurable debug toggle key (default `F5`)
- Docs and usage examples implemented:
	- root README
	- ThreeJS integration README
	- standalone integration README
	- runnable demo page

### Missing for a stronger v1

- Mouse input device support is not implemented.
- Advanced DualSense-only sensors/effects are not part of core runtime:
	- gyroscope and accelerometer streams
	- touchpad point telemetry
	- adaptive trigger effect programming
- Optional Chromium-only WebHID diagnostics are not integrated into the main UX.
- No release packaging pipeline yet (bundle variants, changelog/release automation).
- No accessibility verification pass yet (screen reader and keyboard-only audit).

## Gap Check Against Original Requirements

### Initial release requirements

- Modal for configuring binds: done.
- Action groups and descriptions: done.
- Keyboard input support: done.
- Gamepad input support (browser Gamepad API): done.
- Multiple binds per action (usually two): done.
- Reset to defaults: done.
- Key naming support: done.
- Per-action hint controls: done.
- Listen for binding changes: done.
- Optional runtime input manager behavior: done for keyboard.

### Future requirements from original notes

- Export/import JSON: done.
- Hint visibility controls: done (per-action and bulk).

## Next Milestones

### Milestone 1: Quality and stability (recommended next)

- Add and maintain unit tests for:
	- key mapping/labeling
	- binding assignment and conflict detection
	- clear/reset flows
	- storage round-trip
- Add and maintain browser integration tests for modal/hints behavior.
- Manual QA checklist added in `QA_CHECKLIST.md`; execute before release.

### Milestone 2: Data portability

- JSON export API implemented.
- JSON import API implemented with validation and import report.
- Merge and replace import strategies implemented.

### Milestone 3: Input device expansion

- Add mouse binding support.
- Expand gamepad/controller quality and profile coverage.

### Milestone 4: Optional advanced controller diagnostics

- Keep Gamepad API as primary runtime path for rebinding.
- Add optional WebHID-only diagnostics page for advanced telemetry (Chromium-only).
- Keep optional diagnostics isolated from core binding and gameplay input path.

## Future Feature Backlog

### Controllers and gamepad support

- PlayStation controller mapping:
	- DualShock 4 and DualSense button/axis naming presets
	- PS glyph labels (Cross, Circle, Square, Triangle, L1, R1, etc.)
- Xbox controller mapping:
	- Xbox One / Series button/axis naming presets
	- Xbox glyph labels (A, B, X, Y, LB, RB, etc.)
- Generic gamepad fallback profile when vendor map is unknown.
- Left/right stick axis bindings with deadzone and sensitivity settings.
- Trigger threshold configuration (for analog triggers).
- Per-device profile switching for multi-controller setups.
- Controller disconnect/reconnect handling and UI feedback.
- Optional advanced telemetry (future, opt-in only):
	- gyro and accelerometer readouts
	- touchpad point diagnostics
	- battery and extra device metadata where available

### Input system features

- Combo/chord bindings (for example `Shift + W`).
- Context-based action maps (gameplay vs menu vs dialogue).
- Temporary input layers (hold-to-modify behavior).
- Action priority and consume-propagation rules.

### UX and accessibility

- Built-in search/filter in modal for large action lists.
- Category collapse/expand state persistence.
- Full keyboard-only modal navigation with explicit focus states.
- Improved accessibility labels and screen-reader announcements.
- High-contrast and color-blind-friendly style presets.

### Data and integration

- Import/export JSON with schema version migration.
- Optional cloud sync adapter interface.
- Preset management (default, alternate, custom profiles).
- User-level and character-level bind profiles.

### Developer experience

- TypeScript declaration files for stronger editor support.
- Event debugging panel for action stream inspection.
- Performance benchmarks for large action sets.
- CI pipeline for lint, test, and release checks.

## Suggested Immediate Order

1. Add tests and QA checklist.
2. Implement JSON export/import.
3. Expand hardware validation coverage for exact generated profiles and fallback paths.
4. Add context action maps and combos.
