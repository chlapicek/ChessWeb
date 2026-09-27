import React, { useId, useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Chess } from 'chess.js';
import { Chessboard, type ChessboardOptions } from 'react-chessboard';
import { ChevronLeft, ChevronRight, RotateCcw, FastForward, MessageCircle, Sparkles, RefreshCw } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { localizeSan, type PieceLetters } from '../chessNotation';

export type ViewerGame = { key: string; pgn: string; label?: string };

export type ViewerTarget = { gameKey: string; ply: number; nonce: number };

export type ChessViewerState = {
  gameKey: string;
  ply: number;
  san?: string;
  fen: string;
  moveNumberLabel?: string;
  isAnalyzing: boolean;
};

interface ChessViewerProps {
  pgn?: string;
  fen?: string;
  games?: ViewerGame[];
  target?: ViewerTarget;
  onStateChange?: (state: ChessViewerState) => void;
  mode?: 'edit' | 'analysis';
  hideGameSelector?: boolean;
  boardWidth?: number;
  arrows?: Array<[string, string, string?]>;
  onPositionChange?: (fen: string) => void;
  onPgnChange?: (pgn: string) => void;
  notationTarget?: HTMLElement | null;
  keyboardNavigationEnabled?: boolean;
  reloadToken?: number;
}

interface ParsedGame {
  pgn: string;
  history: string[];
  startFen?: string;
  label?: string;
  headers: Record<string, string>;
  annotations: Record<number, string[]>;
}

type KeyedGame = ParsedGame & { key: string };

const EMPTY_HISTORY: string[] = [];

// Returns "12." for a White move or "12..." for a Black move; ply 1 is the first half-move played.
export const formatMoveNumber = (ply: number, startFen?: string): string => {
  const fields = startFen?.trim().split(/\s+/) ?? [];
  const offset = fields[1] === 'b' ? 1 : 0;
  const halfMoveIndex = ply - 1 + offset;
  const moveNumber = (Number(fields[5]) || 1) + Math.floor(halfMoveIndex / 2);
  return halfMoveIndex % 2 === 0 ? `${moveNumber}.` : `${moveNumber}...`;
};

export const formatMoveLabel = (ply: number, san: string, pieceLetters?: PieceLetters, startFen?: string): string =>
  `${formatMoveNumber(ply, startFen)} ${pieceLetters ? localizeSan(san, pieceLetters) : san}`;

const splitPgnGames = (pgn: string): string[] => {
  const games: string[] = [];
  const lines: string[] = [];
  let inComment = false;
  const hasMoves = () => lines.some((line) => /^\s*\d+\.(?:\.\.)?/.test(line) || /(?:1-0|0-1|1\/2-1\/2|\*)\s*$/.test(line));
  for (const line of pgn.split(/\r?\n/)) {
    const trimmed = line.trimStart();
    if (!inComment && /^\[[^\s]+\s/.test(trimmed) && hasMoves()) {
      games.push(lines.join('\n'));
      lines.length = 0;
    }
    lines.push(line);
    for (const character of line) {
      if (character === '{') inComment = true;
      if (character === '}') inComment = false;
      if (!inComment && character === ';') break;
    }
  }
  if (lines.some((line) => line.trim())) games.push(lines.join('\n'));
  return games;
};

const stripLeadingComments = (pgn: string) => pgn.trimStart().replace(/^(?:;[^\r\n]*(?:\r?\n|$)|\{[\s\S]*?\}\s*)+/, '').trimStart();

const stripAnnotationsAndVariations = (pgn: string, preserveComments = false): string => {
  let result = '';
  let commentDepth = 0;
  let variationDepth = 0;
  let lineComment = false;
  for (let index = 0; index < pgn.length; index += 1) {
    const character = pgn[index];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (commentDepth > 0) {
      if (preserveComments) result += character;
      if (character === '{') commentDepth += 1;
      if (character === '}') commentDepth -= 1;
      continue;
    }
    if (variationDepth > 0) {
      if (character === '{') commentDepth = 1;
      if (character === '(') variationDepth += 1;
      if (character === ')') variationDepth -= 1;
      continue;
    }
    if (character === '{') {
      commentDepth = 1;
      if (preserveComments) result += character;
    } else if (character === '(') variationDepth = 1;
    else if (character === ';') lineComment = true;
    else if (character === '$') {
      result += ' ';
      while (index + 1 < pgn.length && /\d/.test(pgn[index + 1])) index += 1;
    } else result += character;
  }
  return result;
};

const rawHeaders = (pgn: string) => Object.fromEntries(
  [...pgn.matchAll(/^\s*\[([^\s]+)\s+"((?:\\.|[^"\\])*)"\]\s*$/gm)].map(([, key, value]) => [key, value.replace(/\\"/g, '"').replace(/\\\\/g, '\\')])
);

