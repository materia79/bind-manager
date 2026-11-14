/**
 * Injects the Bind Manager stylesheet into document.head once.
 * Using a JS module avoids import-assertions/CSS-modules which aren't universally
 * supported in browser-native ESM without a bundler.
 */

const CSS = `
/* ================================================================
   Bind Manager — base styles
   Customise via CSS custom properties on any ancestor element or :root

   Every length is a multiple of --bm-u (1px at 1920x1080, scales with the
   viewport, clamped to [--bm-u-min, --bm-u-max]), so the UI looks the same on
   any resolution with the same aspect ratio. Set --bm-u: 1px for fixed sizes.
   Borders are drawn as box-shadow rings so they never shift the layout.
   ================================================================ */

:root {
  --bm-z-modal:  9000;
  --bm-z-capture:  9010;
  --bm-z-hints:  8000;

  --bm-overlay-bg:   rgba(0, 0, 0, 0.75);
  --bm-modal-bg:     #1e1e2e;
  --bm-modal-border: #3a3a5c;
  --bm-modal-radius: calc(12 * var(--bm-u));
  --bm-modal-width:  calc(880 * var(--bm-u));
  --bm-modal-max-h:  calc(880 * var(--bm-u));

  --bm-text-primary:   #e0e0f0;
  --bm-text-secondary: #9090b0;
  --bm-text-desc:      #6a6a90;

  --bm-group-bg:     #16162a;
  --bm-group-border: #2a2a44;
  --bm-row-hover:    #252540;

  --bm-accent:         #5c7cfa;
  --bm-accent-hover:   #748cfb;
  --bm-accent-active:  #4a6ae8;

  --bm-btn-bg:         #2a2a44;
  --bm-btn-hover:      #343460;
  --bm-btn-border:     #3a3a60;

  --bm-capture-bg:     #3a2a00;
  --bm-capture-border: #c89000;
  --bm-capture-text:   #ffd060;

  --bm-reset-color:    #e06060;
  --bm-reset-hover:    #f07070;

  --bm-warn-bg:        #2e1e00;
  --bm-warn-border:    #a06000;
  --bm-warn-text:      #ffa040;

  --bm-hints-bg:       rgba(10, 10, 25, 0.85);
  --bm-hints-border:   rgba(255, 255, 255, 0.08);
  --bm-hint-key-bg:    rgba(255, 255, 255, 0.12);
  --bm-hint-key-border:rgba(255, 255, 255, 0.22);

  --bm-u-min: 0.6667px;
  --bm-u-max: 2px;
  --bm-u: clamp(var(--bm-u-min), min(100vw / 1920, 100vh / 1080), var(--bm-u-max));
  --bm-fs-xs: max(9px, calc(14 * var(--bm-u)));
  --bm-fs-s: max(10px, calc(15 * var(--bm-u)));
  --bm-fs-m: calc(17 * var(--bm-u));
  --bm-fs-l: calc(21 * var(--bm-u));
}

.bm-overlay,
.bm-overlay *,
.bm-overlay *::before,
.bm-overlay *::after,
.bm-capture-overlay,
.bm-capture-overlay *,
.bm-hints,
.bm-hints * {
  box-sizing: border-box;
}

:where(.bm-overlay, .bm-capture-overlay) :where(button, select) {
  margin: 0;
  border: 0;
  font-family: inherit;
  font-size: var(--bm-fs-m);
  line-height: 1.2;
}

.bm-overlay :focus-visible,
.bm-capture-overlay :focus-visible {
  outline: calc(2 * var(--bm-u)) solid var(--bm-accent);
  outline-offset: calc(2 * var(--bm-u));
}

/* ---- Overlay ---- */
.bm-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--bm-z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bm-overlay-bg);
  /* Use pointer-events so the canvas behind is clickable when overlay is hidden */
  pointer-events: all;
}

/* ---- Modal container ---- */
.bm-modal {
  background: var(--bm-modal-bg);
  border-radius: var(--bm-modal-radius);
  width: var(--bm-modal-width);
  max-width: calc(100vw - 32 * var(--bm-u));
  max-height: var(--bm-modal-max-h);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow:
    0 0 0 1px var(--bm-modal-border),
    0 calc(24 * var(--bm-u)) calc(64 * var(--bm-u)) rgba(0, 0, 0, 0.6);
  font-family: system-ui, -apple-system, sans-serif;
  font-size: var(--bm-fs-m);
  line-height: 1.3;
  color: var(--bm-text-primary);
}
.bm-modal:focus {
  outline: none;
}

/* ---- Header ---- */
.bm-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(16 * var(--bm-u));
  height: calc(64 * var(--bm-u));
  padding: 0 calc(16 * var(--bm-u)) 0 calc(24 * var(--bm-u));
  box-shadow: inset 0 -1px 0 var(--bm-modal-border);
  flex-shrink: 0;
}

.bm-modal-title {
  margin: 0;
  font-size: var(--bm-fs-l);
  font-weight: 600;
  line-height: 1.2;
  color: var(--bm-text-primary);
}

.bm-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(36 * var(--bm-u));
  height: calc(36 * var(--bm-u));
  padding: 0;
  background: none;
  color: var(--bm-text-secondary);
  font-size: var(--bm-fs-l);
  line-height: 1;
  cursor: pointer;
  border-radius: calc(8 * var(--bm-u));
  transition: color 0.15s, background 0.15s;
}
.bm-close-btn:hover {
  color: var(--bm-text-primary);
  background: var(--bm-btn-hover);
}

/* ---- Scrollable body ---- */
.bm-modal-body {
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
  padding: calc(16 * var(--bm-u)) 0;
}
.bm-modal-body::-webkit-scrollbar {
  width: calc(10 * var(--bm-u));
}
.bm-modal-body::-webkit-scrollbar-track {
  background: transparent;
}
.bm-modal-body::-webkit-scrollbar-thumb {
  background: var(--bm-btn-border);
  border-radius: calc(5 * var(--bm-u));
}
@supports not selector(::-webkit-scrollbar) {
  .bm-modal-body {
    scrollbar-width: thin;
    scrollbar-color: var(--bm-btn-border) transparent;
  }
}

.bm-empty {
  margin: 0;
  padding: calc(24 * var(--bm-u));
  color: var(--bm-text-desc);
  text-align: center;
}

/* ---- Gamepad profile line: name · source chip · profile select ---- */
.bm-profile-panel {
  display: flex;
  align-items: center;
  gap: calc(12 * var(--bm-u));
  height: calc(48 * var(--bm-u));
  margin: 0 calc(24 * var(--bm-u)) calc(8 * var(--bm-u));
  padding: 0 calc(8 * var(--bm-u)) 0 calc(16 * var(--bm-u));
  border-radius: calc(8 * var(--bm-u));
  background: var(--bm-group-bg);
  box-shadow: inset 0 0 0 1px var(--bm-group-border);
}

.bm-profile-name {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--bm-text-primary);
}

.bm-profile-panel-empty {
  height: calc(40 * var(--bm-u));
}
.bm-profile-panel-empty .bm-profile-name {
  color: var(--bm-text-desc);
  font-size: var(--bm-fs-s);
}

.bm-profile-chip {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  height: calc(24 * var(--bm-u));
  padding: 0 calc(10 * var(--bm-u));
  border-radius: calc(12 * var(--bm-u));
  background: rgba(92, 124, 250, 0.16);
  color: var(--bm-accent-hover);
  font-size: var(--bm-fs-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  line-height: 1;
}
.bm-profile-chip--family,
.bm-profile-chip--generic {
  background: var(--bm-btn-bg);
  color: var(--bm-text-secondary);
}
.bm-profile-chip--manual,
.bm-profile-chip--memory-edit {
  background: var(--bm-warn-bg);
  color: var(--bm-warn-text);
}

.bm-profile-select {
  flex: 0 0 calc(300 * var(--bm-u));
  min-width: 0;
  height: calc(32 * var(--bm-u));
  padding: 0 calc(32 * var(--bm-u)) 0 calc(12 * var(--bm-u));
  appearance: none;
  background-color: var(--bm-btn-bg);
  background-image:
    linear-gradient(45deg, transparent 50%, var(--bm-text-secondary) 50%),
    linear-gradient(135deg, var(--bm-text-secondary) 50%, transparent 50%);
  background-position:
    calc(100% - 18 * var(--bm-u)) 50%,
    calc(100% - 13 * var(--bm-u)) 50%;
  background-size: calc(5 * var(--bm-u)) calc(5 * var(--bm-u));
  background-repeat: no-repeat;
  box-shadow: inset 0 0 0 1px var(--bm-btn-border);
  border-radius: calc(6 * var(--bm-u));
  color: var(--bm-text-primary);
  font-size: var(--bm-fs-s);
  text-overflow: ellipsis;
  cursor: pointer;
}
.bm-profile-select:hover {
  box-shadow: inset 0 0 0 1px var(--bm-accent);
}
.bm-profile-select option {
  background: var(--bm-modal-bg);
  color: var(--bm-text-primary);
}

/* ---- Group ---- */
.bm-group + .bm-group {
  margin-top: calc(8 * var(--bm-u));
}

.bm-group-title {
  padding: calc(12 * var(--bm-u)) calc(24 * var(--bm-u)) calc(6 * var(--bm-u));
  font-size: var(--bm-fs-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1.2;
  text-transform: uppercase;
  color: var(--bm-text-secondary);
}

/* ---- Action row: label | keyboard slots | gamepad slots | reset ---- */
.bm-action-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: calc(8 * var(--bm-u)) calc(16 * var(--bm-u));
  min-height: calc(52 * var(--bm-u));
  padding: calc(8 * var(--bm-u)) calc(24 * var(--bm-u));
  transition: background 0.1s;
}
.bm-action-row:hover {
  background: var(--bm-row-hover);
}

.bm-action-info {
  flex: 1 1 calc(200 * var(--bm-u));
  min-width: 0;
}

.bm-action-label {
  font-weight: 500;
  color: var(--bm-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bm-action-desc {
  font-size: var(--bm-fs-xs);
  color: var(--bm-text-desc);
  margin-top: calc(2 * var(--bm-u));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bm-action-controls {
  display: flex;
  align-items: center;
  gap: calc(12 * var(--bm-u));
  flex: 0 1 auto;
  margin-left: auto;
}

.bm-device-rows {
  display: flex;
  align-items: center;
  gap: calc(16 * var(--bm-u));
}

.bm-device-row {
  display: flex;
  align-items: center;
  gap: calc(8 * var(--bm-u));
}

/* Fixed width per device (badge + widest slot count), so slot columns line up across rows */
.bm-device-row--keyboard {
  width: calc((32 + var(--bm-kb-slots, 2) * 154 - 6) * var(--bm-u));
}
.bm-device-row--gamepad {
  width: calc((32 + var(--bm-gp-slots, 1) * 154 - 6) * var(--bm-u));
}

.bm-device-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(24 * var(--bm-u));
  height: calc(36 * var(--bm-u));
  font-size: var(--bm-fs-m);
  flex-shrink: 0;
  color: var(--bm-text-desc);
  user-select: none;
}

.bm-device-badge.bm-device-gp {
  color: var(--bm-accent);
  opacity: 0.8;
}

.bm-bind-slots {
  display: flex;
  gap: calc(6 * var(--bm-u));
}

.bm-slot {
  display: inline-flex;
  align-items: center;
  gap: calc(4 * var(--bm-u));
}

/* ---- Bind button ---- */
.bm-bind-btn {
  width: calc(120 * var(--bm-u));
  height: calc(36 * var(--bm-u));
  padding: 0 calc(10 * var(--bm-u));
  background: var(--bm-btn-bg);
  box-shadow: inset 0 0 0 1px var(--bm-btn-border);
  border-radius: calc(6 * var(--bm-u));
  color: var(--bm-text-primary);
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bm-bind-btn:hover {
  background: var(--bm-btn-hover);
  box-shadow: inset 0 0 0 1px var(--bm-accent);
}
.bm-bind-btn.bm-unbound {
  color: var(--bm-text-desc);
}

/* Capture state: waiting for user to press a key */
.bm-bind-btn.bm-capturing {
  background: var(--bm-capture-bg);
  box-shadow: inset 0 0 0 1px var(--bm-capture-border);
  color: var(--bm-capture-text);
  animation: bm-pulse 1s ease-in-out infinite;
}

.bm-bind-btn:disabled,
.bm-clear-slot-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.bm-action-reset-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ---- "No controller" placeholder ---- */
.bm-no-controller {
  font-size: var(--bm-fs-xs);
  color: var(--bm-text-desc);
  font-style: italic;
  padding: 0 calc(4 * var(--bm-u));
  line-height: calc(36 * var(--bm-u));
}

.bm-clear-slot-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(24 * var(--bm-u));
  height: calc(24 * var(--bm-u));
  padding: 0;
  border-radius: calc(6 * var(--bm-u));
  background: transparent;
  color: var(--bm-text-desc);
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.bm-clear-slot-btn:hover {
  background: var(--bm-btn-hover);
  color: var(--bm-reset-hover);
}

/* Nothing to clear: keep the space so columns stay aligned */
.bm-bind-btn.bm-unbound + .bm-clear-slot-btn {
  visibility: hidden;
}

@keyframes bm-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.6; }
}

/* ---- Per-action reset button ---- */
.bm-action-reset-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(32 * var(--bm-u));
  height: calc(32 * var(--bm-u));
  padding: 0;
  background: none;
  color: var(--bm-text-desc);
  cursor: pointer;
  border-radius: calc(6 * var(--bm-u));
  transition: color 0.15s, background 0.15s;
  font-size: var(--bm-fs-l);
  line-height: 1;
}
.bm-action-reset-btn:hover {
  color: var(--bm-reset-color);
  background: var(--bm-btn-hover);
}

/* ---- Footer: conflict warning · tool buttons · Reset All ---- */
.bm-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(12 * var(--bm-u));
  min-height: calc(64 * var(--bm-u));
  padding: calc(14 * var(--bm-u)) calc(24 * var(--bm-u));
  box-shadow: inset 0 1px 0 var(--bm-modal-border);
  flex-shrink: 0;
}

.bm-footer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: calc(8 * var(--bm-u));
  flex-shrink: 0;
  margin-left: auto;
}

/* ---- Conflict warning ---- */
.bm-conflict-warning {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--bm-fs-s);
  color: var(--bm-warn-text);
  background: var(--bm-warn-bg);
  box-shadow: inset 0 0 0 1px var(--bm-warn-border);
  border-radius: calc(6 * var(--bm-u));
  padding: calc(6 * var(--bm-u)) calc(12 * var(--bm-u));
  transition: opacity 0.2s;
}
.bm-conflict-warning.bm-hidden {
  display: none;
}

/* ---- Footer buttons ---- */
.bm-reset-all-btn,
.bm-footer-action-btn {
  height: calc(36 * var(--bm-u));
  padding: 0 calc(16 * var(--bm-u));
  border-radius: calc(6 * var(--bm-u));
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s, color 0.15s;
}
.bm-reset-all-btn {
  background: none;
  box-shadow: inset 0 0 0 1px var(--bm-btn-border);
  color: var(--bm-reset-color);
  flex-shrink: 0;
}
.bm-footer-action-btn {
  background: var(--bm-btn-bg);
  box-shadow: inset 0 0 0 1px var(--bm-btn-border);
  color: var(--bm-text-primary);
}
.bm-footer-action-btn:hover {
  background: var(--bm-btn-hover);
  box-shadow: inset 0 0 0 1px var(--bm-accent);
}
.bm-footer-action-btn--debug {
  color: #ffd3a4;
  box-shadow: inset 0 0 0 1px rgba(250, 170, 90, 0.55);
  background: rgba(250, 170, 90, 0.12);
}
.bm-footer-action-btn--debug:hover {
  background: rgba(250, 170, 90, 0.22);
  box-shadow: inset 0 0 0 1px rgba(255, 192, 120, 0.95);
}
.bm-footer-action-btn--test {
  color: #b8f2ff;
  box-shadow: inset 0 0 0 1px rgba(100, 210, 235, 0.5);
  background: rgba(100, 210, 235, 0.12);
}
.bm-footer-action-btn--test:hover {
  background: rgba(100, 210, 235, 0.22);
  box-shadow: inset 0 0 0 1px rgba(130, 235, 255, 0.95);
}
.bm-reset-all-btn:hover {
  background: var(--bm-btn-hover);
  box-shadow: inset 0 0 0 1px var(--bm-reset-color);
  color: var(--bm-reset-hover);
}
.bm-reset-all-btn:disabled,
.bm-footer-action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ---- Capture modal ---- */
.bm-capture-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--bm-z-capture);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
}

.bm-capture-modal {
  width: calc(480 * var(--bm-u));
  max-width: calc(100vw - 32 * var(--bm-u));
  padding: calc(24 * var(--bm-u));
  border-radius: calc(12 * var(--bm-u));
  background: linear-gradient(180deg, rgba(58, 42, 0, 0.98), rgba(27, 20, 0, 0.98));
  box-shadow:
    0 0 0 1px var(--bm-capture-border),
    0 calc(20 * var(--bm-u)) calc(48 * var(--bm-u)) rgba(0, 0, 0, 0.45);
  color: var(--bm-text-primary);
  font-family: system-ui, -apple-system, sans-serif;
  font-size: var(--bm-fs-m);
  line-height: 1.4;
}
.bm-capture-modal:focus {
  outline: none;
}

.bm-capture-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(16 * var(--bm-u));
}

.bm-capture-title {
  margin: 0;
  font-size: var(--bm-fs-l);
  font-weight: 600;
  line-height: 1.2;
  color: var(--bm-capture-text);
}

.bm-capture-cancel-btn {
  flex-shrink: 0;
  height: calc(36 * var(--bm-u));
  padding: 0 calc(16 * var(--bm-u));
  border-radius: calc(6 * var(--bm-u));
  box-shadow: inset 0 0 0 1px var(--bm-capture-border);
  background: rgba(255, 208, 96, 0.08);
  color: var(--bm-capture-text);
  cursor: pointer;
}

.bm-capture-cancel-btn:hover {
  background: rgba(255, 208, 96, 0.14);
}

.bm-capture-message {
  margin-top: calc(16 * var(--bm-u));
  font-size: var(--bm-fs-m);
}

.bm-capture-detail {
  margin-top: calc(8 * var(--bm-u));
  font-size: var(--bm-fs-s);
  color: var(--bm-text-secondary);
  white-space: pre-wrap;
}

/* ====== Action Hints Bar (centred at the bottom of the screen) ====== */

.bm-hints {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(16 * var(--bm-u));
  z-index: var(--bm-z-hints);
  width: fit-content;
  max-width: calc(100vw - 32 * var(--bm-u));
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: calc(6 * var(--bm-u)) calc(20 * var(--bm-u));
  padding: calc(8 * var(--bm-u)) calc(16 * var(--bm-u));
  border-radius: calc(10 * var(--bm-u));
  background: var(--bm-hints-bg);
  box-shadow: 0 0 0 1px var(--bm-hints-border);
  pointer-events: none;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: var(--bm-fs-s);
  line-height: 1.2;
  color: var(--bm-text-secondary);
  /* backdrop-filter: blur(6px); jsdom doesn't support this, but it's still nice for browsers */
}

.bm-hint-item {
  display: flex;
  align-items: center;
  gap: calc(8 * var(--bm-u));
  white-space: nowrap;
}

.bm-hint-keys {
  display: flex;
  align-items: center;
  gap: calc(4 * var(--bm-u));
}

.bm-hint-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: calc(28 * var(--bm-u));
  height: calc(26 * var(--bm-u));
  padding: 0 calc(7 * var(--bm-u));
  background: var(--bm-hint-key-bg);
  box-shadow: inset 0 0 0 1px var(--bm-hint-key-border);
  border-radius: calc(5 * var(--bm-u));
  font-size: var(--bm-fs-xs);
  font-family: inherit;
  font-style: normal;
  color: var(--bm-text-primary);
  line-height: 1;
}

.bm-hint-sep {
  color: var(--bm-text-desc);
  font-size: var(--bm-fs-xs);
}

.bm-hint-label {
  color: var(--bm-text-secondary);
}

/* ---- Gamepad hint key (distinct colour) ---- */
.bm-hint-gp-key {
  color: var(--bm-accent-hover);
  background: rgba(92, 124, 250, 0.12);
  box-shadow: inset 0 0 0 1px rgba(92, 124, 250, 0.35);
}

/* ====== Below 1280x720: --bm-u sits on its floor, fit the viewport instead ====== */
@media (max-width: 1279px), (max-height: 719px) {
  .bm-modal {
    max-width: calc(100vw - 24 * var(--bm-u));
    max-height: min(var(--bm-modal-max-h), calc(100vh - 24 * var(--bm-u)));
    max-height: min(var(--bm-modal-max-h), calc(100dvh - 24 * var(--bm-u)));
  }
  .bm-action-controls,
  .bm-device-rows,
  .bm-modal-footer,
  .bm-footer-actions {
    flex-wrap: wrap;
  }
  .bm-profile-panel {
    height: auto;
    min-height: calc(48 * var(--bm-u));
    flex-wrap: wrap;
    padding-top: calc(8 * var(--bm-u));
    padding-bottom: calc(8 * var(--bm-u));
  }
  .bm-capture-modal {
    max-width: calc(100vw - 24 * var(--bm-u));
    max-height: calc(100vh - 24 * var(--bm-u));
    overflow-y: auto;
  }
  .bm-hints {
    max-width: calc(100vw - 24 * var(--bm-u));
  }
}
`;

let _injected = false;

/**
 * Injects the Bind Manager CSS into document.head.
 * Idempotent — safe to call multiple times, only injects once.
 */
export function injectStyles() {
  if (_injected || typeof document === 'undefined') return;
  _injected = true;
  const style = document.createElement('style');
  style.dataset.bindManager = 'styles';
  style.textContent = CSS;
  document.head.appendChild(style);
}
