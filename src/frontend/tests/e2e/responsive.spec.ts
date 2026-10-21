import { expect, test, type Page, type Route } from '@playwright/test';

const user = {
  id: 'responsive-user',
  email: 'responsive@example.test',
  fullName: 'Responsive Test User',
  roles: ['Admin', 'SuperAdmin'],
};

const article = {
  id: 'responsive-article',
  title: 'Responsive article layout check',
  summary: 'A deterministic article fixture for narrow-screen rendering.',
  content: 'Article body content for responsive layout checks.',
  contentFormat: 0,
  excerpt: 'Article excerpt',
  pgnData: '1. e4 e5 *',
  fenData: null,
  isPublished: true,
  createdAt: '2026-10-01T12:00:00Z',
  authorId: user.id,
  authorName: user.fullName,
  attachments: [],
  reactions: [],
  commentsCount: 0,
  commentsLocked: false,
  collection: null,
};

const availability = {
  teamId: 'team-1',
  teamName: 'Responsive Team',
  teamMembers: [{ userId: user.id, fullName: user.fullName }],
  captainUserId: user.id,
  dates: [{
    id: 'match-1', teamId: 'team-1', roundNumber: 1, matchDate: '2026-10-28T00:00:00Z',
    opponentTeam: 'Long Opponent Name', location: 'Club Hall', isHomeMatch: true, isClosed: false,
  }],
  players: [{
    id: 'player-1', teamId: 'team-1', playerUserId: user.id, playerName: user.fullName,
    isZaklad: false, tag: 0,
  }],
  entries: [{
    id: 'entry-1', teamId: 'team-1', playerUserId: user.id, playerName: user.fullName,
    roundNumber: 1, matchDate: '2026-10-28T00:00:00Z', opponentTeam: 'Long Opponent Name',
    location: 'Club Hall', isHomeMatch: true, status: 0, isDriver: false, updatedAt: '2026-10-01T12:00:00Z',
  }],
};

const event = {
  id: 'event-1',
  title: 'Responsive calendar event',
  description: 'A deterministic event fixture.',
  location: 'Club Hall',
  startTime: new Date().toISOString(),
  endTime: new Date(Date.now() + 3_600_000).toISOString(),
  isAllDay: false,
  category: 0,
  recurrence: 0,
  createdAt: new Date().toISOString(),
};

const paged = <T,>(items: T[]) => ({ items, totalCount: items.length, pageNumber: 1, pageSize: 10, totalPages: 1 });

async function fulfillApi(route: Route) {
  const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
  let data: unknown = [];

  if (path === '/auth/me') data = user;
  else if (path === '/articles') data = { ...paged([article]), pageSize: 5 };
  else if (path === `/articles/${article.id}`) data = article;
  else if (path === `/articles/${article.id}/comments`) data = paged([]);
  else if (path === '/calendar/events') data = [event];
  else if (path === '/calendar/my-subscriptions') data = [];
  else if (path === '/player') data = [{ id: user.id, fullName: user.fullName, nickname: null, chessRating: null, fideId: null }];
  else if (path === `/player/${user.id}`) data = { ...user, nickname: null, chessRating: null, fideId: null, isSelf: true };
  else if (path === '/teamavailability/teams') data = [{ id: 'team-1', name: 'Responsive Team', memberCount: 1, captainUserId: user.id }];
  else if (path === '/teamavailability/team/team-1') data = availability;
  else if (path === '/notifications') data = { ...paged([]), page: 1 };
  else if (path === '/notifications/audience-options') data = { teams: [], users: [], roles: [], isAdministrator: true };
  else if (path === '/logging/settings') data = { minimumLevel: 'Information', retainedFileCountLimit: 14, updatedAt: '2026-10-01T12:00:00Z' };

  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
}

async function preparePage(page: Page, language: 'en' | 'cs') {
  await page.addInitScript(({ selectedLanguage, savedUser }) => {
    localStorage.setItem('chessweb_language', selectedLanguage);
    localStorage.setItem('chessweb_token', 'responsive-test-token');
    localStorage.setItem('chessweb_user', JSON.stringify(savedUser));
  }, { selectedLanguage: language, savedUser: user });
  await page.route('**/api/**', fulfillApi);
}

const routedScreens = [
  '/articles',
  '/articles/responsive-article',
  '/calendar',
  '/team-availability',
  '/players',
  `/players/${user.id}`,
  '/board',
  '/settings',
  '/notifications',
  '/admin',
];

for (const { width, language } of [
  { width: 320, language: 'cs' as const },
  { width: 375, language: 'en' as const },
  { width: 430, language: 'cs' as const },
  { width: 767, language: 'en' as const },
  { width: 768, language: 'cs' as const },
]) {
  test(`routed screens fit a ${width}px viewport (${language})`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await preparePage(page, language);

    for (const path of routedScreens) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main')).toBeVisible();

      if (path === '/calendar') {
        if (width < 768) {
          const eventCard = page.getByRole('button', { name: event.title, exact: true });
          await expect(eventCard).toBeVisible();
          if (width === 320) {
            await eventCard.focus();
            await eventCard.press('Enter');
            const eventDialog = page.getByRole('dialog', { name: event.title });
            await expect(eventDialog).toBeVisible();
            await page.keyboard.press('Escape');
            await expect(eventDialog).toHaveCount(0);
            await expect(eventCard).toBeFocused();
          }
        } else {
          await expect(page.locator('main .grid-cols-7').last()).toBeVisible();
          if (width === 768) {
            const eventCard = page.getByRole('button', { name: event.title, exact: true });
            await expect(eventCard).toBeVisible();
            await eventCard.focus();
            await eventCard.press('Enter');
            const eventDialog = page.getByRole('dialog', { name: event.title });
            await expect(eventDialog).toBeVisible();
            await page.keyboard.press('Escape');
            await expect(eventDialog).toHaveCount(0);
            await expect(eventCard).toBeFocused();
          }
        }
      }
      if (path === '/team-availability' && (width === 320 || width === 768)) {
        const matrix = page.locator('main [role="region"]').filter({ has: page.locator('table') });
        await expect(matrix).toBeVisible();
        expect(await matrix.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
        await expect(page.getByText(/scroll the availability table horizontally|tabulce dostupnosti se posuňte vodorovně/i)).toBeVisible();
        await matrix.focus();
        await expect(matrix).toBeFocused();
      }

      const pageWidth = await page.evaluate(() => Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ));
      expect(pageWidth, `${path} overflows horizontally at ${width}px`).toBeLessThanOrEqual(width);
    }
  });
}

for (const width of [1023, 1024]) {
  test(`article board stacks at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await preparePage(page, 'en');
    await page.goto(`/articles/${article.id}`);
    await page.waitForLoadState('networkidle');

    const heading = page.locator('main h1').first();
    const board = page.locator('main aside').first();
    await expect(heading).toBeVisible();
    await expect(board).toBeVisible();
    const [headingBox, boardBox] = await Promise.all([heading.boundingBox(), board.boundingBox()]);
    expect(headingBox).not.toBeNull();
    expect(boardBox).not.toBeNull();
    if (!headingBox || !boardBox) return;
    if (width === 1023) expect(Math.abs(boardBox.x - headingBox.x)).toBeLessThanOrEqual(1);
    else expect(boardBox.x).toBeGreaterThan(headingBox.x);
  });
}