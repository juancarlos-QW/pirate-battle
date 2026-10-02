import type { ReactNode } from 'react';
import { LOGO_URL } from '../uiAssets.ts';

interface ScreenLayoutProps {
  readonly children: ReactNode;
  readonly label: string;
}

/** Full-screen scene with the illustrated sea background and a centered content slot. */
export function ScreenLayout({ children, label }: ScreenLayoutProps) {
  return (
    <main className="scene" aria-label={label}>
      <div className="scene__content">{children}</div>
      <img className="scene__logo" src={LOGO_URL} alt="Jungle Gaming" width={120} height={60} />
    </main>
  );
}
