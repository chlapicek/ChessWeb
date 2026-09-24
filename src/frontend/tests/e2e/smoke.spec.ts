import { test, expect } from '@playwright/test';

test('homepage redirects to articles page', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/articles$/);
  await expect(page.getByRole('link', { name: /chessweb/i }).first()).toBeVisible();
  await expect(page.locator('body')).toContainText(/chessweb|články|articles/i);
});

test('articles page renders content and navigation', async ({ page }) => {
  await page.goto('/articles');

  await expect(page).toHaveURL(/\/articles$/);
  await expect(page.getByRole('link', { name: /chessweb/i }).first()).toBeVisible();
  await expect(page.locator('body')).toContainText(/chessweb|články|articles/i);
});

test('opening an article updates the URL and the logo returns to the article list', async ({ page }) => {
  await page.goto('/articles');
  await expect(page).toHaveURL(/\/articles$/);

  const articleCard = page.locator('main').locator('h3').first();
  await expect(articleCard).toBeVisible();
  const articleTitle = await articleCard.textContent();

  await articleCard.click();
  await expect(page).toHaveURL(/\/articles\/[^/]+$/);
  if (articleTitle) {
    await expect(page.locator('main')).toContainText(articleTitle.trim());
  }

  await page.getByRole('link', { name: /chessweb/i }).first().click();

  await expect(page).toHaveURL(/\/articles$/);
  await expect(articleCard).toBeVisible();
});
