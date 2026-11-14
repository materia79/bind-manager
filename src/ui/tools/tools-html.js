import { padSvgOpenTag } from './pad-view.js';

/** Static markup of the built-in tools, mounted once by createBuiltInToolsController. */
export function getBuiltInToolsHtml() {
  return `
    <div class="bm-debug-modal" aria-hidden="true">
      <div class="bm-debug-panel" role="dialog" aria-modal="true" aria-label="Input Debugger">
        <div class="bm-debug-head">
          <h2>Input Debugger</h2>
          <button class="bm-tool-btn bm-debug-close-btn">Close</button>
        </div>
        <div class="bm-debug-body">
          <div class="bm-debug-card">
            <h3>Guided Test</h3>
            <div class="bm-debug-small">Resolved controller profile</div>
            <div class="bm-debug-profile-status">Profile: waiting for controller</div>
            <div class="bm-debug-actions">
              <select class="bm-debug-profile-select"></select>
              <button class="bm-tool-btn bm-debug-profile-auto-btn">Auto</button>
            </div>
            <div class="bm-debug-small">Capture preset</div>
            <div class="bm-debug-actions"><select class="bm-debug-preset-select"></select></div>
            <div class="bm-debug-status">Press Start Debug to begin the controller mapping routine.</div>
            <div class="bm-debug-progress"></div>
            <div class="bm-debug-countdown"></div>
            <div class="bm-debug-small">Live strongest input delta from baseline</div>
            <div class="bm-debug-live">(idle)</div>
            <div class="bm-debug-actions">
              <button class="bm-tool-btn bm-debug-start-btn">Start Debug</button>
              <button class="bm-tool-btn bm-debug-back-btn">Back</button>
              <button class="bm-tool-btn bm-debug-redo-btn">Redo</button>
              <button class="bm-tool-btn bm-debug-capture-btn">Capture</button>
              <button class="bm-tool-btn bm-debug-next-btn">Next</button>
              <button class="bm-tool-btn bm-debug-copy-btn">Copy JSON</button>
              <button class="bm-tool-btn bm-debug-download-btn">Download JSON</button>
            </div>
            <div class="bm-debug-validation"></div>
            <div class="bm-debug-small">Release all controls during normalization when prompted. Each control step records for 5 seconds.</div>
          </div>
          <div class="bm-debug-card">
            <h3>Generated Controller Definition JSON</h3>
            <textarea class="bm-debug-results" spellcheck="false" readonly></textarea>
          </div>
        </div>
      </div>
    </div>

    <div class="bm-tester-modal" aria-hidden="true">
      <div class="bm-tester-panel" role="dialog" aria-modal="true" aria-label="Controller Tester" tabindex="-1">
        <div class="bm-tester-head">
          <h2>Controller Tester</h2>
          <button class="bm-tool-btn bm-tester-close-btn">Close</button>
        </div>
        <div class="bm-tester-body">
          <div class="bm-tester-card">
            <h3>Live Controller View</h3>
            ${padSvgOpenTag('bm-tester-pad')}</svg>
            <div class="bm-tester-trigger-edit" style="display:none;">
              <span>Trigger analog targets</span>
              <button class="bm-tool-btn bm-tester-code-btn" data-code="GP_B6">L2</button>
              <button class="bm-tool-btn bm-tester-code-btn" data-code="GP_B7">R2</button>
              <button class="bm-tool-btn bm-tester-code-btn" data-code="GP_B6A">L2A</button>
              <button class="bm-tool-btn bm-tester-code-btn" data-code="GP_B7A">R2A</button>
            </div>
            <div class="bm-tester-raw-section">
              <button type="button" class="bm-tool-btn bm-tester-raw-toggle-btn" style="font-size:11px;padding:2px 10px;height:26px;margin-top:6px;">Show raw input</button>
              <pre class="bm-tester-raw-pre" hidden></pre>
            </div>
          </div>
          <div class="bm-tester-card">
            <h3>Signal Details</h3>
            <div class="bm-tester-profile-status">Profile: waiting for controller</div>
            <div class="bm-tester-actions">
              <select class="bm-tester-profile-select"></select>
              <button class="bm-tool-btn bm-tester-profile-auto-btn">Auto</button>
            </div>
            <div class="bm-tester-status">Connect a gamepad and press controls to test input mapping.</div>
            <div class="bm-tester-detail">Idle.</div>
            <div class="bm-tester-actions"><button class="bm-tool-btn bm-tester-calibrate-btn">Calibrate Baseline</button></div>
            <div class="bm-tester-actions">
              <button class="bm-tool-btn bm-tester-edit-toggle-btn">Enable Edit Mode</button>
              <button class="bm-tool-btn bm-tester-capture-update-btn" disabled>Capture Update</button>
              <button class="bm-tool-btn bm-tester-download-updated-btn" disabled>Download Updated JSON</button>
            </div>
            <div class="bm-tester-edit-target">Edit target: (none)</div>
            <div class="bm-tester-edit-status">Edit mode is off.</div>
            <div class="bm-tester-bindings-section" style="display:none;">
              <div class="bm-tester-bindings-head">Current bindings for selected target</div>
              <ul class="bm-tester-bindings-list"></ul>
            </div>
            <div class="bm-tester-last-signal">Last strongest signal: (none)</div>
            <div class="bm-tester-active-codes">Active codes: (none)</div>
            <div class="bm-tester-help">Tip: keep sticks centered during calibration. Escape closes this modal.</div>
          </div>
        </div>
      </div>
    </div>

    <div class="bm-capture-mini-modal" aria-hidden="true">
      <div class="bm-capture-mini-panel" role="dialog" aria-modal="true" aria-label="Input Capture" tabindex="-1">
        <div class="bm-debug-head">
          <h3 class="bm-capture-mini-title">Capture Input</h3>
          <button class="bm-tool-btn bm-capture-mini-cancel-btn">Cancel</button>
        </div>
        <div class="bm-capture-mini-instruction">Press and hold input now.</div>
        <div class="bm-capture-mini-countdown"></div>
        <div class="bm-capture-mini-live">Waiting for strongest signal...</div>
        <div class="bm-debug-small">Capture window uses strongest stable input over 5 seconds.</div>
      </div>
    </div>
  `;
}
