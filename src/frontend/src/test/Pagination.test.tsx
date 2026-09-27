import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { Pagination } from '../components/Pagination';
import { usePersistentPageSize } from '../hooks/usePersistentPageSize';
import i18n from '../i18n';

describe('Pagination page size', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    localStorage.clear();
  });

  it('keeps the size selector visible on a single page while hiding page buttons', () => {
    const onPageSizeChange = vi.fn();
    render(<Pagination page={1} totalPages={1} totalCount={8} pageSize={10} onPageChange={vi.fn()} onPageSizeChange={onPageSizeChange} />);

    const select = screen.getByLabelText('Items per page');
    expect(select).toHaveValue('10');
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: '5' } });
    expect(onPageSizeChange).toHaveBeenCalledWith(5);
  });

  it('hides the selector when every item fits the smallest option and keeps legacy behaviour without a handler', () => {
    const { container, rerender } = render(<Pagination page={1} totalPages={1} totalCount={4} pageSize={5} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<Pagination page={1} totalPages={1} totalCount={8} pageSize={10} onPageChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<Pagination page={1} totalPages={3} totalCount={25} pageSize={10} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Items per page')).not.toBeInTheDocument();
  });

  it('persists the chosen size and ignores invalid stored values', () => {
    const { result } = renderHook(() => usePersistentPageSize('test', 10));
    expect(result.current[0]).toBe(10);

    act(() => result.current[1](20));
    expect(result.current[0]).toBe(20);
    expect(localStorage.getItem('chessweb_pageSize_test')).toBe('20');
    expect(renderHook(() => usePersistentPageSize('test', 10)).result.current[0]).toBe(20);

    act(() => result.current[1](7));
    expect(result.current[0]).toBe(20);

    localStorage.setItem('chessweb_pageSize_test', 'abc');
    expect(renderHook(() => usePersistentPageSize('test', 10)).result.current[0]).toBe(10);
    localStorage.setItem('chessweb_pageSize_test', '7');
    expect(renderHook(() => usePersistentPageSize('test', 10)).result.current[0]).toBe(10);
  });
});
