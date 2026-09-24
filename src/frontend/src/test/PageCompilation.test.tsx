import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { AuthProvider } from '../context/AuthContext';
import { ArticlesView } from '../views/ArticlesView';
import { CalendarView } from '../views/CalendarView';
import { BoardView } from '../views/BoardView';
import { SettingsView } from '../views/SettingsView';
import { AdminView } from '../views/AdminView';
import '../i18n';
import i18n from '../i18n';

const sonnerMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: sonnerMocks.success,
    error: sonnerMocks.error,
  },
  Toaster: () => null,
}));

vi.mock('../services/apiClient', () => ({
  apiClient: {
    get: vi.fn(async (url: string) => {
      if (url === '/auth/me') {
        return {
          data: {
            id: 'admin-1',
            email: 'admin@chessweb.local',
            fullName: 'Admin User',
            roles: ['Admin'],
          },
        };
      }

      if (url === '/auth/users') {
        return { data: [] };
      }

      if (url === '/calendar/feeds') {
        return { data: [] };
      }

      if (url === '/partners') {
        return { data: [] };
      }

      return { data: [] };
    }),
    post: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: {} })),
    request: vi.fn(async () => ({ data: {} })),
  },
}));

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </AuthProvider>
    </ThemeProvider>
  );

describe('Page compilation smoke test', () => {
  it.each([
    ['Articles', <ArticlesView />],
    ['Calendar', <CalendarView />],
    ['Board', <BoardView />],
    ['Settings', <SettingsView />],
    ['Admin', <AdminView />],
  ])('renders %s page without crashing', (_name, element) => {
    const { container } = renderWithProviders(element);

    expect(container).not.toBeEmptyDOMElement();
  });

  it('shows partner creation feedback as a toast', async () => {
    localStorage.setItem('chessweb_token', 'test-token');
    localStorage.setItem('chessweb_user', JSON.stringify({
      id: 'admin-1',
      email: 'admin@chessweb.local',
      fullName: 'Admin User',
      roles: ['Admin'],
    }));
    renderWithProviders(<AdminView />);

    const addPartnerButton = await screen.findByRole('button', { name: i18n.t('admin.addPartnerBtn') });
    const partnerForm = addPartnerButton.closest('form');
    const partnerNameInput = partnerForm?.querySelector('input[type="text"]');
    const partnerUrlInput = partnerForm?.querySelector('input[type="url"]');
    const partnerLogoInput = partnerForm?.querySelector('input[type="file"]');

    expect(partnerNameInput).not.toBeNull();
    expect(partnerUrlInput).not.toBeNull();
    expect(partnerLogoInput).not.toBeNull();
    fireEvent.change(partnerNameInput!, { target: { value: 'Chess Club' } });
    fireEvent.change(partnerUrlInput!, { target: { value: 'https://example.com' } });
    fireEvent.change(partnerLogoInput!, {
      target: { files: [new File(['logo'], 'logo.png', { type: 'image/png' })] },
    });
    fireEvent.click(addPartnerButton);

    await waitFor(() => expect(sonnerMocks.success).toHaveBeenCalledWith(i18n.t('admin.partnerAddSuccess')));
  });

  it('starts a fresh game from the notation panel', () => {
    renderWithProviders(<BoardView />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('board.newGame') }));
    expect(screen.getByLabelText(i18n.t('board.notationLabel'))).toHaveValue('');
  });

  it('re-imports identical PGN and resets the selected position', async () => {
    renderWithProviders(<BoardView />);
    const notation = screen.getByLabelText(i18n.t('board.notationLabel'));
    const importButton = screen.getByRole('button', { name: i18n.t('board.loadGame') });
    fireEvent.change(notation, { target: { value: '1. d4 d5 *' } });
    fireEvent.click(importButton);

    const firstMove = await screen.findByRole('button', { name: '1. d4' });
    fireEvent.click(firstMove);
    expect(firstMove).toHaveAttribute('aria-current', 'step');

    fireEvent.click(importButton);
    await waitFor(() => expect(screen.getByRole('button', { name: '1. d4' })).not.toHaveAttribute('aria-current', 'step'));
  });
});
