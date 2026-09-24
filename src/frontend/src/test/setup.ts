import '@testing-library/jest-dom';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: any) => void) | null = null;

  constructor(_url?: string | URL) {}

  postMessage() {}
  terminate() {}
}

if (!('ResizeObserver' in globalThis)) {
  // @ts-expect-error jsdom test compatibility
  globalThis.ResizeObserver = MockResizeObserver;
}

if (!('Worker' in globalThis)) {
  // @ts-expect-error jsdom test compatibility
  globalThis.Worker = MockWorker;
}
