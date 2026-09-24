import React, { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Chess } from 'chess.js';
import { Chessboard, ChessboardDnDProvider, SparePiece } from 'react-chessboard';
import { ClipboardPaste, Eraser, Pin, RotateCcw, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';

// react-chessboard doesn't export its Square/Piece/BoardPosition types for external casting.
type BoardPositionProp = ComponentProps<typeof Chessboard>['position'];
type SparePieceCode = ComponentProps<typeof SparePiece>['piece'];

const DND_ID = 'board-editor';
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const BLACK_PALETTE: SparePieceCode[] = ['bK', 'bQ', 'bR', 'bB', 'bN', 'bP'] as SparePieceCode[];
const WHITE_PALETTE: SparePieceCode[] = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP'] as SparePieceCode[];

type EditorPosition = Record<string, string>;

const buildPositionFromFen = (fen: string): EditorPosition => {
  const placement = fen.split(' ')[0];
  const position: EditorPosition = {};
  placement.split('/').forEach((rankRow, rankIndex) => {
    let file = 0;
    for (const char of rankRow) {
      if (/\d/.test(char)) {
        file += Number(char);
        continue;
      }
      const square = `${FILES[file]}${8 - rankIndex}`;
      const color = char === char.toUpperCase() ? 'w' : 'b';
      position[square] = `${color}${char.toUpperCase()}`;
      file += 1;
    }
  });
  return position;
};

// Castling rights can't be known from a placement alone, so they're inferred from king/rook home squares.
const getCastlingRights = (position: EditorPosition): string => {
  let rights = '';
  if (position.e1 === 'wK' && position.h1 === 'wR') rights += 'K';
  if (position.e1 === 'wK' && position.a1 === 'wR') rights += 'Q';
  if (position.e8 === 'bK' && position.h8 === 'bR') rights += 'k';
  if (position.e8 === 'bK' && position.a8 === 'bR') rights += 'q';
  return rights || '-';
};

const buildFenFromPosition = (position: EditorPosition, turn: 'w' | 'b'): string => {
  const rows: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '';
    let empty = 0;
    for (const file of FILES) {
      const piece = position[`${file}${rank}`];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty) {
        row += empty;
        empty = 0;
      }
      row += piece[0] === 'w' ? piece[1] : piece[1].toLowerCase();
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join('/')} ${turn} ${getCastlingRights(position)} - 0 1`;
};

const START_POSITION = buildPositionFromFen(new Chess().fen());

const getPieceLabel = (piece: string, t: (key: string, options?: Record<string, unknown>) => string): string => {
  const color = piece[0] === 'w' ? t('board.whiteToMove') : t('board.blackToMove');
  const names = t('board.pieceNames', { returnObjects: true }) as unknown as Record<string, string>;
  return `${color} ${names[piece[1]] ?? piece[1]}`;
};

interface BoardEditorProps {
  onLoadPosition: (fen: string) => void;
}

export const BoardEditor: React.FC<BoardEditorProps> = ({ onLoadPosition }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [position, setPosition] = useState<EditorPosition>(START_POSITION);
  const [turn, setTurn] = useState<'w' | 'b'>('w');
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [error, setError] = useState<string | null>(null);
  const [armedPiece, setArmedPiece] = useState<SparePieceCode | null>(null);
  const [stickyArmed, setStickyArmed] = useState(false);
  const [fenInput, setFenInput] = useState('');
  const [fenError, setFenError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(280);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => setBoardWidth(Math.max(0, container.clientWidth - 2));
    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!armedPiece) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setArmedPiece(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [armedPiece]);

  const spareWidth = Math.max(24, Math.floor(boardWidth / 8));

  const armPiece = (piece: SparePieceCode, modifiers: { shiftKey: boolean; ctrlKey: boolean }) => {
    setArmedPiece((previous) => {
      if (previous === piece) return null;
      setStickyArmed(modifiers.shiftKey || modifiers.ctrlKey);
      return piece;
    });
  };

  const onSparePieceDrop = (piece: string, targetSquare: string): boolean => {
    setPosition((previous) => ({ ...previous, [targetSquare]: piece }));
    setError(null);
    return true;
  };

  const onPieceDrop = (sourceSquare: string, targetSquare: string, piece: string): boolean => {
    if (sourceSquare === targetSquare) return true;
    setPosition((previous) => {
      const next = { ...previous };
      delete next[sourceSquare];
      next[targetSquare] = piece;
      return next;
    });
    setError(null);
    return true;
  };

  const onPieceDropOffBoard = (sourceSquare: string) => {
    setPosition((previous) => {
      const next = { ...previous };
      delete next[sourceSquare];
      return next;
    });
    setError(null);
  };

  const onSquareClick = (square: string, piece?: string) => {
    // An empty square while a palette piece is armed places it there. Clicking an occupied square
    // always removes the piece on it instead of overwriting — even while armed, so a piece is
    // never silently replaced; the armed piece then stays armed (or "-selected" in sticky mode)
    // for the user to click an empty square afterwards.
    if (armedPiece && !piece) {
      setPosition((previous) => ({ ...previous, [square]: armedPiece }));
      setError(null);
      if (!stickyArmed) setArmedPiece(null);
      return;
    }
    if (!piece) return;
    setPosition((previous) => {
      const next = { ...previous };
      delete next[square];
      return next;
    });
    setError(null);
  };

  const clearBoard = () => {
    setPosition({});
    setArmedPiece(null);
    setError(null);
  };

  const resetToStart = () => {
    setPosition(START_POSITION);
    setTurn('w');
    setArmedPiece(null);
    setError(null);
  };

  const importFen = () => {
    const trimmed = fenInput.trim();
    if (!trimmed) return;
    try {
      const chess = new Chess(trimmed);
      setPosition(buildPositionFromFen(chess.fen()));
      setTurn(chess.turn() as 'w' | 'b');
      setArmedPiece(null);
      setError(null);
      setFenError(null);
    } catch {
      setFenError(t('board.invalidFenImport'));
    }
  };

  const loadPosition = () => {
    const kingCounts = { w: 0, b: 0 };
    Object.values(position).forEach((piece) => {
      if (piece[1] === 'K') kingCounts[piece[0] as 'w' | 'b'] += 1;
    });
    if (kingCounts.w !== 1 || kingCounts.b !== 1) {
      setError(t('board.invalidPositionMissingKing'));
      return;
    }

    const fen = buildFenFromPosition(position, turn);
    try {
      new Chess(fen);
    } catch {
      setError(t('board.invalidPosition'));
      return;
    }

    setError(null);
    onLoadPosition(fen);
  };

  const blackPalette = useMemo(() => (orientation === 'white' ? BLACK_PALETTE : WHITE_PALETTE), [orientation]);
  const whitePalette = useMemo(() => (orientation === 'white' ? WHITE_PALETTE : BLACK_PALETTE), [orientation]);

  return (
    <ChessboardDnDProvider>
      <div className="space-y-3">
        <div className="flex gap-1.5">
          <input
            type="text"
            value={fenInput}
            onChange={(event) => {
              setFenInput(event.target.value);
              setFenError(null);
            }}
            placeholder={t('board.fenPlaceholder')}
            spellCheck={false}
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] font-mono text-slate-900 outline-none transition focus:border-amber-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
          <button
            type="button"
            onClick={importFen}
            className="flex items-center gap-1 shrink-0 text-[11px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-md font-medium border border-slate-300 dark:border-slate-700 transition"
          >
            <ClipboardPaste className="w-3 h-3" />
            {t('board.importFen')}
          </button>
        </div>
        {fenError && <p className="text-[11px] font-semibold text-rose-500 text-center">{fenError}</p>}

        <div className="flex justify-center gap-1">
          {blackPalette.map((piece) => (
            <div
              key={piece}
              role="button"
              tabIndex={0}
              onClick={(event) => armPiece(piece, event)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') armPiece(piece, event);
              }}
              aria-pressed={armedPiece === piece}
              title={armedPiece === piece ? t('board.cancelPlacement') : t('board.armPieceHint')}
              className={`relative rounded-md p-0.5 transition ${
                armedPiece === piece ? 'ring-2 ring-sky-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900' : ''
              }`}
            >
              <SparePiece piece={piece} width={spareWidth} dndId={DND_ID} />
              {armedPiece === piece && stickyArmed && <Pin className="absolute -top-1 -right-1 h-3 w-3 text-sky-500" />}
            </div>
          ))}
        </div>

        <div ref={containerRef} className="w-full flex justify-center overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <Chessboard
            id={DND_ID}
            position={position as BoardPositionProp}
            boardWidth={boardWidth}
            boardOrientation={orientation}
            arePiecesDraggable={true}
            areArrowsAllowed={false}
            dropOffBoardAction="trash"
            onPieceDrop={onPieceDrop}
            onSparePieceDrop={onSparePieceDrop}
            onPieceDropOffBoard={onPieceDropOffBoard}
            onSquareClick={onSquareClick}
            customDarkSquareStyle={{ backgroundColor: theme === 'dark' ? '#475569' : '#b58863' }}
            customLightSquareStyle={{ backgroundColor: theme === 'dark' ? '#cbd5e1' : '#f0d9b5' }}
            customBoardStyle={{ borderRadius: '8px' }}
          />
        </div>

        <div className="flex justify-center gap-1">
          {whitePalette.map((piece) => (
            <div
              key={piece}
              role="button"
              tabIndex={0}
              onClick={(event) => armPiece(piece, event)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') armPiece(piece, event);
              }}
              aria-pressed={armedPiece === piece}
              title={armedPiece === piece ? t('board.cancelPlacement') : t('board.armPieceHint')}
              className={`relative rounded-md p-0.5 transition ${
                armedPiece === piece ? 'ring-2 ring-sky-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900' : ''
              }`}
            >
              <SparePiece piece={piece} width={spareWidth} dndId={DND_ID} />
              {armedPiece === piece && stickyArmed && <Pin className="absolute -top-1 -right-1 h-3 w-3 text-sky-500" />}
            </div>
          ))}
        </div>

        {armedPiece && (
          <div className="flex items-center justify-center gap-2 text-[11px] text-sky-700 dark:text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-md px-2 py-1">
            <span>
              {t('board.placingPiece', { piece: getPieceLabel(armedPiece, t) })}
              {stickyArmed ? ` \u2013 ${t('board.stickyModeOn')}` : ''}
            </span>
            <button type="button" onClick={() => setArmedPiece(null)} className="font-semibold underline underline-offset-2">
              {t('board.cancelPlacement')}
            </button>
          </div>
        )}

        <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center">{t('board.editorDragHint')}</p>

        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={resetToStart}
            className="flex items-center gap-1 text-[11px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-md font-medium border border-slate-300 dark:border-slate-700 transition"
          >
            <RotateCcw className="w-3 h-3" />
            {t('chessboard.startPosition')}
          </button>
          <button
            type="button"
            onClick={clearBoard}
            className="flex items-center gap-1 text-[11px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-md font-medium border border-slate-300 dark:border-slate-700 transition"
          >
            <Eraser className="w-3 h-3" />
            {t('board.clearBoard')}
          </button>
          <button
            type="button"
            onClick={() => setOrientation((previous) => (previous === 'white' ? 'black' : 'white'))}
            className="text-[11px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-md font-medium border border-slate-300 dark:border-slate-700 transition"
          >
            {t('chessboard.flip')} ({orientation})
          </button>
        </div>

        <div className="flex items-center justify-center gap-2">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">{t('board.sideToMove')}</span>
          <div className="flex gap-1" role="group" aria-label={t('board.sideToMove')}>
            <button
              type="button"
              onClick={() => setTurn('w')}
              aria-pressed={turn === 'w'}
              className={`text-[11px] px-2 py-1 rounded-md font-semibold transition ${
                turn === 'w' ? 'bg-amber-500 text-slate-950' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              {t('board.whiteToMove')}
            </button>
            <button
              type="button"
              onClick={() => setTurn('b')}
              aria-pressed={turn === 'b'}
              className={`text-[11px] px-2 py-1 rounded-md font-semibold transition ${
                turn === 'b' ? 'bg-amber-500 text-slate-950' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              {t('board.blackToMove')}
            </button>
          </div>
        </div>

        {error && <p className="text-[11px] font-semibold text-rose-500 text-center">{error}</p>}

        <button
          type="button"
          onClick={loadPosition}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-600"
        >
          <Upload className="h-4 w-4" />
          {t('board.loadPosition')}
        </button>
      </div>
    </ChessboardDnDProvider>
  );
};
