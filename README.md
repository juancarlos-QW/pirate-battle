# Pirate Battle

Top-down 2D naval shooter built with React, TypeScript (strict) and PixiJS.

Sink as many enemy ships as you can before the time runs out. Chasers ram your ship; shooters
keep their distance and fire. Every ship sunk by your cannons is worth 1 point. The match ends
when the time is up or when your ship sinks.

## Requirements

- Node.js 20+ (developed with Node 24)
- npm 10+

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env.local   # optional
```

## Commands

| Command                   | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `npm run dev`             | Start the dev server                                 |
| `npm run build`           | Type-check and build for production                  |
| `npm run preview`         | Serve the production build                           |
| `npm run lint`            | Run ESLint                                           |
| `npm run typecheck`       | Run the TypeScript compiler without emitting         |
| `npm test`                | Run unit tests (Vitest)                              |
| `npm run test:e2e`        | Run Playwright E2E tests (desktop + mobile Chromium) |
| `npm run test:e2e:update` | Update visual regression baselines                   |
| `npm run test:e2e:report` | Open the last HTML report                            |

## Controls

| Action                 | Keyboard      | Touch                     |
| ---------------------- | ------------- | ------------------------- |
| Sail forward           | W / ↑         | ↑ button (left pad)       |
| Turn left / right      | A / ← · D / → | ↶ / ↷ buttons (left pad)  |
| Fire front cannon      | Space / K     | centre button (right pad) |
| Left / right broadside | Q / J · E / L | side buttons (right pad)  |
| Pause / resume         | P / Esc       | pause button (top right)  |

Touch buttons appear on devices with a coarse pointer and can be held at the same time. The match
also pauses automatically when the tab is hidden.

## Gameplay configuration

All balancing values (speeds, weapons, enemy AI distances, spawn rules, points) live in
[`src/config/gameConfig.ts`](src/config/gameConfig.ts). Each match uses a frozen snapshot, so
changing options never affects a battle that is already running.

Player options (Options screen, stored in localStorage):

| Option            | Range                  | Default      |
| ----------------- | ---------------------- | ------------ |
| Game session time | 60–180 s               | 120 s        |
| Enemy spawn time  | 1–10 s, steps of 0.5 s | 3 s          |
| Captain name      | 1–20 characters        | Captain Jack |

The ranking is kept per _session time + spawn time_ combination, so scores are only compared
between matches played under the same rules.

## Architecture

| Path                      | Responsibility                                                            |
| ------------------------- | ------------------------------------------------------------------------- |
| `src/game/sim`            | Deterministic, framework-free simulation (fixed 60 Hz step, seedable RNG) |
| `src/game/render`         | PixiJS renderer and visual effects                                        |
| `src/game/input`          | Keyboard and touch input merged into one held-action snapshot             |
| `src/game/GameSession.ts` | Game loop wiring simulation, renderer, input, audio and the HUD store     |
| `src/audio`               | Web Audio effects and ambience loops (mute setting is persisted)          |
| `src/api`                 | Axios client, zod schemas, React Query hooks and the MSW mock backend     |
| `src/storage`             | Versioned localStorage (options, player id, pending results)              |
| `src/ui`                  | React screens, HUD and components                                         |

## API and network scenarios

There is no real backend: [MSW](https://mswjs.io) intercepts requests to `VITE_API_BASE_URL` and
answers from an in-memory database that is persisted in localStorage and seeded with rival
captains.

| Endpoint                                                   | Description                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `POST /api/matches`                                        | Records a finished match (idempotent on the client-generated `id`) and returns the player's rank |
| `GET /api/ranking?sessionTime&spawnInterval&page&pageSize` | Best score per player for one rule set                                                           |
| `GET /api/players/:playerId/matches?page&pageSize`         | A player's match history, newest first                                                           |

Every response is validated with zod. A result that cannot be sent (offline, server error) is kept
in a local outbox and delivered on the next app start or successful submission.

Add `?mock=<scenario>` to the URL to simulate network conditions. The choice is remembered for the
tab; `?mock=normal` resets it.

| Scenario  | Behaviour                                       |
| --------- | ----------------------------------------------- |
| `normal`  | 250–500 ms latency (default)                    |
| `slow`    | 3 s latency on every request                    |
| `flaky`   | Half of the requests fail with 503              |
| `error`   | Every request fails with 500                    |
| `offline` | Every request fails with a network error        |
| `empty`   | Fresh backend without seed data (not persisted) |
