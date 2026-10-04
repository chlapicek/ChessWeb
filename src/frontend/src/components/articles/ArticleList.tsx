import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Edit3, MessageSquare, Search, Trash2, User } from 'lucide-react';
import type { Article, ArticleReactionType } from '../../types';
import { Pagination } from '../Pagination';
import { ReactionBar } from './ReactionBar';

interface ArticleListProps {
  articles: Article[];
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  canManage: (article: Article) => boolean;
  onOpen: (article: Article) => void;
  onEdit: (article: Article) => void;
  onDelete: (article: Article) => void;
  onReact: (article: Article, type: ArticleReactionType) => void;
}

export const ArticleList: React.FC<ArticleListProps> = ({
  articles, loading, search, onSearchChange, page, pageSize, totalCount, onPageChange, onPageSizeChange,
  canManage, onOpen, onEdit, onDelete, onReact,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <div className="relative mb-8 max-w-md">
        <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" aria-hidden="true" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('articles.searchPlaceholder')}
          aria-label={t('common.search')}
          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none shadow-sm transition-colors brand-input"
        />
      </div>

      <div className="space-y-6">
        {loading ? (
          <div className="text-center py-16 text-slate-500 text-sm">{t('common.loading')}</div>
        ) : articles.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-500 text-sm">
            {t('articles.noArticles')}
          </div>
        ) : (
          articles.map((art) => (
            <div
              key={art.id}
              onClick={() => onOpen(art)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 rounded-2xl p-6 transition duration-200 cursor-pointer group relative shadow-sm hover-card-animate animate-slide-up"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-300">
                    <User className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                    <Link
                      to={`/players/${art.authorId}`}
                      onClick={(event) => event.stopPropagation()}
                      className="rounded-sm hover:text-emerald-600 dark:hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                      aria-label={`${t('players.viewProfile')}: ${art.authorName}`}
                    >
                      {art.authorName}
                    </Link>
                  </span>
                  {art.authorRating && (
                    <span className="bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 text-[10px] px-1.5 py-0.5 rounded font-mono">
                      {art.authorRating} Elo
                    </span>
                  )}
                  <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">•</span>
                  <span>{new Date(art.createdAt).toLocaleDateString()}</span>
                </div>

                <div className="flex items-center gap-2">
                  {!art.isPublished && (
                    <span className="bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[10px] px-2 py-0.5 rounded border border-amber-300/60 dark:border-amber-800">
                      {t('articles.draft')}
                    </span>
                  )}
                  {(art.pgnData || art.collection) && (
                    <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] px-2 py-0.5 rounded font-mono border border-emerald-500/30">
                      {t('articles.interactiveBoardBadge')}
                    </span>
                  )}
                  {art.attachments.length > 0 && (
                    <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] px-2 py-0.5 rounded">
                      📎 {art.attachments.length} {t('articles.filesCount')}
                    </span>
                  )}
                </div>
              </div>

              <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition mb-2">
                <Link
                  to={`/articles/${art.id}`}
                  onClick={(event) => event.stopPropagation()}
                  className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  {art.title}
                </Link>
              </h3>

              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed mb-4">
                {art.summary || art.excerpt}
              </p>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                <ReactionBar reactions={art.reactions} onToggle={(type) => onReact(art, type)} size="sm" />

                <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                    <span className="text-xs font-medium">{art.commentsCount} {t('articles.commentsCount')}</span>
                  </div>

                  {canManage(art) && (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onEdit(art)}
                        className="p-1 rounded text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        title={t('articles.editArticle')}
                        aria-label={t('articles.editArticle')}
                      >
                        <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(art)}
                        className="p-1 rounded text-slate-400 hover:text-rose-500 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        title={t('articles.deleteArticle')}
                        aria-label={t('articles.deleteArticle')}
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}

                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition" aria-hidden="true" />
                </div>
              </div>
            </div>
          ))
        )}

        {articles.length > 0 && (
          <Pagination
            page={page}
            totalPages={Math.ceil(totalCount / pageSize)}
            totalCount={totalCount}
            pageSize={pageSize}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        )}
      </div>
    </>
  );
};