export const formatAnnotationText = (annotation: string): string => annotation.replace(/\[%eval\s+([^\]]+)\]/g, (directive, rawValue: string) => {
  const value = rawValue.trim();
  const mate = value.match(/^#(-?\d+)$/);
  if (mate) return `${mate[1].startsWith('-') ? '-' : ''}M${Math.abs(Number(mate[1]))}`;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return directive;
  const normalizedValue = numericValue.toString();
  return numericValue > 0 ? `+${normalizedValue}` : normalizedValue;
});

export const buildPgnWithAnnotations = (game: Chess, history: string[], annotations: Record<number, string[]>): string => {
  const generatedPgn = game.pgn();
  const separatorIndex = generatedPgn.indexOf('\n\n');
  const headerBlock = separatorIndex >= 0 ? generatedPgn.slice(0, separatorIndex) : '';
  const result = game.getHeaders().Result || '*';
  const moveText = history.map((move, index) => {
    const movePrefix = index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : '';
    const comments = (annotations[index] ?? []).map((comment) => `{ ${comment} }`).join(' ');
    return `${movePrefix}${move}${comments ? ` ${comments}` : ''}`;
  }).join(' ');

  return `${headerBlock}${headerBlock ? '\n\n' : ''}${moveText || ''}${moveText ? ` ${result}` : result}`;
};

const extractMainlineAnnotations = (pgn: string, startFen: string | undefined): Record<number, string[]> => {
  const annotations: Record<number, string[]> = {};
  let variationDepth = 0;
  let commentStart = -1;

  for (let index = 0; index < pgn.length; index += 1) {
    const character = pgn[index];
    if (commentStart >= 0) {
      if (character !== '}') continue;
      const comment = pgn.slice(commentStart + 1, index).trim();
      const prefix = stripAnnotationsAndVariations(pgn.slice(0, commentStart));
      const prefixGame = new Chess();
      try {
        if (startFen) prefixGame.load(startFen);
        try { prefixGame.loadPgn(`${prefix}\n*`); } catch { prefixGame.loadPgn(`${prefix} *`); }
        const moveIndex = prefixGame.history().length - 1;
        if (moveIndex >= 0 && comment) annotations[moveIndex] = [...(annotations[moveIndex] ?? []), comment];
      } catch {
        // The main parser still provides the playable line when a prefix is incomplete.
      }
      commentStart = -1;
      continue;
    }
    if (variationDepth > 0) {
      if (character === '(') variationDepth += 1;
      else if (character === ')') variationDepth -= 1;
      else if (character === '{') {
        let commentDepth = 1;
        while (commentDepth > 0 && index + 1 < pgn.length) {
          index += 1;
          if (pgn[index] === '{') commentDepth += 1;
          if (pgn[index] === '}') commentDepth -= 1;
        }
      }
    } else if (character === '{') commentStart = index;
    else if (character === '(') variationDepth = 1;
  }

  return annotations;
};

