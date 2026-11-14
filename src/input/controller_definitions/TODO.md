# Controller Definitions TODO

Open work on captures, the generator and hardware verification. Items are checked against the code of this tree.

## Done

- [x] Re-capture or normalize `captures/054c-0ce6_PS5.json` so `captures[*].expectedCode` matches the PlayStation face-button semantics. All 27 `sequence` and `captures` codes agree; the generated profile maps Cross to raw button 1 and Square to raw button 0 (asserted in `tests/input/gamepad-profile-gating.test.js`).
- [x] Processor warning for a sequence/capture `expectedCode` mismatch (`validateCaptureSanity` in `scripts/process-controller-defs.js`).
- [x] Processor unit tests (`tests/scripts/process-controller-defs.test.js`): fixture capture, a capture without `targetController`, the D-pad hat conversion, Chrome-form ids, no vendor-only fallback in the registry.
- [x] Exact profiles apply only to pads they fit (`mapping !== 'standard'`, equal raw button/axis counts); runtime gating test with the real registry (`tests/input/gamepad-profile-gating.test.js`).
- [x] Hat D-pad diagonals decoded on the 2/7 grid (`isHatGridLayout`, `isHatEntryActive` in `../gamepad-runtime.js`).
- [x] A raw -> logical -> label trace per active control: the Controller Test's Debug panel (last signal with the resolved code and label, active codes, raw table).
- [x] Document the capture workflow: [README.md](README.md#adding-a-controller-profile).

## No longer applicable

- Trigger and PS-button disambiguation in the PS5 sample: PS is raw button 12, the triggers are buttons 6/7 plus axes 3/4; only the D-pad shares axis 9, as the hat it is.
- A capture-rewrite helper for edited `sequence` codes: the sample is consistent and the mismatch warning exists.

## Open

<!-- STATUS AT THIS VERSION: being fixed; tick or remove when it is. -->
- [ ] Record `gamepad.mapping` in the capture JSON and warn (in Input Remap and in the generator) when a capture comes from a pad with `mapping: 'standard'`. Today such a capture produces a profile that never applies, and as the newest capture of an existing device it replaces that profile's `sourceButtons`/`sourceAxes`, so the raw profile stops applying.
- [ ] Warn when a generated profile has no `sourceButtons`/`sourceAxes` (a capture without `targetController`): it can never apply.
- [ ] A touchpad step (`GP_B17`) in the DualSense preset, and a re-capture of `054c-0ce6`: the shipped raw profile has no touchpad mapping (raw button 13 is unmapped).
- [ ] More capture presets (Xbox, Switch Pro, …) and a family taken from the preset or the detected family instead of the hard-coded `dualsense`; steps for `GP_B18`..`GP_B23` where a pad has them.
- [ ] Make Input Remap's validation match the generator's: a step without a detected input passes the tool's check but fails the generator (`<code>: detected mapping is missing`); the tool's own id parser (`parseControllerId` in `src/ui/tools/capture-payload.js`) reads Chrome ids and Firefox ids with 4-digit vendor/product, but not the zero-stripped Firefox form (`54c-ce6-…`) that `parseGamepadId` accepts, so such a pad gets "Controller id does not expose a vendor/product pair".
- [ ] A path from the Controller Test's Download JSON (an edited profile definition) to a shipped profile, or a clear statement in the tool that it is not one.
- [ ] Merging a re-capture into an existing profile never drops codes the new capture lacks; decide whether it should.
- [ ] Optional `--strict` flag for the generator to fail on repeated physical-input collisions for critical controls.
- [ ] Generator tests for dedupe, merge, stale-file removal and the all-or-nothing write.
- [ ] Hardware verification with a real DualSense (Firefox raw layout and Chrome standard mapping): face buttons, D-pad and diagonals, PS, triggers, manual profile override.
- [ ] Add the Xbox Elite paddle labels (`GP_B17`..`GP_B20` of `GAMEPAD_LABEL_VARIANTS['xbox-elite']`) to the unverified list: they come from research, not from hardware.
- [ ] Verify the labels in `GAMEPAD_UNVERIFIED_LABELS` (`../gamepad-profiles.js`) on hardware: Xbox `GP_B17` (Share outside Chrome on Windows), Steam `GP_B17`..`GP_B23` (back-button order, the 2026 Steam Controller), Stadia `GP_B17`/`GP_B18` (Assistant and Capture may be swapped).
- [ ] Dead code in `src/ui/tools/capture-payload.js`: `normalizePayloadForProcessing` has no callers, and `getPayloadOverrideMapping` and `toDetectedFromMappingEntry` are called only from inside it; the comment in `scripts/process-controller-defs.js` about "tester edit-mode exports" refers to that old format.
