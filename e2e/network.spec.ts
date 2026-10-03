import { expect, test, type Page } from '@playwright/test';

const PLAYER_ID = 'e2e-player-0002';
const MATCH_ID = 'e2e-match-timeout-0001';

async function openLog(page: Page, tab: 'Ranking' | 'Match history', query: string) {
  await page.goto(`/${query}`);
  await page.getByRole('button', { name: tab }).click();
  await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
}

/** Seeds the player id and one pending result before the app starts (first load only). */
async function seedPendingResult(page: Page) {
  await page.addInitScript(
    ({ playerId, matchId }) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('pirate-battle:player:v1', JSON.stringify({ id: playerId }));
      localStorage.setItem(
        'pirate-battle:outbox:v1',
        JSON.stringify([
          {
            id: matchId,
            playerId,
            captainName: 'Captain Jack',
            score: 77,
            duration: 120,
            endReason: 'timeUp',
            settings: { sessionTime: 120, spawnInterval: 3 },
            playedAt: new Date().toISOString(),
          },
        ]),
      );
    },
    { playerId: PLAYER_ID, matchId: MATCH_ID },
  );
}

const storedMatchIds = (page: Page) =>
  page.evaluate(() =>
    (JSON.parse(localStorage.getItem('pirate-battle:mock-db:v1') ?? '[]') as { id: string }[]).map(
      (match) => match.id,
    ),
  );

test('a failing ranking does not affect the match history', async ({ page }) => {
  await openLog(page, 'Ranking', '?mock=ranking-error');
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('tab', { name: 'Match history' }).click();
  await expect(page.getByText('No battles yet')).toBeVisible();
});

test('a late response does not overwrite the page being displayed', async ({ page }) => {
  // In this scenario every odd request is slow (1.5 s) and every even one is fast.
  await openLog(page, 'Ranking', '?mock=out-of-order');
  const panel = page.getByRole('tabpanel');
  await expect(panel.getByText('Page 1 of 3')).toBeVisible();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(panel.getByText('Page 2 of 3')).toBeVisible();

  // Page 3 is requested (slow) and the player goes back to page 2 before it answers.
  await page.getByRole('button', { name: 'Next page' }).click();
  await page.getByRole('button', { name: 'Previous page' }).click();
  await page.waitForTimeout(2500);
  await expect(panel.getByText('Page 2 of 3')).toBeVisible();
  await expect(panel.getByRole('row').nth(1).getByRole('cell').first()).toHaveText('06');
});

test('a result stored before a timeout is re-sent without duplication', async ({ page }) => {
  test.setTimeout(60_000);
  await seedPendingResult(page);

  // The backend stores the result but answers after the client timeout: it stays pending.
  await page.goto('/?mock=save-timeout');
  await expect.poll(() => storedMatchIds(page), { timeout: 10_000 }).toContain(MATCH_ID);
  await page.waitForTimeout(9000);
  const pending = await page.evaluate(() => localStorage.getItem('pirate-battle:outbox:v1'));
  expect(pending).toContain(MATCH_ID);

  // Back to normal: the retry recovers the existing record and clears the outbox.
  await openLog(page, 'Match history', '?mock=normal');
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(2); // header + 1 match
  await expect(page.getByRole('table').getByRole('row').nth(1)).toContainText('77');
  expect((await storedMatchIds(page)).filter((id) => id === MATCH_ID)).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem('pirate-battle:outbox:v1'))).toBe('[]');
});

test('?mock=reset restores the initial state', async ({ page }) => {
  await seedPendingResult(page);
  await page.goto('/?mock=offline');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

  await page.goto('/?mock=reset');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.has('mock')).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('pirate-battle:outbox:v1'))).toBeNull();
  expect(await storedMatchIds(page)).not.toContain(MATCH_ID);
});

test('a failed arena load can be retried', async ({ page, context }) => {
  // Routed on the context: requests pass through the MSW service worker, which page.route misses.
  const ships = '**/assets/png/default/ships/**';
  await context.route(ships, (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Arena unavailable' });
  await expect(dialog).toBeVisible({ timeout: 20_000 });

  await context.unroute(ships);
  await dialog.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.game__arena canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('hud-score')).toHaveText('0');
  await expect(dialog).toBeHidden();
});
