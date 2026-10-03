import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError } from '../../api/client.ts';
import { useSubmitMatch } from '../../api/queries.ts';
import type { MatchSubmission } from '../../api/schemas.ts';
import { createMatchConfig, getMatchSettings, type MatchConfig } from '../../config/matchConfig.ts';
import { GameSession, type HudState } from '../../game/GameSession.ts';
import { optionsStore } from '../../storage/optionsStore.ts';
import { createId, getPlayerId } from '../../storage/playerStore.ts';
import { Button } from '../components/Button.tsx';
import { Dialog } from '../components/Dialog.tsx';
import { SoundToggle } from '../components/SoundToggle.tsx';
import { formatClock } from '../format.ts';
import { Hud } from '../hud/Hud.tsx';
import { TouchControls } from '../hud/TouchControls.tsx';
import { LOGO_URL } from '../uiAssets.ts';

interface GameScreenProps {
  readonly onExit: () => void;
  readonly onPlayAgain: () => void;
}

/** Delay before the result dialog, so the final explosion can be seen. */
const RESULT_DELAY_MS = 900;

const noopSubscribe = () => () => {};

/**
 * With `?debug` in the URL the running session is exposed as `window.__PIRATE_BATTLE__`, so
 * profiling scripts can observe the simulation (entity counts). Never set otherwise.
 */
const DEBUG_KEY = '__PIRATE_BATTLE__';
const debugEnabled = () => new URLSearchParams(window.location.search).has('debug');

function initialHud(config: MatchConfig): HudState {
  return {
    phase: 'loading',
    health: config.player.maxHealth,
    maxHealth: config.player.maxHealth,
    score: 0,
    remaining: config.match.duration,
    duration: config.match.duration,
    elapsed: 0,
    endReason: null,
  };
}

export function GameScreen({ onExit, onPlayAgain }: GameScreenProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // The options are read once: changing them later never affects a running match.
  const [config] = useState(() => createMatchConfig(optionsStore.get()));
  const [fallbackHud] = useState(() => initialHud(config));
  const [session, setSession] = useState<GameSession | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const next = new GameSession(config);
    setSession(next);
    if (debugEnabled()) Reflect.set(window, DEBUG_KEY, next);
    next.mount(host).catch((error: unknown) => console.error('Failed to start the arena', error));
    return () => {
      next.destroy();
      if (Reflect.get(window, DEBUG_KEY) === next) Reflect.deleteProperty(window, DEBUG_KEY);
    };
  }, [config]);

  const hud = useSyncExternalStore(
    session?.subscribe ?? noopSubscribe,
    session?.getSnapshot ?? (() => fallbackHud),
  );

  const [showResult, setShowResult] = useState(false);
  useEffect(() => {
    if (hud.phase !== 'ended') return undefined;
    const timer = window.setTimeout(() => setShowResult(true), RESULT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [hud.phase]);

  const submission = useResultSubmission(hud, config);

  const resultTitle = hud.endReason === 'sunk' ? 'Ship sunk' : 'Battle complete';
  const playedTime = formatClock(hud.endReason === 'timeUp' ? hud.duration : hud.elapsed);

  return (
    <main className="game" aria-label="Battle">
      <h1 className="visually-hidden">Battle</h1>
      <div className="game__arena" ref={hostRef} />

      <Hud state={hud} onPause={() => session?.pause()} />
      <TouchControls
        onChange={(action, pressed) => session?.setTouch(action, pressed)}
        onJoystick={(joystick) => session?.setJoystick(joystick)}
      />
      <img className="scene__logo" src={LOGO_URL} alt="" width={120} height={60} />

      {hud.phase === 'loading' && (
        <p className="game__loading" role="status">
          Raising the sails…
        </p>
      )}

      <Dialog open={hud.phase === 'paused'} title="Paused" onClose={() => session?.resume()}>
        <p className="dialog__lead">Ready when you are.</p>
        <div className="dialog__actions">
          <Button autoFocus onClick={() => session?.resume()}>
            Resume
          </Button>
          <Button onClick={onExit}>Main menu</Button>
          <SoundToggle />
        </div>
      </Dialog>

      <Dialog open={showResult} title={resultTitle} onClose={onExit} dismissible={false}>
        <p className="result__score">{hud.score}</p>
        <p className="result__meta">
          {hud.score === 1 ? 'Point' : 'Points'} · {playedTime} ·{' '}
          {hud.endReason === 'sunk' ? 'Sunk' : 'Time up'}
        </p>
        <p className={`result__save result__save--${submission.tone}`} role="status">
          {submission.message}
        </p>
        <div className="dialog__actions">
          <Button autoFocus onClick={onPlayAgain}>
            Play again
          </Button>
          <Button onClick={onExit}>Main menu</Button>
        </div>
      </Dialog>

      <Dialog
        open={hud.phase === 'error'}
        title="Arena unavailable"
        onClose={onExit}
        dismissible={false}
      >
        <p className="dialog__lead">
          The battle could not start. Check your connection and try again. If it keeps failing, your
          browser may not support WebGL.
        </p>
        <div className="dialog__actions">
          {/* A new run remounts the screen, so loading starts from scratch. */}
          <Button autoFocus onClick={onPlayAgain}>
            Try again
          </Button>
          <Button onClick={onExit}>Main menu</Button>
        </div>
      </Dialog>
    </main>
  );
}

interface SubmissionStatus {
  readonly tone: 'pending' | 'success' | 'warning' | 'error';
  readonly message: string;
}

/** Sends the result to the captain's log once the match is over. */
function useResultSubmission(hud: HudState, config: MatchConfig): SubmissionStatus {
  const { mutate, status, data, error } = useSubmitMatch();
  const submitted = useRef(false);

  useEffect(() => {
    if (hud.phase !== 'ended' || !hud.endReason || submitted.current) return;
    submitted.current = true;
    const match: MatchSubmission = {
      id: createId(),
      playerId: getPlayerId(),
      captainName: optionsStore.get().captainName,
      score: hud.score,
      duration: hud.endReason === 'timeUp' ? hud.duration : Math.min(hud.elapsed, hud.duration),
      endReason: hud.endReason,
      settings: getMatchSettings(config),
      playedAt: new Date().toISOString(),
    };
    mutate(match);
  }, [hud, config, mutate]);

  if (status === 'success') {
    return {
      tone: 'success',
      message: data.rank
        ? `Saved to the captain's log · Your best is rank #${data.rank}`
        : "Saved to the captain's log",
    };
  }
  if (status === 'error') {
    return error instanceof ApiError && !error.retryable
      ? { tone: 'error', message: 'This result could not be recorded.' }
      : {
          tone: 'warning',
          message: "Couldn't reach the harbour. Your result is kept and will be sent later.",
        };
  }
  return { tone: 'pending', message: "Saving to the captain's log…" };
}
