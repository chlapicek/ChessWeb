import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { Navbar } from '../components/Navbar';
import { NotificationsView } from '../views/NotificationsView';
import i18n from '../i18n';

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('../services/apiClient', () => ({ apiClient: apiMocks }));

const user = {
  id: 'admin-1',
  email: 'admin@example.com',
  fullName: 'Admin User',
  roles: ['Admin'],
};

const options = {
  teams: [{ id: 'team-1', name: 'First Team' }],
  users: [{ id: 'user-1', fullName: 'Player One', email: 'player@example.com' }],
  roles: ['RegisteredUser', 'ClubMember'],
  isAdministrator: true,
};

const inbox = {
  items: [{
    id: 'notification-1',
    title: 'Training change',
    message: 'Training starts at 18:30.',
    senderName: 'Club office',
    createdAt: '2026-09-24T10:00:00Z',
    isRead: false,
  }],
  page: 1,
  pageSize: 10,
  totalCount: 1,
  totalPages: 1,
};

const renderView = () => render(
  <ThemeProvider>
    <AuthProvider>
      <MemoryRouter>
        <Navbar onOpenLogin={() => {}} />
        <NotificationsView />
      </MemoryRouter>
    </AuthProvider>
  </ThemeProvider>
);

describe('NotificationsView', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    localStorage.clear();
    localStorage.setItem('chessweb_token', 'test-token');
    localStorage.setItem('chessweb_user', JSON.stringify(user));
    apiMocks.get.mockReset();
    apiMocks.post.mockReset();
    apiMocks.put.mockReset();
    apiMocks.get.mockImplementation(async (url: string) => {
      if (url === '/auth/me') return { data: user };
      if (url === '/notifications/audience-options') return { data: options };
      if (url === '/notifications/unread-count') return { data: { count: 3 } };
      if (url === '/notifications') return { data: inbox };
      return { data: [] };
    });
    apiMocks.post.mockResolvedValue({ data: { recipientCount: 1 } });
    apiMocks.put.mockResolvedValue({ data: {} });
  });

  it('renders the inbox and exposes the unread count on the accessible navigation bell', async () => {
    renderView();

    expect(await screen.findByText('Training change')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Notifications, 3 unread' })).toBeInTheDocument();
    expect(screen.getByText('Unread')).toBeInTheDocument();
  });

  it('marks a notification read without navigating away or changing the active page', async () => {
    renderView();

    fireEvent.click(await screen.findByRole('button', { name: 'Mark as read' }));

    await waitFor(() => expect(apiMocks.put).toHaveBeenCalledWith('/notifications/notification-1/read'));
    expect(screen.getByText('Training change')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unread' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('requires an administrator review before posting a broad audience notification', async () => {
    renderView();

    fireEvent.click(await screen.findByLabelText('Club member'));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Club update' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Bring your boards.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review notification' }));
    expect(apiMocks.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm and send' }));
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/notifications', {
      title: 'Club update',
      message: 'Bring your boards.',
      internalLink: null,
      audience: 'admin',
      teamIds: [],
      userIds: [],
      roles: ['ClubMember'],
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Notification sent to 1 account.');
  });

  it('moves back when the last unread item on a later page is marked read', async () => {
    let markedRead = false;
    const laterPageInbox = { ...inbox, page: 2, totalCount: 11, totalPages: 2 };
    apiMocks.get.mockImplementation(async (url: string, config?: { params?: { page?: number } }) => {
      if (url === '/auth/me') return { data: user };
      if (url === '/notifications/audience-options') return { data: options };
      if (url === '/notifications/unread-count') return { data: { count: 3 } };
      if (url === '/notifications') {
        const requestedPage = config?.params?.page ?? 1;
        if (markedRead && requestedPage === 1) return { data: { ...inbox, items: [], totalCount: 10, totalPages: 1 } };
        return { data: requestedPage === 2 ? laterPageInbox : { ...inbox, totalCount: 11, totalPages: 2 } };
      }
      return { data: [] };
    });
    apiMocks.put.mockImplementation(async () => { markedRead = true; return { data: {} }; });

    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Unread' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Training change')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as read' }));

    await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith('/notifications', {
      params: { page: 1, pageSize: 10, unreadOnly: true },
    }));
    expect(await screen.findByText('There are no unread notifications.')).toBeInTheDocument();
  });

  it('explains when a captain has no teams to notify', async () => {
    apiMocks.get.mockImplementation(async (url: string) => {
      if (url === '/auth/me') return { data: user };
      if (url === '/notifications/audience-options') return { data: { teams: [], users: [], roles: [], isAdministrator: false } };
      if (url === '/notifications/unread-count') return { data: { count: 0 } };
      if (url === '/notifications') return { data: { ...inbox, items: [], totalCount: 0, totalPages: 0 } };
      return { data: [] };
    });

    renderView();

    expect(await screen.findByText('You do not currently captain any teams.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send notification' })).not.toBeInTheDocument();
  });
});
