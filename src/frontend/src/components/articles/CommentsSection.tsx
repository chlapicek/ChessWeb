import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Lock, MessageSquare, Send, Unlock, Crosshair } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../services/apiClient';
import type { Article, ArticleComment, ArticleReactionType, CommentsLockResult, PagedResult, ReactionSummary } from '../../types';
import type { ChessViewerState } from '../ChessViewer';
import { Pagination } from '../Pagination';
import { useConfirm } from '../ConfirmDialog';
import { usePersistentPageSize } from '../../hooks/usePersistentPageSize';
import { apiErrorMessage } from './articleUtils';
import { COMMENT_MAX_LENGTH, CommentItem } from './CommentItem';
import { buildMoveToken } from './richContent/moveTokens';
import { isArticleGameKey } from './richContent/richDoc';

const COMMENT_PAGE_SIZES = [5, 10, 20, 50];

interface CommentsSectionProps {
  article: Pick<Article, 'id' | 'authorId' | 'commentsLocked' | 'commentsCount'>;
  boardState: ChessViewerState | null;
  onCountChange: (count: number) => void;
  onLockedChange: (locked: boolean) => void;
}

export const CommentsSection: React.FC<CommentsSectionProps> = ({ article, boardState, onCountChange, onLockedChange }) => {
  const { t } = useTranslation();
  const { user, isAuthenticated, isAdmin } = useAuth();
  const confirm = useConfirm();
  const [comments, setComments] = useState<ArticleComment[]>([]);
  const [totalCount, setTotalCount] = useState(article.commentsCount);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePersistentPageSize('comments', 10, COMMENT_PAGE_SIZES);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [lockBusy, setLockBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;

  const isArticleAuthor = !!user && user.id === article.authorId;
  const canModerate = isArticleAuthor || isAdmin;
  const canComment = isAuthenticated && (!article.commentsLocked || canModerate);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    apiClient.get<PagedResult<ArticleComment>>(`/articles/${article.id}/comments`, { params: { page, pageSize } })
      .then((res) => {
        if (cancelled) return;
        const totalPages = Math.max(1, res.data.totalPages);
        if (page > totalPages) {
          setPage(totalPages);
          return;
        }
        setComments(res.data.items);
        setTotalCount(res.data.totalCount);
        onCountChangeRef.current(res.data.totalCount);
      })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [article.id, page, pageSize, reloadKey, user?.id]);

  const reload = () => setReloadKey((key) => key + 1);

  const canReferenceMove = !!boardState && boardState.ply > 0 && !boardState.isAnalyzing && !!boardState.san && isArticleGameKey(boardState.gameKey);

  const insertMoveReference = () => {
    if (!boardState || !canReferenceMove) return;
    const token = buildMoveToken(boardState.gameKey, boardState.ply, boardState.san);
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? text.length;
    const end = textarea?.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${token}${text.slice(end)}`;
    if (next.length > COMMENT_MAX_LENGTH) return;
    setText(next);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    setPostError(null);
    setSubmitting(true);
    try {
      await apiClient.post<ArticleComment>(`/articles/${article.id}/comments`, { content: text.trim() });
      setText('');
      setPage(Math.max(1, Math.ceil((totalCount + 1) / pageSize)));
      reload();
    } catch (error) {
      setPostError(apiErrorMessage(error, t('articles.commentPostFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSave = async (commentId: string, content: string): Promise<boolean> => {
    try {
      const res = await apiClient.put<ArticleComment>(`/articles/comments/${commentId}`, { content });
      setComments((prev) => prev.map((comment) => (comment.id === commentId ? res.data : comment)));
      return true;
    } catch (error) {
      toast.error(apiErrorMessage(error, t('articles.commentUpdateFailed')));
      return false;
    }
  };

  const handleDelete = async (commentId: string) => {
    const confirmed = await confirm({
      title: t('confirmDialog.deleteCommentTitle'),
      message: t('common.deleteConfirm'),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await apiClient.delete(`/articles/comments/${commentId}`);
      reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, t('articles.commentDeleteFailed')));
    }
  };

  const handleReact = async (commentId: string, reactionType: ArticleReactionType) => {
    try {
      const res = await apiClient.post<ReactionSummary[]>(`/articles/comments/${commentId}/reactions`, { reactionType });
      setComments((prev) => prev.map((comment) => (comment.id === commentId ? { ...comment, reactions: res.data } : comment)));
    } catch (error) {
      toast.error(apiErrorMessage(error, t('articles.reactionFailed')));
    }
  };

  const toggleLock = useCallback(async () => {
    setLockBusy(true);
    try {
      const res = await apiClient.put<CommentsLockResult>(`/articles/${article.id}/comments-lock`, { locked: !article.commentsLocked });
      onLockedChange(res.data.commentsLocked);
      reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, t('articles.lockFailed')));
    } finally {
      setLockBusy(false);
    }
  }, [article.id, article.commentsLocked, onLockedChange, t]);

  return (
    <section aria-labelledby="article-comments-heading" className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <MessageSquare className="w-4 h-4 text-emerald-500" aria-hidden="true" />
        <h3 id="article-comments-heading" className="text-base font-bold text-slate-900 dark:text-white">
          {t('articles.comments')} ({totalCount})
        </h3>
        {article.commentsLocked && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <Lock className="h-3 w-3" aria-hidden="true" />
            {t('articles.lockedBadge')}
          </span>
        )}
        {canModerate && (
          <button
            type="button"
            onClick={toggleLock}
            disabled={lockBusy}
            aria-pressed={article.commentsLocked}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {article.commentsLocked ? <Unlock className="h-3.5 w-3.5" aria-hidden="true" /> : <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
            {article.commentsLocked ? t('articles.unlockComments') : t('articles.lockComments')}
          </button>
        )}
      </div>

      {article.commentsLocked && !canModerate ? (
        <div role="status" className="mb-8 flex items-center justify-center gap-2 p-3.5 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
          <Lock className="h-4 w-4" aria-hidden="true" />
          {t('articles.commentsLockedNotice')}
        </div>
      ) : canComment ? (
        <form onSubmit={handleSubmit} className="mb-8">
          {postError && (
            <div role="alert" className="mb-3 text-xs text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded border border-rose-200 dark:border-rose-900">
              {postError}
            </div>
          )}
          {article.commentsLocked && (
            <p className="mb-2 text-[11px] text-amber-700 dark:text-amber-300">{t('articles.commentsLockedModeratorNotice')}</p>
          )}
          <textarea
            ref={textareaRef}
            rows={3}
            required
            maxLength={COMMENT_MAX_LENGTH}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t('articles.leaveCommentPlaceholder')}
            aria-label={t('articles.commentLabel')}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:border-emerald-500"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={insertMoveReference}
              disabled={!canReferenceMove}
              title={canReferenceMove ? undefined : t('articles.referenceMoveHint')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300"
            >
              <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
              {t('articles.referenceMove')}
            </button>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-400">{text.length} / {COMMENT_MAX_LENGTH}</span>
              <button
                type="submit"
                disabled={submitting || !text.trim()}
                className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-slate-950 font-semibold px-3 py-1.5 rounded-lg text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{submitting ? t('articles.postingComment') : t('articles.postComment')}</span>
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="mb-8 p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 text-center">
          {t('articles.signInToComment')}
        </div>
      )}

      {loadError ? (
        <div role="alert" className="flex items-center justify-center gap-3 py-4 text-xs text-rose-600 dark:text-rose-400">
          {t('articles.commentsLoadFailed')}
          <button type="button" onClick={reload} className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">{t('common.retry')}</button>
        </div>
      ) : loading && comments.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">{t('common.loading')}</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-slate-400 italic text-center py-4">{t('articles.noComments')}</p>
      ) : (
        <div className="space-y-3" aria-busy={loading}>
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onSave={(content) => handleSave(comment.id, content)}
              onDelete={() => handleDelete(comment.id)}
              onReact={(type) => handleReact(comment.id, type)}
            />
          ))}
          <Pagination
            page={page}
            totalPages={Math.ceil(totalCount / pageSize)}
            totalCount={totalCount}
            pageSize={pageSize}
            pageSizeOptions={COMMENT_PAGE_SIZES}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          />
        </div>
      )}
    </section>
  );
};