export const parsePgnGames = (pgn: string): ParsedGame[] => {
  if (!pgn.trim()) return [];
  return splitPgnGames(pgn.trim()).flatMap((gamePgn) => {
    try {
      const game = new Chess();
      const originalHeaders = rawHeaders(gamePgn);
      try { game.loadPgn(stripLeadingComments(gamePgn)); }
      catch { try { game.loadPgn(stripAnnotationsAndVariations(stripLeadingComments(gamePgn), true)); } catch { game.loadPgn(stripAnnotationsAndVariations(stripLeadingComments(gamePgn))); } }
      const headers = { ...originalHeaders, ...game.getHeaders() };
      const history = game.history();
      const replay = new Chess();
      if (headers.FEN) replay.load(headers.FEN);
      const positions: string[] = [];
      history.forEach((move, index) => { replay.move(move); positions[index] = replay.fen(); });
      const annotations: Record<number, string[]> = {};
      game.getComments().forEach(({ fen, comment }) => {
        const index = positions.indexOf(fen);
        const normalizedComment = comment.trim();
        if (index >= 0 && normalizedComment && !annotations[index]?.includes(normalizedComment)) {
          annotations[index] = [...(annotations[index] ?? []), normalizedComment];
        }
      });
      const rawAnnotations = extractMainlineAnnotations(gamePgn, headers.FEN);
      Object.entries(rawAnnotations).forEach(([index, notes]) => {
        const moveIndex = Number(index);
        const existing = annotations[moveIndex] ?? [];
        annotations[moveIndex] = [...existing, ...notes.filter((note) => !existing.includes(note))];
      });
      const label = [headers.White, headers.Black].filter(Boolean).join(' - ') || undefined;
      return [{ pgn: gamePgn, history, startFen: headers.FEN, label, headers, annotations }];
    } catch (error) {
      console.error('Invalid PGN game provided:', error);
      return [];
    }
  });
};

const buildViewerGames = (viewerGames: ViewerGame[] | undefined, pgn: string | undefined, fen: string | undefined): KeyedGame[] => {
  if (viewerGames) {
    return viewerGames.flatMap(({ key, pgn: gamePgn, label }) => {
      const [parsed] = parsePgnGames(gamePgn);
      return parsed ? [{ ...parsed, key, label: label ?? parsed.label }] : [];
    });
  }
  if (fen) return [{ key: 'fen', pgn: '', history: [], startFen: fen, headers: {}, annotations: {} }];
  return parsePgnGames(pgn ?? '').map((game, index) => ({ ...game, key: `p${index}` }));
};

