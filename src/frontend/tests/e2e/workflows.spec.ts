import { expect, test } from '@playwright/test';

test.describe('public workflows', () => {
  test('imports multiple PGN games, switches between them, and exports the notation', async ({ page }) => {
    await page.goto('/board');

    await expect(page.getByRole('heading', { name: /chessboard studio|šachové studio/i })).toBeVisible();

    const pgn = [
      '[Event "Game One"]\n\n1. e4 e5 *',
      '[Event "Game Two"]\n\n1. d4 d5 *',
    ].join('\n\n');
    await page.locator('#pgn-notation').fill(pgn);
    await page.getByRole('button', { name: /import pgn|importovat pgn/i }).click();

    const gameSelector = page.getByRole('combobox', { name: /select game|vybrat partii/i });
    await expect(gameSelector).toBeVisible();
    await expect(gameSelector.locator('option')).toHaveCount(2);

    await gameSelector.selectOption('1');
    await expect(gameSelector).toHaveValue('1');
    await expect(gameSelector.locator('option:checked')).toContainText(/Game 2|Partie 2/i);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export pgn|exportovat pgn/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('chessweb-game.pgn');
  });

  test('calendar exposes view controls and downloads an event ICS file when an event is available', async ({ page }) => {
    const eventsResponsePromise = page.waitForResponse((response) => response.url().includes('/api/calendar/events') && response.request().method() === 'GET');
    await page.goto('/calendar');
    const eventsResponse = await eventsResponsePromise;
    expect(eventsResponse.ok()).toBeTruthy();

    await expect(page.getByRole('heading', { name: /event calendar|kalendář akcí/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /month|měsíční/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /list|seznam/i })).toBeVisible();

    await page.getByRole('button', { name: /list|seznam/i }).click();
    await expect(page.locator('main')).toContainText(/event calendar|kalendář akcí|no events|žádné události/i);

    const eventCards = page.locator('main h3');
    if (await eventCards.count() === 0) {
      return;
    }

    await eventCards.first().click();
    const downloadButton = page.getByRole('button', { name: /download event|tato událost|add to my calendar|přidat do mého kalendáře/i }).first();
    await expect(downloadButton).toBeVisible();

    const icsResponsePromise = page.waitForResponse((response) => response.url().includes('/api/calendar/events/') && response.url().endsWith('/ics'));
    const downloadPromise = page.waitForEvent('download');
    await downloadButton.click();
    const icsResponse = await icsResponsePromise;
    expect(icsResponse.ok()).toBeTruthy();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.ics$/);
  });

  test('unknown routes return to the article list', async ({ page }) => {
    await page.goto('/route-that-does-not-exist');

    await expect(page).toHaveURL(/\/articles$/);
    await expect(page.getByRole('link', { name: /chessweb/i }).first()).toBeVisible();
    await expect(page.locator('main')).toContainText(/articles|články/i);
  });
});