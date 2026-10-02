import { expect, test, type Page } from '@playwright/test';

const sessionInput = (page: Page) => page.getByRole('textbox', { name: 'Game session time' });
const spawnInput = (page: Page) => page.getByRole('textbox', { name: 'Enemy spawn time' });
const nameInput = (page: Page) => page.getByRole('textbox', { name: 'Captain name' });

async function openOptions(page: Page) {
  await page.getByRole('button', { name: 'Options' }).click();
  await expect(page.getByRole('heading', { name: 'Options' })).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await openOptions(page);
});

test('shows the defaults', async ({ page }) => {
  await expect(nameInput(page)).toHaveValue('Captain Jack');
  await expect(sessionInput(page)).toHaveValue('120');
  await expect(spawnInput(page)).toHaveValue('3');
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('validates fields and blocks saving invalid values', async ({ page }) => {
  await sessionInput(page).fill('500');
  await spawnInput(page).fill('0');
  await nameInput(page).fill('   ');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('alert')).toHaveText('Please fix the highlighted fields.');
  await expect(nameInput(page)).toBeFocused();
  await expect(nameInput(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(sessionInput(page)).toHaveAccessibleDescription(/at most 180 s/);
  await expect(spawnInput(page)).toHaveAccessibleDescription(/at least 1 s/);

  await page.reload();
  await openOptions(page);
  await expect(sessionInput(page)).toHaveValue('120');
});

test('steppers respect limits', async ({ page }) => {
  const increase = page.getByRole('button', { name: 'Increase game session time' });
  for (let i = 0; i < 8; i += 1) await increase.click();
  await expect(sessionInput(page)).toHaveValue('180');

  const decrease = page.getByRole('button', { name: 'Decrease enemy spawn time' });
  for (let i = 0; i < 6; i += 1) await decrease.click();
  await expect(spawnInput(page)).toHaveValue('1');

  await spawnInput(page).focus();
  await page.keyboard.press('ArrowUp');
  await expect(spawnInput(page)).toHaveValue('1.5');
});

test('saves and persists options after refresh', async ({ page }) => {
  await nameInput(page).fill('Anne Bonny');
  await sessionInput(page).fill('90');
  await page.getByRole('button', { name: 'Increase enemy spawn time' }).click();
  await expect(page.getByRole('status')).toHaveText('You have unsaved changes.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Options saved.');

  await page.reload();
  await openOptions(page);
  await expect(nameInput(page)).toHaveValue('Anne Bonny');
  await expect(sessionInput(page)).toHaveValue('90');
  await expect(spawnInput(page)).toHaveValue('3.5');

  await page.getByRole('button', { name: 'Reset defaults' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.reload();
  await openOptions(page);
  await expect(sessionInput(page)).toHaveValue('120');
});

test('ignores corrupted stored options', async ({ page }) => {
  await page.evaluate(() =>
    localStorage.setItem('pirate-battle:options:v1', '{"sessionTime":9999,"spawnInterval":"x"}'),
  );
  await page.reload();
  await openOptions(page);
  await expect(sessionInput(page)).toHaveValue('120');
});
