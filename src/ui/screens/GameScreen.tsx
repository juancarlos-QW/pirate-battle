import { Button } from '../components/Button.tsx';
import { Panel } from '../components/Panel.tsx';
import { useFocusOnMount } from '../hooks/useFocusOnMount.ts';

interface GameScreenProps {
  readonly onExit: () => void;
}

/** Placeholder until the PixiJS arena lands (stage 2). */
export function GameScreen({ onExit }: GameScreenProps) {
  const headingRef = useFocusOnMount<HTMLHeadingElement>();
  return (
    <Panel>
      <h1 className="panel-title" ref={headingRef} tabIndex={-1}>
        Battle
      </h1>
      <p className="empty-state">The arena is under construction.</p>
      <Button onClick={onExit}>Main menu</Button>
    </Panel>
  );
}
