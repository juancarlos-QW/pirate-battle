import type { ComponentPropsWithRef, MouseEvent } from 'react';
import { audio } from '../../audio/AudioManager.ts';
import { iconUrl, type IconName } from '../uiAssets.ts';

type NativeButtonProps = Omit<ComponentPropsWithRef<'button'>, 'className'>;

/** Click feedback. The first click also unlocks Web Audio, which needs a user gesture. */
function withClickSound(onClick: NativeButtonProps['onClick']) {
  return (event: MouseEvent<HTMLButtonElement>) => {
    audio.unlock();
    audio.play('uiClick', { volume: 0.5 });
    onClick?.(event);
  };
}

interface ButtonProps extends NativeButtonProps {
  readonly variant?: 'primary' | 'secondary';
  readonly size?: 'md' | 'sm';
  readonly className?: string;
}

/** Text button using the `button_primary_*` / `button_secondary_*` sprites. */
export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn btn--${variant} btn--${size}${className ? ` ${className}` : ''}`}
      onClick={withClickSound(onClick)}
      {...rest}
    />
  );
}

interface IconButtonProps extends NativeButtonProps {
  readonly icon: IconName;
  /** Accessible name. Required because the button only shows an icon. */
  readonly label: string;
  readonly className?: string;
}

/** Round button using the `button_round_*` sprites with an icon on top. */
export function IconButton({
  icon,
  label,
  className,
  type = 'button',
  onClick,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`round-btn${className ? ` ${className}` : ''}`}
      onClick={withClickSound(onClick)}
      {...rest}
    >
      <img src={iconUrl(icon)} alt="" draggable={false} />
    </button>
  );
}
