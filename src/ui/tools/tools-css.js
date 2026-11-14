/**
 * Stylesheet of the built-in tools (Input Remap, Controller Tester, capture mini modal).
 *
 * Every length is a multiple of the shared scale unit --bm-u (or a --bm-fs-* font
 * token), so the tools look the same on every resolution with the same aspect
 * ratio. Panels have a fixed size in u; live values sit in fixed-height boxes so
 * nothing moves when input arrives. Below the floor (narrow or short viewports)
 * panels become one scrolling column.
 */

const u = (n) => `calc(${n} * var(--bm-u))`;

/** Panel sizes in u, exported for tests. */
export const TOOL_PANEL_SIZES = Object.freeze({
  tester: { width: 1400, height: 800 },
  debug: { width: 1200, height: 760 },
  captureMini: { width: 640, height: 420 },
});

const T = TOOL_PANEL_SIZES;
const HEAD_H = 64;
const BODY_PAD = 16;
const SIDE_W = 480;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export const BUILT_IN_TOOLS_CSS = `
.bm-debug-modal,
.bm-tester-modal,
.bm-capture-mini-modal {
  position: fixed;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  pointer-events: all;
}

.bm-debug-modal { z-index: 10020; background: rgba(0, 0, 0, 0.78); backdrop-filter: blur(${u(4)}); }
.bm-debug-modal.bm-debug-open { display: flex; }
.bm-tester-modal { z-index: 10030; background: rgba(2, 10, 18, 0.82); backdrop-filter: blur(${u(4)}); }
.bm-tester-modal.bm-tester-open { display: flex; }
.bm-capture-mini-modal { z-index: 10040; background: rgba(0, 0, 0, 0.55); }
.bm-capture-mini-modal.bm-open { display: flex; }

/* ---- Panels: fixed size in u ---- */
.bm-tool-panel {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: none;
  border: 1px solid #35506d;
  border-radius: ${u(10)};
  background: #0f1a26;
  color: #d6ecff;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: var(--bm-fs-s);
  line-height: 1.4;
  box-shadow: 0 ${u(20)} ${u(60)} rgba(0, 0, 0, 0.6);
}
.bm-tool-panel *,
.bm-tool-panel *::before,
.bm-tool-panel *::after { box-sizing: border-box; }
.bm-tool-panel :where(h2, h3, dl, dd, ul) { margin: 0; padding: 0; }

.bm-tester-panel { width: ${u(T.tester.width)}; height: ${u(T.tester.height)}; }
.bm-debug-panel { width: ${u(T.debug.width)}; height: ${u(T.debug.height)}; background: #111526; border-color: #38446b; }
.bm-capture-mini-panel {
  width: ${u(T.captureMini.width)};
  height: ${u(T.captureMini.height)};
  border-color: rgba(110, 200, 230, 0.35);
  background: linear-gradient(180deg, rgba(10, 22, 34, 0.98), rgba(8, 16, 24, 0.98));
}

/* ---- Header pattern: title, controller name, profile chip, profile select, toggles, close ---- */
.bm-tool-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: ${u(12)};
  height: ${u(HEAD_H)};
  padding: 0 ${u(BODY_PAD)};
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.bm-tool-title {
  flex: none;
  font-size: var(--bm-fs-l);
  font-weight: 600;
  line-height: ${u(28)};
  color: #e8f8ff;
  white-space: nowrap;
}
.bm-capture-mini-panel .bm-tool-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.bm-tool-device {
  flex: 1 1 auto;
  min-width: 0;
  height: ${u(22)};
  line-height: ${u(22)};
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: #9fc0d8;
  font-size: var(--bm-fs-s);
}
.bm-tool-chip {
  flex: none;
  width: ${u(96)};
  height: ${u(28)};
  line-height: ${u(26)};
  text-align: center;
  border-radius: ${u(14)};
  border: 1px solid rgba(160, 190, 210, 0.4);
  background: rgba(160, 190, 210, 0.1);
  color: #c7d8e4;
  font-size: var(--bm-fs-xs);
  font-weight: 600;
  overflow: hidden;
  white-space: nowrap;
}
.bm-tool-chip[data-source="exact"] { border-color: rgba(110, 220, 150, 0.6); background: rgba(110, 220, 150, 0.12); color: #b9f5cf; }
.bm-tool-chip[data-source="family"] { border-color: rgba(100, 190, 240, 0.6); background: rgba(100, 190, 240, 0.12); color: #bfe6ff; }
.bm-tool-chip[data-source="manual"] { border-color: rgba(255, 196, 100, 0.65); background: rgba(255, 196, 100, 0.12); color: #ffe2b0; }
.bm-tool-select,
.bm-debug-preset-select {
  flex: none;
  width: ${u(280)};
  height: ${u(36)};
  padding: 0 ${u(10)};
  border-radius: ${u(6)};
  border: 1px solid rgba(92, 124, 250, 0.4);
  background: rgba(15, 24, 38, 0.85);
  color: #dce6ff;
  font-family: inherit;
  font-size: var(--bm-fs-s);
}

.bm-tool-btn {
  flex: none;
  height: ${u(36)};
  padding: 0 ${u(14)};
  background: rgba(92, 124, 250, 0.2);
  border: 1px solid rgba(92, 124, 250, 0.5);
  border-radius: ${u(7)};
  color: #c0ccff;
  font-size: var(--bm-fs-s);
  font-family: inherit;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.bm-tool-btn:hover { background: rgba(92, 124, 250, 0.4); border-color: #5c7cfa; }
.bm-tool-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.bm-tool-btn:disabled:hover { background: rgba(92, 124, 250, 0.2); border-color: rgba(92, 124, 250, 0.5); }
.bm-tool-toggle[aria-pressed="true"] { background: rgba(76, 201, 240, 0.28); border-color: #7cf0ff; color: #eafcff; }
.bm-tool-close { width: ${u(96)}; }
.bm-tester-debug-btn { width: ${u(96)}; }
.bm-tester-editor-btn { width: ${u(150)}; }

/* ---- Shared text boxes: fixed height, clipped, tabular digits ---- */
.bm-tool-line,
.bm-tool-lines2,
.bm-tool-lines3 {
  flex: none;
  overflow: hidden;
  font-variant-numeric: tabular-nums;
}
.bm-tool-line { height: ${u(24)}; line-height: ${u(24)}; white-space: nowrap; text-overflow: ellipsis; }
.bm-tool-lines2 { height: ${u(44)}; line-height: ${u(22)}; }
.bm-tool-lines3 { height: ${u(66)}; line-height: ${u(22)}; }
.bm-tool-section {
  display: flex;
  flex-direction: column;
  gap: ${u(8)};
  min-height: 0;
  overflow: hidden;
  padding: ${u(12)};
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: ${u(8)};
  background: rgba(255, 255, 255, 0.03);
}
.bm-tool-section-title {
  flex: none;
  height: ${u(18)};
  line-height: ${u(18)};
  font-size: var(--bm-fs-xs);
  font-weight: 700;
  letter-spacing: ${u(0.6)};
  text-transform: uppercase;
  color: #86dfff;
}
.bm-debug-panel .bm-tool-section-title { color: #9ab0ff; }
.bm-tool-note { flex: none; font-size: var(--bm-fs-xs); color: #8eb8d4; line-height: ${u(20)}; }
.bm-tool-row { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: ${u(8)}; }

/* Signal grid: fixed rows of key / value, monospace */
.bm-tool-grid {
  flex: none;
  display: grid;
  grid-template-columns: ${u(96)} minmax(0, 1fr);
  grid-auto-rows: ${u(22)};
  column-gap: ${u(10)};
  padding: ${u(6)} ${u(10)};
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: ${u(6)};
  background: rgba(0, 0, 0, 0.24);
  font-family: ${MONO};
  font-size: var(--bm-fs-xs);
  line-height: ${u(22)};
  font-variant-numeric: tabular-nums;
  color: #b8def8;
}
.bm-tool-grid dt { color: #7f9fb8; }
.bm-tool-grid dt,
.bm-tool-grid dd { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }

/* ---- Controller Tester ---- */
.bm-tester-body {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${u(BODY_PAD)};
  padding: ${u(BODY_PAD)};
}
.bm-tester-panel.bm-side-open .bm-tester-body { grid-template-columns: minmax(0, 1fr) ${u(SIDE_W)}; }
.bm-tester-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: ${u(8)};
}
.bm-tester-pad-wrap { flex: 1 1 auto; min-height: 0; position: relative; }
.bm-tester-pad {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
}
.bm-tester-status {
  padding: 0 ${u(4)};
  color: #daf2ff;
  text-align: center;
}
.bm-tester-side {
  display: none;
  min-height: 0;
  flex-direction: column;
  gap: ${u(12)};
}
.bm-tester-panel.bm-side-open .bm-tester-side { display: flex; }
.bm-tester-side > section { flex: 1 1 0; }
.bm-tester-side > section[hidden] { display: none; }
.bm-tester-panel.bm-debug-on.bm-editor-on .bm-tester-debug { flex: 0 0 ${u(372)}; }

.bm-tester-active-codes {
  padding: 0 ${u(10)};
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: ${u(6)};
  background: rgba(0, 0, 0, 0.24);
  font-family: ${MONO};
  font-size: var(--bm-fs-xs);
  color: #b8def8;
}
.bm-tester-raw {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: ${u(6)} ${u(10)};
  border: 1px solid rgba(100, 180, 220, 0.18);
  border-radius: ${u(6)};
  background: rgba(7, 15, 23, 0.88);
  font-family: ${MONO};
  font-size: var(--bm-fs-xs);
  line-height: ${u(20)};
  font-variant-numeric: tabular-nums;
  color: #7cc8ea;
}
.bm-tester-raw-buttons {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: ${u(20)};
  margin-bottom: ${u(6)};
}
.bm-tester-raw-axis { height: ${u(20)}; }
.bm-tester-raw span,
.bm-tester-raw-axis { display: block; overflow: hidden; white-space: pre; }

.bm-tester-editor-actions { flex: none; display: grid; grid-template-columns: 1fr 1fr; gap: ${u(8)}; }
.bm-tester-editor-actions .bm-tool-btn { width: 100%; }
.bm-tester-trigger-edit {
  flex: none;
  display: flex;
  gap: ${u(6)};
  align-items: center;
  height: ${u(30)};
  font-size: var(--bm-fs-xs);
  color: #b8def8;
}
.bm-tester-trigger-edit[data-disabled="true"] { visibility: hidden; }
.bm-tester-trigger-edit span { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bm-tester-code-btn { height: ${u(28)}; width: ${u(56)}; padding: 0; font-size: var(--bm-fs-xs); }
.bm-tester-code-btn.bm-active { border-color: #4dd; background: rgba(0, 30, 40, 0.9); color: #aff; }
.bm-tester-code-btn.bm-selected { border-color: #ffd56a; background: rgba(62, 41, 8, 0.9); color: #fff8e5; }
.bm-tester-edit-target { color: #daf2ff; }
.bm-tester-edit-status { color: #9fc0d8; font-size: var(--bm-fs-xs); }
.bm-tester-bindings-section {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: ${u(6)};
  overflow: hidden;
}
.bm-tester-bindings-section[data-empty="true"] { visibility: hidden; }
.bm-tester-bindings-head { flex: none; height: ${u(20)}; line-height: ${u(20)}; font-size: var(--bm-fs-xs); color: #b8def8; }
.bm-tester-bindings-list { flex: 1 1 0; min-height: 0; overflow-y: auto; list-style: none; display: grid; align-content: start; gap: ${u(6)}; }
.bm-tester-binding-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${u(8)};
  height: ${u(48)};
  border: 1px solid rgba(100, 180, 220, 0.15);
  border-radius: ${u(6)};
  padding: 0 ${u(8)};
  background: rgba(11, 20, 30, 0.8);
  font-size: var(--bm-fs-xs);
  color: #d6ecff;
}
.bm-tester-binding-meta { color: #8eb8d4; }
.bm-tester-binding-remove { height: ${u(28)}; font-size: var(--bm-fs-xs); }
.bm-tester-binding-empty {
  height: ${u(36)};
  line-height: ${u(34)};
  padding: 0 ${u(8)};
  color: #8eb8d4;
  font-size: var(--bm-fs-xs);
  font-style: italic;
  border: 1px dashed rgba(100, 180, 220, 0.2);
  border-radius: ${u(6)};
}

/* ---- Live controller view (SVG, user units scale with the viewBox) ---- */
.bm-pad-outline { fill: rgba(20, 40, 58, 0.85); stroke: rgba(150, 210, 240, 0.28); stroke-width: 2; }
.bm-pad-el { pointer-events: none; }
.bm-pad-shape { fill: rgba(10, 22, 33, 0.92); stroke: rgba(191, 223, 244, 0.45); stroke-width: 2; }
.bm-pad-label,
.bm-pad-value { fill: #d9edfa; font-weight: 600; pointer-events: none; }
.bm-pad-value { fill: #a9cbe0; font-weight: 500; font-variant-numeric: tabular-nums; }
.bm-pad-ring { fill: rgba(6, 12, 20, 0.6); stroke: rgba(178, 214, 236, 0.4); stroke-width: 2; }
.bm-pad-cross { stroke: rgba(180, 210, 228, 0.16); stroke-width: 1.5; }
.bm-pad-hit { fill: transparent; stroke: none; }
.bm-pad-tick .bm-pad-shape { fill: rgba(191, 223, 244, 0.16); stroke: rgba(191, 223, 244, 0.32); }
.bm-pad-fill { fill: rgba(76, 201, 240, 0.5); pointer-events: none; }
.bm-pad-el.bm-active .bm-pad-shape { fill: #4cc9f0; stroke: #c9f4ff; }
.bm-pad-el.bm-active .bm-pad-label { fill: #04202c; }
.bm-pad-trigger.bm-active .bm-pad-shape { fill: rgba(10, 22, 33, 0.92); stroke: #7cf0ff; }
.bm-pad-trigger.bm-active .bm-pad-label { fill: #f2fcff; }
.bm-pad-edit .bm-pad-el.bm-editable { pointer-events: all; cursor: pointer; }
.bm-pad-edit .bm-pad-el.bm-editable .bm-pad-shape { stroke-dasharray: 6 4; }
.bm-pad-edit .bm-pad-el.bm-editable:hover .bm-pad-shape { stroke: #ecf8ff; }
.bm-pad-el.bm-selected .bm-pad-shape { fill: rgba(62, 41, 8, 0.95); stroke: #ffd56a; stroke-dasharray: none; }
.bm-pad-el.bm-selected .bm-pad-label { fill: #fff8e5; }

/* ---- Input Remap ---- */
.bm-debug-body {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: ${u(BODY_PAD)};
  padding: ${u(BODY_PAD)};
}
.bm-debug-preset-row { flex: none; display: flex; align-items: center; gap: ${u(10)}; height: ${u(36)}; color: #98a6d8; font-size: var(--bm-fs-xs); }
.bm-debug-status { color: #cfd8ff; }
.bm-debug-progress { color: #9fb2f5; font-size: var(--bm-fs-xs); }
.bm-debug-countdown { color: #ffc177; font-size: var(--bm-fs-xs); font-weight: 600; }
.bm-debug-live-state { color: #b8c4ff; font-size: var(--bm-fs-xs); }
.bm-debug-live { color: #b8c4ff; }
.bm-debug-validation { color: #cfd8ff; font-size: var(--bm-fs-xs); }
.bm-debug-results {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  resize: none;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: ${u(6)};
  background: rgba(0, 0, 0, 0.3);
  color: #dfe5ff;
  font-family: ${MONO};
  font-size: var(--bm-fs-xs);
  line-height: 1.45;
  padding: ${u(10)};
}

/* ---- Capture mini modal ---- */
.bm-capture-mini-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: ${u(8)};
  padding: ${u(BODY_PAD)};
}
.bm-capture-mini-instruction { font-size: var(--bm-fs-m); line-height: ${u(22)}; color: #d6ecff; }
.bm-capture-mini-countdown { color: #8fd6ff; }
.bm-capture-mini-live-state { color: #a7eaff; font-size: var(--bm-fs-xs); }
.bm-capture-mini-live { color: #a7eaff; border-color: rgba(100, 180, 220, 0.2); background: rgba(9, 18, 27, 0.8); }

/* ---- Below the floor: one column, panel scrolls inside the viewport ---- */
@media (max-width: 1279px), (max-height: 719px) {
  .bm-tester-panel,
  .bm-debug-panel,
  .bm-capture-mini-panel {
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 16px);
    height: auto;
    overflow-y: auto;
  }
  .bm-tool-head { flex-wrap: wrap; height: auto; min-height: ${u(HEAD_H)}; padding: ${u(10)} ${u(BODY_PAD)}; }
  .bm-tool-select { flex: 1 1 ${u(200)}; width: auto; min-width: 0; }
  .bm-tester-body,
  .bm-tester-panel.bm-side-open .bm-tester-body,
  .bm-debug-body { grid-template-columns: minmax(0, 1fr); flex: none; }
  .bm-tester-pad-wrap { flex: none; aspect-ratio: 1000 / 660; }
  .bm-tester-side > section,
  .bm-tester-panel.bm-debug-on.bm-editor-on .bm-tester-debug { flex: none; }
  .bm-tester-raw,
  .bm-tester-bindings-section,
  .bm-tester-bindings-list { flex: none; }
  .bm-debug-results { flex: none; height: ${u(360)}; }
  .bm-capture-mini-body { flex: none; }
}
`;
