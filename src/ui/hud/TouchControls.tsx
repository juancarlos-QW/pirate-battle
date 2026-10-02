import { useState, type PointerEvent } from 'react';
import type { SimInput } from '../../game/sim/types.ts';
import { iconUrl, type IconName } from '../uiAssets.ts';

type HeldAction = keyof SimInput;

interface TouchControlsProps {
  readonly onChange: (action: HeldAction, pressed: boolean) => void;
}

interface TouchButtonSpec {
  readonly action: HeldAction;
  readonly icon: IconName;
  readonly label: string;
}

const STEERING: readonly TouchButtonSpec[] = [
  { action: 'turnLeft', icon: 'turn_left', label: 'Turn left' },
  { action: 'forward', icon: 'forward', label: 'Sail forward' },
  { action: 'turnRight', icon: 'turn_right', label: 'Turn right' },
];

const WEAPONS: readonly TouchButtonSpec[] = [
  { action: 'fireLeft', icon: 'fire_left', label: 'Left broadside' },
  { action: 'fireFront', icon: 'fire_front', label: 'Fire front cannon' },
  { action: 'fireRight', icon: 'fire_right', label: 'Right broadside' },
];

/**
 * On-screen buttons for touch devices (shown through a `pointer: coarse` media query).
 * Each button captures its pointer, so several can be held at once with different fingers.
 * Hidden from assistive technology: keyboard controls cover the same actions.
 */
export function TouchControls({ onChange }: TouchControlsProps) {
  return (
    <div className="touch-controls" aria-hidden="true">
      <div className="touch-controls__pad touch-controls__pad--steer">
        {STEERING.map((spec) => (
          <TouchButton key={spec.action} spec={spec} onChange={onChange} />
        ))}
      </div>
      <div className="touch-controls__pad touch-controls__pad--fire">
        {WEAPONS.map((spec) => (
          <TouchButton key={spec.action} spec={spec} onChange={onChange} />
        ))}
      </div>
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
