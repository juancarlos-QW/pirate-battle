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

Live demo: <https://pirate-battle-one.vercel.app>

## Environment variables

Both are optional; the defaults are used when no `.env.local` exists (including on Vercel).

| Variable            | Default | Description                                                             |
| ------------------- | ------- | ----------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | `/api`  | Base URL of the ranking and history API used by the Axios client        |
| `VITE_ENABLE_MOCKS` | `true`  | Set to `false` to disable MSW (only useful if a real backend is served) |

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

The E2E suite includes visual regression of the main menu, the arena and the result screen
(`e2e/visual.spec.ts`). Its baselines were generated on Windows; on another operating system run
`npm run test:e2e:update` once to create local baselines. The result screen test plays a real match
with a fake clock, so the full suite takes a few minutes.

## Controls

| Action                 | Keyboard      | Touch                                     |
| ---------------------- | ------------- | ----------------------------------------- |
| Sail forward           | W / ↑         | Drag the joystick (left) in any direction |
| Turn left / right      | A / ← · D / → | The ship turns toward the joystick        |
| Fire front cannon      | Space / K     | Top button (right)                        |
| Left / right broadside | Q / J · E / L | Bottom buttons (right)                    |
| Pause / resume         | P / Esc       | Pause button (top right)                  |

Touch controls appear on devices with a coarse pointer; steering and firing work at the same time
with different fingers. The match also pauses automatically when the tab is hidden or the window
loses focus, and resumes only when the player chooses Resume.

**Mobile orientation:** landscape is the supported orientation. Portrait is playable (the camera
follows the player) but shows less of the arena. Resizing or rotating never changes the match rules.

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

The design decisions (React/PixiJS integration, simulation loop, collisions, resource management,
persistence, ranking and history, limitations and balancing) are described in
[ARCHITECTURE.md](ARCHITECTURE.md).

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

| Scenario        | Behaviour                                                                    |
| --------------- | ---------------------------------------------------------------------------- |
| `normal`        | 250–500 ms latency (default)                                                 |
| `slow`          | 3 s latency on every request                                                 |
| `out-of-order`  | Odd requests take 1.5 s, even ones 150 ms, so later requests answer first    |
| `flaky`         | Half of the requests fail with 503                                           |
| `error`         | Every request fails with 500                                                 |
| `rejected`      | Every request fails with 400                                                 |
| `offline`       | Every request fails with a network error                                     |
| `timeout`       | Requests answer after the client timeout (8 s)                               |
| `ranking-error` | Only the ranking fails (500)                                                 |
| `history-error` | Only the match history fails (500)                                           |
| `save-timeout`  | A submitted match is stored, but the answer arrives after the client timeout |
| `empty`         | Fresh backend without seed data (not persisted)                              |

Latency in `out-of-order` is deterministic; in unit tests the handlers run without latency and with
an injectable random function.

### Resetting to the initial state

1. Open `/?mock=reset`: the mock database goes back to the seeded data, pending results are
   removed and the default scenario is selected. The parameter is removed from the URL afterwards.
2. To also clear the saved options, the player id and the sound setting, run this in the browser
   console and reload (or clear the site data in DevTools → Application → Storage):

   ```js
   Object.keys(localStorage)
     .filter((key) => key.startsWith('pirate-battle:'))
     .forEach((key) => localStorage.removeItem(key));
   ```

### Reproducing failures

| What to see                              | Steps                                                                                                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loading state                            | Open `/?mock=slow`, then Ranking or Match history                                                                                                                                                                        |
| Error with retry                         | Open `/?mock=error` or `/?mock=offline`, then Ranking; the panel shows an error and a **Try again** button                                                                                                               |
| Automatic retries                        | Open `/?mock=flaky` and browse the ranking pages                                                                                                                                                                         |
| Empty lists                              | Open `/?mock=empty`, then Ranking and Match history                                                                                                                                                                      |
| Server unavailable at the end of a match | Open `/?mock=offline`, play a match (set the session time to 60 s in Options to make it short); the result says it will be sent later. Open `/?mock=normal`: the match appears in Match history and in the ranking, once |
| Pending result surviving a refresh       | After the previous step, reload with `/?mock=offline` before switching back; the result stays queued in `pirate-battle:outbox:v1`                                                                                        |
| Timeout after the match was stored       | Open `/?mock=save-timeout` and finish a match: the backend stores it but answers too late, so the result stays pending. Open `/?mock=normal`: the retry recovers the stored match and nothing is duplicated              |
| Only one tab failing                     | Open `/?mock=ranking-error` (or `history-error`): the ranking shows an error while the history keeps working                                                                                                             |
| Late responses                           | Open `/?mock=out-of-order`, page through the ranking quickly: an old page arriving late never replaces the page on screen                                                                                                |
| Arena failing to load                    | Block `/assets/png/` in DevTools → Network → Request blocking and press Play: the dialog offers **Try again**                                                                                                            |

## Credits and licenses

- Game art (ships, tiles, effects, UI sprites, sprite sheets) and sound effects in `public/assets`
  were provided with the challenge and are used unmodified; their license is the one defined by
  the provider.
- [Roboto](https://github.com/googlefonts/roboto-classic) font, bundled through
  `@fontsource/roboto`, is licensed under the SIL Open Font License 1.1.
- Libraries (React, PixiJS, TanStack Query, Axios, zod, MSW and the development tooling) are used
  under their own open-source licenses (MIT, unless stated otherwise in each package).
