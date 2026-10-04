import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CollapsibleText } from '../components/CollapsibleText';
import i18n from '../i18n';

const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

const mockHeights = (scrollHeight: number, clientHeight: number) => {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => scrollHeight });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => clientHeight });
};

describe('CollapsibleText', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    if (originalScrollHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight);
    if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  });

  it('shows a toggle when content overflows and expands/collapses it', () => {
    mockHeights(600, 200);
    render(<CollapsibleText maxLines={4}><p>Long text</p></CollapsibleText>);

    const content = screen.getByText('Long text').parentElement!;
    expect(content.style.maxHeight).toBe(`${4 * 1.625}em`);
    const toggle = screen.getByRole('button', { name: 'Show more' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', content.id);

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
    expect(content.style.maxHeight).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument();
    expect(content.style.maxHeight).toBe(`${4 * 1.625}em`);
  });

  it('hides the toggle when content fits', () => {
    mockHeights(100, 100);
    render(<CollapsibleText><p>Short text</p></CollapsibleText>);

    expect(screen.getByText('Short text')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
