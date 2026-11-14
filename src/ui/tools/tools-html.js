import { _esc } from './esc.js';
import { padSvgOpenTag } from './pad-view.js';
import { SIGNAL_FIELDS } from './signals.js';

/** Fixed key/value rows for a signal readout; values are filled at runtime. */
function signalGrid(className, fields) {
  const rows = fields.map((f) => `<dt>${_esc(f)}</dt><dd data-field="${_esc(f)}">—</dd>`).join('');
  return `<dl class="bm-tool-grid ${_esc(className)}">${rows}</dl>`;
}

function profileHeader(prefix) {
  const p = _esc(prefix);
  return `
          <div class="bm-tool-device bm-${p}-device">No controller</div>
          <span class="bm-tool-chip bm-${p}-profile-chip" data-source="none" title="Profile source">—</span>
          <select class="bm-tool-select bm-${p}-profile-select" aria-label="Controller profile"></select>`;
}

/** Static markup of the built-in tools, mounted once by createBuiltInToolsController. */
export function getBuiltInToolsHtml() {
  return `
    <div class="bm-debug-modal" aria-hidden="true">
      <div class="bm-tool-panel bm-debug-panel" role="dialog" aria-modal="true" aria-label="Input Remap" tabindex="-1">
        <div class="bm-tool-head bm-debug-head">
          <h2 class="bm-tool-title">Input Remap</h2>${profileHeader('debug')}
          <button class="bm-tool-btn bm-tool-close bm-debug-close-btn" title="Close (Esc)">Close</button>
        </div>
        <div class="bm-debug-body">
          <section class="bm-tool-section bm-debug-guide">
            <h3 class="bm-tool-section-title">Guided capture</h3>
            <label class="bm-debug-preset-row">Capture preset <select class="bm-debug-preset-select"></select></label>
            <div class="bm-tool-lines3 bm-debug-status">Press Start Debug to begin the controller mapping routine.</div>
            <div class="bm-tool-line bm-debug-progress"></div>
            <div class="bm-tool-line bm-debug-countdown"></div>
            <h3 class="bm-tool-section-title">Live strongest input delta from baseline</h3>
            <div class="bm-tool-line bm-debug-live-state">(idle)</div>
            ${signalGrid('bm-debug-live', SIGNAL_FIELDS)}
            <div class="bm-tool-row">
              <button class="bm-tool-btn bm-debug-start-btn">Start Debug</button>
              <button class="bm-tool-btn bm-debug-back-btn">Back</button>
              <button class="bm-tool-btn bm-debug-redo-btn">Redo</button>
              <button class="bm-tool-btn bm-debug-capture-btn">Capture</button>
              <button class="bm-tool-btn bm-debug-next-btn">Next</button>
            </div>
            <div class="bm-tool-row">
              <button class="bm-tool-btn bm-debug-copy-btn">Copy JSON</button>
              <button class="bm-tool-btn bm-debug-download-btn">Download JSON</button>
            </div>
            <div class="bm-tool-lines3 bm-debug-validation"></div>
            <div class="bm-tool-note">Release all controls during normalization when prompted. Each control step records for 5 seconds.</div>
          </section>
          <section class="bm-tool-section bm-debug-output">
            <h3 class="bm-tool-section-title">Generated controller definition JSON</h3>
            <textarea class="bm-debug-results" spellcheck="false" readonly aria-label="Generated controller definition JSON"></textarea>
          </section>
        </div>
      </div>
    </div>

    <div class="bm-tester-modal" aria-hidden="true">
      <div class="bm-tool-panel bm-tester-panel" role="dialog" aria-modal="true" aria-label="Controller Tester" tabindex="-1">
        <div class="bm-tool-head bm-tester-head">
          <h2 class="bm-tool-title">Controller Tester</h2>${profileHeader('tester')}
          <button class="bm-tool-btn bm-tool-toggle bm-tester-debug-btn" aria-pressed="false">Debug</button>
          <button class="bm-tool-btn bm-tool-toggle bm-tester-editor-btn" aria-pressed="false">Profile editor</button>
          <button class="bm-tool-btn bm-tool-close bm-tester-close-btn" title="Close (Esc)">Close</button>
        </div>
        <div class="bm-tester-body">
          <div class="bm-tester-main">
            <div class="bm-tester-pad-wrap">${padSvgOpenTag('bm-tester-pad')}</svg></div>
            <div class="bm-tool-line bm-tester-status" aria-live="polite">Connect a gamepad and press controls to test input mapping.</div>
          </div>
          <div class="bm-tester-side">
            <section class="bm-tool-section bm-tester-debug" hidden>
              <h3 class="bm-tool-section-title">Last signal</h3>
              ${signalGrid('bm-tester-signal', [...SIGNAL_FIELDS, 'resolved'])}
              <div class="bm-tool-line bm-tester-active-codes">Active: (none)</div>
              <h3 class="bm-tool-section-title">Raw input</h3>
              <div class="bm-tester-raw"><div class="bm-tester-raw-buttons"></div><div class="bm-tester-raw-axes"></div></div>
            </section>
            <section class="bm-tool-section bm-tester-editor" hidden>
              <h3 class="bm-tool-section-title">Profile editor</h3>
              <div class="bm-tester-editor-actions">
                <button class="bm-tool-btn bm-tester-calibrate-btn">Calibrate baseline</button>
                <button class="bm-tool-btn bm-tool-toggle bm-tester-edit-toggle-btn" aria-pressed="false">Edit mode</button>
                <button class="bm-tool-btn bm-tester-capture-update-btn" disabled>Capture update</button>
                <button class="bm-tool-btn bm-tester-download-updated-btn" disabled>Download JSON</button>
                <button class="bm-tool-btn bm-tester-reset-edits-btn" disabled title="Discard every in-memory mapping edit of this controller">Reset edits</button>
              </div>
              <div class="bm-tester-trigger-edit" data-disabled="true">
                <span>Trigger targets</span>
                <button class="bm-tool-btn bm-tester-code-btn" data-code="GP_B6">L2</button>
                <button class="bm-tool-btn bm-tester-code-btn" data-code="GP_B7">R2</button>
                <button class="bm-tool-btn bm-tester-code-btn" data-code="GP_B6A">L2A</button>
                <button class="bm-tool-btn bm-tester-code-btn" data-code="GP_B7A">R2A</button>
              </div>
              <div class="bm-tool-line bm-tester-edit-target">Edit target: (none)</div>
              <div class="bm-tool-lines2 bm-tester-edit-status">Edit mode is off.</div>
              <div class="bm-tester-bindings-section" data-empty="true">
                <div class="bm-tester-bindings-head">Bindings of the selected target</div>
                <ul class="bm-tester-bindings-list"></ul>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>

    <div class="bm-capture-mini-modal" aria-hidden="true">
      <div class="bm-tool-panel bm-capture-mini-panel" role="dialog" aria-modal="true" aria-label="Input Capture" tabindex="-1">
        <div class="bm-tool-head">
          <h2 class="bm-tool-title bm-capture-mini-title">Capture Input</h2>
          <button class="bm-tool-btn bm-tool-close bm-capture-mini-cancel-btn" title="Cancel (Esc)">Cancel</button>
        </div>
        <div class="bm-capture-mini-body">
          <div class="bm-tool-lines2 bm-capture-mini-instruction">Press and hold input now.</div>
          <div class="bm-tool-line bm-capture-mini-countdown"></div>
          <div class="bm-tool-line bm-capture-mini-live-state">Waiting for strongest signal...</div>
          ${signalGrid('bm-capture-mini-live', SIGNAL_FIELDS)}
          <div class="bm-tool-note">Capture window uses strongest stable input over 5 seconds.</div>
        </div>
      </div>
    </div>
  `;
}
