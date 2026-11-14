/**
 * Pure gamepad signal helpers: strongest-signal detection, active logical codes,
 * mapping magnitudes and the raw input table. No manager access, no module state.
 */

export function getStrongestSignal(gamepad, baseline) {
  let strongest = null;
  const minDelta = 0.12;
  for (let i = 0; i < gamepad.buttons.length; i++) {
    const raw = gamepad.buttons[i]?.value || 0;
    const base = baseline.buttons[i] || 0;
    const delta = raw - base;
    if (delta > minDelta && (!strongest || delta > strongest.delta)) {
      strongest = { kind: 'button', index: i, delta, rawValue: raw };
    }
  }
  for (let i = 0; i < gamepad.axes.length; i++) {
    const raw = gamepad.axes[i] || 0;
    const base = baseline.axes[i] || 0;
    const shifted = raw - base;
    const pos = shifted > 0 ? shifted : 0;
    const neg = shifted < 0 ? -shifted : 0;
    if (pos > minDelta && (!strongest || pos > strongest.delta)) strongest = { kind: 'axis', index: i, direction: 'positive', delta: pos, rawValue: raw };
    if (neg > minDelta && (!strongest || neg > strongest.delta)) strongest = { kind: 'axis', index: i, direction: 'negative', delta: neg, rawValue: raw };
  }
  return strongest;
}

export function toGpCode(signal) {
  if (signal.kind === 'button') return `GP_B${signal.index}`;
  if (signal.kind === 'axis') return `GP_A${signal.index}${signal.direction === 'negative' ? 'N' : 'P'}`;
  return null;
}

export function resolveStrongestSignalToLogicalCode(signal, gamepad, baseline, mapping) {
  if (!signal) return null;
  if (!mapping || typeof mapping !== 'object') return toGpCode(signal);
  const candidates = [];
  for (const [code, entry] of Object.entries(mapping)) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.kind === 'button' && signal.kind === 'button' && entry.index === signal.index) candidates.push(code);
    if (entry.kind === 'axis' && signal.kind === 'axis' && entry.index === signal.index && entry.direction === signal.direction) candidates.push(code);
    if (entry.kind === 'hat' && signal.kind === 'axis' && entry.index === signal.index) {
      const tolerance = typeof entry.tolerance === 'number' ? Math.abs(entry.tolerance) : 0.2;
      const raw = gamepad.axes?.[entry.index] || 0;
      if (Math.abs(raw - entry.value) <= tolerance) candidates.push(code);
    }
  }
  if (candidates.length > 0) {
    candidates.sort();
    return candidates[0];
  }
  return toGpCode(signal);
}

export function getActiveCodes(gamepad, baseline) {
  const activeCodes = [];
  const buttonThreshold = 0.35;
  const axisThreshold = 0.42;
  for (let i = 0; i <= 16; i++) {
    const raw = gamepad.buttons?.[i]?.value || 0;
    const pressed = gamepad.buttons?.[i]?.pressed === true;
    const delta = raw - (baseline.buttons[i] || 0);
    if (pressed || delta > buttonThreshold) activeCodes.push(`GP_B${i}`);
  }
  for (let i = 0; i <= 3; i++) {
    const shifted = shiftedAxis(gamepad, baseline, i);
    if (shifted < -axisThreshold) activeCodes.push(`GP_A${i}N`);
    if (shifted > axisThreshold) activeCodes.push(`GP_A${i}P`);
  }
  return activeCodes;
}

export function getActiveLogicalCodes(gamepad, baseline, mapping) {
  if (!mapping || typeof mapping !== 'object') return getActiveCodes(gamepad, baseline);
  const active = new Set();
  const buttonThreshold = 0.35;
  const axisThreshold = 0.42;
  for (const [code, entry] of Object.entries(mapping)) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.kind === 'button') {
      const raw = gamepad.buttons?.[entry.index]?.value || 0;
      const pressed = gamepad.buttons?.[entry.index]?.pressed === true;
      const delta = raw - (baseline.buttons?.[entry.index] || 0);
      if (pressed || delta > buttonThreshold) active.add(code);
      continue;
    }
    if (entry.kind === 'axis') {
      const shifted = shiftedAxis(gamepad, baseline, entry.index);
      if (entry.direction === 'negative' && shifted < -axisThreshold) active.add(code);
      if (entry.direction === 'positive' && shifted > axisThreshold) active.add(code);
      continue;
    }
    if (entry.kind === 'hat') {
      const raw = gamepad.axes?.[entry.index] || 0;
      const tolerance = typeof entry.tolerance === 'number' ? Math.abs(entry.tolerance) : 0.2;
      if (Math.abs(raw - entry.value) <= tolerance) active.add(code);
    }
  }
  const l2A = (gamepad.buttons?.[6]?.value ?? 0) - (baseline?.buttons?.[6] ?? 0);
  const r2A = (gamepad.buttons?.[7]?.value ?? 0) - (baseline?.buttons?.[7] ?? 0);
  if (l2A > 0.25) active.add('GP_B6A');
  if (r2A > 0.25) active.add('GP_B7A');
  return [...active];
}

