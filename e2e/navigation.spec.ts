import { expect, test } from '@playwright/test';

test('main menu is keyboard navigable', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Options' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Options' })).toBeFocused();
});

test('how to play dialog is modal and restores focus on close', async ({ page }) => {
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'How to play' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'How to play' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('row', { name: /Left broadside/ })).toBeVisible();

  // Focus stays inside the modal dialog while tabbing.
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('Tab');
    const insideDialog = await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    );
    expect(
      insideDialog || (await page.evaluate(() => document.activeElement === document.body)),
    ).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('captain log tabs switch with the keyboard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ranking' }).click();
  const ranking = page.getByRole('tab', { name: 'Ranking' });
  await expect(ranking).toHaveAttribute('aria-selected', 'true');
  await ranking.focus();
  await page.keyboard.press('ArrowRight');
  const history = page.getByRole('tab', { name: 'Match history' });
  await expect(history).toBeFocused();
  await expect(history).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Main menu' }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('repeated navigation between screens keeps the app healthy', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  for (let i = 0; i < 5; i += 1) {
    await page.getByRole('button', { name: 'Options' }).click();
    await page.getByRole('button', { name: 'Main menu' }).click();
    await page.getByRole('button', { name: 'Match history' }).click();
    await page.getByRole('button', { name: 'Main menu' }).click();
  }
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
