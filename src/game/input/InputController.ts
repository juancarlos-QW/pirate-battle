import { CONTROL_BINDINGS, type GameAction } from '../../config/controls.ts';
import { IDLE_INPUT, type SimInput } from '../sim/types.ts';

type HeldAction = keyof SimInput;
type Source = 'keyboard' | 'touch';

const ACTION_BY_CODE = new Map<string, GameAction>(
  CONTROL_BINDINGS.flatMap((binding) =>
    binding.codes.map((code) => [code, binding.action] as const),
  ),
);

/**
 * Merges keyboard and touch input into the held-action snapshot read by the simulation.
 * Keyboard and touch are tracked separately so releasing one never cancels the other.
 * `pause` is edge triggered and reported through `onPause`.
 */
export class InputController {
  private readonly held: Record<Source, Set<HeldAction>> = {
    keyboard: new Set(),
    touch: new Set(),
  };
  private readonly onPause: () => void;
  private attached = false;

  constructor(onPause: () => void) {
    this.onPause = onPause;
  }

  attach(target: Window = window): void {
    if (this.attached) return;
    this.attached = true;
    target.addEventListener('keydown', this.handleKeyDown);
    target.addEventListener('keyup', this.handleKeyUp);
    target.addEventListener('blur', this.clear);
  }

  detach(target: Window = window): void {
    if (!this.attached) return;
    this.attached = false;
    target.removeEventListener('keydown', this.handleKeyDown);
    target.removeEventListener('keyup', this.handleKeyUp);
    target.removeEventListener('blur', this.clear);
    this.clear();
  }

  /** Called by the on-screen touch buttons. */
  setTouch(action: HeldAction, pressed: boolean): void {
    if (pressed) this.held.touch.add(action);
    else this.held.touch.delete(action);
  }

  snapshot(): SimInput {
    const input = { ...IDLE_INPUT };
    for (const action of Object.keys(input) as HeldAction[]) {
      input[action] = this.held.keyboard.has(action) || this.held.touch.has(action);
    }
    return input;
  }

  /** Releases everything, e.g. when the game is paused or the window loses focus. */
  readonly clear = (): void => {
    this.held.keyboard.clear();
    this.held.touch.clear();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const action = ACTION_BY_CODE.get(event.code);
    if (!action || event.altKey || event.ctrlKey || event.metaKey) return;
    // Let dialogs and form controls keep their keys; pause still works everywhere.
    if (isInteractive(event.target) && action !== 'pause') return;
    // Also stops Space/Enter from clicking a focused HUD button while steering.
    event.preventDefault();
    if (action === 'pause') {
      if (!event.repeat) this.onPause();
      return;
    }
    this.held.keyboard.add(action);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const action = ACTION_BY_CODE.get(event.code);
    if (!action || action === 'pause') return;
    this.held.keyboard.delete(action);
    if (!isInteractive(event.target)) event.preventDefault();
  };
}

function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('input, textarea, select, dialog[open]') !== null
  );
}
