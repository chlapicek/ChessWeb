import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../services/apiClient';
import { Article, ArticleComment, PagedResult, ArticleReactionType, ReactionSummary } from '../types';
import { ChessViewer } from '../components/ChessViewer';
import { FileUpload } from '../components/FileUpload';
import { Pagination } from '../components/Pagination';
import {
  Plus,
  Search,
  Trash2,
  Edit3,
  Calendar as CalIcon,
  User,
  Download,
  FileText,
  MessageSquare,
  ChevronRight,
  AlertCircle,
  Send,
  X
} from 'lucide-react';

const REACTION_CONFIG: { type: ArticleReactionType; emoji: string; label: string }[] = [
  { type: 0, emoji: '👍', label: 'Like' },
  { type: 1, emoji: '❤️', label: 'Love' },
  { type: 2, emoji: '♟️', label: 'Brilliant Chess' },
  { type: 3, emoji: '💡', label: 'Insightful' },
  { type: 4, emoji: '🏆', label: 'Masterpiece' },
];

export const ArticlesView: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, isAdmin } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  // Create Article Modal state
  const [isCreating, setIsCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createContent, setCreateContent] = useState('');
  const [createPgn, setCreatePgn] = useState('');
  const [createFen, setCreateFen] = useState('');
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Edit Article Modal state
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editPgn, setEditPgn] = useState('');
  const [editFen, setEditFen] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Comment state for detail view
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const fetchArticles = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<PagedResult<Article>>('/articles', {
        params: { search, page, pageSize: 5 },
      });
      setArticles(res.data.items);
      setTotalCount(res.data.totalCount);
    } catch (err) {
      console.error('Failed to load articles:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchArticleDetail = async (id: string) => {
    try {
      const res = await apiClient.get<Article>(`/articles/${id}`);
      setSelectedArticle(res.data);
    } catch (err) {
      console.error('Failed to fetch article detail:', err);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, [page, search, user]);

  useEffect(() => {
    if (id) {
      fetchArticleDetail(id);
    } else {
      setSelectedArticle(null);
    }
  }, [id]);

  const handleCreateArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (createContent.length > 30000) {
      setCreateError('Article content exceeds 30,000 characters.');
      return;
    }

    setCreateSubmitting(true);
    const formData = new FormData();
    formData.append('Title', createTitle);
    formData.append('Content', createContent);
    if (createPgn) formData.append('PgnData', createPgn);
    if (createFen) formData.append('FenData', createFen);

    createFiles.forEach((file) => {
      formData.append('attachments', file);
    });

    try {
      await apiClient.post('/articles', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setIsCreating(false);
      setCreateTitle('');
      setCreateContent('');
      setCreatePgn('');
      setCreateFen('');
      setCreateFiles([]);
      fetchArticles();
    } catch (err: any) {
      if (err.response?.data?.message) {
        setCreateError(err.response.data.message);
      } else if (err.response?.data?.errors) {
        setCreateError(err.response.data.errors.join(', '));
      } else {
        setCreateError('Failed to create article.');
      }
    } finally {
      setCreateSubmitting(false);
    }
  };

  const openEditModal = (art: Article, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingArticle(art);
    setEditTitle(art.title);
    setEditContent(art.content);
    setEditPgn(art.pgnData || '');
    setEditFen(art.fenData || '');
    setEditError(null);
  };

  const handleUpdateArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingArticle) return;
    setEditError(null);

    if (editContent.length > 30000) {
      setEditError('Article content exceeds 30,000 characters.');
      return;
    }

    setEditSubmitting(true);
    try {
      const res = await apiClient.put<Article>(`/articles/${editingArticle.id}`, {
        title: editTitle,
        content: editContent,
        pgnData: editPgn || null,
        fenData: editFen || null,
      });

      setEditingArticle(null);
      fetchArticles();
      if (selectedArticle?.id === editingArticle.id) {
        setSelectedArticle(res.data);
      }
    } catch (err: any) {
      setEditError(err.response?.data?.message || 'Failed to update article.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteArticle = async (articleId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm(t('common.deleteConfirm'))) return;

    try {
      await apiClient.delete(`/articles/${articleId}`);
      if (selectedArticle?.id === articleId) {
        navigate('/articles');
      }
      fetchArticles();
    } catch (err) {
      console.error('Failed to delete article', err);
    }
  };

  const handleToggleReaction = async (articleId: string, reactionType: ArticleReactionType, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isAuthenticated) {
      toast.error(t('auth.signInPrompt'));
      return;
    }

    try {
      const res = await apiClient.post<ReactionSummary[]>(`/articles/${articleId}/reactions`, {
        reactionType,
      });

      setArticles((prev) =>
        prev.map((a) => (a.id === articleId ? { ...a, reactions: res.data } : a))
      );

      if (selectedArticle && selectedArticle.id === articleId) {
        setSelectedArticle({ ...selectedArticle, reactions: res.data });
      }
    } catch (err) {
      console.error('Failed to toggle reaction', err);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedArticle || !commentText.trim()) return;

    setCommentError(null);
    setCommentSubmitting(true);

    try {
      const res = await apiClient.post<ArticleComment>(`/articles/${selectedArticle.id}/comments`, {
        content: commentText.trim(),
      });

      setSelectedArticle({
        ...selectedArticle,
        comments: [...selectedArticle.comments, res.data],
        commentsCount: selectedArticle.commentsCount + 1,
      });

      setArticles((prev) =>
        prev.map((a) =>
          a.id === selectedArticle.id
            ? { ...a, commentsCount: a.commentsCount + 1 }
            : a
        )
      );

      setCommentText('');
    } catch (err: any) {
      setCommentError(err.response?.data?.message || 'Failed to post comment.');
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm(t('common.deleteConfirm'))) return;

    try {
      await apiClient.delete(`/articles/comments/${commentId}`);
      if (selectedArticle) {
        setSelectedArticle({
          ...selectedArticle,
          comments: selectedArticle.comments.filter((c) => c.id !== commentId),
          commentsCount: Math.max(0, selectedArticle.commentsCount - 1),
        });

        setArticles((prev) =>
          prev.map((a) =>
            a.id === selectedArticle.id
              ? { ...a, commentsCount: Math.max(0, a.commentsCount - 1) }
              : a
          )
        );
      }
    } catch (err) {
      console.error('Failed to delete comment', err);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Header & Write Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {t('articles.title')}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {t('articles.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-4 py-2.5 rounded-xl shadow-lg transition text-sm shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{t('articles.writeArticle')}</span>
            </button>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
              {t('auth.signInPrompt')}
            </p>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative mb-8 max-w-md">
        <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder={t('articles.searchPlaceholder')}
          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500 shadow-sm transition-colors"
        />
      </div>

      {/* Modal: Create Article */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 dark:bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-2xl p-6 shadow-2xl my-8 text-slate-800 dark:text-slate-100 relative transition-colors animate-scale-in">
            <button
              onClick={() => setIsCreating(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{t('articles.writeNewArticle')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              {t('articles.writeNewDesc')}
            </p>

            {createError && (
              <div className="mb-4 flex items-center gap-2 text-xs bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 p-3 rounded-lg border border-rose-200 dark:border-rose-900">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateArticle} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('articles.articleTitle')} (max 200 chars) *
                </label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="Navara vs Rapport..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-amber-500"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t('articles.content')} (max 30,000 chars) *
                  </label>
                  <span className={`text-[11px] ${createContent.length > 28000 ? 'text-amber-500' : 'text-slate-400'}`}>
                    {createContent.length} / 30,000
                  </span>
                </div>
                <textarea
                  rows={8}
                  required
                  value={createContent}
                  onChange={(e) => setCreateContent(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-amber-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('articles.pgnNotation')}
                </label>
                <textarea
                  rows={3}
                  value={createPgn}
                  onChange={(e) => setCreatePgn(e.target.value)}
                  placeholder="1. e4 e5 2. Nf3 Nc6..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:border-amber-500"
                />
              </div>

              <FileUpload
                files={createFiles}
                onFilesChange={setCreateFiles}
                maxFiles={3}
                maxSizeMb={5}
              />

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm transition"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-lg text-sm transition shadow"
                >
                  {createSubmitting ? t('articles.publishing') : t('articles.publishArticle')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Article */}
      {editingArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 dark:bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-2xl p-6 shadow-2xl my-8 text-slate-800 dark:text-slate-100 relative transition-colors animate-scale-in">
            <button
              onClick={() => setEditingArticle(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{t('articles.editArticle')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              {t('articles.editDesc')}
            </p>

            {editError && (
              <div className="mb-4 flex items-center gap-2 text-xs bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 p-3 rounded-lg border border-rose-200 dark:border-rose-900">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateArticle} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('articles.articleTitle')} (max 200 chars) *
                </label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-amber-500"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t('articles.content')} (max 30,000 chars) *
                  </label>
                  <span className={`text-[11px] ${editContent.length > 28000 ? 'text-amber-500' : 'text-slate-400'}`}>
                    {editContent.length} / 30,000
                  </span>
                </div>
                <textarea
                  rows={8}
                  required
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-amber-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('articles.pgnNotationEdit')}
                </label>
                <textarea
                  rows={3}
                  value={editPgn}
                  onChange={(e) => setEditPgn(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingArticle(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm transition"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-lg text-sm transition shadow"
                >
                  {editSubmitting ? t('articles.savingChanges') : t('articles.saveChanges')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Selected Article Detail View */}
      {selectedArticle ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-md dark:shadow-xl mb-12 transition-colors animate-fade-in">
          <button
            onClick={() => navigate('/articles')}
            className="text-xs text-amber-600 dark:text-amber-400 hover:underline mb-6 flex items-center gap-1 font-semibold"
          >
            ← {t('common.back')}
          </button>

          <div className="flex flex-col lg:flex-row gap-8">
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-3 leading-tight">
                {selectedArticle.title}
              </h1>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
                <span className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-medium">
                  <User className="w-4 h-4 text-amber-500" />
                  <Link
                    to={`/players/${selectedArticle.authorId}`}
                    className="rounded-sm hover:text-amber-600 dark:hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                  >
                    {selectedArticle.authorName}
                  </Link>
                  {selectedArticle.authorRating && (
                    <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-mono">
                      {selectedArticle.authorRating} Elo
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5">
                  <CalIcon className="w-4 h-4 text-slate-400" />
                  {new Date(selectedArticle.createdAt).toLocaleDateString()}
                </span>

                {/* Owner / Admin Controls */}
                {(isAdmin || user?.id === selectedArticle.authorId) && (
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => openEditModal(selectedArticle)}
                      className="flex items-center gap-1 text-slate-700 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 transition"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{t('common.edit')}</span>
                    </button>
                    <button
                      onClick={() => handleDeleteArticle(selectedArticle.id)}
                      className="flex items-center gap-1 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 bg-rose-50 dark:bg-rose-950/30 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/50 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t('common.delete')}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Main Article Content */}
              <div className="text-slate-800 dark:text-slate-200 text-sm leading-relaxed whitespace-pre-wrap font-sans space-y-4">
                {selectedArticle.content}
              </div>

              {/* Reactions Bar */}
              <div className="mt-8 pt-4 pb-4 border-y border-slate-200 dark:border-slate-800/80 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium mr-1">{t('articles.reactions')}:</span>
                {REACTION_CONFIG.map(({ type, emoji, label }) => {
                  const summary = selectedArticle.reactions?.find((r) => r.reactionType === type);
                  const count = summary?.count || 0;
                  const active = summary?.userReacted || false;

                  return (
                    <button
                      key={type}
                      onClick={() => handleToggleReaction(selectedArticle.id, type)}
                      title={label}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                        active
                          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <span>{emoji}</span>
                      <span className="font-mono text-[11px]">{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* Attachments Section */}
              {selectedArticle.attachments.length > 0 && (
                <div className="mt-6 pt-2">
                  <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                    {t('articles.attachedFiles')} ({selectedArticle.attachments.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedArticle.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={`http://localhost:8080/api/articles/attachments/${att.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 rounded-xl transition group"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                          <span className="text-xs text-slate-700 dark:text-slate-200 truncate group-hover:text-amber-600 dark:group-hover:text-amber-300 font-mono">
                            {att.fileName}
                          </span>
                        </div>
                        <Download className="w-4 h-4 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-white shrink-0 ml-2" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Comments Section */}
              <div className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 mb-6">
                  <MessageSquare className="w-4 h-4 text-amber-500" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {t('articles.comments')} ({selectedArticle.comments.length})
                  </h3>
                </div>

                {/* Comment Input */}
                {isAuthenticated ? (
                  <form onSubmit={handleAddComment} className="mb-8">
                    {commentError && (
                      <div className="mb-3 text-xs text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded border border-rose-200 dark:border-rose-900">
                        {commentError}
                      </div>
                    )}
                    <div className="relative">
                      <textarea
                        rows={3}
                        required
                        maxLength={5000}
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder={t('articles.leaveCommentPlaceholder')}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:border-amber-500 pr-24"
                      />
                      <button
                        type="submit"
                        disabled={commentSubmitting || !commentText.trim()}
                        className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-slate-950 font-semibold px-3 py-1.5 rounded-lg text-xs transition"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{commentSubmitting ? t('articles.postingComment') : t('articles.postComment')}</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="mb-8 p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 text-center">
                    {t('articles.signInToComment')}
                  </div>
                )}

                {/* Comments List */}
                {selectedArticle.comments.length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-4">
                    {t('articles.noComments')}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {selectedArticle.comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-xl p-4 text-xs"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{comment.authorName}</span>
                            {comment.authorRating && (
                              <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-amber-600 dark:text-amber-400 px-1.5 py-0.2 rounded font-mono">
                                {comment.authorRating} Elo
                              </span>
                            )}
                            <span className="text-slate-400 text-[11px]">
                              • {new Date(comment.createdAt).toLocaleDateString()}
                            </span>
                          </div>

                          {(isAdmin || user?.id === comment.authorId) && (
                            <button
                              onClick={() => handleDeleteComment(comment.id)}
                              className="text-slate-400 hover:text-rose-500 p-1"
                              title={t('articles.deleteComment')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                          {comment.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Chessboard Sidebar (PGN or FEN) */}
            {(selectedArticle.pgnData || selectedArticle.fenData) && (
              <div className="lg:w-96 shrink-0">
                <div className="sticky top-20">
                  <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                    {t('articles.interactiveBoardHeader')}
                  </h4>
                  <ChessViewer
                    pgn={selectedArticle.pgnData}
                    fen={selectedArticle.fenData}
                    boardWidth={360}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 1 Article Per Row List View */
        <div className="space-y-6">
          {loading ? (
            <div className="text-center py-16 text-slate-500 text-sm">
              {t('common.loading')}
            </div>
          ) : articles.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-500 text-sm">
              {t('articles.noArticles')}
            </div>
          ) : (
            articles.map((art) => (
              <div
                key={art.id}
                onClick={() => navigate('/articles/' + art.id)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 rounded-2xl p-6 transition duration-200 cursor-pointer group relative shadow-sm hover-card-animate animate-slide-up"
              >
                {/* Header: Author + Date */}
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-300">
                      <User className="w-3.5 h-3.5 text-amber-500" />
                      <Link
                        to={`/players/${art.authorId}`}
                        onClick={(event) => event.stopPropagation()}
                        className="rounded-sm hover:text-amber-600 dark:hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                      >
                        {art.authorName}
                      </Link>
                    </span>
                    {art.authorRating && (
                      <span className="bg-slate-100 dark:bg-slate-800 text-amber-600 dark:text-amber-400 text-[10px] px-1.5 py-0.5 rounded font-mono">
                        {art.authorRating} Elo
                      </span>
                    )}
                    <span className="text-slate-300 dark:text-slate-600">•</span>
                    <span>{new Date(art.createdAt).toLocaleDateString()}</span>
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-2">
                    {art.pgnData && (
                      <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] px-2 py-0.5 rounded font-mono border border-amber-500/30">
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

                {/* Title */}
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition mb-2">
                  {art.title}
                </h3>

                {/* Content Excerpt */}
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed mb-4">
                  {art.content}
                </p>

                {/* Bottom Bar: Reactions, Comments, Actions */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                  {/* Reaction buttons */}
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {REACTION_CONFIG.map(({ type, emoji }) => {
                      const summary = art.reactions?.find((r) => r.reactionType === type);
                      const count = summary?.count || 0;
                      const active = summary?.userReacted || false;

                      return (
                        <button
                          key={type}
                          onClick={(e) => handleToggleReaction(art.id, type, e)}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                            active
                              ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40'
                              : 'bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <span>{emoji}</span>
                          <span className="font-mono text-[10px]">{count}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Right side: Comments count & Author actions */}
                  <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-xs font-medium">{art.commentsCount} {t('articles.commentsCount')}</span>
                    </div>

                    {(isAdmin || user?.id === art.authorId) && (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => openEditModal(art, e)}
                          className="p-1 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition"
                          title={t('articles.editArticle')}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteArticle(art.id, e)}
                          className="p-1 text-slate-400 hover:text-rose-500 transition"
                          title={t('articles.deleteArticle')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-500 transition" />
                  </div>
                </div>
              </div>
            ))
          )}

          {articles.length > 0 && (
            <Pagination
              page={page}
              totalPages={Math.ceil(totalCount / 5)}
              totalCount={totalCount}
              pageSize={5}
              onPageChange={(newPage) => setPage(newPage)}
            />
          )}
        </div>
      )}
    </div>
  );
};
