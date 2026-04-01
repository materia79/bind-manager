/**
 * Injects the Bind Manager stylesheet into document.head once.
 * Using a JS module avoids import-assertions/CSS-modules which aren't universally
 * supported in browser-native ESM without a bundler.
 */

const CSS = `
/* ================================================================
   Bind Manager — base styles
   Customise via CSS custom properties on any ancestor element or :root
   ================================================================ */

:root {
  --bm-z-modal:  9000;
  --bm-z-hints:  8000;

  --bm-overlay-bg:   rgba(0, 0, 0, 0.75);
  --bm-modal-bg:     #1e1e2e;
  --bm-modal-border: #3a3a5c;
  --bm-modal-radius: 10px;
  --bm-modal-width:  660px;
  --bm-modal-max-h:  80vh;

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
  border: 1px solid var(--bm-modal-border);
  border-radius: var(--bm-modal-radius);
  width: var(--bm-modal-width);
  max-width: calc(100vw - 32px);
  max-height: var(--bm-modal-max-h);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 14px;
  color: var(--bm-text-primary);
}

/* ---- Header ---- */
.bm-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--bm-modal-border);
  flex-shrink: 0;
}

.bm-modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--bm-text-primary);
}

.bm-close-btn {
  background: none;
  border: none;
  color: var(--bm-text-secondary);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  transition: color 0.15s, background 0.15s;
}
.bm-close-btn:hover {
  color: var(--bm-text-primary);
  background: var(--bm-btn-hover);
}

/* ---- Scrollable body ---- */
.bm-modal-body {
  overflow-y: auto;
  flex: 1;
  padding: 12px 0;
}

.bm-profile-panel {
  margin: 0 20px 12px;
  padding: 12px;
  border: 1px solid var(--bm-group-border);
  border-radius: 8px;
  background: var(--bm-group-bg);
}

.bm-profile-panel-empty {
  color: var(--bm-text-desc);
}

.bm-profile-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--bm-text-primary);
}

.bm-profile-meta,
.bm-profile-subtitle {
  color: var(--bm-text-secondary);
  font-size: 12px;
}

.bm-profile-subtitle {
  margin-top: 4px;
  word-break: break-word;
}

.bm-profile-controls {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.bm-profile-select {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  background: var(--bm-btn-bg);
  border: 1px solid var(--bm-btn-border);
  border-radius: 6px;
  color: var(--bm-text-primary);
}

.bm-profile-auto-btn {
  height: 32px;
  padding: 0 12px;
  background: var(--bm-btn-bg);
  border: 1px solid var(--bm-btn-border);
  border-radius: 6px;
  color: var(--bm-text-primary);
  cursor: pointer;
}

.bm-profile-auto-btn:hover,
.bm-profile-select:hover {
  border-color: var(--bm-accent);
}

/* ---- Group ---- */
.bm-group {
  margin-bottom: 4px;
}

.bm-group-title {
  padding: 8px 20px 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--bm-text-secondary);
}

/* ---- Action row ---- */
.bm-action-row {
  display: flex;
  align-items: center;
  padding: 8px 20px;
  gap: 12px;
  transition: background 0.1s;
}
.bm-action-row:hover {
  background: var(--bm-row-hover);
}

.bm-action-info {
  flex: 1;
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
  font-size: 12px;
  color: var(--bm-text-desc);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bm-action-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bm-action-controls.bm-with-gamepad {
  align-items: flex-start;
}

.bm-device-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bm-device-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bm-device-badge {
  width: 18px;
  font-size: 13px;
  text-align: center;
  flex-shrink: 0;
  color: var(--bm-text-desc);
  user-select: none;
  line-height: 32px;
}

.bm-device-badge.bm-device-gp {
  color: var(--bm-accent);
  opacity: 0.8;
}

.bm-bind-slots {
  display: flex;
  gap: 6px;
}

.bm-slot {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* ---- Bind button ---- */
.bm-bind-btn {
  min-width: 72px;
  height: 32px;
  padding: 0 10px;
  background: var(--bm-btn-bg);
  border: 1px solid var(--bm-btn-border);
  border-radius: 6px;
  color: var(--bm-text-primary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.bm-bind-btn:hover {
  background: var(--bm-btn-hover);
  border-color: var(--bm-accent);
}
.bm-bind-btn.bm-unbound {
  color: var(--bm-text-desc);
}

/* Capture state: waiting for user to press a key */
.bm-bind-btn.bm-capturing {
  background: var(--bm-capture-bg);
  border-color: var(--bm-capture-border);
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
  font-size: 11px;
  color: var(--bm-text-desc);
  font-style: italic;
  padding: 2px 4px;
  line-height: 32px;
}

.bm-clear-slot-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 4px;
  border: 1px solid var(--bm-btn-border);
  background: var(--bm-btn-bg);
  color: var(--bm-text-secondary);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.bm-clear-slot-btn:hover {
  background: var(--bm-btn-hover);
  border-color: var(--bm-reset-color);
  color: var(--bm-reset-hover);
}

@keyframes bm-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.6; }
}

/* ---- Per-action reset button ---- */
.bm-action-reset-btn {
  background: none;
  border: none;
  color: var(--bm-text-desc);
  font-size: 16px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  transition: color 0.15s, background 0.15s;
  line-height: 1;
}
.bm-action-reset-btn:hover {
  color: var(--bm-reset-color);
  background: var(--bm-btn-hover);
}

/* ---- Footer ---- */
.bm-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid var(--bm-modal-border);
  flex-shrink: 0;
  gap: 12px;
}

/* ---- Conflict warning ---- */
.bm-conflict-warning {
  flex: 1;
  font-size: 12px;
  color: var(--bm-warn-text);
  background: var(--bm-warn-bg);
  border: 1px solid var(--bm-warn-border);
  border-radius: 5px;
  padding: 6px 10px;
  transition: opacity 0.2s;
}
.bm-conflict-warning.bm-hidden {
  display: none;
}

/* ---- Reset All button ---- */
.bm-reset-all-btn {
  background: none;
  border: 1px solid var(--bm-btn-border);
  border-radius: 6px;
  color: var(--bm-reset-color);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  padding: 6px 14px;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  flex-shrink: 0;
}
.bm-reset-all-btn:hover {
  background: var(--bm-btn-hover);
  border-color: var(--bm-reset-color);
  color: var(--bm-reset-hover);
}

/* ====== Action Hints Bar (bottom of screen) ====== */

.bm-hints {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: var(--bm-z-hints);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 4px 16px;
  padding: 8px 20px;
  background: var(--bm-hints-bg);
  border-top: 1px solid var(--bm-hints-border);
  pointer-events: none;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 12px;
  color: var(--bm-text-secondary);
  /* backdrop-filter: blur(6px); jsdom doesn't support this, but it's still nice for browsers */
}

.bm-hint-item {
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.bm-hint-keys {
  display: flex;
  align-items: center;
  gap: 3px;
}

.bm-hint-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 20px;
  padding: 0 5px;
  background: var(--bm-hint-key-bg);
  border: 1px solid var(--bm-hint-key-border);
  border-radius: 3px;
  font-size: 11px;
  font-family: inherit;
  font-style: normal;
  color: var(--bm-text-primary);
  line-height: 1;
}

.bm-hint-sep {
  color: var(--bm-text-desc);
  font-size: 10px;
}

.bm-hint-label {
  color: var(--bm-text-secondary);
}

/* ---- Gamepad hint key (distinct colour) ---- */
.bm-hint-gp-key {
  color: var(--bm-accent-hover);
  background: rgba(92, 124, 250, 0.12);
  border-color: rgba(92, 124, 250, 0.35);
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
