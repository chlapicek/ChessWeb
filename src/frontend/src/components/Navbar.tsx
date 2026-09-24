import React, { useState } from 'react';
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
} from 'lucide-react';

interface NavbarProps {
  onOpenLogin: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenLogin }) => {
  const { t } = useTranslation();
  const { user, isAuthenticated, logout, isAdmin } = useAuth();
  const location = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
      isActive
        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
    }`;

  const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-2 py-1 rounded font-medium ${
      isActive ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-600 dark:text-slate-400'
    }`;

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link to="/articles" className="flex items-center gap-3 cursor-pointer">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-500 dark:text-amber-400 font-bold text-xl shadow-sm">
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
              <div className="text-right hidden sm:block">
                <p className="text-xs font-semibold text-slate-900 dark:text-white">{user.nickname || user.fullName}</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-mono">
                  {user.roles.join(', ') || t('common.member')}
                </p>
              </div>
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
              className="flex items-center gap-1.5 text-xs sm:text-sm bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold px-3 sm:px-4 py-2 rounded-lg shadow-md transition"
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
