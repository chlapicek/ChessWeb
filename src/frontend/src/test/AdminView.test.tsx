import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { AuthProvider } from '../context/AuthContext';
import { AdminView } from '../views/AdminView';
import { ConfirmProvider } from '../components/ConfirmDialog';
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

const mockUsers = [
  {
    id: 'user-1',
    email: 'player@example.com',
    fullName: 'Player One',
    roles: ['RegisteredUser'],
    chessRating: '1500',
  },
];

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  request: vi.fn(),
}));

vi.mock('../services/apiClient', () => ({
  apiClient: apiMocks,
}));

const setupApiMocks = () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/auth/me') {
      return { data: currentUser };
    }
    if (url === '/auth/users') {
      return { data: mockUsers };
    }
    if (url === '/calendar/feeds') {
      return { data: [] };
    }
    if (url === '/partners') {
      return { data: [] };
    }
    if (url === '/teams') {
      return { data: [] };
    }
    if (url === '/logging/settings') {
      return {
        data: {
          minimumLevel: 'Information',
          retainedFileCountLimit: 14,
          updatedAt: new Date().toISOString(),
        },
      };
    }
    return { data: [] };
  });
  apiMocks.post.mockResolvedValue({ data: {} });
  apiMocks.put.mockResolvedValue({ data: {} });
  apiMocks.delete.mockResolvedValue({ data: {} });
  apiMocks.request.mockResolvedValue({ data: {} });
};

let currentUser: { id: string; email: string; fullName: string; roles: string[] };

const renderAdminView = () =>
  render(
    <ThemeProvider>
      <AuthProvider>
        <ConfirmProvider>
          <MemoryRouter>
            <AdminView />
          </MemoryRouter>
        </ConfirmProvider>
      </AuthProvider>
    </ThemeProvider>
  );

const loginAs = (roles: string[]) => {
  currentUser = {
    id: 'admin-1',
    email: 'admin@chessweb.local',
    fullName: 'Admin User',
    roles,
  };
  localStorage.setItem('chessweb_token', 'test-token');
  localStorage.setItem('chessweb_user', JSON.stringify(currentUser));
};

describe('AdminView', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    localStorage.clear();
    apiMocks.get.mockReset();
    apiMocks.post.mockReset();
    apiMocks.put.mockReset();
    apiMocks.delete.mockReset();
    apiMocks.request.mockReset();
    setupApiMocks();
  });

  it('loads and renders the user list from the mocked auth/users, calendar/feeds and partners endpoints', async () => {
    loginAs(['Admin']);
    renderAdminView();

    await waitFor(() => expect(screen.getByText('Player One')).toBeInTheDocument());

    expect(apiMocks.get).toHaveBeenCalledWith('/auth/users');
    expect(apiMocks.get).toHaveBeenCalledWith('/calendar/feeds');
    expect(apiMocks.get).toHaveBeenCalledWith('/partners');
  });

  it('hides SuperAdmin-only sections for an Admin-only user', async () => {
    loginAs(['Admin']);
    renderAdminView();

    await waitFor(() => expect(screen.getByText('Player One')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: 'SuperAdmin' })).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t('admin.logging'))).not.toBeInTheDocument();
  });

  it('shows SuperAdmin-only sections for a SuperAdmin user', async () => {
    loginAs(['Admin', 'SuperAdmin']);
    renderAdminView();

    await waitFor(() => expect(screen.getByText('Player One')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'SuperAdmin' })).toBeInTheDocument();
    expect(screen.getByText(i18n.t('admin.logging'))).toBeInTheDocument();
  });

  it('submits the edit player form calling PUT /player/{id} with the expected payload', async () => {
    loginAs(['Admin']);
    renderAdminView();

    await waitFor(() => expect(screen.getByText('Player One')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: i18n.t('admin.editPlayerLabel', { name: 'Player One' }) }));

    const fullNameInput = await screen.findByPlaceholderText(i18n.t('admin.fullName'));
    fireEvent.change(fullNameInput, { target: { value: 'Player Uno' } });

    fireEvent.click(screen.getByRole('button', { name: i18n.t('admin.savePlayerChanges') }));

    await waitFor(() =>
      expect(apiMocks.put).toHaveBeenCalledWith('/player/user-1', {
        fullName: 'Player Uno',
        email: 'player@example.com',
        chessRating: '1500',
        fideId: null,
      })
    );
  });

  it('deletes a team only after confirming in the dialog', async () => {
    loginAs(['Admin']);
    const baseGet = apiMocks.get.getMockImplementation()!;
    apiMocks.get.mockImplementation(async (url: string) => url === '/teams'
      ? { data: [{ id: 'team-1', name: 'First Team', userIds: [] }] }
      : baseGet(url));
    renderAdminView();

    const deleteButton = await screen.findByRole('button', { name: i18n.t('admin.deleteTeamLabel', { name: 'First Team' }) });
    fireEvent.click(deleteButton);
    const dialog = await screen.findByRole('alertdialog', { name: i18n.t('confirmDialog.deleteTeamTitle') });
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('common.cancel') }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(apiMocks.delete).not.toHaveBeenCalled();

    fireEvent.click(deleteButton);
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: i18n.t('common.delete') }));
    await waitFor(() => expect(apiMocks.delete).toHaveBeenCalledWith('/teams/team-1'));
  });

  it('lets admins change and persist the member page size', async () => {
    loginAs(['Admin']);
    const baseGet = apiMocks.get.getMockImplementation()!;
    const manyUsers = Array.from({ length: 12 }, (_, index) => ({ ...mockUsers[0], id: `user-${index}`, fullName: `Member ${String(index).padStart(2, '0')}`, email: `m${index}@example.com` }));
    apiMocks.get.mockImplementation(async (url: string) => url === '/auth/users' ? { data: manyUsers } : baseGet(url));
    renderAdminView();

    await screen.findByText('Member 00');
    expect(screen.queryByText('Member 05')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(i18n.t('common.itemsPerPage')), { target: { value: '20' } });

    expect(screen.getByText('Member 11')).toBeInTheDocument();
    expect(localStorage.getItem('chessweb_pageSize_adminUsers')).toBe('20');
  });
});
