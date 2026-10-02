import { audio, useMuted } from '../../audio/AudioManager.ts';
import { Button } from './Button.tsx';

/** Turns all game audio on or off. The choice is remembered across sessions. */
export function SoundToggle() {
  const muted = useMuted();
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-label="Sound"
      aria-pressed={!muted}
      onClick={() => audio.setMuted(!muted)}
    >
      Sound: {muted ? 'Off' : 'On'}
    </Button>
  );
}
