import { afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { countFittingItems } from '../hooks/useVisibleItemCount';
import i18n from '../i18n';

// jsdom has no layout; every item and the "More" control measure 100px.
const stubLayout = (containerWidth: number) => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(containerWidth);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 100 } as DOMRect);
};

const renderNavbar = (initialPath = '/articles') => render(
  <MemoryRouter initialEntries={[initialPath]}>
    <ThemeProvider>
      <AuthProvider>
        <main data-testid="outside">
          <Link to="/calendar">outside link</Link>
        </main>
        <Navbar onOpenLogin={() => {}} />
      </AuthProvider>
    </ThemeProvider>
  </MemoryRouter>
);

const moreButtons = () => screen.queryAllByRole('button', { name: i18n.t('nav.more') });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('countFittingItems', () => {
  it('returns all items when they fit without the more control', () => {
    expect(countFittingItems(300, [100, 100, 100], 80, 0)).toBe(3);
  });

  it('reserves room for the more control when items overflow', () => {
    expect(countFittingItems(300, [100, 100, 100, 100], 80, 0)).toBe(2);
  });

  it('accounts for gaps between items', () => {
    expect(countFittingItems(320, [100, 100, 100], 100, 10)).toBe(3);
    expect(countFittingItems(319, [100, 100, 100], 100, 10)).toBe(1);
  });
});

describe('Navbar Component', () => {
  it('renders brand name and navigation items', () => {
    renderNavbar();

    expect(screen.getByText('ChessWeb')).toBeInTheDocument();
  });

  it('shows every item inline and no More button when all fit', () => {
    stubLayout(1000);
    renderNavbar();

    expect(moreButtons()).toHaveLength(0);
    expect(screen.getAllByRole('link', { name: i18n.t('nav.settings') }).length).toBeGreaterThan(0);
  });

  it('moves items that do not fit into More, in order', () => {
    stubLayout(350);
    renderNavbar();

    expect(screen.getAllByRole('link', { name: i18n.t('nav.calendar') })).toHaveLength(2);
    expect(screen.queryByRole('link', { name: i18n.t('nav.board') })).toBeNull();

    fireEvent.click(moreButtons()[0]);

    const menu = document.getElementById('nav-more-desktop')!;
    expect(Array.from(menu.querySelectorAll('a')).map((link) => link.getAttribute('href')))
      .toEqual(['/board', '/team-availability', '/players', '/settings']);
  });

  it('highlights More when a nested route of an overflowed item is active', () => {
    stubLayout(350);
    renderNavbar('/players/123');

    expect(moreButtons()[0].className).toContain('active');
  });

  describe('More menu', () => {
    const openMenu = () => {
      stubLayout(350);
      renderNavbar();
      const [desktopToggle] = moreButtons();
      fireEvent.click(desktopToggle);
      return desktopToggle;
    };

    it('closes when clicking outside', () => {
      const toggle = openMenu();
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      fireEvent.pointerDown(screen.getByTestId('outside'));

      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(document.getElementById('nav-more-desktop')).toBeNull();
    });

    it('stays open when clicking inside the menu', () => {
      const toggle = openMenu();

      fireEvent.pointerDown(document.getElementById('nav-more-desktop')!);

      expect(toggle).toHaveAttribute('aria-expanded', 'true');
    });

    it('closes on Escape and returns focus to the toggle that opened it', () => {
      const toggle = openMenu();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(toggle).toHaveFocus();
    });

    it('closes when focus moves outside', () => {
      const toggle = openMenu();

      fireEvent.blur(toggle, { relatedTarget: screen.getByRole('link', { name: 'outside link' }) });

      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    it('stays open when focus moves into the menu or to nowhere', () => {
      const toggle = openMenu();
      const firstMenuLink = document.getElementById('nav-more-desktop')!.querySelector('a')!;

      fireEvent.blur(toggle, { relatedTarget: firstMenuLink });
      fireEvent.blur(toggle, { relatedTarget: null });

      expect(toggle).toHaveAttribute('aria-expanded', 'true');
    });

    it('closes on navigation', () => {
      const toggle = openMenu();

      fireEvent.click(screen.getByRole('link', { name: 'outside link' }));

      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    it('opens the mobile panel from the mobile toggle', () => {
      stubLayout(350);
      renderNavbar();
      const mobileToggle = moreButtons()[1];

      fireEvent.click(mobileToggle);

      expect(mobileToggle).toHaveAttribute('aria-expanded', 'true');
      expect(document.getElementById('nav-more-mobile')).not.toBeNull();
    });

    it('opens only the menu whose toggle was used', () => {
      const desktopToggle = openMenu();

      expect(desktopToggle).toHaveAttribute('aria-expanded', 'true');
      expect(moreButtons()[1]).toHaveAttribute('aria-expanded', 'false');
      expect(document.getElementById('nav-more-mobile')).toBeNull();
    });
  });
});
