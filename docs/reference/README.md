# Reference Assets

This folder contains read-only reference artifacts used during controller support audits.

## DualSense WebHID Tester

- File: `dualsense-webhid-tester.html`
- Source snapshot: copied from `dist/dualsense_tester/tester.html`
- Purpose: protocol-level reference for DualSense HID reports and advanced signals.

### Important scope boundary

This file is not used by Bind Manager runtime input.

Primary runtime path remains browser Gamepad API for:
- cross-browser compatibility
- simple no-prompt input flow
- core binding behavior (buttons, triggers, sticks, D-pad)

Use this reference only for:
- understanding HID report fields
- comparing advanced features not exposed in standard Gamepad API
- future optional diagnostics work (Chromium-only, opt-in)
