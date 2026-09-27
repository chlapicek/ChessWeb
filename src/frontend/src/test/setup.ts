import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import type React from 'react';

vi.mock('react-chessboard', async () => {
  const { createElement } = await import('react');
  return {
    Chessboard: ({ options }: { options?: { position?: string } }) => createElement('div', {
      'data-testid': 'board',
      'data-position': options?.position,
    }),
    ChessboardProvider: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
    SparePiece: ({ pieceType }: { pieceType: string }) => createElement('span', null, pieceType),
  };
});

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
  globalThis.ResizeObserver = MockResizeObserver;
}

if (!('Worker' in globalThis)) {
  // @ts-expect-error jsdom test compatibility
  globalThis.Worker = MockWorker;
}
