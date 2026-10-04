import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoveLabel } from '../../ChessViewer';
import type { PieceLetters } from '../../../chessNotation';
import { useArticleBoard } from './ArticleBoardContext';

interface MoveChipProps {
  gameKey: string;
  ply: number;
  san?: string;
}

export const MoveChip: React.FC<MoveChipProps> = ({ gameKey, ply, san }) => {
  const { t, i18n } = useTranslation();
  const { gameInfo, jumpTo } = useArticleBoard();
  const pieceLetters = useMemo(
    () => t('board.pieceLetters', { returnObjects: true }) as PieceLetters,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n.language, t],
  );
  const game = gameInfo[gameKey];
  const available = !!game && ply >= 0 && ply <= game.history.length;
  const moveSan = san || (game && ply > 0 ? game.history[ply - 1] : undefined);
  const label = ply > 0 && moveSan
    ? formatMoveLabel(ply, moveSan, pieceLetters, game?.startFen)
    : t('articles.startPositionChip');

  const base = 'mx-0.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 align-baseline font-mono text-[0.85em] font-semibold leading-tight';
  if (!available) {
    return (
      <button
        type="button"
        disabled
        title={t('articles.moveUnavailable')}
        aria-label={`${label}. ${t('articles.moveUnavailable')}`}
        className={`${base} cursor-not-allowed border-slate-300 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500`}
      >
        ♟ {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => jumpTo(gameKey, ply)}
      aria-label={t('articles.jumpToMove', { move: label })}
      title={t('articles.jumpToMove', { move: label })}
      className={`${base} border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300`}
    >
      ♟ {label}
    </button>
  );
};
