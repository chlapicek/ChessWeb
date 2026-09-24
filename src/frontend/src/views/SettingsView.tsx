import React from 'react';
import { Globe, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';

export const SettingsView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();

  const changeLanguage = (language: 'en' | 'cs') => {
    i18n.changeLanguage(language);
    localStorage.setItem('chessweb_language', language);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('settings.subtitle')}</p>
      </div>

      <div className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-3">
            <Globe className="h-5 w-5 text-amber-500" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">{t('settings.languageTitle')}</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('settings.languageDescription')}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(['en', 'cs'] as const).map((language) => (
              <button
                key={language}
                type="button"
                onClick={() => changeLanguage(language)}
                className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                  i18n.language.startsWith(language)
                    ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : 'border-slate-200 text-slate-700 hover:border-amber-400 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                {language === 'en' ? t('settings.english') : t('settings.czech')}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-3">
            {theme === 'dark' ? <Moon className="h-5 w-5 text-amber-500" /> : <Sun className="h-5 w-5 text-amber-500" />}
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">{t('settings.themeTitle')}</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('settings.themeDescription')}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(['light', 'dark'] as const).map((selectedTheme) => (
              <button
                key={selectedTheme}
                type="button"
                onClick={() => setTheme(selectedTheme)}
                className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                  theme === selectedTheme
                    ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : 'border-slate-200 text-slate-700 hover:border-amber-400 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                {selectedTheme === 'light' ? t('common.light') : t('common.dark')}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};