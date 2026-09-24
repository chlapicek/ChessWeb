import React, { useState, useEffect, useCallback } from 'react';
import { Download, RotateCcw, Save, FolderOpen, X, Trash2, FileDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChessViewer, parsePgnGames } from '../components/ChessViewer';
import { EnginePanel } from '../components/EnginePanel';
import { BoardEditor } from '../components/BoardEditor';
import { Chess } from 'chess.js';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../services/apiClient';
import { GameCollectionSummary, GameCollectionDetail } from '../types';

const STARTER_PGN = `1. e4 e5 2. Nf3 Nc6 3. Bb5 a6`;

const SEVEN_TAG_ROSTER_KEYS = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];

// Prepends placeholder Seven Tag Roster headers when a plain move-list has none, so the export is spec-valid PGN.
const ensureSevenTagRoster = (pgnText: string): string => {
  const trimmed = pgnText.trim();
  if (!trimmed) return trimmed;
  if (/^\s*\[[A-Za-z]+\s+"/m.test(trimmed)) return trimmed;
  const resultMatch = trimmed.match(/(1-0|0-1|1\/2-1\/2|\*)\s*$/);
  const result = resultMatch ? resultMatch[1] : '*';
  const headerBlock = SEVEN_TAG_ROSTER_KEYS
    .map((key) => `[${key} "${key === 'Date' ? '????.??.??' : key === 'Result' ? result : '?'}"]`)
    .join('\n');
  return `${headerBlock}\n\n${trimmed}`;
};

const sanitizeDownloadFileName = (name: string) => {
  const sanitized = name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim();
  return sanitized || 'game-collection';
};

export const BoardView: React.FC = () => {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [pgn, setPgn] = useState(STARTER_PGN);
  const [loadedPgn, setLoadedPgn] = useState<string | undefined>(STARTER_PGN);
  const [loadVersion, setLoadVersion] = useState(0);
  const [loadedFen, setLoadedFen] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'pgn' | 'editor'>('pgn');
  const [analysisFen, setAnalysisFen] = useState(() => new Chess().fen());
  const [engineArrows, setEngineArrows] = useState<Array<[string, string, string]>>([]);
  const [notationTarget, setNotationTarget] = useState<HTMLDivElement | null>(null);

  const [showCollectionsPanel, setShowCollectionsPanel] = useState(false);
  const [collections, setCollections] = useState<GameCollectionSummary[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [collectionActionId, setCollectionActionId] = useState<string | null>(null);

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveSubmitting, setSaveSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadGame = (event: React.FormEvent) => {
    event.preventDefault();
    setEngineArrows([]);
    setLoadedFen(undefined);
    setLoadedPgn(pgn.trim());
    setLoadVersion((version) => version + 1);
  };

  const exportPgn = () => {
    const file = new Blob([ensureSevenTagRoster(pgn)], { type: 'application/x-chess-pgn;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'chessweb-game.pgn';
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetGame = () => {
    setEngineArrows([]);
    setLoadedFen(undefined);
    setPgn('');
    setLoadedPgn('');
    setLoadVersion((version) => version + 1);
  };

  const loadPosition = (fen: string) => {
    setEngineArrows([]);
    setLoadedPgn(undefined);
    setLoadedFen(fen);
    setActiveTab('pgn');
  };

  const fetchCollections = useCallback(async () => {
    setCollectionsLoading(true);
    setCollectionsError(null);
    try {
      const response = await apiClient.get<GameCollectionSummary[]>('/gamecollections');
      setCollections(response.data);
    } catch {
      setCollectionsError(t('board.collectionsLoadError'));
    } finally {
      setCollectionsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (showCollectionsPanel && isAuthenticated) {
      fetchCollections();
    }
  }, [showCollectionsPanel, isAuthenticated, fetchCollections]);

  const handleSaveCollection = async (event: React.FormEvent) => {
    event.preventDefault();
    const games = parsePgnGames(pgn).map((game) => ({ pgn: game.pgn, label: game.label }));
    if (games.length === 0) {
      setSaveError(t('board.collectionSaveNoGames'));
      return;
    }
    setSaveSubmitting(true);
    setSaveError(null);
    try {
      await apiClient.post('/gamecollections', { name: saveName.trim(), games });
      toast.success(t('board.collectionSaved'));
      setShowSaveModal(false);
      setSaveName('');
      if (showCollectionsPanel) fetchCollections();
    } catch {
      setSaveError(t('board.collectionSaveError'));
    } finally {
      setSaveSubmitting(false);
    }
  };

  const handleLoadCollection = async (id: string) => {
    setCollectionActionId(id);
    try {
      const response = await apiClient.get<GameCollectionDetail>(`/gamecollections/${id}`);
      const combinedPgn = response.data.games
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((game) => game.pgn)
        .join('\n\n');
      setEngineArrows([]);
      setLoadedFen(undefined);
      setPgn(combinedPgn);
      setLoadedPgn(combinedPgn);
      setLoadVersion((version) => version + 1);
      setShowCollectionsPanel(false);
    } catch {
      toast.error(t('board.collectionsLoadError'));
    } finally {
      setCollectionActionId(null);
    }
  };

  const handleExportCollection = async (collection: GameCollectionSummary) => {
    setCollectionActionId(collection.id);
    try {
      const response = await apiClient.get(`/gamecollections/${collection.id}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${sanitizeDownloadFileName(collection.name)}.pgn`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('board.collectionSaveError'));
    } finally {
      setCollectionActionId(null);
    }
  };

  const handleDeleteCollection = async (id: string) => {
    if (!window.confirm(t('board.deleteCollectionConfirm'))) return;
    setCollectionActionId(id);
    try {
      await apiClient.delete(`/gamecollections/${id}`);
      setCollections((current) => current.filter((c) => c.id !== id));
    } catch {
      toast.error(t('board.collectionSaveError'));
    } finally {
      setCollectionActionId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{t('board.title')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('board.subtitle')}</p>
        </div>
        {isAuthenticated && (
          <button
            type="button"
            onClick={() => setShowCollectionsPanel((open) => !open)}
            className="flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FolderOpen className="h-4 w-4" />{t('board.myCollections')}
          </button>
        )}
      </div>

      {showCollectionsPanel && isAuthenticated && (
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-base font-bold text-slate-900 dark:text-white">{t('board.myCollections')}</h2>
          {collectionsLoading && <p className="text-xs text-slate-500 dark:text-slate-400">{t('board.loadingCollections')}</p>}
          {collectionsError && <p className="text-xs text-rose-600 dark:text-rose-400">{collectionsError}</p>}
          {!collectionsLoading && !collectionsError && collections.length === 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('board.noCollections')}</p>
          )}
          {!collectionsLoading && collections.length > 0 && (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {collections.map((collection) => (
                <li key={collection.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{collection.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('board.collectionGameCount', { count: collection.gameCount })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleLoadCollection(collection.id)}
                      disabled={collectionActionId === collection.id}
                      className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                    >
                      {t('board.loadCollection')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportCollection(collection)}
                      disabled={collectionActionId === collection.id}
                      aria-label={t('board.exportCollection')}
                      title={t('board.exportCollection')}
                      className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                    >
                      <FileDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCollection(collection.id)}
                      disabled={collectionActionId === collection.id}
                      aria-label={t('board.deleteCollection')}
                      title={t('board.deleteCollection')}
                      className="flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-600 disabled:opacity-40 dark:border-rose-900 dark:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-300 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setActiveTab('pgn')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'pgn'
                ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t('board.tabPgn')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'editor'
                ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t('board.tabPositionEditor')}
          </button>
        </div>
        {activeTab === 'editor' && (
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">{t('board.editorModeHint')}</p>
        )}
      </div>

      {/* Kept mounted (not remounted) when hidden so ChessViewer's own navigation state survives tab switches. */}
      <div className={activeTab === 'pgn' ? '' : 'hidden'}>
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
          <div className="space-y-5">
            <ChessViewer
              pgn={loadedFen ? undefined : loadedPgn}
              fen={loadedFen}
              boardWidth={720}
              arrows={engineArrows}
              onPositionChange={setAnalysisFen}
              onPgnChange={setPgn}
              notationTarget={notationTarget}
              keyboardNavigationEnabled={activeTab === 'pgn'}
              reloadToken={loadVersion}
            />
            <EnginePanel fen={analysisFen} onArrowsChange={setEngineArrows} />
          </div>

          <form onSubmit={loadGame} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">{t('board.editorTitle')}</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('board.editorHint')}</p>
              </div>
            </div>

            <textarea
              id="pgn-notation"
              value={pgn}
              onChange={(event) => setPgn(event.target.value)}
              rows={12}
              spellCheck={false}
              placeholder={t('board.placeholder')}
              className="w-full resize-y rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-900 outline-none transition focus:border-amber-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />

            <label htmlFor="pgn-notation" className="sr-only">{t('board.notationLabel')}</label>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button type="submit" className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950">{t('board.loadGame')}</button>
              <button type="button" onClick={exportPgn} disabled={!pgn.trim()} aria-label={t('board.exportPgn')} title={t('board.exportPgn')} className="flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-40 sm:max-w-[10rem]"><Download className="h-4 w-4" />{t('board.exportPgn')}</button>
              <button type="button" onClick={resetGame} aria-label={t('board.newGame')} className="flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold sm:max-w-[10rem]"><RotateCcw className="h-4 w-4" />{t('board.newGame')}</button>
            </div>
            {isAuthenticated && (
              <button
                type="button"
                onClick={() => { setSaveError(null); setSaveName(''); setShowSaveModal(true); }}
                disabled={!pgn.trim()}
                aria-label={t('board.saveAsCollection')}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
              >
                <Save className="h-4 w-4" />{t('board.saveAsCollection')}
              </button>
            )}
            {!isAuthenticated && (
              <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">{t('board.signInToSaveCollections')}</p>
            )}
            <div ref={setNotationTarget} aria-label={t('board.movesLabel')} />
          </form>
        </div>
      </div>

      <div className={activeTab === 'editor' ? '' : 'hidden'}>
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <BoardEditor onLoadPosition={loadPosition} />
        </div>
      </div>

      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm dark:bg-slate-950/80">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setShowSaveModal(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">{t('board.saveAsCollection')}</h3>
            {saveError && <p className="mb-3 text-xs text-rose-600 dark:text-rose-400">{saveError}</p>}
            <form onSubmit={handleSaveCollection} className="space-y-4">
              <div>
                <label htmlFor="collection-name" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">{t('board.collectionName')}</label>
                <input
                  id="collection-name"
                  type="text"
                  required
                  maxLength={200}
                  value={saveName}
                  onChange={(event) => setSaveName(event.target.value)}
                  placeholder={t('board.collectionNamePlaceholder')}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowSaveModal(false)} className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">{t('common.cancel')}</button>
                <button type="submit" disabled={saveSubmitting} className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 shadow transition hover:bg-amber-600 disabled:opacity-40">
                  {saveSubmitting ? t('board.savingCollection') : t('board.saveCollection')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};