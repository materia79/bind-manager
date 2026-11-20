/**
 * F6: the bindings modal's profile line and the tools' header show the
 * device's own name (raw id in title) and the same chip wording:
 * "Family · Xbox", "Exact · DualSense", "Manual · …", "Generic", "Edited".
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';
import { PADS, installPad } from './tools/real-manager.js';
import { installManualRaf } from './tools/helpers.js';

function mount(spec) {
  const raf = installManualRaf();
  installPad(spec);
  const manager = createBindManager({ namespace: `line-${Math.random()}`, builtInTools: true, storage: { load: () => null, save() {} } });
  manager.registerAction({ id: 'jump', label: 'Jump', defaultGamepadBindings: ['GP_B0'] });
  manager.open();
  manager.openControllerTest();
  raf.step(2);
  const q = (s) => document.querySelector(s);
  const modalLine = () => ({ name: q('.bm-profile-name').textContent, nameTitle: q('.bm-profile-name').title, chip: q('.bm-profile-chip').textContent, chipTitle: q('.bm-profile-chip').title });
  const toolLine = () => ({ name: q('.bm-tester-device').textContent, nameTitle: q('.bm-tester-device').title, chip: q('.bm-tester-profile-chip').textContent, chipTitle: q('.bm-tester-profile-chip').title });
  return { manager, raf, modalLine, toolLine };
}

describe('profile line wording (F6)', () => {
  let t = null;
  afterEach(() => {
    t?.manager.destroy();
    t = null;
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('family source: device name, "Family · Xbox", the family in the chip title', () => {
    t = mount(PADS.xboxSeries);
    const expected = { name: 'Xbox Wireless Controller', nameTitle: PADS.xboxSeries.id, chip: 'Family · Xbox', chipTitle: 'Xbox' };
    expect(t.modalLine()).toEqual(expected);
    expect(t.toolLine()).toMatchObject({ name: expected.name, chip: expected.chip, chipTitle: expected.chipTitle });
    expect(t.toolLine().nameTitle).toContain(PADS.xboxSeries.id);
  });

  it('generic source: the device name beside "Generic"', () => {
    t = mount(PADS.generic);
    expect(t.modalLine()).toMatchObject({ name: 'USB Gamepad', chip: 'Generic' });
    expect(t.toolLine()).toMatchObject({ name: 'USB Gamepad', chip: 'Generic' });
  });

  it('exact source: "Exact · DualSense"', () => {
    t = mount(PADS.dualsenseRaw);
    expect(t.modalLine()).toMatchObject({ name: 'DualSense Wireless Controller', chip: 'Exact · DualSense' });
    expect(t.toolLine()).toMatchObject({ name: 'DualSense Wireless Controller', chip: 'Exact · DualSense' });
  });

  it('manual and edited: the chip changes, the device name does not', () => {
    t = mount(PADS.xboxSeries);
    t.manager.setGamepadProfileOverride(0, { type: 'family', family: 'stadia' });
    t.raf.step();
    expect(t.modalLine()).toMatchObject({ name: 'Xbox Wireless Controller', chip: 'Manual · Stadia' });
    expect(t.toolLine()).toMatchObject({ name: 'Xbox Wireless Controller', chip: 'Manual · Stadia' });
    t.manager.clearGamepadProfileOverride(0);
    t.manager.setGamepadProfileMappingEntry(0, 'GP_B0', { kind: 'button', index: 3 });
    t.raf.step();
    expect(t.modalLine()).toMatchObject({ name: 'Xbox Wireless Controller', chip: 'Edited' });
    expect(t.toolLine()).toMatchObject({ name: 'Xbox Wireless Controller', chip: 'Edited' });
  });
});
