/** Game actions that can be bound to keyboard keys or touch buttons. */
export type GameAction =
  'forward' | 'turnLeft' | 'turnRight' | 'fireFront' | 'fireLeft' | 'fireRight' | 'pause';

export interface ControlBinding {
  readonly action: GameAction;
  readonly label: string;
  /** `KeyboardEvent.code` values. Layout independent. */
  readonly codes: readonly string[];
  /** Human readable keys shown in the instructions. */
  readonly keys: readonly string[];
}

export const CONTROL_BINDINGS: readonly ControlBinding[] = [
  { action: 'forward', label: 'Sail forward', codes: ['KeyW', 'ArrowUp'], keys: ['W', '↑'] },
  { action: 'turnLeft', label: 'Turn left', codes: ['KeyA', 'ArrowLeft'], keys: ['A', '←'] },
  { action: 'turnRight', label: 'Turn right', codes: ['KeyD', 'ArrowRight'], keys: ['D', '→'] },
  {
    action: 'fireFront',
    label: 'Fire front cannon',
    codes: ['Space', 'KeyK'],
    keys: ['Space', 'K'],
  },
  { action: 'fireLeft', label: 'Left broadside', codes: ['KeyQ', 'KeyJ'], keys: ['Q', 'J'] },
  { action: 'fireRight', label: 'Right broadside', codes: ['KeyE', 'KeyL'], keys: ['E', 'L'] },
  { action: 'pause', label: 'Pause / resume', codes: ['KeyP', 'Escape'], keys: ['P', 'Esc'] },
];

export const TOUCH_INSTRUCTIONS =
  'On touch screens drag the joystick on the left toward where you want to sail and use the ' +
  'buttons on the right to fire. You can steer and fire at the same time.';
