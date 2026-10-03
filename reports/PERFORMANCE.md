# Performance report

Measured on 2026-10-03 with `npm run build && npm run profile`
([`scripts/profile.mjs`](../scripts/profile.mjs)). Raw numbers, including the per-second entity
timeline, are in [`performance.json`](performance.json).

## Reference environment

| Item         | Value                                                                  |
| ------------ | ---------------------------------------------------------------------- |
| CPU          | Intel Core i7-8700 @ 3.20 GHz (6 cores / 12 threads)                   |
| GPU          | NVIDIA GeForce GTX 1650 (ANGLE, Direct3D 11)                           |
| Memory       | 16 GB                                                                  |
| OS           | Windows 11 (10.0.26200)                                                |
| Browser      | Chromium 153.0.8010.12 driven by Playwright, headless with GPU enabled |
| Resolution   | 1280 × 720, device pixel ratio 1                                       |
| Build        | Production build (`vite build`) served by `vite preview`               |
| Match config | 180 s session, 3 s spawn interval, default balancing                   |

## Three-minute match

The player sails in circles holding forward, turn right and the front cannon for the whole match.
Frame intervals are sampled with `requestAnimationFrame`, the same clock that drives the PixiJS
ticker.

| Metric                   | Value         |
| ------------------------ | ------------- |
| Frames sampled           | 10 818        |
| Average frame rate       | **60.0 FPS**  |
| Median frame time        | 16.7 ms       |
| **95th percentile**      | **16.7 ms**   |
| 99th percentile          | 16.8 ms       |
| Worst frame              | 33.3 ms (one) |
| Frames longer than 20 ms | 1             |

Entities alive (player + enemies + projectiles, sampled every second):

| Time (s)    | 0   | 30  | 61  | 90  | 120 | 150 | 179 |
| ----------- | --- | --- | --- | --- | --- | --- | --- |
| Enemies     | 0   | 5   | 7   | 6   | 6   | 3   | 5   |
| Projectiles | 0   | 2   | 4   | 3   | 1   | 2   | 4   |

Maximum 9 enemies and 5 projectiles at once (14 entities), 7.8 on average. Visual effects
(explosions, splashes, wrecks) are not counted; they live for at most 1.8 s each.

The 60 FPS target is met with a large margin: the frame rate is capped by the display refresh rate
(vsync), and the 95th percentile equals one refresh interval.

## Memory after repeated matches

Five cycles of: Play → 20 s of play → pause → Main menu. The JS heap is read after a forced
garbage collection (`--js-flags=--expose-gc`, `performance.memory`).

| After cycle | 0 (menu) | 1     | 2     | 3     | 4     | 5     |
| ----------- | -------- | ----- | ----- | ----- | ----- | ----- |
| JS heap     | 13.82 MB | 10.80 | 11.04 | 11.19 | 11.32 | 11.40 |
| Canvases    | –        | 0     | 0     | 0     | 0     | 0     |

- After every exit no canvas remains and the session reference is released, which confirms that
  the PixiJS application, its ticker and the listeners are torn down.
- The heap grows by 0.6 MB over five cycles, but each increment is smaller than the previous one
  (+0.24, +0.15, +0.13, +0.08 MB). This is consistent with caches settling (cached textures, the
  TanStack Query cache, JIT code) rather than a per-match leak. Five cycles are not enough to rule
  out a very slow leak; a longer run would confirm it.
- The first reading (13.8 MB) is higher because it is taken right after the first page load, before
  start-up garbage is collected.

## Method and limitations

- To measure a full three minutes, the profiling script tops up the player's health every second
  through the `?debug` hook (an automated player would otherwise sink early). Everything else
  (spawning, enemy AI, collisions, projectiles, rendering) runs unchanged.
- Headless Chromium presents frames at 60 Hz, so frame rates above 60 FPS (high refresh rate
  displays) are not measured here; the simulation itself runs at a fixed 60 Hz step at any refresh
  rate.
- The GPU is a dedicated desktop card. Low-end phones were not profiled. In the Playwright E2E
  suite, which uses software rendering (SwiftShader), arenas are noticeably slower, which is why
  the suite runs with three workers.
- `performance.memory` only reports the JS heap; GPU memory (textures) is not included.
