import React, { useEffect, useState } from 'react';
import { ExternalLink, Handshake, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../services/apiClient';
import { Partner } from '../types';

export const PartnersBar: React.FC = () => {
  const { t } = useTranslation();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const loadPartners = async () => {
      try {
        const res = await apiClient.get<Partner[]>('/partners');
        setPartners(res.data);
      } catch (err) {
        console.error('Failed to load partners', err);
      }
    };

    loadPartners();
  }, []);

  const getFallbackLabel = (name: string) =>
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'P';

  return (
    <aside className="fixed right-0 top-1/2 z-30 -translate-y-1/2">
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label={t('partners.open')}
          title={t('partners.open')}
          className="flex items-center gap-2 rounded-l-xl border border-r-0 border-slate-200/90 bg-white/95 px-2 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 shadow-[-8px_8px_24px_rgba(15,23,42,0.1)] backdrop-blur transition hover:-translate-x-1 hover:text-amber-600 dark:border-slate-800/90 dark:bg-slate-900/95 dark:text-slate-400 dark:hover:text-amber-400"
        >
          <Handshake className="h-4 w-4 text-amber-500" />
          <span className="hidden sm:inline">{t('partners.title')}</span>
          <PanelRightOpen className="h-4 w-4" />
        </button>
      ) : (
        <div className="w-[min(18rem,calc(100vw-1rem))] rounded-l-2xl border border-r-0 border-slate-200/90 bg-white/95 p-2 shadow-[-8px_8px_24px_rgba(15,23,42,0.1)] backdrop-blur dark:border-slate-800/90 dark:bg-slate-900/95">
          <div className="flex items-center justify-between border-b border-slate-200 px-2 pb-2 dark:border-slate-700">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Handshake className="h-4 w-4 text-amber-500" />
              <span>{t('partners.title')}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label={t('partners.close')}
              title={t('partners.close')}
              className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-amber-600 dark:hover:bg-slate-800 dark:hover:text-amber-400"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2 space-y-1.5">
            {partners.length === 0 ? (
              <div className="px-2 py-3 text-[11px] text-slate-500 dark:text-slate-400">{t('partners.empty')}</div>
            ) : (
              partners.map((partner) => (
                <a
                  key={partner.id}
                  href={partner.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={partner.name}
                  className="group flex items-center gap-2 rounded-lg border border-transparent px-2 py-2 transition hover:-translate-x-1 hover:border-amber-400/60 hover:bg-amber-50 dark:hover:border-amber-500/50 dark:hover:bg-slate-800"
                >
                  <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-100 text-[10px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <img
                      src={partner.logoUrl}
                      alt={`${partner.name} logo`}
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                        const fallback = event.currentTarget.nextElementSibling as HTMLElement | null;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                    />
                    <span className="hidden h-full w-full items-center justify-center bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                      {getFallbackLabel(partner.name)}
                    </span>
                  </div>
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{partner.name}</span>
                    <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">{partner.url}</span>
                  </span>
                  <ExternalLink className="ml-auto h-3 w-3 shrink-0 text-slate-400 transition group-hover:text-amber-500" />
                </a>
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  );
};