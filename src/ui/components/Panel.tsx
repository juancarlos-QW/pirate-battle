import type { ReactNode } from 'react';

interface PanelProps {
  readonly children: ReactNode;
  readonly size?: 'md' | 'lg';
  readonly className?: string;
}

/** Wooden framed board drawn with the `panel_menu` sprite as a nine-slice border image. */
export function Panel({ children, size = 'md', className }: PanelProps) {
  return (
    <section className={`panel panel--${size}${className ? ` ${className}` : ''}`}>
      <div className="panel__body">{children}</div>
    </section>
  );
}
