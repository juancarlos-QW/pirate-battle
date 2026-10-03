# Architecture

This document describes how Pirate Battle is organised and why. For setup, commands and controls
see [README.md](README.md).

## 1. Overview

The code is split into layers. Inner layers never import outer ones.

```
 ui/ (React screens, HUD, dialogs)  ←  app/ (screen navigation)        presentation
                 │
 game/GameSession.ts  ·  api/queries.ts                                orchestration
                 │
 game/render (PixiJS) · game/input (DOM) · audio (Web Audio) · api     infrastructure
                 │
 game/sim (pure TypeScript)  ·  config/                                core
```

| Path                      | Responsibility                                                                |
| ------------------------- | ----------------------------------------------------------------------------- |
| `src/config`              | Typed gameplay configuration, player options (zod), key bindings              |
| `src/game/sim`            | Simulation: arena geometry, movement, combat, enemy AI, spawning, match rules |
| `src/game/input`          | Keyboard, touch buttons and virtual joystick merged into one input snapshot   |
| `src/game/assets`         | Texture loading                                                               |
| `src/game/render`         | PixiJS scene, camera, sprite synchronisation, visual effects                  |
| `src/game/GameSession.ts` | Game loop: wires simulation, input, renderer and audio; HUD store for React   |
| `src/audio`               | Web Audio playback and the mapping from game events to sounds                 |
| `src/api`                 | zod contracts, Axios client, TanStack Query hooks, MSW mock backend           |
| `src/storage`             | Versioned localStorage access, player id, pending results outbox              |
| `src/ui`                  | React screens, HUD, touch controls and shared components                      |

The key rule: `game/sim` imports nothing from React, PixiJS, the DOM or audio. It receives an input
snapshot and a time step, and returns what happened. This is what makes the rules unit-testable in
Node (Vitest) and keeps rendering and audio as pure observers.

## 2. React and PixiJS integration

- **React** renders menus, forms, panels, dialogs and the HUD.
- **PixiJS** renders the arena: water, islands, ships, projectiles, effects and the health bars
  above every ship.

`GameScreen` creates one `GameSession` per match inside a `useEffect` and calls
`session.mount(host)`, which creates the PixiJS `Application` inside a `<div>`. The effect cleanup
calls `session.destroy()`.

Each **Play** increments a `runId` in the navigation reducer, used as the `key` of `GameScreen`.
**Play again** therefore unmounts the previous match and mounts a brand new one: health, score,
clock and entities start from scratch and nothing leaks between matches.

**No React render per frame.** `GameSession` is an external store (`subscribe` / `getSnapshot`)
read with `useSyncExternalStore`. After every frame it builds a small `HudState` (phase, health,
score, remaining whole seconds, end reason) and only notifies React when one of those fields
changed. In practice the HUD re-renders about once per second.

**React Strict Mode.** Strict Mode mounts, unmounts and mounts effects again in development.
`mount()` is asynchronous (texture loading), so it checks a `destroyed` flag after every `await`:
if the session was destroyed in the meantime, the freshly created renderer is destroyed
immediately. `destroy()` is idempotent.

## 3. Simulation cycle

```
PixiJS ticker (display rate: 60, 120, 144 Hz…)
  └─ GameSession.tick(deltaMS)
       dt = min(deltaMS / 1000, 0.25)
       if running:
         accumulator += dt
         while accumulator ≥ 1/60:
           input  = InputController.snapshot(player heading)
           events = World.step(input, 1/60)
           renderer.handleEvents(events)   → visual effects
           audio.handleEvents(events)      → sounds
       audio.update(world)                 → engine loop volume, low health, countdown
       renderer.render(world, dt)          → sync sprites, camera, animate effects
       publish()                           → HUD snapshot if something visible changed
```

- **Fixed time step with accumulator.** The simulation always advances in steps of exactly 1/60 s,
  so movement, damage, cooldowns and spawns behave the same at any display refresh rate.
