import { DEFAULT_OPTIONS } from '../../config/options.ts';
import { createRng } from '../../game/sim/rng.ts';
import type { MatchRecord } from '../schemas.ts';

/** Fictional rival captains so the ranking is not empty on first launch. */
const RIVALS = [
  'Captain Flint',
  'Red Sparrow',
  'Storm Rider',
  'Sea Wolf',
  'Iron Maw',
  'Salty Meg',
  'One-Eyed Finn',
  'Coral Queen',
  'Barnacle Bill',
  'Tidecaller',
  'Grey Gull',
  'Black Marlin',
];

const HOUR_MS = 3_600_000;

/** Deterministic sample data, with dates relative to `now`. */
export function createSeedMatches(now = Date.now()): MatchRecord[] {
  const rng = createRng(1337);
  const brackets = [
    { sessionTime: DEFAULT_OPTIONS.sessionTime, spawnInterval: DEFAULT_OPTIONS.spawnInterval },
    { sessionTime: 60, spawnInterval: 2 },
    { sessionTime: 180, spawnInterval: 3 },
  ];

  return RIVALS.flatMap((captainName, index) =>
    brackets.map((settings, bracket) => {
      const sunk = rng.next() < 0.3;
      const duration = sunk
        ? Math.round(rng.range(settings.sessionTime * 0.4, settings.sessionTime * 0.95))
        : settings.sessionTime;
      const kills = Math.round((duration / settings.spawnInterval) * rng.range(0.15, 0.5));
      return {
        id: `seed-${index}-${bracket}`,
        playerId: `seed-player-${index}`,
        captainName,
        score: kills,
        duration,
        endReason: sunk ? ('sunk' as const) : ('timeUp' as const),
        settings,
        playedAt: new Date(now - rng.range(2, 24 * 10) * HOUR_MS).toISOString(),
      };
    }),
  );
}
