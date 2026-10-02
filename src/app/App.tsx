import { useReducer } from 'react';
import { ScreenLayout } from '../ui/components/ScreenLayout.tsx';
import { CaptainsLogScreen } from '../ui/screens/CaptainsLogScreen.tsx';
import { GameScreen } from '../ui/screens/GameScreen.tsx';
import { MainMenuScreen } from '../ui/screens/MainMenuScreen.tsx';
import { OptionsScreen } from '../ui/screens/OptionsScreen.tsx';
import { initialNavigation, navigationReducer } from './navigation.ts';

const SCREEN_LABELS = {
  menu: 'Main menu',
  options: 'Options',
  log: "Captain's log",
  game: 'Battle',
  result: 'Battle result',
} as const;

export function App() {
  const [{ screen }, navigate] = useReducer(navigationReducer, initialNavigation);
  const toMenu = () => navigate({ type: 'menu' });

  return (
    <ScreenLayout label={SCREEN_LABELS[screen.name]}>
      {screen.name === 'menu' && (
        <MainMenuScreen
          onPlay={() => navigate({ type: 'play' })}
          onOptions={() => navigate({ type: 'options' })}
          onOpenLog={(tab) => navigate({ type: 'log', tab })}
        />
      )}
      {screen.name === 'options' && <OptionsScreen onBack={toMenu} />}
      {screen.name === 'log' && (
        <CaptainsLogScreen
          tab={screen.tab}
          onTabChange={(tab) => navigate({ type: 'log', tab })}
          onBack={toMenu}
        />
      )}
      {screen.name === 'game' && <GameScreen key={screen.runId} onExit={toMenu} />}
      {screen.name === 'result' && null}
    </ScreenLayout>
  );
}
