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
   any resolution with the same aspect ratio. Set --bm-u: 1px (on :root or any
   ancestor) for fixed sizes; --bm-u-min / --bm-u-max take effect on :root.
   Borders are drawn as box-shadow rings so they never shift the layout.

   Size overrides without a default here (the default is used where they apply,
   so it follows --bm-u set on any ancestor):
     --bm-modal-width   default calc(1080 * var(--bm-u))
     --bm-modal-max-h   default calc(880 * var(--bm-u))
     --bm-modal-radius  default calc(12 * var(--bm-u))
   ================================================================ */

:root {
  --bm-z-modal:  9000;
  --bm-z-capture:  9010;
  --bm-z-hints:  8000;

  --bm-overlay-bg:   rgba(0, 0, 0, 0.75);
  --bm-modal-bg:     #1e1e2e;
  --bm-modal-border: #3a3a5c;

  --bm-text-primary:   #e0e0f0;
  --bm-text-secondary: #b0b0d0;
  --bm-text-desc:      #9898c0;

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

/*
 * The font tokens again, so a --bm-u set on any ancestor (not only :root) resizes text as well.
 * Hosts set fixed text sizes through --bm-font-xs / -s / -m / -l (on :root or any ancestor);
 * a host value for --bm-fs-* itself is replaced here.
 */
.bm-overlay,
.bm-capture-overlay,
.bm-hints {
  --bm-fs-xs: var(--bm-font-xs, max(9px, calc(14 * var(--bm-u))));
  --bm-fs-s: var(--bm-font-s, max(10px, calc(15 * var(--bm-u))));
  --bm-fs-m: var(--bm-font-m, calc(17 * var(--bm-u)));
  --bm-fs-l: var(--bm-font-l, calc(21 * var(--bm-u)));
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
  position: relative;
  background: var(--bm-modal-bg);
  border-radius: var(--bm-modal-radius, calc(12 * var(--bm-u)));
  width: var(--bm-modal-width, calc(1080 * var(--bm-u)));
  /* Never larger than the viewport, whatever --bm-u or the host sizes say */
  max-width: calc(100vw - min(32 * var(--bm-u), 4vw));
  max-height: min(var(--bm-modal-max-h, calc(880 * var(--bm-u))), calc(100vh - min(32 * var(--bm-u), 4vh)));
  max-height: min(var(--bm-modal-max-h, calc(880 * var(--bm-u))), calc(100dvh - min(32 * var(--bm-u), 4dvh)));
  display: flex;
  flex-direction: column;
  /* Only the list (.bm-modal-body) scrolls: clip, unlike hidden, is no scroll
     container, so scrollIntoView() and focus() on a row cannot move the header,
     the search field and the footer. Browsers without clip keep hidden (the
     modal controller puts a scrolled box back). */
  overflow: hidden;
  overflow: clip;
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

/* Measures --bm-u in px for the layout decision in modal-controller.js */
.bm-u-probe {
  position: absolute;
  top: 0;
  left: 0;
  width: calc(1000 * var(--bm-u));
  height: 0;
  visibility: hidden;
  pointer-events: none;
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
  min-width: 0;
  font-size: var(--bm-fs-l);
  font-weight: 600;
  line-height: 1.2;
  color: var(--bm-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bm-close-btn {
  flex-shrink: 0;
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

/* Rows hidden by the search (and other [hidden] parts) stay hidden whatever their display rule says */
.bm-overlay [hidden] {
  display: none;
}

/* Read by screen readers only (the search's match count) */
.bm-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* ---- Search: one row between the header and the body, so it stays while the list scrolls ---- */
.bm-search {
  position: relative;
  display: flex;
  align-items: center;
  padding: calc(12 * var(--bm-u)) calc(24 * var(--bm-u));
  box-shadow: inset 0 -1px 0 var(--bm-modal-border);
  flex-shrink: 0;
}

.bm-search-input {
  flex: 1 1 auto;
  min-width: 0;
  height: calc(36 * var(--bm-u));
  margin: 0;
  border: 0;
  padding: 0 calc(40 * var(--bm-u)) 0 calc(12 * var(--bm-u));
  appearance: none;
  background: var(--bm-btn-bg);
  box-shadow: inset 0 0 0 1px var(--bm-btn-border);
  border-radius: calc(6 * var(--bm-u));
  color: var(--bm-text-primary);
  font-family: inherit;
  font-size: var(--bm-fs-m);
  line-height: 1.2;
}
.bm-search-input:hover {
  box-shadow: inset 0 0 0 1px var(--bm-accent);
}
.bm-search-input::placeholder {
  color: var(--bm-text-desc);
  opacity: 1;
}
/* The clear button below replaces the browser's own */
.bm-search-input::-webkit-search-cancel-button,
.bm-search-input::-webkit-search-decoration {
  appearance: none;
}
.bm-search-input:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
/* Touch screens: at least 16px text, or iOS Safari zooms the page when the field takes focus */
@media (any-pointer: coarse) {
  .bm-search-input {
    font-size: max(16px, var(--bm-fs-m)); /* the one px font size: the iOS zoom limit */
  }
}

.bm-search-clear {
  position: absolute;
  right: calc(30 * var(--bm-u));
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(28 * var(--bm-u));
  height: calc(28 * var(--bm-u));
  padding: 0;
  background: transparent;
  color: var(--bm-text-secondary);
  font-size: var(--bm-fs-l);
  line-height: 1;
  border-radius: calc(6 * var(--bm-u));
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.bm-search-clear:hover {
  background: var(--bm-btn-hover);
  color: var(--bm-text-primary);
}
.bm-search-clear:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ---- Scrollable body ---- */
.bm-modal-body {
  overflow-y: auto;
  flex: 1 1 auto;
  /* Never squeezed to nothing (a short viewport, an on-screen keyboard): the footer is cut first */
  min-height: min(calc(120 * var(--bm-u)), 40vh);
  padding: calc(16 * var(--bm-u)) 0;
  /* The scrollbar space is always reserved, so the layout does not depend on overflow */
  scrollbar-gutter: stable;
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
  flex-wrap: wrap;
  gap: calc(8 * var(--bm-u)) calc(12 * var(--bm-u));
  min-height: calc(48 * var(--bm-u));
  margin: 0 calc(24 * var(--bm-u)) calc(8 * var(--bm-u));
  padding: calc(8 * var(--bm-u)) calc(8 * var(--bm-u)) calc(8 * var(--bm-u)) calc(16 * var(--bm-u));
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
  min-height: calc(40 * var(--bm-u));
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

/* A saved exact profile that does not fit the pad: a short note after the select (wraps to its own line) */
.bm-profile-note {
  flex: 1 1 100%;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--bm-warn-text);
  font-size: var(--bm-fs-xs);
}

.bm-profile-select {
  flex: 0 1 calc(300 * var(--bm-u));
  min-width: 0;
  max-width: 100%;
  height: calc(32 * var(--bm-u));
  padding: 0 calc(32 * var(--bm-u)) 0 calc(12 * var(--bm-u));
  appearance: none;
  background-color: var(--bm-btn-bg);
  /* SVG chevron in the default --bm-text-secondary; sized from the s token, so never below 8px */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1.5 1.75 6 6.25l4.5-4.5' fill='none' stroke='%23b0b0d0' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-position: calc(100% - 12 * var(--bm-u)) 50%;
  background-size: calc(0.8 * var(--bm-fs-s)) auto;
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

/* Foldable group: the title is a button with a marker, the name and a bound / total count */
.bm-group-toggle {
  display: flex;
  align-items: center;
  gap: calc(8 * var(--bm-u));
  width: 100%;
  margin: 0;
  border: 0;
  background: none;
  text-align: left;
  font-family: inherit;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.bm-group-toggle:hover {
  color: var(--bm-text-primary);
  background: var(--bm-row-hover);
}
.bm-group-toggle:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.bm-group-marker {
  flex-shrink: 0;
  display: inline-flex;
  justify-content: center;
  width: calc(12 * var(--bm-u));
  transition: transform 0.15s;
}
.bm-group-toggle[aria-expanded="false"] .bm-group-marker {
  transform: rotate(-90deg);
}
.bm-group-name {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bm-group-count {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--bm-text-desc);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
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
  flex-wrap: wrap;
  gap: calc(12 * var(--bm-u));
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  margin-left: auto;
}

/*
 * Layouts, chosen in modal-controller.js from the modal's real width and the
 * widest slot counts over all actions (--bm-kb-slots, --bm-gp-slots):
 *   bm-layout-inline   label | keyboard slots | gamepad slots | reset
 *   bm-layout-stacked  label | keyboard row above gamepad row | reset
 *   bm-layout-narrow   label on its own line, then the stacked rows
 * Device rows have a fixed width, so slot columns line up across all rows.
 * Every level may still shrink and wrap, so nothing ever overflows sideways.
 */
.bm-device-rows {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: calc(6 * var(--bm-u)) calc(28 * var(--bm-u));
  min-width: 0;
  max-width: 100%;
}

.bm-device-row {
  display: flex;
  align-items: center;
  gap: calc(8 * var(--bm-u));
  min-width: 0;
  max-width: 100%;
  flex: 0 1 auto;
}

.bm-device-row--keyboard {
  width: calc((32 + var(--bm-kb-slots, 2) * 154 - 6) * var(--bm-u));
}
.bm-device-row--gamepad {
  position: relative;
  width: calc((32 + var(--bm-gp-slots, 1) * 154 - 6) * var(--bm-u));
}

/* Divider between the keyboard and the gamepad group on one line */
.bm-layout-inline .bm-device-row--gamepad::before {
  content: '';
  position: absolute;
  left: calc(-14 * var(--bm-u));
  top: calc(6 * var(--bm-u));
  bottom: calc(6 * var(--bm-u));
  width: 1px;
  background: var(--bm-modal-border);
}

.bm-layout-stacked .bm-device-rows,
.bm-layout-narrow .bm-device-rows {
  flex-direction: column;
  align-items: flex-start;
}
.bm-layout-stacked .bm-device-row,
.bm-layout-narrow .bm-device-row {
  width: calc((32 + max(var(--bm-kb-slots, 2), var(--bm-gp-slots, 1)) * 154 - 6) * var(--bm-u));
}
.bm-layout-narrow .bm-action-info {
  flex-basis: 100%;
}
.bm-layout-narrow .bm-action-controls {
  margin-left: 0;
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
  flex-wrap: wrap;
  gap: calc(6 * var(--bm-u));
  min-width: 0;
}

.bm-slot {
  display: inline-flex;
  align-items: center;
  gap: calc(4 * var(--bm-u));
  min-width: 0;
  max-width: 100%;
}

/* ---- Bind button ---- */
.bm-bind-btn {
  flex: 0 1 auto;
  min-width: 0;
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
  flex-shrink: 0;
  background: transparent;
  color: var(--bm-text-secondary);
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
  flex-wrap: wrap;
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
  flex-wrap: wrap;
  gap: calc(8 * var(--bm-u));
  min-width: 0;
  max-width: 100%;
  margin-left: auto;
}

/* ---- Conflict warning ---- */
.bm-conflict-warning {
  flex: 1 1 calc(240 * var(--bm-u));
  min-width: 0;
  font-size: var(--bm-fs-s);
  line-height: 1.3;
  /* At most three lines; the full text is in the title */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
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
  max-width: 100%;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  max-width: calc(100vw - min(32 * var(--bm-u), 4vw));
  max-height: calc(100vh - min(32 * var(--bm-u), 4vh));
  max-height: calc(100dvh - min(32 * var(--bm-u), 4dvh));
  overflow-y: auto;
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
  flex-wrap: wrap;
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
  bottom: min(16 * var(--bm-u), 2vh);
  z-index: var(--bm-z-hints);
  width: fit-content;
  max-width: calc(100vw - min(32 * var(--bm-u), 4vw));
  /* At most three rows of hints (8 + 3 x 26 + 2 x 6 gap + 6); further rows are clipped */
  max-height: min(calc(104 * var(--bm-u)), calc(100vh - 2 * min(16 * var(--bm-u), 2vh)));
  overflow: hidden;
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
  min-width: 0;
  max-width: 100%;
  white-space: nowrap;
}

.bm-hint-keys {
  flex-shrink: 0;
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
  min-width: 0;
  max-width: calc(240 * var(--bm-u));
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--bm-text-secondary);
}

/* ---- Gamepad hint key (distinct colour) ---- */
.bm-hint-gp-key {
  color: var(--bm-accent-hover);
  background: rgba(92, 124, 250, 0.12);
  box-shadow: inset 0 0 0 1px rgba(92, 124, 250, 0.35);
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
