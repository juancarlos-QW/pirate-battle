import type { CSSProperties } from 'react';
import type { HudState } from '../../game/GameSession.ts';
import { IconButton } from '../components/Button.tsx';
import { formatClock } from '../format.ts';
import { uiImage } from '../uiAssets.ts';

interface HudProps {
  readonly state: HudState;
  readonly onPause: () => void;
}

const TIME_WARNING_SECONDS = 10;

function healthFill(ratio: number): 'green' | 'amber' | 'red' {
  if (ratio > 0.5) return 'green';
  if (ratio > 0.25) return 'amber';
  return 'red';
}

/** Health, score, time and pause button drawn over the arena. */
export function Hud({ state, onPause }: HudProps) {
  const ratio = state.maxHealth > 0 ? state.health / state.maxHealth : 0;
  const lowTime = state.remaining <= TIME_WARNING_SECONDS;

  return (
    <header className="hud">
      <div
        className="hud-health"
        role="meter"
        aria-label="Hull integrity"
        aria-valuemin={0}
        aria-valuemax={state.maxHealth}
        aria-valuenow={state.health}
        aria-valuetext={`${state.health} of ${state.maxHealth}`}
      >
        <img className="hud-health__icon" src={uiImage('hud/icon_heart')} alt="" />
        <div className="hud-health__bar" style={{ '--ratio': ratio } as CSSProperties}>
          <img
            className="hud-health__fill"
            src={uiImage(`hud/health_fill_${healthFill(ratio)}`)}
            alt=""
          />
          <span className="hud-health__label" aria-hidden="true">
            {state.health} / {state.maxHealth}
          </span>
        </div>
      </div>

      <div className="hud__right">
        <div className="hud-counter" data-testid="hud-score">
          <img src={uiImage('hud/icon_score')} alt="Score" />
          <span>{state.score}</span>
        </div>
        <div
          className={`hud-counter${lowTime ? ' hud-counter--warning' : ''}`}
          role="timer"
          data-testid="hud-time"
        >
          <img src={uiImage('hud/icon_time')} alt="Time left" />
          <span>{formatClock(state.remaining)}</span>
        </div>
        <IconButton
          icon="pause"
          label="Pause"
          onClick={onPause}
          disabled={state.phase !== 'running'}
        />
      </div>
    </header>
  );
}
