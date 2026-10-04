import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import {
  BookOpen,
  Calendar,
  Shield,
  LogIn,
  LogOut,
  MoreHorizontal,
  Settings,
  Crown,
  Users,
  UserCircle,
  Bell,
  type LucideIcon,
} from 'lucide-react';
import { apiClient } from '../services/apiClient';
import { useVisibleItemCount } from '../hooks/useVisibleItemCount';

interface NavbarProps {
  onOpenLogin: () => void;
}

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  iconClassName?: string;
  adminOnly?: boolean;
}

// Ordered by priority: later items move into "More" first when space runs out.
const NAV_ITEMS: NavItem[] = [
  { to: '/articles', labelKey: 'nav.articles', icon: BookOpen },
  { to: '/calendar', labelKey: 'nav.calendar', icon: Calendar },
  { to: '/board', labelKey: 'nav.board', icon: Crown },
  { to: '/team-availability', labelKey: 'nav.teamAvailability', icon: Users },
  { to: '/players', labelKey: 'nav.players', icon: UserCircle },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
  { to: '/admin', labelKey: 'nav.admin', icon: Shield, iconClassName: 'text-emerald-500', adminOnly: true },
];

const isRouteWithin = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`);

export const Navbar: React.FC<NavbarProps> = ({ onOpenLogin }) => {
  const { t } = useTranslation();
  const { user, isAuthenticated, logout, isAdmin } = useAuth();
  const location = useLocation();
  const [openMenu, setOpenMenu] = useState<'desktop' | 'mobile' | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const desktopMenuRef = useRef<HTMLDivElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const moreOpenerRef = useRef<HTMLButtonElement | null>(null);
  const desktopNavRef = useRef<HTMLElement>(null);
  const desktopMeasureRef = useRef<HTMLDivElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const mobileMeasureRef = useRef<HTMLDivElement>(null);

  const navItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const desktopVisibleCount = useVisibleItemCount(desktopNavRef, desktopMeasureRef);
  const mobileVisibleCount = useVisibleItemCount(mobileNavRef, mobileMeasureRef);
  // Until measured, render everything invisibly so the first paint doesn't jump.
  const desktopInline = desktopVisibleCount === null ? navItems : navItems.slice(0, desktopVisibleCount);
  const desktopOverflow = desktopVisibleCount === null ? [] : navItems.slice(desktopVisibleCount);
  const mobileInline = mobileVisibleCount === null ? navItems : navItems.slice(0, mobileVisibleCount);
  const mobileOverflow = mobileVisibleCount === null ? [] : navItems.slice(mobileVisibleCount);
  const isOverflowActive = (items: NavItem[]) => items.some((item) => isRouteWithin(location.pathname, item.to));

  const toggleMore = (menu: 'desktop' | 'mobile') => (event: React.MouseEvent<HTMLButtonElement>) => {
    moreOpenerRef.current = event.currentTarget;
    setOpenMenu((open) => (open === menu ? null : menu));
  };
  const closeMore = () => setOpenMenu(null);

  const isInsideMoreMenu = (node: Node | null) =>
    !!node && [desktopMenuRef, mobileToggleRef, mobilePanelRef].some((ref) => ref.current?.contains(node));

  const handleMoreMenuBlur = (event: React.FocusEvent) => {
    if (event.relatedTarget && !isInsideMoreMenu(event.relatedTarget as Node)) closeMore();
  };

  useEffect(() => {
    closeMore();
  }, [location.pathname]);

  useEffect(() => {
    // The open menu's contents may have moved inline; don't leave focus on a removed element.
    if (isInsideMoreMenu(document.activeElement)) moreOpenerRef.current?.focus();
    closeMore();
  }, [desktopVisibleCount, mobileVisibleCount]);

  useEffect(() => {
    if (!openMenu) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!isInsideMoreMenu(event.target as Node)) closeMore();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      closeMore();
      moreOpenerRef.current?.focus();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setUnreadCount(0);
      return;
    }

    let active = true;
    const refreshUnreadCount = () => {
      apiClient.get<{ count: number }>('/notifications/unread-count')
        .then((response) => { if (active) setUnreadCount(response.data.count); })
        .catch(() => { if (active) setUnreadCount(0); });
    };
    refreshUnreadCount();
    const intervalId = window.setInterval(refreshUnreadCount, 60_000);
    window.addEventListener('focus', refreshUnreadCount);
    window.addEventListener('notifications:refresh', refreshUnreadCount);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshUnreadCount);
      window.removeEventListener('notifications:refresh', refreshUnreadCount);
    };
  }, [isAuthenticated, user?.id, location.pathname]);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `brand-nav-link flex items-center gap-2 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition border ${
      isActive ? 'brand-nav-link active border' : 'border-transparent hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
    }`;

  const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-11 items-center whitespace-nowrap px-2 rounded font-medium ${
      isActive ? 'brand-nav-link active' : 'text-slate-600 dark:text-slate-400'
    }`;

  const renderDesktopItemContent = (item: NavItem) => (
    <>
      <item.icon className={`h-4 w-4 ${item.iconClassName ?? ''}`} />
      <span>{t(item.labelKey)}</span>
    </>
  );

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link to="/articles" className="flex shrink-0 items-center gap-3 cursor-pointer">
          <div className="w-10 h-10 rounded-xl border flex items-center justify-center font-bold text-xl shadow-sm" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent-border)', color: 'var(--accent)' }}>
            ♟
          </div>
          <div>
            <h1 className="font-bold text-lg text-slate-900 dark:text-white leading-tight">
              {t('common.appName')}
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('common.tagline')}</p>
          </div>
        </Link>

        {/* Navigation Tabs */}
        <nav ref={desktopNavRef} className="relative mx-4 hidden min-w-0 flex-1 items-center justify-center md:flex">
          <div ref={desktopMeasureRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex w-max gap-2">
            {navItems.map((item) => (
              <span key={item.to} className={navLinkClass({ isActive: false })}>{renderDesktopItemContent(item)}</span>
            ))}
            <span data-more className={navLinkClass({ isActive: false })}>
              <MoreHorizontal className="h-4 w-4" />
              <span>{t('nav.more')}</span>
            </span>
          </div>

          <div className={`flex items-center gap-2 ${desktopVisibleCount === null ? 'invisible' : ''}`}>
            {desktopInline.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass}>{renderDesktopItemContent(item)}</NavLink>
            ))}

            {desktopOverflow.length > 0 && (
              <div className="relative" ref={desktopMenuRef} onBlur={handleMoreMenuBlur}>
                <button
                  type="button"
                  onClick={toggleMore('desktop')}
                  aria-expanded={openMenu === 'desktop'}
                  aria-controls={openMenu === 'desktop' ? 'nav-more-desktop' : undefined}
                  className={navLinkClass({ isActive: openMenu === 'desktop' || isOverflowActive(desktopOverflow) })}
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span>{t('nav.more')}</span>
                </button>

                {openMenu === 'desktop' && (
                  <div id="nav-more-desktop" className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                    {desktopOverflow.map((item) => (
                      // Route-change effect closes the menu, but not when re-selecting the current route.
                      <NavLink key={item.to} to={item.to} onClick={closeMore} className={navLinkClass}>{renderDesktopItemContent(item)}</NavLink>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </nav>

        {/* Right side: authentication */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* User Auth */}
          {isAuthenticated && user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                to="/notifications"
                aria-label={t('notifications.bellLabel', { count: unreadCount })}
                title={t('notifications.bellLabel', { count: unreadCount })}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
                {unreadCount > 0 && (
                  <span aria-hidden="true" className="absolute -right-1 -top-1 min-w-5 rounded-full border border-white bg-rose-600 px-1 text-center text-[10px] font-bold leading-4 text-white dark:border-slate-900">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
              <Link
                to={`/players/${user.id}`}
                className="flex items-center gap-2 rounded-md text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                style={{ color: 'var(--text-primary)' }}
              >
                <UserCircle className="h-5 w-5 sm:hidden" aria-hidden="true" />
                <span className="hidden sm:block">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">{user.nickname || user.fullName}</p>
                  <p className="text-[10px] font-mono" style={{ color: 'var(--accent-strong)' }}>
                    {user.roles.map((role) => t(`common.roleNames.${role}`, { defaultValue: role })).join(', ') || t('common.member')}
                  </p>
                </span>
              </Link>
              <button
                onClick={logout}
                className="flex items-center gap-1.5 text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('common.logout')}</span>
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenLogin}
              className="brand-button flex items-center gap-1.5 text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 rounded-lg shadow-md transition focus-ring-green"
            >
              <LogIn className="w-4 h-4" />
              <span>{t('common.login')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile navigation bar */}
      <nav className="md:hidden relative px-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs">
        <div ref={mobileMeasureRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex w-max gap-1">
          {navItems.map((item) => (
            <span key={item.to} className={mobileNavLinkClass({ isActive: false })}>{t(item.labelKey)}</span>
          ))}
          <span data-more className={mobileNavLinkClass({ isActive: false })}>{t('nav.more')}</span>
        </div>

        <div ref={mobileNavRef} className={`flex w-full items-center justify-around gap-1 ${mobileVisibleCount === null ? 'invisible' : ''}`}>
          {mobileInline.map((item) => (
            <NavLink key={item.to} to={item.to} className={mobileNavLinkClass}>{t(item.labelKey)}</NavLink>
          ))}
          {mobileOverflow.length > 0 && (
            <button
              ref={mobileToggleRef}
              type="button"
              onClick={toggleMore('mobile')}
              onBlur={handleMoreMenuBlur}
              aria-expanded={openMenu === 'mobile'}
              aria-controls={openMenu === 'mobile' ? 'nav-more-mobile' : undefined}
              className={mobileNavLinkClass({ isActive: openMenu === 'mobile' || isOverflowActive(mobileOverflow) })}
            >
              {t('nav.more')}
            </button>
          )}
        </div>
      </nav>

      {openMenu === 'mobile' && mobileOverflow.length > 0 && (
        <div id="nav-more-mobile" ref={mobilePanelRef} onBlur={handleMoreMenuBlur} className="md:hidden border-t border-slate-200 bg-white px-2 py-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="grid grid-cols-2 gap-1">
            {mobileOverflow.map((item) => (
              <NavLink key={item.to} to={item.to} onClick={closeMore} className={mobileNavLinkClass}>{t(item.labelKey)}</NavLink>
            ))}
          </div>
        </div>
      )}
    </header>
  );
};
