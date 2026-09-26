import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { apiClient } from '../services/apiClient';

interface NavbarProps {
  onOpenLogin: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenLogin }) => {
  const { t } = useTranslation();
  const { user, isAuthenticated, logout, isAdmin } = useAuth();
  const location = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

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
    `brand-nav-link flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition border ${
      isActive ? 'brand-nav-link active border' : 'border-transparent hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
    }`;

  const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-2 py-1 rounded font-medium ${
      isActive ? 'brand-nav-link active font-bold' : 'text-slate-600 dark:text-slate-400'
    }`;

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link to="/articles" className="flex items-center gap-3 cursor-pointer">
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
        <nav className="hidden md:flex items-center gap-1 md:gap-2">
          <NavLink to="/articles" className={navLinkClass}>
            <BookOpen className="w-4 h-4" />
            <span>{t('nav.articles')}</span>
          </NavLink>

          <NavLink to="/calendar" className={navLinkClass}>
            <Calendar className="w-4 h-4" />
            <span>{t('nav.calendar')}</span>
          </NavLink>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsMoreOpen((open) => !open)}
              aria-expanded={isMoreOpen}
              className={navLinkClass({ isActive: isMoreOpen || ['/board', '/team-availability', '/players', '/settings', '/admin'].includes(location.pathname) })}
            >
              <MoreHorizontal className="h-4 w-4" />
              <span>{t('nav.more')}</span>
            </button>

            {isMoreOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                <NavLink to="/board" onClick={() => setIsMoreOpen(false)} className={navLinkClass}>
                  <Crown className="h-4 w-4" />
                  <span>{t('nav.board')}</span>
                </NavLink>
                <NavLink to="/team-availability" onClick={() => setIsMoreOpen(false)} className={navLinkClass}>
                  <Users className="h-4 w-4" />
                  <span>{t('nav.teamAvailability')}</span>
                </NavLink>
                <NavLink to="/players" onClick={() => setIsMoreOpen(false)} className={navLinkClass}>
                  <UserCircle className="h-4 w-4" />
                  <span>{t('nav.players')}</span>
                </NavLink>
                {isAdmin && (
                  <NavLink to="/admin" onClick={() => setIsMoreOpen(false)} className={navLinkClass}>
                    <Shield className="h-4 w-4 text-emerald-500" />
                    <span>{t('nav.admin')}</span>
                  </NavLink>
                )}
                <NavLink to="/settings" onClick={() => setIsMoreOpen(false)} className={navLinkClass}>
                  <Settings className="h-4 w-4" />
                  <span>{t('nav.settings')}</span>
                </NavLink>
              </div>
            )}
          </div>
        </nav>

        {/* Right side: authentication */}
        <div className="flex items-center gap-2 sm:gap-3">
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
      <div className="md:hidden flex items-center justify-around px-2 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs">
        <NavLink to="/articles" className={mobileNavLinkClass}>
          {t('nav.articles')}
        </NavLink>
        <NavLink to="/calendar" className={mobileNavLinkClass}>
          {t('nav.calendar')}
        </NavLink>
        <button
          type="button"
          onClick={() => setIsMoreOpen((open) => !open)}
          aria-expanded={isMoreOpen}
          className={mobileNavLinkClass({ isActive: isMoreOpen || ['/board', '/team-availability', '/players', '/settings', '/admin'].includes(location.pathname) })}
        >
          {t('nav.more')}
        </button>
      </div>

      {isMoreOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-2 py-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="grid grid-cols-2 gap-1">
            <NavLink to="/board" onClick={() => setIsMoreOpen(false)} className={mobileNavLinkClass}>{t('nav.board')}</NavLink>
            <NavLink to="/team-availability" onClick={() => setIsMoreOpen(false)} className={mobileNavLinkClass}>{t('nav.teamAvailability')}</NavLink>
            <NavLink to="/players" onClick={() => setIsMoreOpen(false)} className={mobileNavLinkClass}>{t('nav.players')}</NavLink>
            {isAdmin && <NavLink to="/admin" onClick={() => setIsMoreOpen(false)} className={mobileNavLinkClass}>{t('nav.admin')}</NavLink>}
            <NavLink to="/settings" onClick={() => setIsMoreOpen(false)} className={mobileNavLinkClass}>{t('nav.settings')}</NavLink>
          </div>
        </div>
      )}
    </header>
  );
};
