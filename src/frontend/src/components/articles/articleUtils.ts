import { validateFen } from 'chess.js';
import { apiClient } from '../../services/apiClient';
import { formatMoveNumber, parsePgnGames, type ViewerGame } from '../ChessViewer';
import type { ArticleReactionType, GameCollectionGame } from '../../types';
import { addTreeMove, nodeAt, parsePgnTree, replacePgnChunk, serializePgnTree, splitPgnChunks, type BranchMove } from '../../chess/pgnTree';

export const REACTION_CONFIG: { type: ArticleReactionType; emoji: string; labelKey: string }[] = [
  { type: 0, emoji: '👍', labelKey: 'articles.reactionNames.like' },
  { type: 1, emoji: '❤️', labelKey: 'articles.reactionNames.love' },
  { type: 2, emoji: '♟️', labelKey: 'articles.reactionNames.brilliant' },
  { type: 3, emoji: '💡', labelKey: 'articles.reactionNames.insightful' },
  { type: 4, emoji: '🏆', labelKey: 'articles.reactionNames.masterpiece' },
];

export const FEN_GAME_KEY = 'fen';

export const isValidFen = (fen: string | null | undefined): fen is string => !!fen?.trim() && validateFen(fen.trim()).ok;

const fenSetupHeaders = (fen: string) => `[SetUp "1"]\n[FEN "${fen.trim().replace(/["\\]/g, '')}"]`;

export const fenToViewerGame = (fen: string, label?: string): ViewerGame => ({
  key: FEN_GAME_KEY,
  pgn: `${fenSetupHeaders(fen)}\n\n*`,
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

const PGN_GAME_KEY = /^p(\d+)$/;

export const isPgnGameKey = (gameKey: string | undefined) => !!gameKey && PGN_GAME_KEY.test(gameKey);

// Board moves can extend games from the PGN field, or start the PGN from an empty board or the FEN position.
export const canRecordMoveInto = (gameKey: string | undefined, pgnText: string) =>
  isPgnGameKey(gameKey) || ((gameKey === undefined || gameKey === FEN_GAME_KEY) && !pgnText.trim());

const sameMoves = (a: string[], b: string[]) => a.length === b.length && a.every((move, index) => move === b[index]);

// Appends `san` as move `ply` of the gameIndex-th valid game in pgnText, leaving everything else untouched.
export const appendMoveToPgn = (pgnText: string, gameIndex: number, san: string, ply: number): string | null => {
  const games = parsePgnGames(pgnText);
  const game = games[gameIndex];
  if (!game || game.history.length !== ply - 1) return null;

  let start = -1;
  let searchFrom = 0;
  for (let index = 0; index <= gameIndex; index += 1) {
    start = pgnText.indexOf(games[index].pgn, searchFrom);
    if (start < 0) return null;
    searchFrom = start + games[index].pgn.length;
  }

  const chunk = game.pgn;
  const trailing = chunk.match(/\s*$/)?.[0] ?? '';
  const resultMatch = chunk.trimEnd().match(/(1-0|0-1|1\/2-1\/2|\*)$/);
  const result = resultMatch?.[1] ?? '*';
  const body = (resultMatch ? chunk.trimEnd().slice(0, resultMatch.index) : chunk).trimEnd();
  const moveNumber = formatMoveNumber(game.history.length + 1, game.startFen);
  const lastChar = body.slice(-1);
  const needsNumber = !moveNumber.endsWith('...') || game.history.length === 0 || lastChar === '}' || lastChar === ')';
  const token = needsNumber ? `${moveNumber} ${san}` : san;
  const lastLine = body.slice(body.lastIndexOf('\n') + 1);
  const separator = !body ? '' : game.history.length === 0 && lastChar === ']' ? '\n\n' : lastLine.includes(';') ? '\n' : ' ';
  const updatedChunk = `${body}${separator}${token} ${result}${trailing}`;
  const updated = `${pgnText.slice(0, start)}${updatedChunk}${pgnText.slice(start + chunk.length)}`;

  const reparsed = parsePgnGames(updated);
  return reparsed.length === games.length && sameMoves(reparsed[gameIndex].history, [...game.history, san]) ? updated : null;
};

// Records a board move in the article PGN: extends a PGN game, or starts one from the shown position.
export const recordMoveInPgn = (pgnText: string, gameKey: string | undefined, san: string, ply: number, startFen?: string): string | null => {
  if (!canRecordMoveInto(gameKey, pgnText)) return null;
  const pgnGameIndex = gameKey?.match(PGN_GAME_KEY)?.[1];
  if (pgnGameIndex !== undefined) return appendMoveToPgn(pgnText, Number(pgnGameIndex), san, ply);
  if (ply !== 1) return null;

  const created = `${startFen ? `${fenSetupHeaders(startFen)}\n\n` : ''}${formatMoveNumber(1, startFen)} ${san} *`;
  return sameMoves(parsePgnGames(created)[0]?.history ?? [], [san]) ? created : null;
};

export const recordBranchInPgn = (pgnText: string, move: BranchMove, maxLength = 15000): string | null => {
  if (!canRecordMoveInto(move.gameKey, pgnText)) return null;
  try {
    const sourceTree = parsePgnTree(move.expectedSource);
    if (nodeAt(sourceTree, move.parentPath)?.fen !== move.expectedParentFen) return null;
    const addition = addTreeMove(sourceTree, move.parentPath, move.san);
    if (!addition.added || JSON.stringify(addition.nodePath) !== JSON.stringify(move.nodePath)
      || serializePgnTree(addition.tree) !== move.pgn) return null;
    const gameIndex = Number(move.gameKey?.match(PGN_GAME_KEY)?.[1] ?? 0);
    let updated: string | null;
    if (pgnText.trim()) updated = replacePgnChunk(pgnText, gameIndex, move.expectedSource, move.pgn);
    else {
      if (gameIndex !== 0 || move.parentPath.length || sourceTree.root.children.length) return null;
      updated = move.pgn;
    }
    return updated !== null && updated.length <= maxLength ? updated : null;
  } catch { return null; }
};

export const isSupportedPgn = (pgn: string): boolean => {
  try { splitPgnChunks(pgn).forEach((chunk) => parsePgnTree(chunk.pgn)); return true; }
  catch { return false; }
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