export const ChessViewer: React.FC<ChessViewerProps> = ({
  pgn,
  fen,
  games: viewerGames,
  target,
  onStateChange,
  mode = 'edit',
  hideGameSelector = false,
  boardWidth = 360,
  arrows,
  onPositionChange,
  onPgnChange,
  notationTarget,
  keyboardNavigationEnabled = true,
  reloadToken = 0,
}) => {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const pieceLetters = useMemo(
    () => t('board.pieceLetters', { returnObjects: true }) as Record<string, string>,
    [i18n.language, t],
  );
  const gameSelectId = useId();
  // react-chessboard needs a unique id per mounted board for drag and drop to target the right one.
  const boardId = `chessviewer-${gameSelectId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const viewerGamesSignature = viewerGames ? JSON.stringify(viewerGames.map(({ key, pgn: gamePgn, label }) => [key, gamePgn, label ?? null])) : null;
  const sourceSignature = JSON.stringify([viewerGamesSignature, pgn ?? null, fen ?? null, reloadToken]);
  const [games, setGames] = useState<KeyedGame[]>(() => buildViewerGames(viewerGames, pgn, fen));
  const [activeGame, setActiveGame] = useState(0);
  const [currentMoveIndex, setCurrentMoveIndex] = useState<number>(-1);
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [customMoves, setCustomMoves] = useState<string[]>([]);
  const skipReset = useRef(false);
  const pendingPly = useRef<number | null>(null);
  const loadedSource = useRef(sourceSignature);
  const awaitingGames = useRef(false);
  const appliedTargetNonce = useRef<number | null>(null);
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [responsiveBoardWidth, setResponsiveBoardWidth] = useState(boardWidth);

  const selectedGame = games[activeGame];
  const history = selectedGame?.history ?? EMPTY_HISTORY;

  useEffect(() => {
    const container = boardContainerRef.current;
    if (!container) return;

    const updateBoardWidth = () => {
      const availableWidth = Math.max(0, container.clientWidth - 2);
      setResponsiveBoardWidth(Math.min(boardWidth, availableWidth));
    };

    updateBoardWidth();
    const resizeObserver = new ResizeObserver(updateBoardWidth);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [boardWidth]);

  useEffect(() => {
    if (loadedSource.current === sourceSignature) return;
    loadedSource.current = sourceSignature;
    awaitingGames.current = true;
    const nextGames = buildViewerGames(viewerGames, pgn, fen);
    const activeKey = games[activeGame]?.key;
    setGames(nextGames);
    setActiveGame(viewerGames ? Math.max(0, nextGames.findIndex((item) => item.key === activeKey)) : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSignature]);

  useEffect(() => {
    awaitingGames.current = false;
    if (skipReset.current) { skipReset.current = false; return; }
    const ply = pendingPly.current;
    pendingPly.current = null;
    const length = games[activeGame]?.history.length ?? 0;
    setCurrentMoveIndex(ply === null ? -1 : Math.min(Math.max(ply, 0), length) - 1);
    setIsAnalyzing(false);
    setCustomMoves([]);
  }, [games, activeGame]);

  const goToMove = (index: number) => {
    setIsAnalyzing(false);
    setCustomMoves([]);
    setCurrentMoveIndex(Math.max(-1, Math.min(index, history.length - 1)));
  };

  useEffect(() => {
    if (!target || awaitingGames.current || appliedTargetNonce.current === target.nonce) return;
    const index = games.findIndex((item) => item.key === target.gameKey);
    if (index < 0) return;
    appliedTargetNonce.current = target.nonce;
    if (index === activeGame) {
      goToMove(Math.max(0, target.ply) - 1);
    } else {
      pendingPly.current = target.ply;
      setActiveGame(index);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.nonce, target?.gameKey, target?.ply, games, activeGame]);

  const position = useMemo(() => {
    const board = new Chess();
    try {
      if (selectedGame?.startFen) board.load(selectedGame.startFen);
      const moves = [...history.slice(0, currentMoveIndex + 1), ...(isAnalyzing ? customMoves : [])];
      for (const move of moves) board.move(move);
    } catch {
      // Invalid FEN or move: show the last valid position.
    }
    return board;
  }, [selectedGame, history, currentMoveIndex, isAnalyzing, customMoves]);
  const positionFen = position.fen();

  useEffect(() => {
    onPositionChange?.(positionFen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionFen]);

  const activeKey = selectedGame?.key;
  const currentSan = currentMoveIndex >= 0 ? history[currentMoveIndex] : undefined;
  useEffect(() => {
    if (!activeKey) return;
    const ply = currentMoveIndex + 1;
    onStateChangeRef.current?.({
      gameKey: activeKey,
      ply,
      san: currentSan,
      fen: positionFen,
      moveNumberLabel: ply > 0 ? formatMoveNumber(ply, selectedGame?.startFen) : undefined,
      isAnalyzing,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, currentMoveIndex, currentSan, positionFen, isAnalyzing]);

  const handleFirst = () => goToMove(-1);
  const handlePrev = () => {
    if (isAnalyzing) {
      goToMove(currentMoveIndex);
      return;
    }
    if (currentMoveIndex > -1) {
      goToMove(currentMoveIndex - 1);
    }
  };
  const handleNext = () => {
    if (isAnalyzing) {
      goToMove(currentMoveIndex);
      return;
    }
    if (currentMoveIndex < history.length - 1) {
      goToMove(currentMoveIndex + 1);
    }
  };
  const handleLast = () => goToMove(history.length - 1);

  useEffect(() => {
    if (!keyboardNavigationEnabled) return;

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('a[href], button, input, textarea, select, [role="link"], [role="button"], [contenteditable="true"]')) return;

      const canMove = event.key === 'ArrowLeft'
        ? currentMoveIndex > -1 || isAnalyzing
        : event.key === 'ArrowRight'
          ? currentMoveIndex < history.length - 1 || isAnalyzing
          : event.key === 'ArrowUp'
            ? currentMoveIndex !== -1 || isAnalyzing
            : event.key === 'ArrowDown' && (history.length > 0 && (currentMoveIndex !== history.length - 1 || isAnalyzing));
      if (!canMove) return;

      event.preventDefault();
      if (event.key === 'ArrowLeft') handlePrev();
      else if (event.key === 'ArrowRight') handleNext();
      else if (event.key === 'ArrowUp') handleFirst();
      else handleLast();
    };

    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => document.removeEventListener('keydown', handleDocumentKeyDown);
  }, [currentMoveIndex, handleFirst, handleLast, handleNext, handlePrev, history.length, isAnalyzing, keyboardNavigationEnabled]);

  const onPieceDrop: NonNullable<ChessboardOptions['onPieceDrop']> = ({ sourceSquare, targetSquare }) => {
    if (!targetSquare) return false;
    if (mode === 'analysis') {
      try {
        const board = new Chess(positionFen);
        const move = board.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
        if (!move) return false;
        setCustomMoves((moves) => [...(isAnalyzing ? moves : []), move.san]);
        setIsAnalyzing(true);
        return true;
      } catch {
        return false;
      }
    }
    try {
      const selected = games[activeGame];
      const gameCopy = new Chess();
      if (selected?.startFen) gameCopy.load(selected.startFen);
      for (let index = 0; index <= currentMoveIndex; index += 1) if (history[index]) gameCopy.move(history[index]);
      const move = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      });

      if (!move) {
        return false;
      }

      const updatedHistory = [...history.slice(0, currentMoveIndex + 1), move.san];
      Object.entries(selected?.headers ?? {}).forEach(([key, value]) => gameCopy.setHeader(key, value));
      if (selected?.startFen) {
        gameCopy.setHeader('SetUp', '1');
        gameCopy.setHeader('FEN', selected.startFen);
      }
      const retainedAnnotations = Object.fromEntries(
        Object.entries(selected?.annotations ?? {}).filter(([index]) => Number(index) < updatedHistory.length && Number(index) <= currentMoveIndex)
      );
      const updatedGames = games.map((item, index) => index === activeGame
        ? { ...item, pgn: buildPgnWithAnnotations(gameCopy, updatedHistory, retainedAnnotations), history: updatedHistory, annotations: retainedAnnotations }
        : item);
      skipReset.current = true;
      setGames(updatedGames);
      setCurrentMoveIndex(updatedHistory.length - 1);
      setIsAnalyzing(false);
      setCustomMoves([]);
      onPgnChange?.(updatedGames.map((item) => item.pgn).filter(Boolean).join('\n\n'));
      return true;
    } catch {
      return false;
    }
  };

  const resumeGameLine = () => {
    goToMove(currentMoveIndex);
  };

  const selectedAnnotations = games[activeGame]?.annotations ?? {};
  const annotationCount = Object.values(selectedAnnotations).reduce((count, notes) => count + notes.length, 0);
  const inlineNotation = !notationTarget;
  const atStart = currentMoveIndex === -1 && !isAnalyzing;
  const atEnd = currentMoveIndex === history.length - 1 && !isAnalyzing;
  const renderNavigation = (variant: 'compact' | 'touch', visibilityClass: string) => {
    const buttonClass = variant === 'touch'
      ? 'flex h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 disabled:opacity-40 dark:border-slate-700'
      : 'p-2 rounded-lg border border-slate-300 bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800';
    const chevronClass = variant === 'touch' ? 'w-5 h-5' : 'w-4 h-4';
    return (
      <div role="toolbar" aria-label={t('chessboard.moveNavigation')} className={`${visibilityClass} mt-3 w-full flex-nowrap items-center justify-center gap-1.5 sm:gap-2`}>
        <button type="button" onClick={handleFirst} aria-label={t('chessboard.startPosition')} disabled={atStart} className={buttonClass} title={t('chessboard.startPosition')}><RotateCcw className="w-4 h-4" /></button>
        <button type="button" onClick={handlePrev} aria-label={t('chessboard.prevMove')} disabled={atStart} className={buttonClass} title={t('chessboard.prevMove')}><ChevronLeft className={chevronClass} /></button>
        <span className="min-w-16 whitespace-nowrap px-2 text-center text-xs font-mono">{currentMoveIndex + 1} / {history.length}</span>
        <button type="button" onClick={handleNext} aria-label={t('chessboard.nextMove')} disabled={atEnd} className={buttonClass} title={t('chessboard.nextMove')}><ChevronRight className={chevronClass} /></button>
        <button type="button" onClick={handleLast} aria-label={t('chessboard.endGame')} disabled={atEnd} className={buttonClass} title={t('chessboard.endGame')}><FastForward className="w-4 h-4" /></button>
      </div>
    );
  };

  const notation = (
    <>
      {annotationCount > 0 && <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"><MessageCircle className="h-3.5 w-3.5" />{t('chessboard.annotationsHeading')} ({annotationCount})</div>}
      {games.length > 1 && !hideGameSelector && <div className="mt-3 flex items-center justify-between gap-3 text-xs"><label htmlFor={`${gameSelectId}-game`}>{t('chessboard.game')}</label><select id={`${gameSelectId}-game`} value={activeGame} onChange={(event) => setActiveGame(Number(event.target.value))} aria-label={t('chessboard.selectGame')} className="max-w-[75%] rounded-lg border px-2 py-1.5 dark:bg-slate-800">{games.map((item, index) => <option key={item.key} value={index}>{t('chessboard.gameOption', { number: index + 1, label: item.label || t('chessboard.game') })}</option>)}</select></div>}
      {history.length > 0 && <div className="mt-3 max-h-56 min-h-20 overflow-y-auto rounded-xl border bg-slate-50 p-2 text-xs dark:bg-slate-950">
        {currentMoveIndex === -1 && !isAnalyzing && <div className="mb-1 rounded border-l-2 border-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-sans text-emerald-700 dark:text-emerald-300">{t('chessboard.initialPosition')}</div>}
        <div className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-1">
          {Array.from({ length: Math.ceil(history.length / 2) }, (_, rowIndex) => {
            const moveNumber = rowIndex + 1;
            const whiteIndex = rowIndex * 2;
            const blackIndex = whiteIndex + 1;
            const renderMove = (index: number, accessiblePrefix: string) => {
              const move = history[index];
              if (!move) return <div />;
              const displayMove = localizeSan(move, pieceLetters);
              const notes = selectedAnnotations[index] ?? [];
              const selected = index === currentMoveIndex && !isAnalyzing;
              return <div className="min-w-0">
                <button type="button" onClick={() => goToMove(index)} aria-label={`${accessiblePrefix} ${displayMove}`} aria-current={selected ? 'step' : undefined} className={`w-full rounded border-l-2 px-1.5 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${selected ? 'border-emerald-500 bg-emerald-500/15 font-bold text-emerald-700 dark:text-emerald-300' : 'border-transparent text-slate-700 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800'}`}>{displayMove}</button>
                {notes.length > 0 && <div className="mt-0.5 whitespace-pre-wrap break-words rounded border-l-2 border-emerald-500/50 bg-emerald-500/5 px-2 py-1 text-xs font-sans leading-relaxed text-slate-600 dark:text-slate-300">{notes.map((note, noteIndex) => <p key={noteIndex}>{formatAnnotationText(note)}</p>)}</div>}
              </div>;
            };
            return <React.Fragment key={moveNumber}>
              <div className="py-1 text-right text-[11px] font-mono text-slate-400">{moveNumber}.</div>
              {renderMove(whiteIndex, `${moveNumber}.`)}
              {renderMove(blackIndex, `${moveNumber}.`)}
            </React.Fragment>;
          })}
        </div>
      </div>}
      <div className={`${inlineNotation ? 'flex' : 'hidden lg:flex'} justify-center gap-2 mt-2`}><button type="button" onClick={() => setBoardOrientation((orientation) => orientation === 'white' ? 'black' : 'white')} className="whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs">{t('chessboard.flip')} ({t(boardOrientation === 'white' ? 'board.orientationWhite' : 'board.orientationBlack')})</button></div>
    </>
  );

  const customMovesText = customMoves.map((san, index) => {
    const ply = currentMoveIndex + 2 + index;
    const label = formatMoveLabel(ply, san, pieceLetters, selectedGame?.startFen);
    return index === 0 || !label.includes('...') ? label : localizeSan(san, pieceLetters);
  }).join(' ');

  return (
    <div className="flex w-full min-w-0 flex-col items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-md dark:shadow-lg max-w-full transition-colors">
      {/* Interactive status banner */}
      <div className="w-full flex items-center justify-between mb-3 text-xs">
        {isAnalyzing ? (
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30 font-medium">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>{t('chessboard.interactiveMode')}</span>
          </div>
        ) : (
          <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
            {currentMoveIndex === -1 ? t('chessboard.initialPosition') : `${t('chessboard.move')} ${Math.floor(currentMoveIndex / 2) + 1}`}
          </span>
        )}

        {isAnalyzing && (
          <button
            type="button"
            onClick={resumeGameLine}
            className="flex items-center gap-1 text-[11px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-md font-medium border border-slate-300 dark:border-slate-700 transition"
          >
            <RefreshCw className="w-3 h-3" />
            <span>{t('chessboard.resumeGameLine')}</span>
          </button>
        )}
      </div>

      <div
        ref={boardContainerRef}
        tabIndex={0}
        role="region"
        aria-label={t('chessboard.boardRegion')}
        aria-describedby={`${gameSelectId}-keyboard-hint`}
        className="w-full flex justify-center overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <Chessboard options={{
          id: boardId,
          position: positionFen,
          boardOrientation,
          boardStyle: { width: responsiveBoardWidth, borderRadius: '8px' },
          allowDragging: true,
          allowDrawingArrows: false,
          onPieceDrop,
          arrows: (arrows ?? []).map(([startSquare, endSquare, color]) => ({ startSquare, endSquare, color: color ?? '#2563eb' })),
          darkSquareStyle: { backgroundColor: theme === 'dark' ? '#475569' : '#b58863' },
          lightSquareStyle: { backgroundColor: theme === 'dark' ? '#cbd5e1' : '#f0d9b5' },
        } satisfies ChessboardOptions} />
      </div>

      <div className="mt-2.5 min-h-12 w-full text-center">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('chessboard.dragDropHint')}</p>
        <p id={`${gameSelectId}-keyboard-hint`} className="sr-only">{t('chessboard.keyboardNavigationHint')}</p>
      </div>

      {inlineNotation && renderNavigation('touch', 'flex')}
      {!inlineNotation && renderNavigation('touch', 'flex lg:hidden')}

      {/* Custom analysis moves */}
      {isAnalyzing && customMoves.length > 0 && (
        <div className="w-full mt-3 p-2.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-emerald-500/30 text-xs font-mono">
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold block mb-1">{t('chessboard.yourMoves')}</span>
          <span className="text-slate-800 dark:text-slate-200">{customMovesText}</span>
        </div>
      )}
      {inlineNotation
        ? <div className="w-full">{notation}</div>
        : createPortal(<div>{notation}{renderNavigation('compact', 'hidden lg:flex')}</div>, notationTarget)}
    </div>
  );
};
