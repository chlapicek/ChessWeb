import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { AuthProvider } from '../context/AuthContext';
import { CalendarView } from '../views/CalendarView';
import '../i18n';
import i18n from '../i18n';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  Toaster: () => null,
}));

const mockEvents = [
  {
    id: 'event-1',
    title: 'Club Championship',
    description: 'Annual club championship tournament.',
    location: 'Main Hall',
    startTime: '2026-10-01T18:00:00Z',
    endTime: '2026-10-01T20:00:00Z',
    category: 0,
    isAllDay: false,
    recurrenceGroupId: null,
    sourceFeedName: null,
    externalUrl: null,
  },
  {
    id: 'event-2',
    title: 'Casual Club Night',
    description: 'Weekly casual games.',
    location: 'Back Room',
    startTime: '2026-10-05T18:00:00Z',
    endTime: '2026-10-05T21:00:00Z',
    category: 2,
    isAllDay: false,
    recurrenceGroupId: null,
    sourceFeedName: null,
    externalUrl: null,
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
      return {
        data: {
          id: 'player-1',
          email: 'player@example.com',
          fullName: 'Test Player',
          roles: ['RegisteredUser'],
        },
      };
    }
    if (url === '/calendar/events') {
      return { data: mockEvents };
    }
    if (url === '/calendar/my-subscriptions') {
      return { data: [] };
    }
    if (url.startsWith('/calendar/events/') && url.endsWith('/ics')) {
      return { data: new Blob(['BEGIN:VCALENDAR'], { type: 'text/calendar' }) };
    }
    return { data: [] };
  });
  apiMocks.post.mockResolvedValue({ data: {} });
  apiMocks.put.mockResolvedValue({ data: {} });
  apiMocks.delete.mockResolvedValue({ data: {} });
  apiMocks.request.mockResolvedValue({ data: {} });
};

const renderCalendarView = () =>
  render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter>
          <CalendarView />
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>
  );

describe('CalendarView', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMocks.get.mockReset();
    apiMocks.post.mockReset();
    apiMocks.put.mockReset();
    apiMocks.delete.mockReset();
    apiMocks.request.mockReset();
    setupApiMocks();
    // URL.createObjectURL is not implemented in jsdom.
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  it('renders events from the mocked GET /calendar/events in list view', async () => {
    renderCalendarView();

    fireEvent.click(screen.getByRole('button', { name: i18n.t('calendar.listView') }));

    await waitFor(() => expect(screen.getByText('Club Championship')).toBeInTheDocument());
    expect(screen.getByText('Casual Club Night')).toBeInTheDocument();
  });

  it('narrows displayed events using the category filter', async () => {
    renderCalendarView();

    fireEvent.click(screen.getByRole('button', { name: i18n.t('calendar.listView') }));
    await waitFor(() => expect(screen.getByText('Club Championship')).toBeInTheDocument());

    apiMocks.get.mockImplementation(async (url: string) => {
      if (url === '/calendar/events') {
        return { data: [mockEvents[1]] };
      }
      return { data: [] };
    });

    fireEvent.click(screen.getByRole('button', { name: i18n.t('calendar.clubNight') }));

    await waitFor(() =>
      expect(apiMocks.get).toHaveBeenCalledWith('/calendar/events', { params: { category: 2 } })
    );
    await waitFor(() => expect(screen.queryByText('Club Championship')).not.toBeInTheDocument());
    expect(screen.getByText('Casual Club Night')).toBeInTheDocument();
  });

  it('triggers the ICS download request when adding an event to my calendar', async () => {
    renderCalendarView();

    fireEvent.click(screen.getByRole('button', { name: i18n.t('calendar.listView') }));
    const eventCard = await screen.findByText('Club Championship');
    fireEvent.click(eventCard);

    const downloadButton = await screen.findByRole('button', { name: i18n.t('calendar.addToMyCalendar') });
    fireEvent.click(downloadButton);

    await waitFor(() =>
      expect(apiMocks.get).toHaveBeenCalledWith('/calendar/events/event-1/ics', { responseType: 'blob' })
    );
  });

  it('subscribes an authenticated user to an event', async () => {
    localStorage.setItem('chessweb_token', 'test-token');
    localStorage.setItem('chessweb_user', JSON.stringify({
      id: 'player-1',
      email: 'player@example.com',
      fullName: 'Test Player',
      roles: ['RegisteredUser'],
    }));

    renderCalendarView();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('calendar.listView') }));
    fireEvent.click(await screen.findByText('Club Championship'));

    const subscribeButton = await screen.findByRole('button', { name: i18n.t('calendar.subscribeEvent') });
    fireEvent.click(subscribeButton);

    await waitFor(() =>
      expect(apiMocks.post).toHaveBeenCalledWith('/calendar/events/event-1/subscribe')
    );
  });
});
