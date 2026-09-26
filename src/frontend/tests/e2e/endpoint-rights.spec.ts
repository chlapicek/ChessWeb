import { expect, request, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { apiBaseUrl, mutationTargetSkipReason, safeMutationTarget } from './testApiSafety';

const emptyGuid = '00000000-0000-0000-0000-000000000000';

type Credentials = {
  email: string;
  password: string;
  userId: string;
  token: string;
};

type EndpointCase = {
  method: 'get' | 'post' | 'put' | 'delete';
  path: string;
  body?: unknown;
  expectedStatus?: number;
};

const protectedEndpoints: EndpointCase[] = [
  { method: 'get', path: '/api/auth/me' },
  { method: 'get', path: '/api/auth/users' },
  { method: 'post', path: '/api/auth/change-roles', body: {} },
  { method: 'get', path: '/api/notifications' },
  { method: 'get', path: '/api/notifications/unread-count' },
  { method: 'get', path: '/api/notifications/audience-options' },
  { method: 'post', path: '/api/notifications', body: {} },
  { method: 'put', path: `/api/notifications/${emptyGuid}/read` },
  { method: 'post', path: '/api/partners/upload' },
  { method: 'post', path: '/api/articles', body: {} },
  { method: 'put', path: `/api/articles/${emptyGuid}`, body: {} },
  { method: 'delete', path: `/api/articles/${emptyGuid}` },
  { method: 'post', path: `/api/articles/${emptyGuid}/comments`, body: {} },
  { method: 'delete', path: `/api/articles/comments/${emptyGuid}` },
  { method: 'post', path: `/api/articles/${emptyGuid}/reactions`, body: {} },
  { method: 'post', path: '/api/calendar/events', body: {} },
  { method: 'delete', path: `/api/calendar/events/${emptyGuid}` },
  { method: 'get', path: '/api/calendar/feeds' },
  { method: 'post', path: '/api/calendar/feeds', body: {} },
  { method: 'post', path: `/api/calendar/feeds/${emptyGuid}/sync` },
  { method: 'post', path: '/api/calendar/sync-all' },
  { method: 'get', path: '/api/gamecollections' },
  { method: 'get', path: `/api/gamecollections/${emptyGuid}` },
  { method: 'post', path: '/api/gamecollections', body: {} },
  { method: 'put', path: `/api/gamecollections/${emptyGuid}`, body: {} },
  { method: 'delete', path: `/api/gamecollections/${emptyGuid}` },
  { method: 'get', path: `/api/gamecollections/${emptyGuid}/export` },
  { method: 'get', path: '/api/logging/settings' },
  { method: 'put', path: '/api/logging/settings', body: {} },
  { method: 'post', path: '/api/partners', body: {} },
  { method: 'put', path: `/api/partners/${emptyGuid}`, body: {} },
  { method: 'post', path: '/api/partners/reorder', body: {} },
  { method: 'delete', path: `/api/partners/${emptyGuid}` },
  { method: 'put', path: `/api/player/${emptyGuid}`, body: {} },
  { method: 'get', path: '/api/teamavailability/teams' },
  { method: 'get', path: `/api/teamavailability/team/${emptyGuid}` },
  { method: 'get', path: `/api/teamavailability/players?teamId=${emptyGuid}&query=A` },
  { method: 'post', path: `/api/teamavailability/team/${emptyGuid}/entries`, body: {} },
  { method: 'post', path: `/api/teamavailability/team/${emptyGuid}/dates`, body: {} },
  { method: 'post', path: `/api/teamavailability/team/${emptyGuid}/players`, body: {} },
  { method: 'put', path: `/api/teamavailability/entries/${emptyGuid}/self`, body: {} },
  { method: 'put', path: `/api/teamavailability/entries/${emptyGuid}`, body: {} },
  { method: 'delete', path: `/api/teamavailability/entries/${emptyGuid}` },
  { method: 'put', path: `/api/teamavailability/team/${emptyGuid}/captain`, body: {} },
  { method: 'put', path: `/api/teamavailability/team/${emptyGuid}/players/${emptyGuid}/zaklad`, body: {} },
  { method: 'put', path: `/api/teamavailability/team/${emptyGuid}/players/${emptyGuid}/tag`, body: {} },
  { method: 'put', path: `/api/teamavailability/team/${emptyGuid}/season`, body: {} },
  { method: 'get', path: `/api/teamavailability/team/${emptyGuid}/season-report` },
  { method: 'get', path: '/api/teams' },
  { method: 'post', path: '/api/teams', body: {} },
  { method: 'post', path: `/api/teams/${emptyGuid}/members`, body: {} },
  { method: 'delete', path: `/api/teams/${emptyGuid}/members/${emptyGuid}` },
  { method: 'delete', path: `/api/teams/${emptyGuid}` },
];

const publicEndpoints: EndpointCase[] = [
  { method: 'post', path: '/api/auth/register', body: {}, expectedStatus: 400 },
  { method: 'post', path: '/api/auth/login', body: { emailOrNickname: 'invalid@example.com', password: 'invalid' }, expectedStatus: 401 },
  { method: 'get', path: '/api/articles', expectedStatus: 200 },
  { method: 'get', path: `/api/articles/${emptyGuid}`, expectedStatus: 404 },
  { method: 'get', path: `/api/articles/attachments/${emptyGuid}`, expectedStatus: 404 },
  { method: 'get', path: '/api/calendar/events', expectedStatus: 200 },
  { method: 'get', path: `/api/calendar/events/${emptyGuid}/ics`, expectedStatus: 404 },
  { method: 'get', path: `/api/calendar/events/series/${emptyGuid}/ics`, expectedStatus: 404 },
  { method: 'get', path: '/api/partners', expectedStatus: 200 },
  { method: 'get', path: `/api/partners/${emptyGuid}/logo`, expectedStatus: 404 },
];

async function callEndpoint(api: APIRequestContext, endpoint: EndpointCase): Promise<APIResponse> {
  const options = endpoint.body === undefined ? undefined : { data: endpoint.body };
  return api[endpoint.method](endpoint.path, options);
}

async function register(api: APIRequestContext, label: string): Promise<Credentials> {
  const email = `e2e-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@chessweb.local`;
  const password = 'Player123!#';
  const response = await api.post('/api/auth/register', {
    data: { email, password, fullName: `E2E ${label}`, chessRating: null, fideId: null },
  });
  expect(response.status(), await response.text()).toBe(200);
  const auth = await response.json();
  return { email, password, userId: auth.user.id, token: auth.token };
}

async function login(api: APIRequestContext, email: string, password: string): Promise<Credentials> {
  const response = await api.post('/api/auth/login', { data: { emailOrNickname: email, password } });
  expect(response.status(), await response.text()).toBe(200);
  const auth = await response.json();
  return { email, password, userId: auth.user.id, token: auth.token };
}

function authorizedApi(token: string): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: apiBaseUrl,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('endpoint authentication matrix', () => {
  test.skip(!safeMutationTarget, mutationTargetSkipReason);

  test('every public endpoint is reachable without authentication', async () => {
    const api = await request.newContext({ baseURL: apiBaseUrl });
    try {
      for (const endpoint of publicEndpoints) {
        const response = await callEndpoint(api, endpoint);
        expect(response.status(), `${endpoint.method.toUpperCase()} ${endpoint.path}`).toBe(endpoint.expectedStatus);
      }
    } finally {
      await api.dispose();
    }
  });

  test('every protected endpoint rejects unauthenticated requests', async () => {
    const api = await request.newContext({ baseURL: apiBaseUrl });
    try {
      for (const endpoint of protectedEndpoints) {
        const response = await callEndpoint(api, endpoint);
        expect(response.status(), `${endpoint.method.toUpperCase()} ${endpoint.path}`).toBe(401);
      }
    } finally {
      await api.dispose();
    }
  });
});

test.describe('role and ownership rights', () => {
  test.skip(!safeMutationTarget, mutationTargetSkipReason);

  test('registered users cannot access Admin or SuperAdmin endpoints', async () => {
    const api = await request.newContext({ baseURL: apiBaseUrl });
    const user = await register(api, 'rights');
    const authenticated = await authorizedApi(user.token);
    try {
      const adminOnly = [
        '/api/auth/users',
        '/api/calendar/feeds',
        '/api/teams',
        '/api/calendar/events',
        '/api/calendar/sync-all',
        '/api/partners',
      ];
      for (const path of adminOnly) {
        const response = path === '/api/calendar/events' || path === '/api/partners' || path === '/api/calendar/sync-all'
          ? await authenticated.post(path, { data: {} })
          : await authenticated.get(path);
        expect(response.status(), path).toBe(403);
      }
      expect((await authenticated.post('/api/articles', { data: {} })).status()).toBe(400);
      expect((await authenticated.put(`/api/articles/${emptyGuid}`, { data: {} })).status()).toBe(400);
      expect((await authenticated.delete(`/api/articles/${emptyGuid}`)).status()).toBe(404);
      for (const action of [
        () => authenticated.post('/api/auth/change-roles', { data: {} }),
        () => authenticated.post(`/api/calendar/feeds/${emptyGuid}/sync`),
        () => authenticated.post('/api/calendar/feeds', { data: {} }),
        () => authenticated.delete(`/api/calendar/events/${emptyGuid}`),
        () => authenticated.post('/api/partners/upload', { data: {} }),
        () => authenticated.put(`/api/partners/${emptyGuid}`, { data: {} }),
        () => authenticated.post('/api/partners/reorder', { data: {} }),
        () => authenticated.delete(`/api/partners/${emptyGuid}`),
        () => authenticated.post('/api/teams', { data: {} }),
        () => authenticated.post(`/api/teams/${emptyGuid}/members`, { data: {} }),
        () => authenticated.delete(`/api/teams/${emptyGuid}`),
        () => authenticated.put(`/api/teamavailability/team/${emptyGuid}/captain`, { data: {} }),
      ]) {
        expect((await action()).status()).toBe(403);
      }
      expect((await authenticated.get('/api/logging/settings')).status()).toBe(403);
      expect((await authenticated.put('/api/logging/settings', { data: { minimumLevel: 'Debug', retainedFileCountLimit: 7 } })).status()).toBe(403);
      expect((await authenticated.put(`/api/player/${user.userId}`, { data: { fullName: 'Changed', email: user.email } })).status()).toBe(403);
      expect((await authenticated.post('/api/notifications', {
        data: { title: 'Unauthorized', message: 'Not a captain or administrator', audience: 'admin', userIds: [user.userId] },
      })).status()).toBe(403);
    } finally {
      await authenticated.dispose();
      await api.dispose();
    }
  });

  test('Admin cannot use SuperAdmin-only logging settings, while SuperAdmin can', async () => {
    const api = await request.newContext({ baseURL: apiBaseUrl });
    const admin = await login(api, 'admin@chessweb.local', 'Admin123!#');
    const superAdmin = await login(api, 'superadmin@chessweb.local', 'SuperAdmin123!#');
    const adminApi = await authorizedApi(admin.token);
    const superAdminApi = await authorizedApi(superAdmin.token);
    try {
      expect((await adminApi.get('/api/logging/settings')).status()).toBe(403);
      expect((await adminApi.put('/api/logging/settings', { data: { minimumLevel: 'Information', retainedFileCountLimit: 14 } })).status()).toBe(403);
      expect((await superAdminApi.get('/api/logging/settings')).status()).toBe(200);
      expect((await superAdminApi.put('/api/logging/settings', { data: { minimumLevel: 'Information', retainedFileCountLimit: 14 } })).status()).toBe(200);
    } finally {
      await adminApi.dispose();
      await superAdminApi.dispose();
      await api.dispose();
    }
  });

  test('game collections enforce owner access while allowing the owner to manage them', async () => {
    const api = await request.newContext({ baseURL: apiBaseUrl });
    const owner = await register(api, 'collection-owner');
    const otherUser = await register(api, 'collection-other');
    const ownerApi = await authorizedApi(owner.token);
    const otherApi = await authorizedApi(otherUser.token);
    let collectionId: string | undefined;
    try {
      const createResponse = await ownerApi.post('/api/gamecollections', {
        data: {
          name: `E2E collection ${Date.now()}`,
          games: [{ pgn: '[Event "E2E"]\n\n1. e4 e5 *', label: 'E2E game' }],
        },
      });
      expect(createResponse.status(), await createResponse.text()).toBe(201);
      const collection = await createResponse.json();
      collectionId = collection.id;

      expect((await ownerApi.get(`/api/gamecollections/${collectionId}`)).status()).toBe(200);
      expect((await ownerApi.put(`/api/gamecollections/${collectionId}`, {
        data: { name: 'Updated E2E collection', games: [{ pgn: '1. d4 d5 *', label: 'Updated game' }] },
      })).status()).toBe(200);
      expect((await ownerApi.get(`/api/gamecollections/${collectionId}/export`)).status()).toBe(200);

      for (const action of [
        () => otherApi.get(`/api/gamecollections/${collectionId}`),
        () => otherApi.put(`/api/gamecollections/${collectionId}`, { data: { name: 'Forbidden', games: [] } }),
        () => otherApi.get(`/api/gamecollections/${collectionId}/export`),
        () => otherApi.delete(`/api/gamecollections/${collectionId}`),
      ]) {
        expect((await action()).status()).toBe(403);
      }

      expect((await ownerApi.delete(`/api/gamecollections/${collectionId}`)).status()).toBe(204);
    } finally {
      if (typeof collectionId !== 'undefined') {
        await ownerApi.delete(`/api/gamecollections/${collectionId}`).catch(() => undefined);
      }
      await ownerApi.dispose();
      await otherApi.dispose();
      await api.dispose();
    }
  });

  test('team captain can manage team availability while an ordinary member cannot', async () => {
    const api = await request.newContext({ baseURL: apiBaseUrl });
    const captain = await register(api, 'captain');
    const member = await register(api, 'member');
    const admin = await login(api, 'admin@chessweb.local', 'Admin123!#');
    const adminApi = await authorizedApi(admin.token);
    let teamId: string | undefined;
    try {
      const teamResponse = await adminApi.post('/api/teams', { data: { name: `E2E rights team ${Date.now()}` } });
      expect(teamResponse.status(), await teamResponse.text()).toBe(201);
      const team = await teamResponse.json();
      teamId = team.id;
      expect((await adminApi.post(`/api/teams/${teamId}/members`, { data: { userId: captain.userId } })).status()).toBe(200);
      expect((await adminApi.post(`/api/teams/${teamId}/members`, { data: { userId: member.userId } })).status()).toBe(200);
      expect((await adminApi.put(`/api/teamavailability/team/${teamId}/captain`, { data: { captainUserId: captain.userId } })).status()).toBe(204);

      const captainApi = await authorizedApi(captain.token);
      const memberApi = await authorizedApi(member.token);
      try {
        expect((await captainApi.get(`/api/teamavailability/team/${teamId}`)).status()).toBe(200);
        expect((await memberApi.get(`/api/teamavailability/team/${teamId}`)).status()).toBe(200);
        const date = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
        expect((await captainApi.post(`/api/teamavailability/team/${teamId}/dates`, {
          data: { matchDate: date, opponentTeam: 'E2E opponent', location: 'E2E club', isHomeMatch: true },
        })).status()).toBe(201);
        expect((await memberApi.post(`/api/teamavailability/team/${teamId}/dates`, {
          data: { matchDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(), opponentTeam: 'Forbidden', location: 'E2E club', isHomeMatch: true },
        })).status()).toBe(403);
      } finally {
        await captainApi.dispose();
        await memberApi.dispose();
      }
    } finally {
      if (typeof teamId !== 'undefined') {
        await adminApi.delete(`/api/teams/${teamId}`).catch(() => undefined);
      }
      await adminApi.dispose();
      await api.dispose();
    }
  });
});