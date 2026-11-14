/** Stylesheet of the built-in tools (Input Remap, Controller Tester, capture mini modal). */
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

.bm-debug-modal { z-index: 10020; background: rgba(0, 0, 0, 0.78); backdrop-filter: blur(4px); }
.bm-debug-modal.bm-debug-open { display: flex; }
.bm-tester-modal { z-index: 10030; background: rgba(2, 10, 18, 0.82); backdrop-filter: blur(4px); }
.bm-tester-modal.bm-tester-open { display: flex; }
.bm-capture-mini-modal { z-index: 10040; background: rgba(0, 0, 0, 0.55); }
.bm-capture-mini-modal.bm-open { display: flex; }

.bm-debug-panel,
.bm-tester-panel,
.bm-capture-mini-panel {
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
}

.bm-debug-panel {
  width: min(880px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #111526;
  border: 1px solid #38446b;
  border-radius: 10px;
}

.bm-debug-head,
.bm-tester-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 14px 16px;
}

.bm-debug-head h2,
.bm-tester-head h2 { font-size: 15px; color: #f0f2ff; }
.bm-tester-head h2 { color: #e8f8ff; }

.bm-debug-body {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 12px;
  padding: 12px;
  overflow: auto;
}

.bm-debug-card,
.bm-tester-card {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  padding: 10px;
}

.bm-debug-card h3,
.bm-tester-card h3 {
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.bm-debug-card h3 { color: #9ab0ff; }
.bm-tester-card h3 { color: #86dfff; }

.bm-debug-status { min-height: 44px; color: #cfd8ff; line-height: 1.45; }
.bm-debug-progress { margin-top: 8px; font-size: 12px; color: #9fb2f5; }
.bm-debug-countdown { margin-top: 8px; font-size: 12px; color: #ffc177; font-weight: 600; }
.bm-debug-live,
.bm-tester-last-signal,
.bm-tester-active-codes,
.bm-capture-mini-live {
  margin-top: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.24);
  padding: 8px;
  font-size: 12px;
  line-height: 1.4;
  white-space: pre-wrap;
}

.bm-debug-live { max-height: 180px; overflow: auto; color: #b8c4ff; }
.bm-tester-last-signal,
.bm-tester-active-codes { color: #b8def8; }
.bm-capture-mini-live { color: #a7eaff; border-color: rgba(100, 180, 220, 0.2); background: rgba(9, 18, 27, 0.8); }

.bm-debug-results {
  width: 100%;
  min-height: 260px;
  resize: vertical;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.3);
  color: #dfe5ff;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  padding: 10px;
}

.bm-debug-actions,
.bm-tester-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.bm-debug-small,
.bm-tester-help { font-size: 12px; margin-top: 6px; }
.bm-debug-small { color: #98a6d8; }
.bm-tester-help { color: #8eb8d4; }

.bm-debug-profile-select,
.bm-tester-profile-select {
  min-width: 220px;
  max-width: 100%;
  height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid rgba(92, 124, 250, 0.4);
  background: rgba(15, 24, 38, 0.85);
  color: #dce6ff;
}

.bm-tool-btn {
  background: rgba(92, 124, 250, 0.2);
  border: 1px solid rgba(92, 124, 250, 0.5);
  border-radius: 7px;
  color: #c0ccff;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  padding: 7px 16px;
  transition: background 0.15s, border-color 0.15s;
}

.bm-tool-btn:hover { background: rgba(92, 124, 250, 0.4); border-color: #5c7cfa; }

.bm-tester-panel {
  width: min(940px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #0f1a26;
  border: 1px solid #35506d;
  border-radius: 10px;
}

.bm-tester-body {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 12px;
  padding: 12px;
  overflow: auto;
}

.bm-tester-status { min-height: 24px; color: #daf2ff; line-height: 1.45; margin-bottom: 6px; }
.bm-tester-detail { font-size: 12px; color: #9fc0d8; min-height: 36px; line-height: 1.4; }

.bm-tester-controller {
  position: relative;
  width: min(540px, 100%);
  height: 320px;
  margin: 0 auto;
  border-radius: 160px;
  border: 1px solid rgba(150, 210, 240, 0.2);
  background:
    radial-gradient(circle at 50% 45%, rgba(66, 164, 212, 0.22), rgba(14, 28, 42, 0.94) 64%),
    linear-gradient(165deg, rgba(40, 80, 110, 0.45), rgba(9, 16, 25, 0.95));
  overflow: hidden;
}

.bm-tester-controller::before {
  content: '';
  position: absolute;
  inset: 14px;
  border-radius: 150px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  pointer-events: none;
}

.bm-tester-node {
  position: absolute;
  min-width: 24px;
  min-height: 24px;
  border-radius: 999px;
  border: 1px solid rgba(191, 223, 244, 0.35);
  color: #d9edfa;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(12, 25, 36, 0.9);
  transition: transform 0.08s ease, box-shadow 0.08s ease, border-color 0.08s ease;
  padding: 4px 6px;
  text-align: center;
  pointer-events: none;
}

.bm-tester-controller.bm-tester-edit-mode .bm-tester-node.bm-editable {
  pointer-events: auto;
  cursor: pointer;
  border-style: dashed;
}

.bm-tester-controller.bm-tester-edit-mode .bm-tester-node.bm-editable:hover {
  transform: scale(1.06);
  border-color: rgba(236, 248, 255, 0.86);
}

.bm-tester-node.bm-selected {
  border-color: #ffd56a;
  box-shadow: 0 0 14px rgba(255, 213, 106, 0.7);
  background: rgba(62, 41, 8, 0.92);
  color: #fff8e5;
}

.bm-tester-node.bm-active {
  border-color: #7cf0ff;
  box-shadow: 0 0 14px rgba(124, 240, 255, 0.75);
  transform: scale(1.06);
  background: rgba(18, 55, 78, 0.95);
  color: #f2fcff;
}

.bm-tester-node.bm-wide { border-radius: 8px; min-width: 46px; min-height: 22px; }

.bm-tester-stick {
  position: absolute;
  width: 88px;
  height: 88px;
  border-radius: 50%;
  border: 1px solid rgba(178, 214, 236, 0.36);
  background: rgba(6, 12, 20, 0.55);
  pointer-events: none;
}

.bm-tester-stick::before,
.bm-tester-stick::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  background: rgba(180, 210, 228, 0.18);
  transform: translate(-50%, -50%);
}

.bm-tester-stick::before { width: 1px; height: 100%; }
.bm-tester-stick::after { width: 100%; height: 1px; }

.bm-tester-stick-dot {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid rgba(200, 232, 250, 0.7);
  background: rgba(78, 157, 208, 0.55);
  transform: translate(-50%, -50%);
  transition: transform 0.08s linear;
}

.bm-tester-trigger-meter {
  position: absolute;
  width: 18px;
  height: 58px;
  border-radius: 8px;
  border: 1px solid rgba(180, 220, 245, 0.32);
  background: rgba(8, 14, 22, 0.66);
  overflow: hidden;
}

.bm-tester-trigger-fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 0%;
  background: linear-gradient(180deg, rgba(83, 178, 233, 0.72), rgba(30, 105, 158, 0.95));
  transition: height 0.08s linear;
}

.bm-tester-raw-section { margin-top: 6px; text-align: left; }
.bm-tester-raw-pre {
  font-family: 'Courier New', Courier, monospace;
  font-size: 10px;
  line-height: 1.5;
  color: #7cc8ea;
  background: rgba(7, 15, 23, 0.88);
  border: 1px solid rgba(100, 180, 220, 0.18);
  border-radius: 6px;
  padding: 8px 10px;
  margin-top: 6px;
  max-height: 220px;
  overflow-y: auto;
  white-space: pre;
  text-align: left;
}

.bm-tester-trigger-edit {
  position: absolute;
  left: 50%;
  top: 94px;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid rgba(100, 180, 220, 0.25);
  background: rgba(7, 15, 23, 0.82);
  font-size: 11px;
  color: #b8def8;
  z-index: 3;
}

.bm-tester-trigger-edit span { opacity: 0.9; white-space: nowrap; }
.bm-tester-code-btn { font-size: 11px; padding: 2px 8px; height: 26px; }
.bm-tester-code-btn.bm-active { border-color: #4dd; background: rgba(0, 30, 40, 0.9); color: #aff; }
.bm-tester-code-btn.bm-selected { border-color: #ffd56a; background: rgba(62, 41, 8, 0.9); color: #fff8e5; }

.bm-tester-bindings-section {
  margin-top: 8px;
  border: 1px solid rgba(100, 180, 220, 0.2);
  border-radius: 8px;
  background: rgba(8, 16, 24, 0.75);
  padding: 8px;
}

.bm-tester-bindings-head { font-size: 12px; color: #b8def8; margin-bottom: 6px; }
.bm-tester-bindings-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }

.bm-tester-binding-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(100, 180, 220, 0.15);
  border-radius: 6px;
  padding: 6px 8px;
  background: rgba(11, 20, 30, 0.8);
  font-size: 12px;
  color: #d6ecff;
}

.bm-tester-binding-meta { color: #8eb8d4; font-size: 11px; }
.bm-tester-binding-remove { height: 24px; padding: 2px 8px; font-size: 11px; flex-shrink: 0; }
.bm-tester-binding-empty {
  color: #8eb8d4;
  font-size: 12px;
  font-style: italic;
  border: 1px dashed rgba(100, 180, 220, 0.2);
  border-radius: 6px;
  padding: 6px 8px;
}

.bm-capture-mini-panel {
  width: min(560px, 92vw);
  max-height: 80vh;
  overflow: auto;
  border-radius: 12px;
  border: 1px solid rgba(110, 200, 230, 0.35);
  background: linear-gradient(180deg, rgba(10, 22, 34, 0.98), rgba(8, 16, 24, 0.98));
  color: #d6ecff;
  padding: 12px 14px;
}

.bm-capture-mini-instruction { margin-top: 6px; font-size: 14px; color: #d6ecff; }
.bm-capture-mini-countdown { margin-top: 6px; font-size: 13px; color: #8fd6ff; }

@media (max-width: 860px) {
  .bm-debug-body { grid-template-columns: 1fr; }
  .bm-tester-body { grid-template-columns: 1fr; }
  .bm-tester-controller { height: 300px; }
}
`;
