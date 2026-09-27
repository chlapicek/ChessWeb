import { describe, it, expect, beforeEach } from 'vitest';
import { apiClient } from '../services/apiClient';

describe('apiClient', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adds bearer token to authenticated requests', () => {
    localStorage.setItem('chessweb_token', 'my-token');

    const requestInterceptor = apiClient.interceptors.request.handlers?.[0]?.fulfilled as unknown as (
      config: { headers: Record<string, string> }
    ) => { headers: Record<string, string> };
    const config = { headers: {} } as any;

    const updatedConfig = requestInterceptor?.(config);

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
});
