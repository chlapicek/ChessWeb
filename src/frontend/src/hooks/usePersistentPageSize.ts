import { useCallback, useState } from 'react';

export const DEFAULT_PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

const readStoredSize = (storageKey: string, options: number[]): number | null => {
  try {
    const stored = Number(localStorage.getItem(storageKey));
    return options.includes(stored) ? stored : null;
  } catch {
    return null;
  }
};

export const usePersistentPageSize = (
  key: string,
  defaultSize: number,
  options: number[] = DEFAULT_PAGE_SIZE_OPTIONS,
): [number, (size: number) => void] => {
  const storageKey = `chessweb_pageSize_${key}`;
  const [pageSize, setPageSizeState] = useState(() => readStoredSize(storageKey, options) ?? defaultSize);

  const setPageSize = useCallback((size: number) => {
    if (!options.includes(size)) return;
    setPageSizeState(size);
    try {
      localStorage.setItem(storageKey, String(size));
    } catch {
      // Storage may be unavailable (private mode); the in-memory value still applies.
    }
  }, [storageKey, options]);

  return [pageSize, setPageSize];
};
