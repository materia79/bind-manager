/**
 * L3: one name. The Controller Test dialog is titled like its footer button,
 * also for assistive technology.
 */
import { describe, it, expect } from 'vitest';
import { getBuiltInToolsHtml } from '../../../src/ui/tools/tools-html.js';
import { createBuiltInToolsController } from '../../../src/ui/built-in-tools-controller.js';

describe('Controller Test naming (L3)', () => {
  it('the dialog title and aria-label match the footer button', () => {
    const host = document.createElement('div');
    host.innerHTML = getBuiltInToolsHtml();
    const panel = host.querySelector('.bm-tester-panel');
    expect(panel.querySelector('.bm-tool-title').textContent).toBe('Controller Test');
    expect(panel.getAttribute('aria-label')).toBe('Controller Test');
    expect(host.innerHTML).not.toContain('Controller Tester');
    const footer = createBuiltInToolsController({}, { builtInTools: true }).getFooterActions().find((a) => a.id === 'controller-test');
    expect(footer.label).toBe('Controller Test');
  });
});
