import { expect, test, type Page } from '@playwright/test';

/**
 * Visual regression of the main menu, the arena in a stable state and the result screen.
 *
 * The browser clock is faked (Date, timers and requestAnimationFrame, which drives the PixiJS
 * ticker). Pausing it before Play fixes the match seed, and advancing it by exact amounts makes
 * every frame reproducible while the real simulation, rendering and UI code runs.
 */

const START = new Date('2026-01-01T12:00:00Z');
const MATCH_START = new Date('2026-01-01T12:00:30Z');
const SCREENSHOT = { animations: 'disabled', stylePath: 'e2e/visual.css' } as const;

async function openMenu(page: Page, spawnInterval = 3) {
  await page.clock.install({ time: START });
  await page.addInitScript((interval) => {
    localStorage.setItem(
      'pirate-battle:options:v1',
      JSON.stringify({ sessionTime: 60, spawnInterval: interval, captainName: 'Captain Jack' }),
    );
    localStorage.setItem('pirate-battle:player:v1', JSON.stringify({ id: 'visual-player-0001' }));
  }, spawnInterval);
  await page.goto('/?mock=normal');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Starts a match with the clock paused, so the seed and every later frame are deterministic. */
async function startFrozenMatch(page: Page, spawnInterval = 3) {
  await openMenu(page, spawnInterval);
  await page.clock.pauseAt(MATCH_START);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.game__arena canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Raising the sails' })).toBeHidden({
    timeout: 20_000,
  });
}

test('main menu', async ({ page }) => {
  await openMenu(page);
  await expect(page).toHaveScreenshot('menu.png', SCREENSHOT);
});

test('arena in a stable state', async ({ page }) => {
  await startFrozenMatch(page);
  // Half a second in: the HUD is up, the player is idle and no enemy has spawned yet.
  await page.clock.runFor(500);
  await expect(page.getByTestId('hud-score')).toHaveText('0');
  await expect(page).toHaveScreenshot('arena.png', SCREENSHOT);
});

test('result screen', async ({ page }) => {
  // Every simulated frame is really rendered (software WebGL in headless Chromium), so this test
  // shortens the match: with one enemy per second and an idle player, the ship sinks quickly.
  test.setTimeout(180_000);
  await startFrozenMatch(page, 1);
  const dialog = page.getByRole('dialog', { name: /Ship sunk|Battle complete/ });
  for (let second = 0; second < 62 && !(await dialog.isVisible()); second += 1) {
    await page.clock.runFor(1000);
  }
  await expect(dialog).toBeVisible();
  // Let the mock API answer so the save status is final.
  for (let i = 0; i < 5; i += 1) await page.clock.runFor(1000);
  await expect(dialog.getByRole('status')).not.toHaveText(/Saving/);
  await expect(page).toHaveScreenshot('result.png', SCREENSHOT);
});