- **Frame clamp.** A single frame contributes at most 0.25 s, so a stalled tab cannot fast-forward
  the match.
- **Pause.** Manual (P / Esc / pause button) or automatic when the tab is hidden
  (`visibilitychange`) or the window loses focus (`blur`). While paused the simulation is not
  stepped, so the clock, cooldowns and spawns are frozen. Held input is cleared on pause and the
  accumulator is reset on resume, so nothing from the paused period is replayed. Resuming always
  requires a player action (Resume button or pause key).
- **End of match.** `World.step` stops doing anything once the status is `ended`: no movement,
  attacks, damage, spawns or scoring.

`World.step(input, dt)` runs, in order: weapon cooldowns → player movement and firing → enemy AI →
ship contacts → projectiles → spawning → end conditions. It returns a list of typed `GameEvent`s
(`shot`, `splash`, `hit`, `ram`, `shipDestroyed`, `spawn`, `matchEnd`).

**Determinism.** Randomness (spawn positions, enemy type) comes from a seedable PRNG
(mulberry32). Matches use the current time as seed; tests use a fixed seed.

## 4. Movement, combat and collisions

- **Ships** are circles (`radius` in the config). Heading is in radians: 0 points right and angles
  grow clockwise on screen. Turning rotates at `turnSpeed`; forward speed accelerates up to
  `maxSpeed` and decelerates when the throttle is released.
- **Islands** are axis-aligned rectangles in tile coordinates (`DEFAULT_ARENA_LAYOUT`).
  Their collision rectangles are inset by 10 px because the sand tiles have soft transparent
  borders, so ships stop at the visible shore.
- **Ship vs island / arena edge.** `Arena.resolveCircle` finds the closest point of each rectangle
  and pushes the circle out along that direction, then clamps it inside the arena. Scraping the
  shore bleeds speed.
- **Ship vs ship.** Overlapping ships are pushed apart symmetrically. A Chaser touching the player
  explodes: the player takes `contactDamage`, the Chaser is removed and **no point** is awarded.
- **Projectiles** move in a straight line at the weapon's speed and expire after the weapon's
  `range`. Each step a projectile is removed when it leaves the arena, hits an island or expires
  (splash), or hits a ship of the opposite faction. A projectile is removed in the same step it
  deals damage, so it can only damage once. Destroyed enemies are removed from the list
  immediately, so they stop moving, firing and colliding.
- **Weapons.** Front cannon: one projectile along the heading. Broadsides: `count` parallel
  projectiles fired perpendicular to the heading, spread by `spacing` along the hull. Each weapon
  slot has its own cooldown.
- **Enemy AI.**
  - Chaser: steers toward the player at full throttle.
  - Shooter: approaches until `preferredDistance`, backs away when closer than 60 % of it, and fires
    its front cannon when the player is within `attackRange` and the aim error is below
    `aimTolerance`.
  - Both use a short look-ahead (`avoidObstacles`) that tries progressively wider heading offsets
    until the course is clear of islands and edges.
- **Spawning.** Every `spawn.interval` seconds, while fewer than `maxAlive` enemies are alive. The
  first spawns follow `openingSequence` (`chaser`, then `shooter`) so both types appear early in
  every match; later spawns use `weights`. Spawn points are random but must be at least
  `minDistanceFromPlayer` from the player and `clearance` away from islands and edges.

## 5. Configuration and balancing

All balancing values live in [`src/config/gameConfig.ts`](src/config/gameConfig.ts) (units: world
pixels, seconds, radians). Systems read them from a per-match snapshot and never hard-code numbers.

When a match starts, `createMatchConfig(options)` deep-clones the defaults, applies the player's
session time and spawn interval and deep-freezes the result. Changing options later never affects
a match in progress.

Balancing decisions:

