import type { ComponentPropsWithRef } from 'react';
import { iconUrl, type IconName } from '../uiAssets.ts';

type NativeButtonProps = Omit<ComponentPropsWithRef<'button'>, 'className'>;

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
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn btn--${variant} btn--${size}${className ? ` ${className}` : ''}`}
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
export function IconButton({ icon, label, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`round-btn${className ? ` ${className}` : ''}`}
      {...rest}
    >
      <img src={iconUrl(icon)} alt="" draggable={false} />
    </button>
  );
}
