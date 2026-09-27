import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import i18n from '../i18n';

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

  describe('More menu', () => {
    const renderNavbar = () => render(
      <MemoryRouter>
        <ThemeProvider>
          <AuthProvider>
            <main data-testid="outside">content</main>
            <Navbar onOpenLogin={() => {}} />
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
    const openMenu = () => {
      const [desktopToggle] = screen.getAllByRole('button', { expanded: false, name: i18n.t('nav.more') });
      fireEvent.click(desktopToggle);
      return desktopToggle;
    };

    it('closes when clicking outside', () => {
      renderNavbar();
      const toggle = openMenu();
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      fireEvent.pointerDown(screen.getByTestId('outside'));

      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(document.getElementById('nav-more-desktop')).toBeNull();
    });

    it('stays open when clicking inside the menu', () => {
      renderNavbar();
      const toggle = openMenu();

      fireEvent.pointerDown(document.getElementById('nav-more-desktop')!);

      expect(toggle).toHaveAttribute('aria-expanded', 'true');
    });

    it('closes on Escape', () => {
      renderNavbar();
      const toggle = openMenu();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    it('closes when focus moves outside', () => {
      renderNavbar();
      const toggle = openMenu();

      fireEvent.blur(toggle, { relatedTarget: screen.getAllByRole('link', { name: i18n.t('nav.articles') })[0] });

      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });
  });
});
