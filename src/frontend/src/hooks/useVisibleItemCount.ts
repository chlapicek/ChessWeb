import { useLayoutEffect, useState, type RefObject } from 'react';

/** How many leading items fit in `available`, reserving room for a "more" control when not all fit. */
export function countFittingItems(available: number, itemWidths: number[], moreWidth: number, gap: number): number {
  const totalWidth = itemWidths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, itemWidths.length - 1);
  if (totalWidth <= available) return itemWidths.length;

  let used = moreWidth;
  let count = 0;
  for (const width of itemWidths) {
    used += gap + width;
    if (used > available) break;
    count++;
  }
  return count;
}

/**
 * Measures a hidden row of items plus a `[data-more]` control and returns how many items
 * fit in the container, or null until the first measurement.
 */
export function useVisibleItemCount(
  containerRef: RefObject<HTMLElement | null>,
  measureRef: RefObject<HTMLElement | null>,
): number | null {
  const [count, setCount] = useState<number | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const update = () => {
      const available = container.clientWidth;
      // Hidden at this breakpoint; keep the last result.
      if (available === 0) return;
      const children = Array.from(measure.children) as HTMLElement[];
      const itemWidths = children.filter((child) => !child.hasAttribute('data-more')).map((child) => child.getBoundingClientRect().width);
      const moreWidth = measure.querySelector<HTMLElement>('[data-more]')?.getBoundingClientRect().width ?? 0;
      const gap = parseFloat(getComputedStyle(measure).columnGap) || 0;
      // 1px margin absorbs sub-pixel rounding across items.
      setCount(countFittingItems(available - 1, itemWidths, moreWidth, gap));
    };

    update();
    // Observing the measuring row also catches font loading, language and item changes.
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [containerRef, measureRef]);

  return count;
}
