import { injectStyles } from './styles.js';
import { BUILT_IN_TOOLS_CSS } from './tools/tools-css.js';
import { getBuiltInToolsHtml } from './tools/tools-html.js';
import { createToolContext } from './tools/tool-context.js';
import { createInputDebugger } from './tools/input-debugger.js';
import { createControllerTester } from './tools/controller-tester.js';

let builtInToolsStylesInjected = false;

export function createBuiltInToolsController(manager, options = {}) {
  const enabledTools = normalizeBuiltInToolsOption(options.builtInTools);
  let root = null;
  let container = null;
  let ctx = null;
  let inputDebug = null;
  let controllerTester = null;

  function injectToolStyles() {
    if (builtInToolsStylesInjected || typeof document === 'undefined') return;
    builtInToolsStylesInjected = true;
    const style = document.createElement('style');
    style.dataset.bindManager = 'built-in-tools';
    style.textContent = BUILT_IN_TOOLS_CSS;
    document.head.appendChild(style);
  }

  function mount(target) {
    if (!enabledTools.inputRemap && !enabledTools.controllerTest) return;
    if (root || !target) return;
    injectStyles();
    injectToolStyles();
    container = target;
    root = document.createElement('div');
    root.className = 'bm-built-in-tools-root';
    root.innerHTML = getBuiltInToolsHtml();
    container.appendChild(root);
    ctx = createToolContext(manager, root);
    inputDebug = createInputDebugger(ctx);
    controllerTester = createControllerTester(ctx);
  }

  function unmount() {
    inputDebug?.close?.();
    controllerTester?.close?.();
    ctx?.dispose();
    root?.remove();
    root = null;
    container = null;
    ctx = null;
    inputDebug = null;
    controllerTester = null;
  }

  // One tool at a time: opening one closes the other first, so the open tool
  // is both the visible one and the topmost dialog (Escape, Tab, focus).
  function openInputRemap() {
    if (!enabledTools.inputRemap) return;
    if (controllerTester?.isOpen()) controllerTester.close();
    inputDebug?.open();
  }

  function openControllerTest() {
    if (!enabledTools.controllerTest) return;
    if (inputDebug?.isOpen()) inputDebug.close();
    controllerTester?.open();
  }

  /** True while the Input Remap or Controller Test tool is open. */
  function isAnyOpen() {
    return !!(inputDebug?.isOpen() || controllerTester?.isOpen());
  }

  function getFooterActions() {
    const actions = [];
    if (enabledTools.inputRemap) {
      actions.push({
        id: 'input-debug',
        label: 'Input Remap',
        className: 'debug',
        onClick: () => openInputRemap(),
      });
    }
    if (enabledTools.controllerTest) {
      actions.push({
        id: 'controller-test',
        label: 'Controller Test',
        className: 'test',
        onClick: () => openControllerTest(),
      });
    }
    return actions;
  }

  return { mount, unmount, getFooterActions, openInputRemap, openControllerTest, isAnyOpen, enabledTools };
}

function normalizeBuiltInToolsOption(value) {
  if (value === true) return { inputRemap: true, controllerTest: true };
  if (!value || typeof value !== 'object') return { inputRemap: false, controllerTest: false };
  return { inputRemap: value.inputRemap === true, controllerTest: value.controllerTest === true };
}
