import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from './Button.tsx';

interface DialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /** When false, Escape and the close button are disabled (e.g. a blocking prompt). */
  readonly dismissible?: boolean;
  readonly className?: string;
}

/**
 * Modal dialog built on the native `<dialog>` element. `showModal()` makes the rest of the page
 * inert (focus containment), Escape closes it and focus returns to the previously focused element.
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
  dismissible = true,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const previouslyFocused = document.activeElement as HTMLElement | null;
      dialog.showModal();
      return () => {
        if (dialog.open) dialog.close();
        previouslyFocused?.focus?.({ preventScroll: true });
      };
    }
    return undefined;
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog panel panel--md${className ? ` ${className}` : ''}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
    >
      <div className="panel__body dialog__body">
        <div className="dialog__header">
          <h2 id={titleId} className="panel-title">
            {title}
          </h2>
          {dismissible && (
            <IconButton icon="close" label="Close" className="dialog__close" onClick={onClose} />
          )}
        </div>
        {children}
      </div>
    </dialog>
  );
}
