const configuredApiBaseUrl = process.env.API_BASE_URL;
export const apiBaseUrl = configuredApiBaseUrl ?? 'http://localhost:8080';

function isLoopbackHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    return url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '::1'].includes(hostname) &&
      url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
  } catch {
    return false;
  }
}

export const safeMutationTarget =
  Boolean(configuredApiBaseUrl) &&
  process.env.E2E_ALLOW_MUTATING_API === '1' &&
  process.env.E2E_DISPOSABLE_DATABASE === '1' &&
  isLoopbackHttpUrl(apiBaseUrl);

export const mutationTargetSkipReason =
  'Point API_BASE_URL at a disposable loopback test API and set E2E_ALLOW_MUTATING_API=1 and E2E_DISPOSABLE_DATABASE=1; these tests create persistent test data.';