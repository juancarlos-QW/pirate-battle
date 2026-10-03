import { CONTROL_BINDINGS, type GameAction } from '../../config/controls.ts';
import { angleDelta } from '../sim/math.ts';
import { IDLE_INPUT, type SimInput } from '../sim/types.ts';

type HeldAction = keyof SimInput;
type Source = 'keyboard' | 'touch';

/** Direction the joystick points to (radians, same convention as ship headings) and how far. */
export interface JoystickVector {
  readonly angle: number;
  /** 0 at the center, 1 at the rim. */
  readonly strength: number;
}

/** Below this strength the joystick is considered centered. */
const JOYSTICK_DEAD_ZONE = 0.25;
/** Heading error tolerated before turning. Larger than one step of rotation, so it never jitters. */
const JOYSTICK_AIM_TOLERANCE = 0.1;

/**
 * Converts a joystick vector into held actions for a ship facing `heading`:
 * sail forward and turn the shortest way toward the joystick direction.
 */
export function joystickToInput(
  heading: number,
  joystick: JoystickVector | null,
): Pick<SimInput, 'forward' | 'turnLeft' | 'turnRight'> {
  if (!joystick || joystick.strength < JOYSTICK_DEAD_ZONE) {
    return { forward: false, turnLeft: false, turnRight: false };
  }
  const delta = angleDelta(heading, joystick.angle);
  return {
    forward: true,
    turnLeft: delta < -JOYSTICK_AIM_TOLERANCE,
    turnRight: delta > JOYSTICK_AIM_TOLERANCE,
  };
}

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
  private joystick: JoystickVector | null = null;
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

  /** Called by the on-screen joystick; `null` when released. */
  setJoystick(joystick: JoystickVector | null): void {
    this.joystick = joystick;
  }

  /** Held actions for this step. `heading` is the player's angle, used to steer with the joystick. */
  snapshot(heading: number): SimInput {
    const steering = joystickToInput(heading, this.joystick);
    const input = { ...IDLE_INPUT };
    for (const action of Object.keys(input) as HeldAction[]) {
      input[action] = this.held.keyboard.has(action) || this.held.touch.has(action);
    }
    input.forward ||= steering.forward;
    input.turnLeft ||= steering.turnLeft;
    input.turnRight ||= steering.turnRight;
    return input;
  }

  /** Releases everything, e.g. when the game is paused or the window loses focus. */
  readonly clear = (): void => {
    this.held.keyboard.clear();
    this.held.touch.clear();
    this.joystick = null;
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
