import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import React from 'react';

const mockUser = {
  id: 'user-1',
  email: 'player@example.com',
  fullName: 'Player One',
  roles: ['Admin'],
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('hydrates saved auth state from localStorage', async () => {
    localStorage.setItem('chessweb_token', 'abc');
    localStorage.setItem('chessweb_user', JSON.stringify(mockUser));

    const apiGet = vi.spyOn((await import('../services/apiClient')).apiClient, 'get').mockResolvedValue({
      data: mockUser,
    } as any);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe('player@example.com');
    expect(apiGet).toHaveBeenCalledWith('/auth/me');
  });

  it('login stores token and user, and exposes role helpers', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => {
      result.current.login('token-123', mockUser);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.hasRole('Admin')).toBe(true);
    expect(localStorage.getItem('chessweb_token')).toBe('token-123');
    expect(JSON.parse(localStorage.getItem('chessweb_user') ?? '{}').email).toBe('player@example.com');
  });

  it('logout clears stored auth state', () => {
    localStorage.setItem('chessweb_token', 'abc');
    localStorage.setItem('chessweb_user', JSON.stringify(mockUser));

    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => {
      result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('chessweb_token')).toBeNull();
    expect(localStorage.getItem('chessweb_user')).toBeNull();
  });
});