export function createNeutralBaseline(gamepad) {
  return { buttons: new Array(gamepad.buttons?.length || 0).fill(0), axes: new Array(gamepad.axes?.length || 0).fill(0) };
}

export function shiftedAxis(gamepad, baseline, axisIndex) {
  const raw = gamepad.axes?.[axisIndex] || 0;
  const base = baseline.axes?.[axisIndex] || 0;
  return raw - base;
}

export function readButtonDelta(gamepad, baseline, buttonIndex) {
  const raw = gamepad.buttons?.[buttonIndex]?.value || 0;
  const base = baseline.buttons?.[buttonIndex] || 0;
  return raw - base;
}

export function clamp01(value) { return Math.max(0, Math.min(1, value)); }

export function buildAxisBar(value, width) {
  const center = Math.floor(width / 2);
  const pos = Math.min(width - 1, Math.max(0, Math.round(((value + 1) / 2) * width)));
  return Array.from({ length: width }, (_, i) => {
    if (i === pos) return '●';
    if (i === center) return '│';
    return '·';
  }).join('');
}

export function updateRawInputDisplay(preEl, gamepad, baseline) {
  if (!preEl || preEl.hidden) return;
  if (!gamepad) { preEl.textContent = ''; return; }
  const BTH = 0.05;
  const ATH = 0.05;
  const bRows = [];
  for (let i = 0; i < gamepad.buttons.length; i++) {
    const raw = gamepad.buttons[i]?.value ?? 0;
    const pressed = gamepad.buttons[i]?.pressed ?? false;
    const delta = raw - (baseline?.buttons[i] ?? 0);
    const active = pressed || delta > BTH;
    bRows.push(`${active ? '●' : '○'}B${String(i).padStart(2, '0')}:${raw.toFixed(2)}`);
  }
  const bLines = [];
  for (let i = 0; i < bRows.length; i += 5) bLines.push(bRows.slice(i, i + 5).join('  '));
  const aLines = [];
  for (let i = 0; i < gamepad.axes.length; i++) {
    const raw = gamepad.axes[i] ?? 0;
    const delta = raw - (baseline?.axes[i] ?? 0);
    const active = Math.abs(delta) > ATH;
    const rawFmt = (raw >= 0 ? '+' : '') + raw.toFixed(3);
    const dFmt = (delta >= 0 ? '+' : '') + delta.toFixed(3);
    aLines.push(`${active ? '→' : ' '}A${String(i).padStart(2, '0')}: ${rawFmt}  Δ${dFmt}  [${buildAxisBar(raw, 15)}]`);
  }
  preEl.textContent = [bLines.join('\n') || '(no buttons)', '', aLines.join('\n') || '(no axes)'].join('\n');
}

export function readMappingMagnitude(gamepad, baseline, entry) {
  if (!entry || typeof entry !== 'object') return 0;
  if (entry.kind === 'button') {
    const raw = gamepad.buttons?.[entry.index]?.value || 0;
    const base = baseline.buttons?.[entry.index] || 0;
    return Math.max(0, raw - base);
  }
  if (entry.kind === 'axis') {
    const shifted = shiftedAxis(gamepad, baseline, entry.index);
    if (entry.direction === 'negative') return Math.max(0, -shifted);
    return Math.max(0, shifted);
  }
  if (entry.kind === 'hat') {
    const raw = gamepad.axes?.[entry.index] || 0;
    const tolerance = typeof entry.tolerance === 'number' ? Math.abs(entry.tolerance) : 0.2;
    return Math.abs(raw - entry.value) <= tolerance ? 1 : 0;
  }
  return 0;
}

export function getLogicalAxisValueFromMapping(gamepad, baseline, mapping, axisIndex, fallbackRawAxisIndex) {
  const codeN = `GP_A${axisIndex}N`;
  const codeP = `GP_A${axisIndex}P`;
  const nEntry = mapping?.[codeN];
  const pEntry = mapping?.[codeP];
  if (!nEntry && !pEntry) {
    return shiftedAxis(gamepad, baseline, fallbackRawAxisIndex);
  }
  const neg = nEntry ? readMappingMagnitude(gamepad, baseline, nEntry) : 0;
  const pos = pEntry ? readMappingMagnitude(gamepad, baseline, pEntry) : 0;
  return Math.max(-1, Math.min(1, pos - neg));
}

export function getTriggerFillValue(gamepad, baseline, mapping, analogCode, fallbackButtonIndex) {
  const mappedEntry = mapping?.[analogCode];
  if (mappedEntry) return clamp01(readMappingMagnitude(gamepad, baseline, mappedEntry));
  return clamp01(readButtonDelta(gamepad, baseline, fallbackButtonIndex));
}

export function toProfileMappingEntry(signal) {
  if (!signal || typeof signal !== 'object') return null;
  if (signal.kind === 'button' && Number.isInteger(signal.index)) {
    return { kind: 'button', index: signal.index };
  }
  if (signal.kind === 'axis' && Number.isInteger(signal.index)) {
    return { kind: 'axis', index: signal.index, direction: signal.direction === 'negative' ? 'negative' : 'positive' };
  }
  return null;
}
