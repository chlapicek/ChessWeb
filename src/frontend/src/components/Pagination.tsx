import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (newPage: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
}) => {
  const { t } = useTranslation();

  if (totalPages <= 1) return null;

  const startItem = Math.min((page - 1) * pageSize + 1, totalCount);
  const endItem = Math.min(page * pageSize, totalCount);

  // Generate range of visible page numbers
  const pages: number[] = [];
  const maxPagesToShow = 5;
  let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
  let endPage = startPage + maxPagesToShow - 1;

  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(1, endPage - maxPagesToShow + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-200 dark:border-slate-800 text-xs">
      <div className="text-slate-500 dark:text-slate-400 font-medium">
        {t('common.showing')} <span className="font-semibold text-slate-800 dark:text-slate-200">{startItem}</span> -{' '}
        <span className="font-semibold text-slate-800 dark:text-slate-200">{endItem}</span> {t('common.of')}{' '}
        <span className="font-semibold text-slate-800 dark:text-slate-200">{totalCount}</span> {t('common.items')}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>{t('common.previousPage')}</span>
        </button>

        <div className="flex items-center gap-1">
          {startPage > 1 && (
            <>
              <button
                onClick={() => onPageChange(1)}
                className="w-8 h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium transition"
              >
                1
              </button>
              {startPage > 2 && <span className="px-1 text-slate-400">...</span>}
            </>
          )}

          {pages.map((p) => (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`w-8 h-8 rounded-lg border font-semibold transition ${
                p === page
                  ? 'bg-emerald-500 text-slate-950 border-emerald-500 font-bold shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {p}
            </button>
          ))}

          {endPage < totalPages && (
            <>
              {endPage < totalPages - 1 && <span className="px-1 text-slate-400">...</span>}
              <button
                onClick={() => onPageChange(totalPages)}
                className="w-8 h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium transition"
              >
                {totalPages}
              </button>
            </>
          )}
        </div>

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition"
        >
          <span>{t('common.nextPage')}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
