import type { AxiosAdapter } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../services/apiClient';

describe('apiClient CSRF protection', () => {
  const originalAdapter = apiClient.defaults.adapter;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
  });

  it('shares token bootstrap across concurrent mutations and sends both tokens', async () => {
    localStorage.setItem('chessweb_token', 'jwt-token');
    const requests: Parameters<AxiosAdapter>[0][] = [];
    const adapter: AxiosAdapter = async (config) => {
      requests.push(config);
      return {
        data: config.url === '/csrf/token' ? { requestToken: 'csrf-request-token' } : {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };
    apiClient.defaults.adapter = adapter;

    await Promise.all([
      apiClient.post('/first-mutation', {}),
      apiClient.post('/second-mutation', {}),
    ]);

    const bootstrapRequests = requests.filter((request) => request.url === '/csrf/token');
    const mutationRequests = requests.filter((request) => request.url !== '/csrf/token');
    expect(bootstrapRequests).toHaveLength(1);
    expect(bootstrapRequests[0].withCredentials).toBe(true);
    expect(mutationRequests).toHaveLength(2);
    for (const request of mutationRequests) {
      expect(request.withCredentials).toBe(true);
      expect(request.headers.get('X-CSRF-TOKEN')).toBe('csrf-request-token');
      expect(request.headers.get('Authorization')).toBe('Bearer jwt-token');
    }
  });
});

describe('apiClient', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adds bearer token to authenticated requests', async () => {
    localStorage.setItem('chessweb_token', 'my-token');

    const requestInterceptor = apiClient.interceptors.request.handlers?.[0]?.fulfilled as unknown as (
      config: { headers: Record<string, string> }
    ) => Promise<{ headers: Record<string, string> }>;
    const config = { headers: {} } as any;
    const updatedConfig = await requestInterceptor(config);

    expect(updatedConfig.headers.Authorization).toBe('Bearer my-token');
  });

  it('removes auth data when server responds 401', async () => {
    localStorage.setItem('chessweb_token', 'my-token');
    localStorage.setItem('chessweb_user', JSON.stringify({ id: '1' }));

    const errorHandler = apiClient.interceptors.response.handlers?.[0]?.rejected as (error: unknown) => Promise<unknown>;
    const error = {
      response: { status: 401, data: { message: 'Unauthorized' } },
      config: { url: '/auth/me' },
    } as any;

    await expect(errorHandler(error)).rejects.toBeTruthy();
    expect(localStorage.getItem('chessweb_token')).toBeNull();
    expect(localStorage.getItem('chessweb_user')).toBeNull();
  });

  it('does not log request or error payloads', async () => {
    const secret = 'sensitive-request-and-response-value';
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const requestHandler = apiClient.interceptors.request.handlers?.[0]?.fulfilled as (config: any) => Promise<any>;
    const errorHandler = apiClient.interceptors.response.handlers?.[0]?.rejected as (error: any) => Promise<unknown>;

    await requestHandler({ method: 'get', url: `/test?token=${secret}`, headers: {}, params: { value: secret }, data: { value: secret } });
    await expect(errorHandler({
      response: { status: 400, data: { message: secret } },
      config: { url: `/test?token=${secret}` },
    })).rejects.toBeTruthy();

    expect(debug.mock.calls.flat().join(' ')).not.toContain(secret);
    expect(warn.mock.calls.flat().join(' ')).not.toContain(secret);
  });
});
