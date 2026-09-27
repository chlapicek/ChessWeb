import React, { useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Calendar as CalIcon, Download, Edit3, FileText, Trash2, User } from 'lucide-react';
import type { Article, ArticleReactionType } from '../../types';
import { ChessViewer } from '../ChessViewer';
import { GameCollectionPanel, describeGames } from '../GameCollectionPanel';
import { ArticleContent } from './ArticleContent';
import { CommentsSection } from './CommentsSection';
import { ReactionBar } from './ReactionBar';
import { ArticleBoardProvider, useBoardController } from './richContent/ArticleBoardContext';
import { collectAttachmentIds, parseRichDoc } from './richContent/richDoc';
import { buildArticleGames, downloadAttachment, formatFileSize } from './articleUtils';

interface ArticleDetailProps {
  article: Article;
  canManage: boolean;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (type: ArticleReactionType) => void;
  onArticleChange: (changes: Partial<Article>) => void;
}

const isStackedLayout = () => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1023px)').matches;

export const ArticleDetail: React.FC<ArticleDetailProps> = ({ article, canManage, onBack, onEdit, onDelete, onReact, onArticleChange }) => {
  const { t } = useTranslation();
  const boardRef = useRef<HTMLDivElement>(null);
  const fenLabel = t('articles.shownPosition');

  const baseGames = useMemo(
    () => buildArticleGames(article.pgnData, article.collection?.games, article.fenData, fenLabel),
    [article.pgnData, article.collection, article.fenData, fenLabel],
  );
  const scrollBoardIntoView = useCallback(() => {
    if (isStackedLayout()) boardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, []);
  const board = useBoardController(baseGames, fenLabel, scrollBoardIntoView);
  const gameEntries = useMemo(() => describeGames(board.games), [board.games]);

  const inlineAttachmentIds = useMemo(
    () => (article.contentFormat === 1 ? collectAttachmentIds(parseRichDoc(article.content)) : new Set<string>()),
    [article.content, article.contentFormat],
  );
  const listedAttachments = article.attachments.filter((att) => !inlineAttachmentIds.has(att.id.toLowerCase()));
  const hasBoard = board.games.length > 0;

  const download = async (id: string, fileName: string) => {
    try {
      await downloadAttachment(id, fileName);
    } catch {
      toast.error(t('articles.downloadFailed'));
    }
  };

  const handleCountChange = useCallback((count: number) => {
    if (count !== article.commentsCount) onArticleChange({ commentsCount: count });
  }, [article.commentsCount, onArticleChange]);
  const handleLockedChange = useCallback((locked: boolean) => onArticleChange({ commentsLocked: locked }), [onArticleChange]);

  return (
    <ArticleBoardProvider
      games={board.games}
      attachments={article.attachments}
      jumpTo={board.jumpTo}
      showFen={board.showFen}
      selectGame={board.selectGame}
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-md dark:shadow-xl mb-12 transition-colors animate-fade-in">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline mb-6 flex items-center gap-1 font-semibold rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          ← {t('common.back')}
        </button>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-3 leading-tight">
              {article.title}
              {!article.isPublished && (
                <span className="ml-3 align-middle text-xs font-medium bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded border border-amber-300/60 dark:border-amber-800">
                  {t('articles.draft')}
                </span>
              )}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
              <span className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-medium">
                <User className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                <Link
                  to={`/players/${article.authorId}`}
                  className="rounded-sm hover:text-emerald-600 dark:hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                  aria-label={`${t('players.viewProfile')}: ${article.authorName}`}
                >
                  {article.authorName}
                </Link>
                {article.authorRating && (
                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-mono">
                    {article.authorRating} Elo
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <CalIcon className="w-4 h-4 text-slate-400" aria-hidden="true" />
                {new Date(article.createdAt).toLocaleDateString()}
              </span>

              {canManage && (
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onEdit}
                    className="flex items-center gap-1 text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('common.edit')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onDelete}
                    className="flex items-center gap-1 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 bg-rose-50 dark:bg-rose-950/30 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('common.delete')}</span>
                  </button>
                </div>
              )}
            </div>

            {article.summary && (
              <p className="mb-6 text-sm font-medium text-slate-600 dark:text-slate-300">{article.summary}</p>
            )}

            <ArticleContent article={article} />

            <div className="mt-8 py-4 border-y border-slate-200 dark:border-slate-800/80 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium mr-1">{t('articles.reactions')}:</span>
              <ReactionBar reactions={article.reactions} onToggle={onReact} />
            </div>

            {listedAttachments.length > 0 && (
              <div className="mt-6 pt-2">
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                  {t('articles.attachedFiles')} ({listedAttachments.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {listedAttachments.map((att) => (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => download(att.id, att.fileName)}
                      aria-label={t('articles.download', { name: att.fileName })}
                      className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 rounded-xl transition group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <FileText className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true" />
                        <span className="text-xs text-slate-700 dark:text-slate-200 truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-300 font-mono">
                          {att.fileName}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">{formatFileSize(att.fileSizeBytes)}</span>
                      </span>
                      <Download className="w-4 h-4 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-white shrink-0 ml-2" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <CommentsSection
              article={article}
              boardState={board.boardState}
              onCountChange={handleCountChange}
              onLockedChange={handleLockedChange}
            />
          </div>

          {hasBoard && (
            <aside className="lg:w-96 shrink-0" aria-label={t('articles.interactiveBoardHeader')}>
              <div ref={boardRef} className="lg:sticky lg:top-20 space-y-3 scroll-mt-20">
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t('articles.interactiveBoardHeader')}
                </h4>
                <ChessViewer
                  games={board.games}
                  target={board.target}
                  onStateChange={board.setBoardState}
                  mode="analysis"
                  hideGameSelector
                  boardWidth={360}
                />
                {board.games.length > 1 && (
                  <GameCollectionPanel
                    games={gameEntries}
                    activeKey={board.boardState?.gameKey ?? board.games[0].key}
                    onSelect={board.selectGame}
                    title={article.collection?.name ?? t('articles.gameList')}
                  />
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </ArticleBoardProvider>
  );
};
