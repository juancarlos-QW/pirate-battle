import { useState } from 'react';
import type { LogTab } from '../../app/navigation.ts';
import { Button } from '../components/Button.tsx';
import { ControlsGuide } from '../components/ControlsGuide.tsx';
import { Dialog } from '../components/Dialog.tsx';
import { Panel } from '../components/Panel.tsx';
import { useFocusOnMount } from '../hooks/useFocusOnMount.ts';
import { MENU_SHIP_URL, uiImage } from '../uiAssets.ts';

interface MainMenuScreenProps {
  readonly onPlay: () => void;
  readonly onOptions: () => void;
  readonly onOpenLog: (tab: LogTab) => void;
}

export function MainMenuScreen({ onPlay, onOptions, onOpenLog }: MainMenuScreenProps) {
  const headingRef = useFocusOnMount<HTMLHeadingElement>();
  const [controlsOpen, setControlsOpen] = useState(false);

  return (
    <Panel className="main-menu">
      <h1 className="main-menu__title" ref={headingRef} tabIndex={-1}>
        <img
          src={uiImage('menu/title_pirate_battle')}
          alt="Pirate Battle"
          width={384}
          height={128}
        />
      </h1>
      <p className="main-menu__tagline">Set sail. Take command.</p>

      <nav className="main-menu__actions" aria-label="Main menu">
        <Button onClick={onPlay}>Play</Button>
        <Button onClick={onOptions}>Options</Button>
        <Button variant="secondary" size="sm" onClick={() => setControlsOpen(true)}>
          How to play
        </Button>
      </nav>

      <img className="main-menu__ship" src={MENU_SHIP_URL} alt="" width={44} height={76} />
      <p className="main-menu__hint">Navigate the islands. Survive the battle.</p>

      <div className="main-menu__log" role="group" aria-label="Captain's log">
        <Button variant="secondary" size="sm" onClick={() => onOpenLog('ranking')}>
          Ranking
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onOpenLog('history')}>
          Match history
        </Button>
      </div>

      <Dialog open={controlsOpen} title="How to play" onClose={() => setControlsOpen(false)}>
        <p className="dialog__lead">
          Sink as many enemy ships as you can before the time runs out. Chasers ram your ship;
          shooters keep their distance and fire. Each ship you sink is worth 1 point.
        </p>
        <ControlsGuide />
      </Dialog>
    </Panel>
  );
}