| Decision                                                   | Reason                                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Player 180 px/s, Chaser 125 px/s, Shooter 95 px/s          | The player can always escape, but not forever                                             |
| Player turns at 2.6 rad/s, Chaser at 2.2 rad/s             | Tight turns are a way to shake off a Chaser                                               |
| Front cannon 25 dmg / 0.45 s; broadside 3 × 20 dmg / 1.4 s | Fast precise shot vs. slow heavy volley: a tactical choice                                |
| Chaser 40 HP, Shooter 60 HP                                | Two and three front shots respectively                                                    |
| Chaser contact damage 25 with 100 player HP                | Four rams sink the player                                                                 |
| Spawn weights 55 % Chaser / 45 % Shooter, max 12 alive     | Pressure grows without flooding the arena                                                 |
| Spawn interval 1–10 s, in steps of 0.5 s                   | Below 1 s the arena becomes unreadable; up to 10 s still shows both types in a 60 s match |
| Spawn at least 480 px from the player                      | No unavoidable damage right after a spawn                                                 |

## 6. Rendering and resource management

- **Textures** are loaded once with `Assets.load` before the arena is shown and kept in the PixiJS
  cache, so the next match starts instantly. While loading, the screen shows a status message. If
  the renderer cannot start (WebGL unavailable or textures failing), the session enters the
  `error` phase and an "Arena unavailable" dialog offers a way back to the menu.
- **Scene graph.** Water (`TilingSprite`) and a world container with layers in drawing order:
  bounds shade, islands, projectiles, ships, effects, health bars.
- **Sprite synchronisation.** Every frame the renderer reads the world and creates, updates or
  destroys sprites by entity id. It never writes to the simulation.
- **Effects** are short-lived objects created from simulation events (muzzle flash, hit, ram,
  splash ring, sinking wreck). Ships show fire below 50 % health.
- **Canvas sizing.** The PixiJS application uses `resizeTo` on its host and
  `resolution = min(devicePixelRatio, 2)` with `autoDensity`. The camera keeps the world's aspect
  ratio: it shows the whole arena when it fits and otherwise follows the player (minimum world
  scale 0.6), always clamped to the arena bounds.
- **Teardown.** `GameSession.destroy()` detaches keyboard listeners, `visibilitychange` and `blur`
  listeners, stops audio loops and destroys the PixiJS application with all its children (which
  also removes the ticker callback and the canvas). An E2E test starts several matches in a row and
  checks that only one canvas exists.

## 7. Input

`InputController` keeps keyboard and touch input in separate sets so releasing one never cancels
the other. Keys are matched by `KeyboardEvent.code` (layout independent) from
[`src/config/controls.ts`](src/config/controls.ts), which also generates the in-game controls
guide. Keyboard listeners are only attached while a match is mounted, and keys are ignored while a
form field or a dialog has focus (except pause).

On touch devices the HUD shows a virtual joystick and three fire buttons. The joystick reports an
angle and a strength; `joystickToInput` turns it into the same `forward` / `turnLeft` /
`turnRight` actions as the keyboard (dead zone 25 %, aim tolerance 0.1 rad), so the simulation has
no touch-specific code.

## 8. Local persistence

All keys are namespaced and versioned (`pirate-battle:<name>:v1`). Every read is validated with zod:
missing, corrupted or outdated data yields the default value instead of an error. Every access is
wrapped in `try/catch` because storage may be blocked or full.

| Key                            | Content                        |
| ------------------------------ | ------------------------------ |
| `pirate-battle:options:v1`     | Player options                 |
| `pirate-battle:player:v1`      | Anonymous player id (UUID)     |
| `pirate-battle:last-result:v1` | Id of the last completed match |
| `pirate-battle:outbox:v1`      | Results waiting to be sent     |
| `pirate-battle:audio:v1`       | Mute setting                   |
| `pirate-battle:mock-db:v1`     | Mock backend database (MSW)    |

