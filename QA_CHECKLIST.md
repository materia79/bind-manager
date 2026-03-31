# Bind Manager QA Checklist

Use this checklist before tagging a release.

## Core Behavior

- [ ] Register actions with defaults and verify they appear in modal grouped correctly.
- [ ] Multiple slots per action render correctly.
- [ ] Per-slot clear button removes only that slot binding.
- [ ] Reset action restores action defaults.
- [ ] Reset all restores all defaults.

## Capture Safety

- [ ] Only one capture can be active at a time.
- [ ] Other bind buttons are disabled while capturing.
- [ ] Reset controls are disabled while capturing.
- [ ] Escape cancels capture without changing binding.
- [ ] Capture highlight is removed after cancel.

## Conflict Handling

- [ ] Assign same key to multiple actions and verify warning appears.
- [ ] Verify duplicate assignment is still applied (warn, not block).

## Runtime Input

- [ ] `pressed` events fire once on initial keydown.
- [ ] `held` events fire on repeated keydown.
- [ ] `released` events fire on keyup.
- [ ] Opening modal suppresses gameplay dispatch.
- [ ] Closing modal restores gameplay dispatch.

## Hints Overlay

- [ ] Per-action `showHint` and `hideHint` work.
- [ ] `showAllHints` and `hideAllHints` work.
- [ ] Hint labels update after rebinding.

## Persistence

- [ ] Rebind keys, reload page, verify values persist.
- [ ] Namespace isolation works across two manager namespaces.

## JSON Export/Import

- [ ] `exportBindings()` returns versioned payload with bindings.
- [ ] `importBindings(payload)` in merge mode updates only provided actions.
- [ ] `importBindings(payload, { mode: 'replace' })` clears missing known actions.
- [ ] Unknown actions in import payload are reported as skipped.
- [ ] Invalid payload yields import report with `invalidEntries`.

## Debug Toggle

- [ ] In debug mode, pressing configured debug key toggles modal.
- [ ] In non-debug mode, debug key does not toggle modal.

## ThreeJS Overlay Compatibility

- [ ] Modal appears above canvas and is interactive.
- [ ] Bottom hints appear above canvas and do not block gameplay pointer interaction.
- [ ] Focus behaves correctly when opening/closing modal during gameplay.
