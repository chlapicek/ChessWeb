import React, { useDeferredValue, useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor } from '@tiptap/react';
import { AlertCircle, Crosshair, LayoutGrid, Swords, X } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import type { Article, Attachment, GameCollectionDetail, GameCollectionGame, GameCollectionSummary } from '../../types';
import { ChessViewer } from '../ChessViewer';
import { GameCollectionPanel, describeGames } from '../GameCollectionPanel';
import { ArticleEditor } from './ArticleEditor';
import { apiErrorMessage, buildArticleGames, isValidFen } from './articleUtils';
import { ArticleBoardProvider, useBoardController } from './richContent/ArticleBoardContext';
import { createRichExtensions } from './richContent/extensions';
import { MAX_RICH_CONTENT_LENGTH, isArticleGameKey, parseRichDoc, plainTextToDoc, sanitizeRichDoc, type RichDoc } from './richContent/richDoc';

interface ArticleEditorModalProps {
  article?: Article | null;
  onClose: () => void;
  onSaved: (article: Article, created: boolean) => void;
}

const initialDocFor = (article?: Article | null): RichDoc | undefined => {
  if (!article) return undefined;
  if (article.contentFormat === 1) return parseRichDoc(article.content) ?? plainTextToDoc(article.excerpt);
  return plainTextToDoc(article.content);
};

const inputClass = 'w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-emerald-500';
const labelClass = 'block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1';
const insertButtonClass = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300';