Reloading or leaving the combat screen ends the match; an abandoned match is never submitted.

## 9. Ranking and match history

### Contracts

[`src/api/schemas.ts`](src/api/schemas.ts) defines the wire format with zod. TypeScript types are
derived with `z.infer`, and the same schemas are used by the client (to validate responses) and by
the mock backend (to validate requests).

| Endpoint                                                   | Purpose                                           |
| ---------------------------------------------------------- | ------------------------------------------------- |
| `POST /api/matches`                                        | Record a completed match; returns it and its rank |
| `GET /api/ranking?sessionTime&spawnInterval&page&pageSize` | Paginated ranking for one rule set                |
| `GET /api/players/:playerId/matches?page&pageSize`         | Paginated history of one player, newest first     |

A match record contains its id, player id, captain name, score, effective duration, end reason,
settings (session time and spawn interval) and date. The ranking only compares matches with the
same settings, keeps the best match per player, sorts by score descending and breaks ties by the
earliest date.

### Client and cache

- The Axios client (8 s timeout) validates every response and maps failures to an `ApiError` with
  a kind (`network`, `server`, `rejected`, `invalidResponse`) and a `retryable` flag.
- TanStack Query hooks `useRanking` and `useHistory` use query keys that include the settings and
  page, `keepPreviousData` while paging, a 30 s stale time, and retry up to twice only for
  retryable errors. Queries receive an `AbortSignal`, and because every page has its own key, a
  slow response for an old page cannot overwrite the page currently displayed.
- After a successful submission both the ranking and history queries are invalidated.

### Submission without duplicates

The match id is generated on the client (`crypto.randomUUID`) before sending, and the backend treats
a repeated id as a no-op that returns the existing record. Re-sending after a timeout or a repeated
click therefore never creates a second entry. The result dialog submits once per match (guarded by
a ref).

### Pending results (outbox)

1. Before sending, the result is stored in the outbox.
2. On success it is removed and the rest of the outbox is flushed.
3. On a retryable error it stays queued; a rejected (invalid) result is dropped.
4. On every app start the outbox is flushed in order, stopping at the first retryable failure.

The player can start another match while a result is pending, and failures of these APIs never
block the game, the options or a running match.

## 10. Mock backend (MSW)

The same handlers ([`src/api/mocks/handlers.ts`](src/api/mocks/handlers.ts)) run in the browser
(development, the published build and Playwright) and in Node (Vitest, with `msw/node`). The
in-memory database is persisted to localStorage and seeded with deterministic rival captains
(fixed seed). Network scenarios are selected with `?mock=<scenario>`; see the README.

Handlers accept an `instant` option and an injectable random function, so unit tests run without
latency and with reproducible behaviour.

## 11. Testing

- **Vitest** (Node): simulation (movement, islands, cooldowns, broadsides, spawning, scoring,
  ramming, end conditions, determinism), arena geometry, options validation, match config
  snapshot, mock database, API client against the mock handlers, outbox, joystick mapping,
  formatting.
- **Playwright** (production build, desktop 1280 × 720 and Pixel 7 landscape): keyboard
  navigation, modal dialogs, options validation and persistence, corrupted storage, match start,
  manual and automatic pause, repeated matches, ranking and history paging, empty and error
  states, delivery of a pending result after reload. HTML report and traces on failure.

## 12. Limitations

- There is no real backend; the player identity is per browser, without login.
- Scores are computed on the client. A real backend should validate that a score is plausible for
  the time played.
- Network scenarios cover latency, failures and empty data, but not every case listed in the brief
  (for example out-of-order responses and a timeout after a successful write).
- E2E tests cover navigation, options, pause, ranking and history; combat rules are covered by unit
  tests on the simulation rather than by E2E tests driving the game.
- Visual regression baselines and a performance profiling report are not included yet.
- Portrait orientation on phones is playable (the camera follows the player) but landscape is the
  supported orientation.
