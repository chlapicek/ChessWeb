import { expect, request, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { apiBaseUrl, mutationTargetSkipReason, safeMutationTarget } from './testApiSafety';

const adminEmail = 'admin@chessweb.local';
const adminPassword = 'Admin123!#';

type TestUser = {
  email: string;
  password: string;
  userId: string;
  fullName: string;
};

async function register(api: APIRequestContext, label: string): Promise<TestUser> {
  const email = `notification-e2e-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@chessweb.local`;
  const password = 'Player123!#';
  const fullName = `Notification E2E ${label}`;
  const response = await api.post('/api/auth/register', {
    data: { email, password, fullName, chessRating: null, fideId: null },
  });
  expect(response.status(), await response.text()).toBe(200);
  const auth = await response.json();
  return { email, password, userId: auth.user.id, fullName };
}

async function loginAdmin(api: APIRequestContext): Promise<APIRequestContext> {
  const response = await api.post('/api/auth/login', {
    data: { emailOrNickname: adminEmail, password: adminPassword },
  });
  expect(response.status(), await response.text()).toBe(200);
  const auth = await response.json();
  return request.newContext({
    baseURL: apiBaseUrl,
    extraHTTPHeaders: { Authorization: `Bearer ${auth.token}` },
  });
}

async function signInThroughUi(page: Page, email: string, password: string): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('chessweb_language', 'en'));
  await page.goto('/notifications');
  await page.getByRole('button', { name: /login/i }).click();
  await page.getByPlaceholder('you@example.com / nickname').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
}

async function createRecipientPage(browser: Browser, user: TestUser): Promise<{ context: Awaited<ReturnType<Browser['newContext']>>; page: Page }> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signInThroughUi(page, user.email, user.password);
    return { context, page };
  } catch (error) {
    await context.close();
    throw error;
  }
}

