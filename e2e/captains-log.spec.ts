import { expect, test, type Page } from '@playwright/test';

async function openLog(page: Page, tab: 'Ranking' | 'Match history', query = '') {
  await page.goto(`/${query}`);
  await page.getByRole('button', { name: tab }).click();
  await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
}

test('ranking lists rival captains for the current settings and paginates', async ({ page }) => {
  await openLog(page, 'Ranking', '?mock=normal');
  const panel = page.getByRole('tabpanel');
  await expect(panel.getByText('120 second battles · 3 second spawn interval')).toBeVisible();
  const rows = panel.getByRole('table').getByRole('row');
  await expect(rows).toHaveCount(6); // header + 5 entries
  await expect(rows.nth(1).getByRole('cell').first()).toHaveText('01');

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(panel.getByText('Page 2 of 3')).toBeVisible();
  await expect(rows.nth(1).getByRole('cell').first()).toHaveText('06');
  await page.getByRole('button', { name: 'Previous page' }).click();
  await expect(panel.getByText('Page 1 of 3')).toBeVisible();
});

test('an offline backend shows a retryable error', async ({ page }) => {
  await openLog(page, 'Ranking', '?mock=offline');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText("can't be reached", { timeout: 15_000 });
  await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('an empty backend shows empty states', async ({ page }) => {
  await openLog(page, 'Ranking', '?mock=empty');
  await expect(page.getByText('No battles recorded with these settings yet')).toBeVisible();
  await page.getByRole('tab', { name: 'Match history' }).click();
  await expect(page.getByText('No battles yet')).toBeVisible();
});

test('results saved while offline are delivered on the next visit', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('pirate-battle:player:v1', JSON.stringify({ id: 'e2e-player-0001' }));
    localStorage.setItem(
      'pirate-battle:outbox:v1',
      JSON.stringify([
        {
          id: 'e2e-match-0001',
          playerId: 'e2e-player-0001',
          captainName: 'Captain Jack',
          score: 99,
          duration: 120,
          endReason: 'timeUp',
          settings: { sessionTime: 120, spawnInterval: 3 },
          playedAt: new Date().toISOString(),
        },
      ]),
    );
  });

  await openLog(page, 'Ranking', '?mock=normal');
  const firstRow = page.getByRole('table').getByRole('row').nth(1);
  await expect(firstRow).toContainText('Captain Jack');
  await expect(firstRow).toContainText('You');
  await expect(firstRow).toContainText('99');

  await page.getByRole('tab', { name: 'Match history' }).click();
  const historyRow = page.getByRole('table').getByRole('row').nth(1);
  await expect(historyRow).toContainText('99');
  await expect(historyRow).toContainText('Time up');
  expect(await page.evaluate(() => localStorage.getItem('pirate-battle:outbox:v1'))).toBe('[]');
});
