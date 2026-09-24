import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import '../i18n';

describe('Navbar Component', () => {
  it('renders brand name and navigation items', () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AuthProvider>
            <Navbar onOpenLogin={() => {}} />
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('ChessWeb')).toBeInTheDocument();
  });
});
