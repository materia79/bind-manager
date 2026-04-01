# Controller Definitions TODO

This file tracks remaining work after the profile resolver, runtime label integration, manual override support, and demo profile controls were implemented.

## Immediate follow-up

- [ ] Re-capture or normalize `captures/054c-0ce6_PS5.json` so `captures[*].expectedCode` matches intended PlayStation face-button semantics.
  - Current issue: `sequence[*].expectedCode` was updated, but the processor uses `captures[*].expectedCode` for generated mappings.
  - Result: generated `profiles/054c-0ce6.js` still maps labels based on old expected codes.

- [ ] Keep and use the new processor warning for sequence/capture mismatch.
  - `process-controller-defs.js` now warns when `sequence.expectedCode` differs from `captures.expectedCode` at the same step.
  - Treat these warnings as actionable during capture QA.

## Capture quality hardening

- [ ] Improve trigger and PS-button disambiguation in Input Debug captures.
  - Current PS5 sample still shows shared axis use (`GP_B6`/`GP_B7` and several D-pad/PS signals on axis 9).
  - Add capture guidance and/or post-capture checks to reduce ambiguous mappings.

- [ ] Add stricter validation mode to fail on severe ambiguity.
  - Optional CLI flag idea: `--strict` to fail on repeated physical input collisions for critical controls.

## Processing and test coverage

- [ ] Add processor unit tests for capture-to-profile generation.
  - Include fixtures for:
    - sequence/captures expected-code mismatch warning
    - D-pad hat heuristic conversion
    - family metadata propagation
    - duplicate capture dedupe behavior

- [ ] Add integration test for generated profile label correctness.
  - Assert that `labels` and `mapping` reflect the intended expected-code scheme from capture fixtures.

## Demo/manual verification

- [ ] Run hardware verification pass with DualSense after capture cleanup.
  - Validate in demo tester and Bind Manager modal:
    - Square lights/labels as Square
    - Cross lights/labels as Cross
    - D-pad directions map correctly
    - Manual profile override still behaves correctly

- [ ] Document known-good capture workflow in README screenshots or short checklist.

## Optional next steps

- [ ] Add a small capture-rewrite helper script that can remap expected codes when only sequence values were edited manually.
- [ ] Add a dedicated profile diagnostics panel in demo for raw -> logical -> label trace per active control.
