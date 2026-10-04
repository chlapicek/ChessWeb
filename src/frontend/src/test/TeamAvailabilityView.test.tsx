import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { TeamAvailabilityView } from '../views/TeamAvailabilityView';
import '../i18n';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  Toaster: () => null,
}));

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

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'captain-1',
      email: 'captain@chessweb.local',
      fullName: 'Captain User',
      roles: [],
    },
    token: 'token',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: vi.fn(),
    isAdmin: false,
  }),
}));

const teamId = 'team-1';

const teamResponse = [
  {
    id: teamId,
    name: 'A Team',
    memberCount: 1,
    captainUserId: 'captain-1',
    captainName: 'Captain User',
  },
];

const availabilityResponse = {
  teamId,
  teamName: 'A Team',
  teamMembers: [
    {
      userId: 'captain-1',
      fullName: 'Captain User',
      chessRating: '2000',
    },
  ],
  captainUserId: 'captain-1',
  captainName: 'Captain User',
  seasonStartDate: null,
  seasonEndDate: null,
  dates: [],
  players: [],
  entries: [],
};

const matchingPlayers = [
  {
    userId: 'user-a',
    fullName: 'A',
    chessRating: null,
    isTeamMember: false,
  },
];

const setupApiMocks = () => {
  apiMocks.get.mockImplementation(async (url: string, config?: { params?: { query?: string } }) => {
    if (url === '/teamavailability/teams') {
      return { data: teamResponse };
    }
    if (url === `/teamavailability/team/${teamId}`) {
      return { data: availabilityResponse };
    }
    if (url === '/teamavailability/players') {
      if (config?.params?.query === 'A') {
        return { data: matchingPlayers };
      }
      return { data: [] };
    }
    return { data: [] };
  });

  apiMocks.post.mockResolvedValue({ data: {} });
  apiMocks.put.mockResolvedValue({ data: {} });
  apiMocks.delete.mockResolvedValue({ data: {} });
  apiMocks.request.mockResolvedValue({ data: {} });
};

describe('TeamAvailabilityView', () => {
  beforeEach(() => {
    apiMocks.get.mockReset();
    apiMocks.post.mockReset();
    apiMocks.put.mockReset();
    apiMocks.delete.mockReset();
    apiMocks.request.mockReset();
    setupApiMocks();
  });

  it('shows registered player results for a one-letter query', async () => {
    const { container } = render(<TeamAvailabilityView />);

    await waitFor(() => {
      const searchInput = container.querySelector('input[type="search"]');
      expect(searchInput).not.toBeNull();
    });

    const searchInput = container.querySelector('input[type="search"]');

    fireEvent.change(searchInput!, { target: { value: 'A' } });

    await waitFor(() =>
      expect(apiMocks.get).toHaveBeenCalledWith('/teamavailability/players', {
        params: { teamId, query: 'A' },
      })
    );
    await waitFor(() => {
      expect(searchInput).toHaveAttribute('aria-expanded', 'true');
    });


    await waitFor(() => {
      const resultsSelect = container.querySelector('#team-availability-player-results');
      expect(resultsSelect).not.toBeNull();
    });

    const resultsSelect = container.querySelector('#team-availability-player-results');
    expect(resultsSelect).not.toBeNull();
    expect(resultsSelect).toHaveTextContent('A');
  });
});
