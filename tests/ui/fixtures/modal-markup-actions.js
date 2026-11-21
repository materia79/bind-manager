/** The fixed actions of the 0.2.1 markup comparison (tests/ui/markup-0.2.1.test.js). */
export const MARKUP_ACTIONS = [
  { id: 'jump', label: 'Jump', description: 'Leave the ground', group: 'Movement', slots: 2, defaultBindings: ['Space', null], defaultGamepadBindings: ['GP_B0'] },
  { id: 'forward', label: 'Move Forward', group: 'Movement', slots: 2, defaultBindings: ['KeyW', 'ArrowUp'] },
  { id: 'save', label: 'Quick <Save> & "Load"', group: 'System', slots: 2, defaultBindings: ['ControlLeft+KeyS', null] },
  { id: 'zoom', label: 'Zoom In', group: 'Camera', slots: 2, defaultBindings: ['MouseWheelUp', null], gamepadSlots: 2 },
  { id: 'pause', label: 'Pause', group: 'System', slots: 1, defaultBindings: ['Escape'] },
];
