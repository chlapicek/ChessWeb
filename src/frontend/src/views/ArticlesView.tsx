import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../services/apiClient';
import type { Article, ArticleReactionType, PagedResult, ReactionSummary } from '../types';
import { useConfirm } from '../components/ConfirmDialog';
import { usePersistentPageSize } from '../hooks/usePersistentPageSize';
import { ArticleList } from '../components/articles/ArticleList';
import { ArticleDetail } from '../components/articles/ArticleDetail';
import { apiErrorMessage } from '../components/articles/articleUtils';

const ArticleEditorModal = lazy(() => import('../components/articles/ArticleEditorModal'));

type EditorState = { mode: 'create' } | { mode: 'edit'; article: Article } | null;

export const ArticlesView: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, isAdmin } = useAuth();
  const confirm = useConfirm();
  const [articles, setArticles] = useState<Article[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePersistentPageSize('articles', 5);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [detailError, setDetailError] = useState(false);
  const [editorState, setEditorState] = useState<EditorState>(null);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<PagedResult<Article>>('/articles', { params: { search, page, pageSize } });
      setArticles(res.data.items);
      setTotalCount(res.data.totalCount);
    } catch (err) {
      console.error('Failed to load articles:', err);
    } finally {
      setLoading(false);
    }
  }, [search, page, pageSize]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles, user?.id]);

  useEffect(() => {
    setDetailError(false);
    if (!id) {
      setSelectedArticle(null);
      return;
    }
    let cancelled = false;
    apiClient.get<Article>(`/articles/${id}`)
      .then((res) => { if (!cancelled) setSelectedArticle(res.data); })
      .catch(() => { if (!cancelled) { setSelectedArticle(null); setDetailError(true); } });
    return () => { cancelled = true; };
  }, [id, user?.id]);

  const canManage = (article: Article) => isAdmin || user?.id === article.authorId;

  const updateArticle = useCallback((articleId: string, changes: Partial<Article>) => {
    setArticles((prev) => prev.map((a) => (a.id === articleId ? { ...a, ...changes } : a)));
    setSelectedArticle((prev) => (prev && prev.id === articleId ? { ...prev, ...changes } : prev));
  }, []);

  const handleDelete = async (article: Article) => {
    const confirmed = await confirm({
      title: t('confirmDialog.deleteArticleTitle'),
      message: t('common.deleteConfirm'),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await apiClient.delete(`/articles/${article.id}`);
      if (selectedArticle?.id === article.id) navigate('/articles');
      fetchArticles();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('articles.deleteFailed')));
    }
  };

  const handleReact = async (article: Article, reactionType: ArticleReactionType) => {
    try {
      const res = await apiClient.post<ReactionSummary[]>(`/articles/${article.id}/reactions`, { reactionType });
      updateArticle(article.id, { reactions: res.data });
    } catch (err) {
      toast.error(apiErrorMessage(err, t('articles.reactionFailed')));
    }
  };

  const handleSaved = (saved: Article, created: boolean) => {
    setEditorState(null);
    fetchArticles();
    if (created) navigate(`/articles/${saved.id}`);
    else if (selectedArticle?.id === saved.id) setSelectedArticle(saved);
  };

  const handleSelectedChange = useCallback(
    (changes: Partial<Article>) => { if (selectedArticle) updateArticle(selectedArticle.id, changes); },
    [selectedArticle, updateArticle],
  );

  return (
    <div className={`${id ? 'max-w-7xl' : 'max-w-5xl'} mx-auto px-4 sm:px-6 lg:px-8 py-8`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{t('articles.title')}</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{t('articles.subtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => setEditorState({ mode: 'create' })}
              className="brand-button flex items-center gap-2 font-semibold px-4 py-2.5 rounded-xl shadow-lg transition text-sm shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>{t('articles.writeArticle')}</span>
            </button>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
              {t('auth.signInPrompt')}
            </p>
          )}
        </div>
      </div>

      {editorState && (
        <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 text-sm text-white" role="status">{t('articles.editorLoading')}</div>}>
          <ArticleEditorModal
            article={editorState.mode === 'edit' ? editorState.article : null}
            onClose={() => setEditorState(null)}
            onSaved={handleSaved}
          />
        </Suspense>
      )}

      {id ? (
        selectedArticle ? (
          <ArticleDetail
            key={selectedArticle.id}
            article={selectedArticle}
            canManage={canManage(selectedArticle)}
            onBack={() => navigate('/articles')}
            onEdit={() => setEditorState({ mode: 'edit', article: selectedArticle })}
            onDelete={() => handleDelete(selectedArticle)}
            onReact={(type) => handleReact(selectedArticle, type)}
            onArticleChange={handleSelectedChange}
          />
        ) : (
          <div className="text-center py-16 text-slate-500 text-sm" role={detailError ? 'alert' : 'status'}>
            {detailError ? t('articles.loadFailed') : t('common.loading')}
          </div>
        )
      ) : (
        <ArticleList
          articles={articles}
          loading={loading}
          search={search}
          onSearchChange={(value) => { setSearch(value); setPage(1); }}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          canManage={canManage}
          onOpen={(article) => navigate(`/articles/${article.id}`)}
          onEdit={(article) => setEditorState({ mode: 'edit', article })}
          onDelete={handleDelete}
          onReact={handleReact}
        />
      )}
    </div>
  );
};