test.describe('notification browser workflows', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!safeMutationTarget, mutationTargetSkipReason);

  test('captain sends to their team and recipients can read the inbox item', async ({ browser, page }) => {
    const setupApi = await request.newContext({ baseURL: apiBaseUrl });
    let adminApi: APIRequestContext | undefined;
    let teamId: string | undefined;
    let recipientContext: Awaited<ReturnType<Browser['newContext']>> | undefined;
    let controlContext: Awaited<ReturnType<Browser['newContext']>> | undefined;

    try {
      adminApi = await loginAdmin(setupApi);
      const captain = await register(setupApi, 'captain');
      const recipient = await register(setupApi, 'member');
      const control = await register(setupApi, 'outside-team');
      const createTeamResponse = await adminApi.post('/api/teams', { data: { name: `Notification E2E ${Date.now()}` } });
      expect(createTeamResponse.status(), await createTeamResponse.text()).toBe(201);
      teamId = (await createTeamResponse.json()).id;
      expect((await adminApi.post(`/api/teams/${teamId}/members`, { data: { userId: captain.userId } })).status()).toBe(200);
      expect((await adminApi.post(`/api/teams/${teamId}/members`, { data: { userId: recipient.userId } })).status()).toBe(200);
      expect((await adminApi.put(`/api/teams/${teamId}/captain`, { data: { captainUserId: captain.userId } })).status()).toBe(204);

      await signInThroughUi(page, captain.email, captain.password);
      await page.getByLabel('Select a team').selectOption(teamId);
      await page.getByLabel('Title').fill('Captain team update');
      await page.getByLabel('Message').fill('Team practice starts at 18:30.');
      await page.getByRole('button', { name: 'Send notification' }).click();
      await expect(page.getByText('Notification sent to 2 accounts.')).toBeVisible();

      recipientContext = await browser.newContext();
      const recipientPage = await recipientContext.newPage();
      await signInThroughUi(recipientPage, recipient.email, recipient.password);
      await expect(recipientPage.getByRole('link', { name: 'Notifications, 1 unread' })).toBeVisible();
      await expect(recipientPage.getByRole('heading', { name: 'Captain team update' })).toBeVisible();
      await expect(recipientPage.getByText('Team practice starts at 18:30.')).toBeVisible();

      await recipientPage.getByRole('button', { name: 'Mark as read' }).click();
      await expect(recipientPage.getByRole('button', { name: 'Mark as read' })).toHaveCount(0);
      await expect(recipientPage.getByRole('link', { name: 'Notifications, 0 unread' })).toBeVisible();
      await recipientPage.reload();
      await expect(recipientPage.getByRole('heading', { name: 'Captain team update' })).toBeVisible();
      await expect(recipientPage.getByRole('button', { name: 'Mark as read' })).toHaveCount(0);

      recipientPage.once('dialog', (dialog) => dialog.accept());
      await recipientPage.getByRole('button', { name: 'Delete notification: Captain team update' }).click();
      await expect(recipientPage.getByRole('status')).toHaveText('Deleted “Captain team update” from your inbox.');
      await expect(recipientPage.getByText('Your inbox is clear.')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Captain team update' })).toBeVisible();

      const controlSession = await createRecipientPage(browser, control);
      controlContext = controlSession.context;
      await expect(controlSession.page.getByText('Your inbox is clear.')).toBeVisible();
    } finally {
      await controlContext?.close();
      await recipientContext?.close();
      if (teamId && adminApi) await adminApi.delete(`/api/teams/${teamId}`).catch(() => undefined);
      await adminApi?.dispose();
      await setupApi.dispose();
    }
  });

  test('Admin targets a selected account through the composer review step', async ({ browser, page }) => {
    const setupApi = await request.newContext({ baseURL: apiBaseUrl });
    let adminApi: APIRequestContext | undefined;
    let recipientContext: Awaited<ReturnType<Browser['newContext']>> | undefined;
    let controlContext: Awaited<ReturnType<Browser['newContext']>> | undefined;

    try {
      adminApi = await loginAdmin(setupApi);
      const recipient = await register(setupApi, 'individual-recipient');
      const control = await register(setupApi, 'individual-control');
      await signInThroughUi(page, adminEmail, adminPassword);
      let notificationPosts = 0;
      page.on('request', (browserRequest) => {
        if (browserRequest.method() === 'POST' && browserRequest.url().endsWith('/api/notifications')) notificationPosts++;
      });
      await page.getByRole('checkbox', { name: `${recipient.fullName} ${recipient.email}`, exact: true }).check();
      await page.getByLabel('Title').fill('Individual account notice');
      await page.getByLabel('Message').fill('The annual meeting is on Thursday.');
      await page.getByRole('button', { name: 'Review notification' }).click();
      await expect(page.getByRole('button', { name: 'Confirm and send' })).toBeVisible();
      expect(notificationPosts).toBe(0);

      const sendResponse = page.waitForResponse((response) =>
        response.url().endsWith('/api/notifications') && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Confirm and send' }).click();
      expect((await sendResponse).status()).toBe(200);
      await expect(page.getByText('Notification sent to 1 account.')).toBeVisible();
      expect(notificationPosts).toBe(1);

      const recipientSession = await createRecipientPage(browser, recipient);
      recipientContext = recipientSession.context;
      await expect(recipientSession.page.getByRole('heading', { name: 'Individual account notice' })).toBeVisible();
      await expect(recipientSession.page.getByText('The annual meeting is on Thursday.')).toBeVisible();
      await expect(recipientSession.page.getByText('Unread', { exact: true })).toBeVisible();

      const controlSession = await createRecipientPage(browser, control);
      controlContext = controlSession.context;
      await expect(controlSession.page.getByText('Your inbox is clear.')).toBeVisible();
    } finally {
      await controlContext?.close();
      await recipientContext?.close();
      await adminApi?.dispose();
      await setupApi.dispose();
    }
  });
});