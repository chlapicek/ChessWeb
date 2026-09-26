import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Toaster } from 'sonner';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Navbar } from './components/Navbar';
import { AuthModal } from './components/AuthModal';
import { ArticlesView } from './views/ArticlesView';
import { CalendarView } from './views/CalendarView';
import { AdminView } from './views/AdminView';
import { PartnersBar } from './components/PartnersBar';
import { BoardView } from './views/BoardView';
import { SettingsView } from './views/SettingsView';
import { TeamAvailabilityView } from './views/TeamAvailabilityView';
import { PlayersView } from './views/PlayersView';
import { PlayerProfileView } from './views/PlayerProfileView';
import { NotificationsView } from './views/NotificationsView';

export const AppContent: React.FC = () => {
  const { t } = useTranslation();
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      <Navbar onOpenLogin={() => setIsAuthOpen(true)} />

      <main className="flex-1 animate-fade-in">
        <Routes>
          <Route path="/" element={<Navigate to="/articles" replace />} />
          <Route path="/articles" element={<ArticlesView />} />
          <Route path="/articles/:id" element={<ArticlesView />} />
          <Route path="/calendar" element={<CalendarView />} />
          <Route path="/team-availability" element={<TeamAvailabilityView />} />
          <Route path="/players" element={<PlayersView />} />
          <Route path="/players/:id" element={<PlayerProfileView />} />
          <Route path="/board" element={<BoardView />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="/notifications" element={<NotificationsView />} />
          <Route path="/admin" element={<AdminView />} />
          <Route path="*" element={<Navigate to="/articles" replace />} />
        </Routes>
      </main>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      <Toaster position="top-right" richColors closeButton />

      <PartnersBar />

      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-slate-500 text-xs py-8 text-center mt-12 transition-colors">
        <div className="max-w-7xl mx-auto px-4">
          <p className="font-semibold text-slate-700 dark:text-slate-300">♟ {t('common.appName')} {t('common.tagline')}</p>
          <p className="mt-1">{t('common.footerText')}</p>
        </div>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
