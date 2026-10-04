import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parsePgnTree } from '../../src/chess/pgnTree';

for (const viewport of [{ width: 1280, height: 900 }, { width: 320, height: 740 }]) {
  test(`nested PGN import, navigation, drop, undo, export and reload at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/board');
    const source = '[Event "Nested"]\n\n{ Opening } 1. e4 e5 (1... c5 $1 { Sicilian } 2. Nf3 (2. Nc3 { Nested note })) 2. Nf3 *';
    const notation = page.locator('#pgn-notation');
    await notation.fill(source);
    await page.getByRole('button', { name: /import pgn|importovat pgn/i }).click();
    const white = await page.getByRole('button', { name: '1. e4', exact: true }).boundingBox();
    const black = await page.getByRole('button', { name: '1... e5', exact: true }).boundingBox();
    const alternative = await page.getByRole('button', { name: '1... c5', exact: true }).boundingBox();
    expect(white).not.toBeNull(); expect(black).not.toBeNull(); expect(alternative).not.toBeNull();
    expect(black!.x).toBeGreaterThan(white!.x + white!.width - 1);
    expect(black!.y).toBeCloseTo(white!.y, 0);
    expect(alternative!.x).toBeGreaterThan(white!.x);
    await page.getByRole('button', { name: /^2\. (Nc3|Jc3)$/ }).click();
    await expect(page.getByRole('button', { name: /^2\. (Nc3|Jc3)$/ })).toHaveAttribute('aria-current', 'step');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('button', { name: '1... c5', exact: true })).toHaveAttribute('aria-current', 'step');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: /^2\. (Nc3|Jc3)$/ })).toHaveAttribute('aria-current', 'step');
    const disclosure = page.getByRole('button', { name: /(?:expand or collapse variation|rozbalit nebo sbalit variantu) 1\.\.\. c5/i });
    await disclosure.click();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await expect(disclosure.locator('..')).toHaveText('');
    await expect(disclosure.locator('..')).toHaveCSS('border-left-width', '0px');
    await expect(page.getByRole('button', { name: '1... c5', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^2\. (Nc3|Jc3)$/ })).toHaveCount(0);
    await expect(page.getByText('Nested note', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`collapsed-${viewport.width}.png`), fullPage: true });
    await disclosure.click();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: /^2\. (Nc3|Jc3)$/ })).toHaveAttribute('aria-current', 'step');
    const board = page.getByRole('region', { name: /chessboard\.|šachovnice\./i });
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('button', { name: '1... c5', exact: true })).toHaveAttribute('aria-current', 'step');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: /^2\. (Nc3|Jc3)$/ })).toHaveAttribute('aria-current', 'step');
    await page.getByRole('button', { name: /return to mainline|zpět na hlavní variantu/i }).click();
    await expect(page.getByRole('button', { name: '1... e5', exact: true })).toHaveAttribute('aria-current', 'step');
    const drag = async (from: string, to: string) => {
      await board.scrollIntoViewIfNeeded();
      const piece = board.locator(`[data-square="${from}"] [data-piece]`);
      await expect(piece).toBeVisible();
      const start = await piece.boundingBox();
      const end = await board.locator(`[data-square="${to}"]`).boundingBox();
      expect(start).not.toBeNull(); expect(end).not.toBeNull();
      await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
      await page.mouse.down();
      await page.mouse.move(end!.x + end!.width / 2, end!.y + end!.height / 2, { steps: 15 });
      await page.mouse.up();
    };
    const draft = '1. d4 d5 *';
    await notation.fill(draft);
    await drag('b1', 'c3');
    await expect(notation).toHaveValue(draft);
    await expect(page.getByText(/import the edited pgn|importujte upravené pgn/i)).toBeVisible();
    await expect(page.getByRole('button', { name: '1... e5', exact: true })).toHaveAttribute('aria-current', 'step');
    await expect(page.getByRole('button', { name: /undo added move|vrátit přidaný tah/i })).toBeDisabled();
    await notation.fill(source);
    await drag('b1', 'c3');
    await expect(notation).toHaveValue(/e5.*\(.*c5[\s\S]*\(2\. Nc3\)/);
    const added = await notation.inputValue();
    await notation.fill(draft);
    await page.getByRole('button', { name: /undo added move|vrátit přidaný tah/i }).click();
    await expect(notation).toHaveValue(draft);
    await expect(page.getByRole('button', { name: /undo added move|vrátit přidaný tah/i })).toBeEnabled();
    await expect(page.getByRole('button', { name: /^2\. (Nc3|Jc3)$/ }).last()).toHaveAttribute('aria-current', 'step');
    await notation.fill(added);
    await page.getByRole('button', { name: /undo added move|vrátit přidaný tah/i }).click();
    await expect(notation).toHaveValue(source);
    await expect(page.getByRole('button', { name: '1... e5', exact: true })).toHaveAttribute('aria-current', 'step');
    await drag('b1', 'c3');
    const working = await notation.inputValue();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export pgn|exportovat pgn/i }).click();
    const download = await downloadPromise;
    const exported = await readFile((await download.path())!, 'utf8');
    expect(parsePgnTree(exported).root).toEqual(parsePgnTree(working).root);
    expect(parsePgnTree(exported).headers).toMatchObject({ Event: 'Nested', Site: '?', Date: '????.??.??', Round: '?', White: '?', Black: '?', Result: '*' });
    expect(exported).toContain('Nested note');
    await notation.fill(exported);
    await page.getByRole('button', { name: /import pgn|importovat pgn/i }).click();
    await expect(page.getByRole('button', { name: /^2\. (Nc3|Jc3)$/ })).toHaveCount(2);
    for (const panel of [board, notation.locator('..')]) {
      const metrics = await panel.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, scroll: element.scrollWidth, client: element.clientWidth, viewport: window.innerWidth };
      });
      expect(metrics.width).toBeGreaterThan(0);
      expect(metrics.left).toBeGreaterThanOrEqual(0);
      expect(metrics.right).toBeLessThanOrEqual(metrics.viewport);
      expect(metrics.scroll).toBeLessThanOrEqual(metrics.client + 1);
    }
    await page.screenshot({ path: testInfo.outputPath(`nested-${viewport.width}.png`), fullPage: true });
    await notation.fill('1. e4 e5 (1... c5 2. Nf3 Nc6 3. d4) 2. Nf3 *');
    await page.getByRole('button', { name: /import pgn|importovat pgn/i }).click();
    await page.getByRole('button', { name: '1... c5', exact: true }).click();
    await expect(page.getByText('2 / 5', { exact: true }).filter({ visible: true })).toBeVisible();
    await page.getByRole('button', { name: /next move|následující tah/i }).filter({ visible: true }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByText('5 / 5', { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(board).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByText('4 / 5', { exact: true }).filter({ visible: true })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('5 / 5', { exact: true }).filter({ visible: true })).toBeVisible();
    await notation.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByText('5 / 5', { exact: true }).filter({ visible: true })).toBeVisible();
    await notation.fill('[SetUp "1"]\n[FEN "8/8/8/8/8/8/8/K1k5 b - - 0 30"]\n\n30... Kd2 31. Ka2 *');
    await page.getByRole('button', { name: /import pgn|importovat pgn/i }).click();
    const blackStart = page.getByRole('button', { name: /^30\.\.\. (Kd2|Kd2)$/ });
    const whiteReply = page.getByRole('button', { name: /^31\. (Ka2|Ka2)$/ });
    await expect(blackStart).toBeVisible();
    const blackStartBounds = await blackStart.boundingBox();
    const whiteReplyBounds = await whiteReply.boundingBox();
    expect(blackStartBounds!.x).toBeGreaterThan(whiteReplyBounds!.x);
    await page.screenshot({ path: testInfo.outputPath(`black-start-${viewport.width}.png`), fullPage: true });
  });
}

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