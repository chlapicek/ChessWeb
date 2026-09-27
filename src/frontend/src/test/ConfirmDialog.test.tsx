import React, { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfirmProvider, useConfirm, type ConfirmOptions } from '../components/ConfirmDialog';
import i18n from '../i18n';

const Harness: React.FC<{ options?: Partial<ConfirmOptions> }> = ({ options }) => {
  const confirm = useConfirm();
  const [result, setResult] = useState('pending');
  return (
    <>
      <button type="button" onClick={async () => setResult(String(await confirm({ title: 'Delete thing?', message: 'This cannot be undone.', ...options })))}>open</button>
      <output data-testid="result">{result}</output>
    </>
  );
};

const renderHarness = (options?: Partial<ConfirmOptions>) => render(<ConfirmProvider><Harness options={options} /></ConfirmProvider>);

describe('ConfirmDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders an accessible alert dialog with initial focus on Cancel and resolves true on confirm', async () => {
    renderHarness({ confirmLabel: 'Delete', destructive: true });
    const trigger = screen.getByRole('button', { name: 'open' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete thing?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirmButton = screen.getByRole('button', { name: 'Delete' });
    expect(cancel).toHaveFocus();
    expect(confirmButton.className).toContain('bg-rose-600');

    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(confirmButton).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(cancel).toHaveFocus();

    fireEvent.click(confirmButton);
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('true'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it.each([
    ['Cancel', () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['backdrop click', () => fireEvent.mouseDown(screen.getByTestId('confirm-dialog-backdrop'))],
  ])('resolves false on %s', async (_name, dismiss) => {
    renderHarness();
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    await screen.findByRole('alertdialog');
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();

    dismiss();

    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('false'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('throws a clear error when used outside the provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Harness />)).toThrow('useConfirm must be used within a <ConfirmProvider>.');
    consoleError.mockRestore();
  });
});
