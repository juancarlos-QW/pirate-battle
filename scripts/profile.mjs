/**
 * Performance profiling of the production build.
 *
 * 1. A full 3-minute match (default spawn interval) while the player sails in circles and fires.
 *    Frame intervals are sampled with requestAnimationFrame; entity counts are read every second
 *    through the `?debug` hook. The player's health is topped up every second so the match lasts
 *    the full three minutes (an idle or automated player would otherwise sink early).
 * 2. Five cycles of starting a match, playing 20 s and leaving to the menu, measuring the JS heap
 *    after a forced garbage collection, to look for continuous growth.
 *
 * Usage: npm run build && npm run profile
 * Output: reports/performance.json (raw numbers) and a summary on stdout.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { chromium } from '@playwright/test';

const PORT = 4180;
const BASE = `http://localhost:${PORT}`;
const MATCH_SECONDS = 180;
const CYCLES = 5;
const CYCLE_SECONDS = 20;
const VIEWPORT = { width: 1280, height: 720 };

const preview = spawn(`npx vite preview --port ${PORT} --strictPort`, {
  shell: true,
  stdio: 'ignore',
});

/** Keeps the player afloat so measurements cover the whole planned duration. */
function topUpHealth() {
  const { world } = window.__PIRATE_BATTLE__;
  world.player.health = world.player.maxHealth;
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Preview server did not start');
}

const percentile = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const round = (value, digits = 2) => Number(value.toFixed(digits));

function frameStats(intervals) {
  const sorted = [...intervals].sort((a, b) => a - b);
  const total = intervals.reduce((sum, value) => sum + value, 0);
  return {
    frames: intervals.length,
    averageFps: round(intervals.length / (total / 1000), 1),
    averageFrameMs: round(total / intervals.length),
    p50FrameMs: round(percentile(sorted, 0.5)),
    p95FrameMs: round(percentile(sorted, 0.95)),
    p99FrameMs: round(percentile(sorted, 0.99)),
    maxFrameMs: round(sorted[sorted.length - 1]),
    framesOver20Ms: intervals.filter((value) => value > 20).length,
  };
}

async function startMatch(page) {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.locator('.game__arena canvas').waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => window.__PIRATE_BATTLE__?.getSnapshot().phase === 'running');
}

async function holdControls(page) {
  for (const key of ['KeyW', 'KeyD', 'Space']) await page.keyboard.down(key);
}

async function releaseControls(page) {
  for (const key of ['KeyW', 'KeyD', 'Space']) await page.keyboard.up(key);
}

async function heapMb(page) {
  return page.evaluate(() => {
    window.gc?.();
    return performance.memory ? performance.memory.usedJSHeapSize / 1024 / 1024 : null;
  });
}

try {
  await waitForServer();
  const browser = await chromium.launch({
    args: [
      '--enable-gpu',
      '--use-angle=d3d11',
      '--ignore-gpu-blocklist',
      '--enable-precise-memory-info',
      '--js-flags=--expose-gc',
    ],
  });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await page.addInitScript((seconds) => {
    localStorage.setItem(
      'pirate-battle:options:v1',
      JSON.stringify({ sessionTime: seconds, spawnInterval: 3, captainName: 'Profiler' }),
    );
    window.__frames = [];
    let last;
    const sample = (time) => {
      if (last !== undefined) window.__frames.push(time - last);
      last = time;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, MATCH_SECONDS);

  await page.goto(`${BASE}/?debug&mock=normal`);
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl ? gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : 'no WebGL';
  });

  // ---- 1. Three-minute match
  console.log(`Playing a ${MATCH_SECONDS} s match…`);
  await startMatch(page);
  await page.evaluate(() => (window.__frames = []));
  await holdControls(page);
  const entities = [];
  while (true) {
    const sample = await page.evaluate(() => {
      const { world } = window.__PIRATE_BATTLE__;
      world.player.health = world.player.maxHealth;
      return {
        elapsed: world.elapsed,
        enemies: world.enemies.length,
        projectiles: world.projectiles.length,
        status: world.status,
        score: world.score,
      };
    });
    entities.push(sample);
    if (sample.status === 'ended') break;
    await page.waitForTimeout(1000);
  }
  await releaseControls(page);
  const intervals = await page.evaluate(() => window.__frames);
  const match = frameStats(intervals);
  const totals = entities.map((s) => 1 + s.enemies + s.projectiles);
  const entityStats = {
    samples: entities.length,
    maxEnemies: Math.max(...entities.map((s) => s.enemies)),
    maxProjectiles: Math.max(...entities.map((s) => s.projectiles)),
    maxTotal: Math.max(...totals),
    averageTotal: round(totals.reduce((a, b) => a + b, 0) / totals.length, 1),
    finalScore: entities.at(-1).score,
  };

  // ---- 2. Memory over repeated matches
  console.log(`Running ${CYCLES} start / play / exit cycles…`);
  await page.goto(`${BASE}/?debug&mock=normal`);
  await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
  const heap = [{ cycle: 0, heapMb: round(await heapMb(page)) }];
  for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
    await startMatch(page);
    await holdControls(page);
    for (let second = 0; second < CYCLE_SECONDS; second += 1) {
      await page.evaluate(topUpHealth);
      await page.waitForTimeout(1000);
    }
    await releaseControls(page);
    await page.keyboard.press('Escape');
    await page
      .getByRole('dialog', { name: 'Paused' })
      .getByRole('button', { name: 'Main menu' })
      .click();
    await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
    await page.waitForTimeout(1000);
    heap.push({
      cycle,
      heapMb: round(await heapMb(page)),
      canvases: await page.locator('canvas').count(),
      sessionExposed: await page.evaluate(() => '__PIRATE_BATTLE__' in window),
    });
  }

  const report = {
    date: new Date().toISOString(),
    environment: {
      cpu: os.cpus()[0]?.model.trim(),
      cores: os.cpus().length,
      memoryGb: round(os.totalmem() / 1024 ** 3, 1),
      os: `${os.type()} ${os.release()}`,
      browser: `Chromium ${browser.version()} (Playwright, headless, GPU flags)`,
      webglRenderer: renderer,
      viewport: `${VIEWPORT.width}×${VIEWPORT.height} @1×`,
      build: 'vite build (production), served by vite preview',
    },
    matchConfig: { sessionTime: MATCH_SECONDS, spawnInterval: 3, playerHealthToppedUp: true },
    match,
    entities: entityStats,
    entityTimeline: entities.map(({ elapsed, enemies, projectiles }) => ({
      t: Math.round(elapsed),
      enemies,
      projectiles,
    })),
    memory: heap,
  };

  await mkdir('reports', { recursive: true });
  await writeFile('reports/performance.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      { environment: report.environment, match, entities: entityStats, memory: heap },
      null,
      2,
    ),
  );
  await browser.close();
} finally {
  preview.kill();
}
