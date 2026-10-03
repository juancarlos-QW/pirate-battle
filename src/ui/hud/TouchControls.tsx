import { useState, type PointerEvent } from 'react';
import type { JoystickVector } from '../../game/input/InputController.ts';
import type { SimInput } from '../../game/sim/types.ts';
import { iconUrl, type IconName } from '../uiAssets.ts';

type HeldAction = keyof SimInput;

interface TouchControlsProps {
  readonly onChange: (action: HeldAction, pressed: boolean) => void;
  readonly onJoystick: (joystick: JoystickVector | null) => void;
}

interface TouchButtonSpec {
  readonly action: HeldAction;
  readonly icon: IconName;
  readonly label: string;
}

const WEAPONS: readonly TouchButtonSpec[] = [
  { action: 'fireLeft', icon: 'fire_left', label: 'Left broadside' },
  { action: 'fireFront', icon: 'fire_front', label: 'Fire front cannon' },
  { action: 'fireRight', icon: 'fire_right', label: 'Right broadside' },
];

/**
 * On-screen controls for touch devices (shown through a `pointer: coarse` media query):
 * a joystick on the left to steer and fire buttons on the right.
 * Each control captures its pointer, so steering and firing work with different fingers.
 * Hidden from assistive technology: keyboard controls cover the same actions.
 */
export function TouchControls({ onChange, onJoystick }: TouchControlsProps) {
  return (
    <div className="touch-controls" aria-hidden="true">
      <Joystick onChange={onJoystick} />
      <div className="touch-controls__pad touch-controls__pad--fire">
        {WEAPONS.map((spec) => (
          <TouchButton key={spec.action} spec={spec} onChange={onChange} />
        ))}
      </div>
    </div>
  );
}

/**
 * How far the knob may move from the center, in % of its own size. The knob is 44% of the base
 * (see `.touch-joystick__knob`), so (100 - 44) / 2 / 44 ≈ 64% keeps it inside the rim.
 */
const KNOB_TRAVEL = 64;

/**
 * Virtual joystick: the knob follows the finger inside the base, and the ship sails toward the
 * direction it points to. The knob offset is kept in base radii (-1..1) so CSS can size freely.
 */
function Joystick({ onChange }: { readonly onChange: TouchControlsProps['onJoystick'] }) {
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);

  const update = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = rect.width / 2;
    const dx = event.clientX - (rect.left + radius);
    const dy = event.clientY - (rect.top + radius);
    const strength = Math.min(1, Math.hypot(dx, dy) / radius);
    const angle = Math.atan2(dy, dx);
    setKnob({ x: Math.cos(angle) * strength, y: Math.sin(angle) * strength });
    onChange({ angle, strength });
  };

  const press = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    update(event);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (knob) update(event);
  };
  const release = () => {
    setKnob(null);
    onChange(null);
  };

  return (
    <div
      className={`touch-joystick${knob ? ' touch-joystick--active' : ''}`}
      onPointerDown={press}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        className="touch-joystick__knob"
        style={{
          transform: `translate(${(knob?.x ?? 0) * KNOB_TRAVEL}%, ${(knob?.y ?? 0) * KNOB_TRAVEL}%)`,
        }}
      />
    </div>
  );
}

function TouchButton({
  spec,
  onChange,
}: {
  readonly spec: TouchButtonSpec;
  readonly onChange: TouchControlsProps['onChange'];
}) {
  const [pressed, setPressed] = useState(false);

  const press = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPressed(true);
    onChange(spec.action, true);
  };
  const release = () => {
    setPressed(false);
    onChange(spec.action, false);
  };

  return (
    <button
      type="button"
      tabIndex={-1}
      className={`round-btn touch-controls__btn touch-controls__btn--${spec.action}`}
      aria-label={spec.label}
      aria-pressed={pressed}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(event) => event.preventDefault()}
    >
      <img src={iconUrl(spec.icon)} alt="" draggable={false} />
    </button>
  );
}