const ArticleEditorModal: React.FC<ArticleEditorModalProps> = ({ article, onClose, onSaved }) => {
  const { t } = useTranslation();
  const formId = useId();
  const isEdit = !!article;
  const [title, setTitle] = useState(article?.title ?? '');
  const [pgn, setPgn] = useState(article?.pgnData ?? '');
  const [fen, setFen] = useState(article?.fenData ?? '');
  const [collectionId, setCollectionId] = useState(article?.gameCollectionId ?? '');
  const [collections, setCollections] = useState<GameCollectionSummary[]>([]);
  const [collectionGames, setCollectionGames] = useState<GameCollectionGame[]>(article?.collection?.games ?? []);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [uploaded, setUploaded] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [contentLength, setContentLength] = useState(0);

  const extensions = useMemo(() => createRichExtensions(), []);
  const editor = useEditor({
    extensions,
    content: initialDocFor(article),
    editorProps: { attributes: { 'aria-label': t('articles.content'), 'aria-multiline': 'true', role: 'textbox' } },
    onUpdate: ({ editor: current }) => setContentLength(JSON.stringify(sanitizeRichDoc(current.getJSON())).length),
    onCreate: ({ editor: current }) => setContentLength(JSON.stringify(sanitizeRichDoc(current.getJSON())).length),
  });

  useEffect(() => {
    apiClient.get<GameCollectionSummary[]>('/gamecollections')
      .then((res) => setCollections(res.data))
      .catch(() => setCollections([]));
  }, []);

  useEffect(() => {
    setCollectionError(null);
    if (!collectionId) {
      setCollectionGames([]);
      return;
    }
    if (article?.collection && collectionId === article.collection.id) {
      setCollectionGames(article.collection.games);
      return;
    }
    let cancelled = false;
    apiClient.get<GameCollectionDetail>(`/gamecollections/${collectionId}`)
      .then((res) => { if (!cancelled) setCollectionGames(res.data.games); })
      .catch(() => { if (!cancelled) { setCollectionGames([]); setCollectionError(t('articles.collectionLoadFailed')); } });
    return () => { cancelled = true; };
  }, [collectionId, article?.collection, t]);

  const collectionOptions = useMemo(() => {
    const own = collections.map(({ id, name }) => ({ id, name }));
    const linked = article?.collection;
    return linked && !own.some((item) => item.id === linked.id) ? [{ id: linked.id, name: linked.name }, ...own] : own;
  }, [collections, article?.collection]);

  const fenLabel = t('articles.shownPosition');
  const deferredPgn = useDeferredValue(pgn);
  const baseGames = useMemo(() => buildArticleGames(deferredPgn, collectionGames, fen, fenLabel), [deferredPgn, collectionGames, fen, fenLabel]);
  const board = useBoardController(baseGames, fenLabel);
  const gameEntries = useMemo(() => describeGames(board.games), [board.games]);
  const attachments = useMemo(() => [...(article?.attachments ?? []), ...uploaded], [article?.attachments, uploaded]);
  const existingAttachmentIds = useMemo(() => (article?.attachments ?? []).map((att) => att.id), [article?.attachments]);

  const state = board.boardState;
  const currentGameKey = isArticleGameKey(state?.gameKey) ? state?.gameKey : undefined;
  const canInsertMove = !!currentGameKey && !!state && state.ply > 0 && !state.isAnalyzing && !!state.san;
  const positionFen = state?.fen ?? (isValidFen(fen) ? fen.trim() : undefined);

  const insert = (content: Record<string, unknown>) => editor?.chain().focus().insertContent(content).run();

  const insertPosition = () => {
    if (!positionFen) return;
    const trimmedCaption = caption.trim().slice(0, 300);
    insert({ type: 'chessPosition', attrs: trimmedCaption ? { fen: positionFen, caption: trimmedCaption } : { fen: positionFen } });
    setCaption('');
  };
  const insertGame = () => { if (currentGameKey) insert({ type: 'chessGame', attrs: { gameKey: currentGameKey } }); };
  const insertMove = () => {
    if (canInsertMove && state?.san) insert({ type: 'moveRef', attrs: { gameKey: currentGameKey, ply: state.ply, san: state.san.slice(0, 20) } });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editor) return;
    setError(null);
    if (editor.isEmpty) {
      setError(t('articles.contentRequired'));
      return;
    }
    const content = JSON.stringify(sanitizeRichDoc(editor.getJSON()));
    if (content.length > MAX_RICH_CONTENT_LENGTH) {
      setError(t('articles.contentTooLong', { count: content.length, max: MAX_RICH_CONTENT_LENGTH }));
      return;
    }
    if (fen.trim() && !isValidFen(fen)) {
      setError(t('articles.invalidFen'));
      return;
    }

    setSubmitting(true);
    try {
      if (article) {
        const res = await apiClient.put<Article>(`/articles/${article.id}`, {
          title,
          content,
          summary: article.summary ?? null,
          pgnData: pgn.trim() || null,
          fenData: fen.trim() || null,
          contentFormat: 1,
          gameCollectionId: collectionId || null,
        });
        onSaved(res.data, false);
      } else {
        const formData = new FormData();
        formData.append('Title', title);
        formData.append('Content', content);
        formData.append('ContentFormat', '1');
        if (pgn.trim()) formData.append('PgnData', pgn.trim());
        if (fen.trim()) formData.append('FenData', fen.trim());
        if (collectionId) formData.append('GameCollectionId', collectionId);
        const res = await apiClient.post<Article>('/articles', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        onSaved(res.data, true);
      }
    } catch (err) {
      setError(apiErrorMessage(err, t('articles.saveFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  const headingId = `${formId}-heading`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 dark:bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="relative mx-auto my-6 w-full max-w-6xl rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-2xl transition-colors animate-scale-in dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.cancel')}
          className="absolute top-4 right-4 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        <h3 id={headingId} className="text-lg font-bold text-slate-900 dark:text-white mb-1">
          {isEdit ? t('articles.editArticle') : t('articles.writeNewArticle')}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{isEdit ? t('articles.editDesc') : t('articles.writeNewDesc')}</p>

        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-100 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <ArticleBoardProvider games={board.games} attachments={attachments} jumpTo={board.jumpTo} showFen={board.showFen} selectGame={board.selectGame}>
          <form id={formId} onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-4">
              <div>
                <label htmlFor={`${formId}-title`} className={labelClass}>{t('articles.articleTitle')} *</label>
                <input
                  id={`${formId}-title`}
                  type="text"
                  required
                  autoFocus
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{t('articles.content')} *</span>
                  <span className={`text-[11px] ${contentLength > MAX_RICH_CONTENT_LENGTH ? 'text-rose-500' : 'text-slate-400'}`}>
                    {t('articles.contentSize', { count: contentLength, max: MAX_RICH_CONTENT_LENGTH })}
                  </span>
                </div>
                {editor ? (
                  <ArticleEditor editor={editor} existingAttachmentIds={existingAttachmentIds} onAttachmentUploaded={(att) => setUploaded((prev) => [...prev, att])} />
                ) : (
                  <p className="text-xs text-slate-500">{t('common.loading')}</p>
                )}
              </div>
            </div>

            <aside aria-labelledby={`${formId}-chess`} className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40">
              <h4 id={`${formId}-chess`} className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('articles.chessPanel')}</h4>

              <div>
                <label htmlFor={`${formId}-pgn`} className={labelClass}>{t('articles.pgnNotation')}</label>
                <textarea
                  id={`${formId}-pgn`}
                  rows={4}
                  maxLength={15000}
                  value={pgn}
                  onChange={(e) => setPgn(e.target.value)}
                  placeholder="1. e4 e5 2. Nf3 Nc6..."
                  className={`${inputClass} font-mono text-xs`}
                />
              </div>

              <div>
                <label htmlFor={`${formId}-fen`} className={labelClass}>{t('articles.fenPosition')}</label>
                <input
                  id={`${formId}-fen`}
                  type="text"
                  maxLength={150}
                  value={fen}
                  onChange={(e) => setFen(e.target.value)}
                  aria-invalid={!!fen.trim() && !isValidFen(fen)}
                  className={`${inputClass} font-mono text-xs`}
                />
                {fen.trim() && !isValidFen(fen) && <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{t('articles.invalidFen')}</p>}
              </div>

              <div>
                <label htmlFor={`${formId}-collection`} className={labelClass}>{t('articles.collection')}</label>
                <select id={`${formId}-collection`} value={collectionId} onChange={(e) => setCollectionId(e.target.value)} className={inputClass}>
                  <option value="">{t('articles.collectionNone')}</option>
                  {collectionOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                {collectionError && <p role="alert" className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{collectionError}</p>}
              </div>

              <div className="space-y-3">
                <ChessViewer
                  games={board.games}
                  target={board.target}
                  onStateChange={board.setBoardState}
                  mode="analysis"
                  hideGameSelector
                  boardWidth={340}
                />
                {board.games.length > 1 && (
                  <GameCollectionPanel
                    games={gameEntries}
                    activeKey={state?.gameKey ?? board.games[0].key}
                    onSelect={board.selectGame}
                    title={t('articles.gameList')}
                  />
                )}
              </div>

              <div className="space-y-2">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('articles.insertHint')}</p>
                <label htmlFor={`${formId}-caption`} className="sr-only">{t('articles.captionOptional')}</label>
                <input
                  id={`${formId}-caption`}
                  type="text"
                  maxLength={300}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder={t('articles.captionOptional')}
                  className={`${inputClass} text-xs`}
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  <button type="button" onClick={insertPosition} disabled={!positionFen} className={insertButtonClass}>
                    <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('articles.insertPosition')}
                  </button>
                  <button type="button" onClick={insertGame} disabled={!currentGameKey} className={insertButtonClass}>
                    <Swords className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('articles.insertGame')}
                  </button>
                  <button type="button" onClick={insertMove} disabled={!canInsertMove} className={insertButtonClass}>
                    <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('articles.insertMove')}
                  </button>
                </div>
              </div>
            </aside>

            <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800 lg:col-span-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting || !editor}
                className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 shadow transition hover:bg-emerald-600 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                {isEdit
                  ? (submitting ? t('articles.savingChanges') : t('articles.saveChanges'))
                  : (submitting ? t('articles.publishing') : t('articles.publishArticle'))}
              </button>
            </div>
          </form>
        </ArticleBoardProvider>
      </div>
    </div>
  );
};

export default ArticleEditorModal;
