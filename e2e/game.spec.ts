import { expect, test, type Page } from '@playwright/test';

async function startMatch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  // WebGL start-up is slow in headless, software-rendered browsers running in parallel.
  await expect(page.locator('.game__arena canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Raising the sails' })).toBeHidden();
  return errors;
}

test('a match starts with a full HUD and the clock running', async ({ page }) => {
  const errors = await startMatch(page);
  await expect(page.getByRole('meter', { name: 'Hull integrity' })).toHaveAttribute(
    'aria-valuenow',
    '100',
  );
  await expect(page.getByTestId('hud-score')).toHaveText('0');
  const clock = page.getByTestId('hud-time');
  // Default session time is 2 minutes.
  await expect(clock).toHaveText(/^0[12]:[0-5]\d$/);
  const start = await clock.textContent();
  await expect(clock).not.toHaveText(start ?? '', { timeout: 3000 });
  expect(errors).toEqual([]);
});

test('pausing freezes the clock and resuming continues it', async ({ page }) => {
  await startMatch(page);
  await page.keyboard.press('KeyP');
  const dialog = page.getByRole('dialog', { name: 'Paused' });
  await expect(dialog).toBeVisible();
  const frozen = await page.getByTestId('hud-time').textContent();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('hud-time')).toHaveText(frozen ?? '');

  await dialog.getByRole('button', { name: 'Resume' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('hud-time')).not.toHaveText(frozen ?? '', { timeout: 3000 });
});

test('the pause menu returns to the main menu', async ({ page }) => {
  await startMatch(page);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page
    .getByRole('dialog', { name: 'Paused' })
    .getByRole('button', { name: 'Main menu' })
    .click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('starting several matches in a row keeps the app healthy', async ({ page }) => {
  const errors = await startMatch(page);
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('Escape');
    await page
      .getByRole('dialog', { name: 'Paused' })
      .getByRole('button', { name: 'Main menu' })
      .click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('.game__arena canvas')).toHaveCount(1, { timeout: 20_000 });
  }
  expect(errors).toEqual([]);
});
