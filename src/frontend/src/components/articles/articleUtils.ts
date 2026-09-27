import { validateFen } from 'chess.js';
import { apiClient } from '../../services/apiClient';
import { parsePgnGames, type ViewerGame } from '../ChessViewer';
import type { ArticleReactionType, GameCollectionGame } from '../../types';

export const REACTION_CONFIG: { type: ArticleReactionType; emoji: string; labelKey: string }[] = [
  { type: 0, emoji: '👍', labelKey: 'articles.reactionNames.like' },
  { type: 1, emoji: '❤️', labelKey: 'articles.reactionNames.love' },
  { type: 2, emoji: '♟️', labelKey: 'articles.reactionNames.brilliant' },
  { type: 3, emoji: '💡', labelKey: 'articles.reactionNames.insightful' },
  { type: 4, emoji: '🏆', labelKey: 'articles.reactionNames.masterpiece' },
];

export const FEN_GAME_KEY = 'fen';

export const isValidFen = (fen: string | null | undefined): fen is string => !!fen?.trim() && validateFen(fen.trim()).ok;

export const fenToViewerGame = (fen: string, label?: string): ViewerGame => ({
  key: FEN_GAME_KEY,
  pgn: `[SetUp "1"]\n[FEN "${fen.trim().replace(/["\\]/g, '')}"]\n\n*`,
  label,
});

// Keys match the backend: p<index> for games in pgnData, c:<id> for linked collection games.
export const buildArticleGames = (
  pgnData: string | null | undefined,
  collectionGames: GameCollectionGame[] | null | undefined,
  fenData?: string | null,
  fenLabel?: string,
): ViewerGame[] => {
  const pgnGames = parsePgnGames(pgnData ?? '').map((game, index) => ({ key: `p${index}`, pgn: game.pgn }));
  const collection = [...(collectionGames ?? [])]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((game) => ({ key: `c:${game.id}`, pgn: game.pgn, label: game.label || undefined }));
  const games = [...pgnGames, ...collection];
  if (games.length === 0 && isValidFen(fenData)) games.push(fenToViewerGame(fenData, fenLabel));
  return games;
};

export const fetchAttachmentBlob = async (attachmentId: string): Promise<Blob> => {
  const res = await apiClient.get<Blob>(`/articles/attachments/${encodeURIComponent(attachmentId)}`, { responseType: 'blob' });
  return res.data;
};

export const downloadAttachment = async (attachmentId: string, fileName: string): Promise<void> => {
  const url = URL.createObjectURL(await fetchAttachmentBlob(attachmentId));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const apiErrorMessage = (error: unknown, fallback: string): string => {
  const data = (error as { response?: { data?: { message?: unknown; errors?: unknown } } })?.response?.data;
  if (typeof data?.message === 'string' && data.message) return data.message;
  if (data && Array.isArray(data.errors)) return data.errors.join(', ');
  if (data?.errors && typeof data.errors === 'object') return Object.values(data.errors as Record<string, string[]>).flat().join(', ');
  return fallback;
};
