import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ConfirmProvider } from '../components/ConfirmDialog';
import { Navbar } from '../components/Navbar';
import { NotificationsView } from '../views/NotificationsView';
import i18n from '../i18n';

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
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
      <ConfirmProvider>
        <MemoryRouter>
          <Navbar onOpenLogin={() => {}} />
          <NotificationsView />
        </MemoryRouter>
      </ConfirmProvider>
    </AuthProvider>
  </ThemeProvider>
);

const confirmDeletion = async () => {
  const dialog = await screen.findByRole('alertdialog', { name: 'Delete notification?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
};

describe('NotificationsView', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    localStorage.clear();
    localStorage.setItem('chessweb_token', 'test-token');
    localStorage.setItem('chessweb_user', JSON.stringify(user));
    apiMocks.get.mockReset();
    apiMocks.post.mockReset();
    apiMocks.put.mockReset();
    apiMocks.delete.mockReset();
    apiMocks.get.mockImplementation(async (url: string) => {
      if (url === '/auth/me') return { data: user };
      if (url === '/notifications/audience-options') return { data: options };
      if (url === '/notifications/unread-count') return { data: { count: 3 } };
      if (url === '/notifications') return { data: inbox };
      return { data: [] };
    });
    apiMocks.post.mockResolvedValue({ data: { recipientCount: 1 } });
    apiMocks.put.mockResolvedValue({ data: {} });
    apiMocks.delete.mockResolvedValue({ data: {} });
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

  it('confirms and deletes a read notification from only the current inbox', async () => {
    let deleted = false;
    apiMocks.get.mockImplementation(async (url: string) => {
      if (url === '/auth/me') return { data: user };
      if (url === '/notifications/audience-options') return { data: options };
      if (url === '/notifications/unread-count') return { data: { count: 3 } };
      if (url === '/notifications') {
        return { data: deleted ? { ...inbox, items: [], totalCount: 0, totalPages: 0 } : { ...inbox, items: [{ ...inbox.items[0], isRead: true }] } };
      }
      return { data: [] };
    });
    apiMocks.delete.mockImplementation(async () => { deleted = true; return { data: {} }; });

    renderView();
    const deleteButton = await screen.findByRole('button', { name: 'Delete notification: Training change' });

    fireEvent.click(deleteButton);
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete notification?' });
    expect(dialog).toHaveTextContent('“Training change” will be removed from your inbox. This cannot be undone.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(apiMocks.delete).not.toHaveBeenCalled();

    fireEvent.click(deleteButton);
    await confirmDeletion();
    await waitFor(() => expect(apiMocks.delete).toHaveBeenCalledWith('/notifications/notification-1'));
    expect(await screen.findByRole('status')).toHaveTextContent('Deleted “Training change” from your inbox.');
    expect(await screen.findByText('Your inbox is clear.')).toBeInTheDocument();
  });

  it('moves back one page when deleting its last notification', async () => {
    let deleted = false;
    const requestedPages: number[] = [];
    apiMocks.get.mockImplementation(async (url: string, config?: { params?: { page?: number } }) => {
      if (url === '/auth/me') return { data: user };
      if (url === '/notifications/audience-options') return { data: options };
      if (url === '/notifications/unread-count') return { data: { count: 3 } };
      if (url === '/notifications') {
        const requestedPage = config?.params?.page ?? 1;
        requestedPages.push(requestedPage);
        if (requestedPage === 2) return { data: { ...inbox, items: [{ ...inbox.items[0], isRead: true }], page: 2, totalCount: 11, totalPages: 2 } };
        if (deleted) return { data: { ...inbox, totalCount: 10 } };
        return { data: { ...inbox, items: [{ ...inbox.items[0], isRead: true }], totalCount: 11, totalPages: 2 } };
      }
      return { data: [] };
    });
    apiMocks.delete.mockImplementation(async () => { deleted = true; return { data: {} }; });

    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete notification: Training change' }));
    await confirmDeletion();

    await waitFor(() => expect(requestedPages.at(-1)).toBe(1));
    expect(await screen.findByText('Training change')).toBeInTheDocument();
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

  it('requests the persisted page size', async () => {
    localStorage.setItem('chessweb_pageSize_notifications', '20');
    renderView();

    expect(await screen.findByText('Training change')).toBeInTheDocument();
    expect(apiMocks.get).toHaveBeenCalledWith('/notifications', { params: { page: 1, pageSize: 20, unreadOnly: undefined } });
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
