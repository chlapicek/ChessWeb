import React, { useId, useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Chess } from 'chess.js';
import { Chessboard, type ChessboardOptions } from 'react-chessboard';
import { ChevronDown, ChevronLeft, ChevronRight, RotateCcw, FastForward, MessageCircle, Sparkles, RefreshCw, Undo2 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { localizeSan, type PieceLetters } from '../chessNotation';
import { addTreeMove, isMainlinePath, mainlineNodes, nodeAt, parsePgnTree, pathKey, replacePgnChunk, serializePgnTree, splitPgnChunks, type BranchMove, type NodePath, type PgnNode, type PgnTree } from '../chess/pgnTree';

export type ViewerGame = { key: string; pgn: string; label?: string };
export type ViewerTarget = { gameKey: string; ply: number; nonce: number; nodePath?: NodePath };
export type ChessViewerState = {
  gameKey: string; ply: number; san?: string; fen: string; moveNumberLabel?: string;
  isAnalyzing: boolean; atMainlineEnd: boolean; isMainline: boolean; nodePath: NodePath;
};
export type MainlineMove = { gameKey?: string; ply: number; san: string };
interface ChessViewerProps {
  pgn?: string; fen?: string; games?: ViewerGame[]; target?: ViewerTarget;
  onStateChange?: (state: ChessViewerState) => void; mode?: 'edit' | 'analysis';
  hideGameSelector?: boolean; boardWidth?: number; arrows?: Array<[string, string, string?]>;
  onPositionChange?: (fen: string) => void; onPgnChange?: (pgn: string) => boolean | void;
  notationTarget?: HTMLElement | null; keyboardNavigationEnabled?: boolean; reloadToken?: number;
  onMainlineMove?: (move: MainlineMove) => boolean;
  onBranchMove?: (move: BranchMove) => boolean | undefined;
}
interface ParsedGame {
  pgn: string; history: string[]; startFen?: string; label?: string;
  headers: Record<string, string>; annotations: Record<number, string[]>; tree: PgnTree;
}
type KeyedGame = ParsedGame & { key: string };

export const formatMoveNumber = (ply: number, startFen?: string): string => {
  const fields = startFen?.trim().split(/\s+/) ?? [];
  const halfMoveIndex = ply - 1 + (fields[1] === 'b' ? 1 : 0);
  const moveNumber = (Number(fields[5]) || 1) + Math.floor(halfMoveIndex / 2);
  return halfMoveIndex % 2 === 0 ? `${moveNumber}.` : `${moveNumber}...`;
};
export const formatMoveLabel = (ply: number, san: string, pieceLetters?: PieceLetters, startFen?: string): string =>
  `${formatMoveNumber(ply, startFen)} ${pieceLetters ? localizeSan(san, pieceLetters) : san}`;
export const formatAnnotationText = (annotation: string): string => annotation.replace(/\[%eval\s+([^\]]+)\]/g, (directive, rawValue: string) => {
  const value = rawValue.trim();
  const mate = value.match(/^#(-?\d+)$/);
  if (mate) return `${mate[1].startsWith('-') ? '-' : ''}M${Math.abs(Number(mate[1]))}`;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return directive;
  return numericValue > 0 ? `+${numericValue}` : numericValue.toString();
});
export const buildPgnWithAnnotations = (game: Chess, history: string[], annotations: Record<number, string[]>): string => {
  const headers = game.getHeaders();
  const replay = new Chess(headers.FEN);
  const tree = parsePgnTree(Object.entries(headers).map(([key, value]) => `[${key} "${value}"]`).join('\n') + '\n\n*');
  let parent = tree.root;
  history.forEach((san, index) => {
    const move = replay.move(san);
    const node: PgnNode = { san: move.san, fen: replay.fen(), comments: annotations[index] ?? [], startingComments: [], nags: [], children: [] };
    parent.children.push(node); parent = node;
  });
  return serializePgnTree(tree);
};
const parsedTree = (tree: PgnTree, pgn: string): ParsedGame => {
  const nodes = mainlineNodes(tree);
  return { pgn, tree, history: nodes.map((node) => node.san!), headers: tree.headers, startFen: tree.headers.FEN,
    label: [tree.headers.White, tree.headers.Black].filter(Boolean).join(' - ') || undefined,
    annotations: Object.fromEntries(nodes.flatMap((node, index) => node.comments.length ? [[index, node.comments]] : [])) };
};
export const parsePgnGames = (pgn: string): ParsedGame[] => {
  if (!pgn.trim()) return [];
  try { return splitPgnChunks(pgn).map((chunk) => parsedTree(parsePgnTree(chunk.pgn), chunk.pgn)); }
  catch (error) { console.error('Invalid PGN game provided:', error); return []; }
};
const buildViewerGames = (games: ViewerGame[] | undefined, pgn?: string, fen?: string): KeyedGame[] => {
  if (games?.length) return games.flatMap(({ key, pgn: source, label }) => {
    const parsed = parsePgnGames(source)[0];
    return parsed ? [{ ...parsed, key, label: label ?? parsed.label }] : [];
  });
  if (fen || !pgn?.trim()) {
    const source = fen ? `[SetUp "1"]\n[FEN "${fen}"]\n\n*` : '*';
    try { return [{ ...parsedTree(parsePgnTree(source), source), key: fen ? 'fen' : 'p0' }]; }
    catch { return []; }
  }
  return parsePgnGames(pgn).map((game, index) => ({ ...game, key: `p${index}` }));
};

export const ChessViewer: React.FC<ChessViewerProps> = ({
  pgn, fen, games: viewerGames, target, onStateChange, mode = 'edit', hideGameSelector = false,
  boardWidth = 360, arrows, onPositionChange, onPgnChange, notationTarget,
  keyboardNavigationEnabled = true, reloadToken = 0, onMainlineMove, onBranchMove,
}) => {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const pieceLetters = useMemo(() => t('board.pieceLetters', { returnObjects: true }) as PieceLetters, [i18n.language, t]);
  const id = useId();
  const sourceSignature = JSON.stringify([viewerGames, pgn, fen, reloadToken]);
  const [games, setGames] = useState(() => buildViewerGames(viewerGames, pgn, fen));
  const [activeGame, setActiveGame] = useState(0);
  const [path, setPath] = useState<NodePath>([]);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [temporary, setTemporary] = useState<Record<string, NodePath[]>>({});
  const [undo, setUndo] = useState<Array<{ games: KeyedGame[]; source: string; path: NodePath; activeGame: number }>>([]);
  const choices = useRef<Record<string, number>>({});
  const loaded = useRef({ signature: sourceSignature, reloadToken });
  const pending = useRef<Record<string, string[]>>({});
  const workingSource = useRef(pgn ?? '');
  const appliedTarget = useRef<number | null>(null);
  const reconciling = useRef(false);
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const boardContainer = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(boardWidth);
  const selectedGame = games[activeGame];
  const currentNode = selectedGame && nodeAt(selectedGame.tree, path);
  const positionFen = currentNode?.fen ?? new Chess().fen();
  const isMainline = isMainlinePath(path);
  const isAnalyzing = (temporary[selectedGame?.key ?? ''] ?? []).some((anchor) => anchor.every((index, depth) => path[depth] === index));
  const atMainlineEnd = isMainline && !isAnalyzing && !currentNode?.children.length;

  const selectPath = (nextPath: NodePath, gameIndex = activeGame) => {
    const game = games[gameIndex];
    if (!game || !nodeAt(game.tree, nextPath)) return;
    nextPath.forEach((child, depth) => { choices.current[`${game.key}:${pathKey(nextPath.slice(0, depth))}`] = child; });
    setCollapsed((current) => new Set([...current].filter((key) => !nextPath.some((_, depth) => key === `${game.key}:${pathKey(nextPath.slice(0, depth + 1))}`))));
    setActiveGame(gameIndex); setPath(nextPath);
  };
  useEffect(() => {
    const container = boardContainer.current;
    if (!container) return;
    const update = () => setWidth(Math.min(boardWidth, Math.max(0, container.clientWidth - 2)));
    update();
    const observer = new ResizeObserver(update); observer.observe(container);
    return () => observer.disconnect();
  }, [boardWidth]);
  useEffect(() => {
    if (loaded.current.signature === sourceSignature) return;
    const authoritative = loaded.current.reloadToken !== reloadToken;
    loaded.current = { signature: sourceSignature, reloadToken };
    reconciling.current = true;
    const incoming = buildViewerGames(viewerGames, pgn, fen);
    const current = games[activeGame];
    if (authoritative) {
      pending.current = {}; choices.current = {}; workingSource.current = pgn ?? '';
      setGames(incoming); setActiveGame(0); setPath([]); setTemporary({}); setUndo([]); setCollapsed(new Set());
      return;
    }
    let delayed = false;
    let replaced = incoming.length !== games.length;
    const reconciled = incoming.map((game) => {
      const local = games.find((item) => item.key === game.key);
      const queue = pending.current[game.key] ?? [];
      let acknowledgement = queue.indexOf(game.pgn);
      if (queue.length && acknowledgement < 0) {
        try { acknowledgement = queue.indexOf(serializePgnTree(game.tree)); }
        catch { acknowledgement = -1; }
      }
      if (local && acknowledgement >= 0) {
        queue.splice(0, acknowledgement + 1);
        delayed ||= queue.length > 0;
        return local;
      }
      if (local?.pgn === game.pgn) return temporary[game.key]?.length ? local : game;
      replaced = true;
      delete pending.current[game.key];
      return game;
    });
    if (replaced) { setUndo([]); pending.current = {}; choices.current = {}; }
    const index = Math.max(0, reconciled.findIndex((game) => game.key === current?.key));
    const nextGame = reconciled[index];
    if (!nextGame || !current || path.some((_, index) => {
      const prefix = path.slice(0, index + 1);
      return nodeAt(nextGame.tree, prefix)?.san !== nodeAt(current.tree, prefix)?.san;
    }) || nodeAt(nextGame.tree, path)?.fen !== nodeAt(current.tree, path)?.fen) setPath([]);
    if (pgn !== undefined && !delayed) workingSource.current = pgn;
    setGames(reconciled); setActiveGame(index);
    setTemporary((value) => Object.fromEntries(Object.entries(value).filter(([key]) => reconciled.find((game) => game.key === key) === games.find((game) => game.key === key))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSignature]);
  useEffect(() => {
    if (reconciling.current) { reconciling.current = false; return; }
    if (!target || appliedTarget.current === target.nonce) return;
    const index = games.findIndex((game) => game.key === target.gameKey);
    if (index < 0) return;
    const nextPath = target.nodePath ?? Array(Math.min(Math.max(0, target.ply), games[index].history.length)).fill(0);
    if (!nodeAt(games[index].tree, nextPath)) return;
    appliedTarget.current = target.nonce; selectPath(nextPath, index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, games]);
  useEffect(() => { onPositionChange?.(positionFen); }, [positionFen, onPositionChange]);
  useEffect(() => {
    if (!selectedGame) return;
    onStateChangeRef.current?.({ gameKey: selectedGame.key, ply: path.length, nodePath: path, san: currentNode?.san, fen: positionFen,
      moveNumberLabel: path.length ? formatMoveNumber(path.length, selectedGame.startFen) : undefined,
      isAnalyzing, isMainline, atMainlineEnd });
  }, [selectedGame?.key, path, currentNode?.san, positionFen, isAnalyzing, isMainline, atMainlineEnd]);
  const nextChild = (parent: NodePath) => {
    const node = selectedGame && nodeAt(selectedGame.tree, parent);
    const remembered = choices.current[`${selectedGame?.key}:${pathKey(parent)}`] ?? 0;
    return node?.children[remembered] ? remembered : 0;
  };
  const first = () => selectPath([]);
  const previous = () => selectPath(path.slice(0, -1));
  const next = () => { if (currentNode?.children.length) selectPath([...path, nextChild(path)]); };
  const continuation = [...path];
  while (selectedGame && nodeAt(selectedGame.tree, continuation)?.children.length) continuation.push(nextChild(continuation));
  const continuationLength = continuation.length;
  const last = () => selectPath(continuation);
  useEffect(() => {
    if (!keyboardNavigationEnabled) return;
    const handle = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const owner = target?.closest('[data-chess-viewer]');
      if (owner && owner.getAttribute('data-chess-viewer') !== id) return;
      if (target?.closest('a[href],input,textarea,select,[role="link"],[role="textbox"],[contenteditable]:not([contenteditable="false"])')) return;
      if (!owner && target?.closest('button,[role="button"]')) return;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      if (owner && target?.closest('[role="toolbar"]')) boardContainer.current?.focus({ preventScroll: true });
      if (event.key === 'ArrowLeft') previous(); else if (event.key === 'ArrowRight') next(); else if (event.key === 'ArrowUp') first(); else last();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  });
  const invalidSource = !!(pgn?.trim() && !parsePgnGames(pgn).length) || !!viewerGames?.some((game) => !parsePgnGames(game.pgn).length);
  const onPieceDrop: NonNullable<ChessboardOptions['onPieceDrop']> = ({ sourceSquare, targetSquare }) => {
    if (!targetSquare || !selectedGame || invalidSource) return false;
    try {
      const board = new Chess(positionFen);
      const move = board.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      const addition = addTreeMove(selectedGame.tree, path, move.san);
      if (!addition.added) { selectPath(addition.nodePath); return true; }
      const resultingPgn = serializePgnTree(addition.tree);
      let recorded = mode === 'edit';
      if (mode === 'analysis' && onBranchMove) {
        const accepted = onBranchMove({ gameKey: selectedGame.key, parentPath: path, expectedParentFen: positionFen,
          expectedSource: selectedGame.pgn, pgn: resultingPgn, nodePath: addition.nodePath, san: move.san });
        if (accepted === false) return false;
        recorded = accepted === true;
      } else if (mode === 'analysis' && atMainlineEnd) {
        recorded = onMainlineMove?.({ gameKey: selectedGame.key, ply: path.length + 1, san: move.san }) ?? false;
      }
      let source = workingSource.current;
      if (mode === 'edit') {
        const replaced = source.trim() ? replacePgnChunk(source, activeGame, selectedGame.pgn, resultingPgn) : resultingPgn;
        if (replaced === null) return false;
        if (onPgnChange?.(replaced) === false) return false;
        const snapshot = { games, source, path, activeGame };
        setUndo((items) => [...items, snapshot]); source = replaced; workingSource.current = source;
      }
      const updated = { ...parsedTree(addition.tree, recorded ? resultingPgn : selectedGame.pgn), key: selectedGame.key, label: selectedGame.label };
      if (!recorded) updated.history = selectedGame.history;
      if (recorded) (pending.current[selectedGame.key] ??= []).push(resultingPgn);
      else setTemporary((value) => ({ ...value, [selectedGame.key]: [...(value[selectedGame.key] ?? []), addition.nodePath] }));
      setGames((items) => items.map((game, index) => index === activeGame ? updated : game));
      addition.nodePath.forEach((child, depth) => { choices.current[`${selectedGame.key}:${pathKey(addition.nodePath.slice(0, depth))}`] = child; });
      setPath(addition.nodePath); setCollapsed(new Set());
      return true;
    } catch { return false; }
  };
  const returnMainline = () => {
    const divergence = path.findIndex((index) => index !== 0);
    if (divergence >= 0) selectPath([...path.slice(0, divergence), 0]);
  };
  const returnSource = () => {
    if (!selectedGame) return;
    const sourceTree = parsePgnTree(selectedGame.pgn);
    let retained = [...path];
    while (retained.length && !nodeAt(sourceTree, retained)) retained.pop();
    setGames((items) => items.map((game, index) => index === activeGame ? { ...game, tree: sourceTree, history: mainlineNodes(sourceTree).map((node) => node.san!) } : game));
    setTemporary((value) => ({ ...value, [selectedGame.key]: [] })); choices.current = {}; setPath(retained);
  };
  const undoAddition = () => {
    const snapshot = undo.at(-1);
    if (!snapshot) return;
    if (onPgnChange?.(snapshot.source) === false) return;
    choices.current = {}; workingSource.current = snapshot.source;
    snapshot.games.forEach((game) => { (pending.current[game.key] ??= []).push(serializePgnTree(game.tree)); });
    setGames(snapshot.games); setPath(snapshot.path); setActiveGame(snapshot.activeGame); setUndo((items) => items.slice(0, -1));
  };
  const annotationCount = (node: PgnNode): number => node.comments.length + node.startingComments.length + node.children.reduce((sum, child) => sum + annotationCount(child), 0);
  const notesCount = selectedGame ? annotationCount(selectedGame.tree.root) : 0;
  const renderNotes = (notes: string[]) => notes.length > 0 && <div className="my-0.5 whitespace-pre-wrap break-words [overflow-wrap:anywhere] border-l-2 border-emerald-500/50 px-2 py-1 font-sans text-slate-600 dark:text-slate-300">{notes.map((note, index) => <p key={index}>{formatAnnotationText(note)}</p>)}</div>;
  const renderAlternatives = (parent: PgnNode, parentPath: NodePath, depth: number) => parent.children.slice(1).map((alternative, index) => {
        const alternativePath = [...parentPath, index + 1];
        const alternativeKey = `${selectedGame?.key}:${pathKey(alternativePath)}`;
        const expanded = !collapsed.has(alternativeKey);
        return <div key={alternativeKey} className={`min-w-0 ${expanded ? 'border-l border-slate-300 dark:border-slate-700' : ''}`}>
          <button type="button" aria-expanded={expanded} aria-label={t('chessboard.toggleVariation', { move: formatMoveLabel(alternativePath.length, alternative.san!, pieceLetters, selectedGame?.startFen) })}
            onClick={() => setCollapsed((value) => { const copy = new Set(value); if (expanded) copy.add(alternativeKey); else copy.delete(alternativeKey); return copy; })}
            className="inline-flex h-6 w-6 items-center justify-center focus-visible:ring-2 focus-visible:ring-emerald-500" title={t('chessboard.variation')}>
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>{expanded && renderLine(parent, parentPath, index + 1, depth + 1)}
        </div>;
      });
  const renderMove = (node: PgnNode, nodePath: NodePath, depth: number, column: number) => {
    const active = pathKey(path) === pathKey(nodePath);
    const label = formatMoveLabel(nodePath.length, node.san!, pieceLetters, selectedGame?.startFen);
    return <button type="button" onClick={() => selectPath(nodePath)} aria-label={label} aria-current={active ? 'step' : undefined}
      style={{ gridColumn: column }}
      className={`min-w-0 w-full break-words rounded border-l-2 px-1.5 py-0.5 text-left focus-visible:ring-2 focus-visible:ring-emerald-500 ${active ? 'border-emerald-500 bg-emerald-500/15 font-bold text-emerald-700 dark:text-emerald-300' : `border-transparent hover:bg-slate-200 dark:hover:bg-slate-800 ${depth === 0 ? 'font-semibold' : 'text-slate-500 dark:text-slate-400'}`}`}>
      {localizeSan(node.san!, pieceLetters)}{node.nags.length > 0 && <span className="ml-1 font-normal">{node.nags.join(' ')}</span>}
    </button>;
  };
  const renderLine = (parent: PgnNode, parentPath: NodePath, childIndex = 0, depth = 0): React.ReactNode => {
    const node = parent.children[childIndex];
    if (!node) return null;
    const nodePath = [...parentPath, childIndex];
    const key = `${selectedGame?.key}:${pathKey(nodePath)}`;
    const fields = parent.fen.split(' ');
    const whiteMove = fields[1] === 'w';
    const canPairReply = whiteMove && (childIndex !== 0 || parent.children.length === 1) && !node.comments.length
      && !node.children[0]?.startingComments.length;
    const paired = canPairReply ? node.children[0] : undefined;
    const endNode = paired ?? node;
    const endPath = paired ? [...nodePath, 0] : nodePath;
    return <React.Fragment key={key}>
      <div className="min-w-0" style={{ paddingLeft: Math.min(depth, 3) * 12 }}>
        {renderNotes(node.startingComments)}
        <div className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-2">
          <span className="py-0.5 text-right font-mono text-slate-400">{fields[5]}{whiteMove ? '.' : '...'}</span>
          {renderMove(node, nodePath, depth, whiteMove ? 2 : 3)}
          {paired && renderMove(paired, endPath, depth, 3)}
        </div>
        {renderNotes(endNode.comments)}
      </div>
      {childIndex === 0 && renderAlternatives(parent, parentPath, depth)}
      {paired && renderAlternatives(node, nodePath, depth)}
      {renderLine(endNode, endPath, 0, depth)}
    </React.Fragment>;
  };
  const navigation = (visibility: string) => <div role="toolbar" aria-label={t('chessboard.moveNavigation')} className={`${visibility} mt-3 flex w-full items-center justify-center gap-1.5`}>
    <button type="button" onClick={first} disabled={!path.length} aria-label={t('chessboard.startPosition')} title={t('chessboard.startPosition')} className="rounded-lg border p-2 disabled:opacity-40"><RotateCcw className="h-4 w-4" /></button>
    <button type="button" onClick={previous} disabled={!path.length} aria-label={t('chessboard.prevMove')} title={t('chessboard.prevMove')} className="rounded-lg border p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
    <span className="min-w-16 text-center font-mono text-xs">{path.length} / {continuationLength}</span>
    <button type="button" onClick={next} disabled={!currentNode?.children.length} aria-label={t('chessboard.nextMove')} title={t('chessboard.nextMove')} className="rounded-lg border p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
    <button type="button" onClick={last} disabled={!currentNode?.children.length} aria-label={t('chessboard.endGame')} title={t('chessboard.endGame')} className="rounded-lg border p-2 disabled:opacity-40"><FastForward className="h-4 w-4" /></button>
  </div>;
  const notation = <>
    {notesCount > 0 && <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300"><MessageCircle className="h-3.5 w-3.5" />{t('chessboard.annotationsHeading')} ({notesCount})</div>}
    {games.length > 1 && !hideGameSelector && <div className="mt-3 flex items-center justify-between gap-3 text-xs"><label htmlFor={`${id}-game`}>{t('chessboard.game')}</label><select id={`${id}-game`} value={activeGame} onChange={(event) => selectPath([], Number(event.target.value))} aria-label={t('chessboard.selectGame')} className="max-w-[75%] rounded-lg border px-2 py-1.5 dark:bg-slate-800">{games.map((game, index) => <option key={game.key} value={index}>{t('chessboard.gameOption', { number: index + 1, label: game.label || t('chessboard.game') })}</option>)}</select></div>}
    {selectedGame && <div className="mt-3 max-h-64 min-w-0 overflow-y-auto rounded-lg border bg-slate-50 p-2 text-xs dark:bg-slate-950">
      {!path.length && <div className="mb-1 text-emerald-700 dark:text-emerald-300">{t('chessboard.initialPosition')}</div>}
      {renderNotes(selectedGame.tree.root.comments)}{renderLine(selectedGame.tree.root, [])}
    </div>}
    <div className="mt-2 flex flex-wrap justify-center gap-2">
      <button type="button" onClick={() => setOrientation((value) => value === 'white' ? 'black' : 'white')} className="rounded-lg border px-2.5 py-1.5 text-xs">{t('chessboard.flip')} ({t(orientation === 'white' ? 'board.orientationWhite' : 'board.orientationBlack')})</button>
      {!isMainline && !isAnalyzing && <button type="button" onClick={returnMainline} aria-label={t('chessboard.returnMainline')} title={t('chessboard.returnMainline')} className="rounded-lg border p-2"><RefreshCw className="h-4 w-4" /></button>}
      {mode === 'edit' && <button type="button" onClick={undoAddition} disabled={!undo.length} aria-label={t('chessboard.undoAddition')} title={t('chessboard.undoAddition')} className="rounded-lg border p-2 disabled:opacity-40"><Undo2 className="h-4 w-4" /></button>}
    </div>
  </>;
  const hasTemporary = !!temporary[selectedGame?.key ?? '']?.length;
  return <div data-chess-viewer={id} className="flex w-full min-w-0 max-w-full flex-col items-center rounded-2xl border border-slate-200 bg-white p-4 shadow-md dark:border-slate-800 dark:bg-slate-900">
    <div className="mb-3 flex w-full flex-wrap items-center justify-between gap-2 text-xs">
      {isAnalyzing ? <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><Sparkles className="h-3.5 w-3.5" /><span>{t('chessboard.interactiveMode')}</span></div>
        : <span className="font-mono text-[11px] text-slate-500">{!path.length ? t('chessboard.initialPosition') : `${t('chessboard.move')} ${formatMoveNumber(path.length, selectedGame?.startFen).replace(/\.+$/, '')}`}</span>}
      {hasTemporary && <button type="button" onClick={returnSource} className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"><RefreshCw className="h-3 w-3" />{t('chessboard.resumeGameLine')}</button>}
      {mode === 'edit' && <span className="text-[11px] text-slate-500">{t('chessboard.workingPgn')}</span>}
    </div>
    {invalidSource && <p role="alert" className="mb-2 break-words text-xs text-rose-600">{t('chessboard.invalidPgn')}</p>}
    <div ref={boardContainer} tabIndex={0} role="region" aria-label={t('chessboard.boardRegion')} aria-describedby={`${id}-keyboard-hint`} className="flex w-full justify-center overflow-hidden rounded-xl border focus-visible:ring-2 focus-visible:ring-emerald-500">
      <Chessboard options={{ id: `chessviewer-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`, position: positionFen, boardOrientation: orientation,
        boardStyle: { width, borderRadius: '8px' }, allowDragging: !invalidSource, allowDrawingArrows: false, onPieceDrop,
        arrows: (arrows ?? []).map(([startSquare, endSquare, color]) => ({ startSquare, endSquare, color: color ?? '#2563eb' })),
        darkSquareStyle: { backgroundColor: theme === 'dark' ? '#475569' : '#b58863' }, lightSquareStyle: { backgroundColor: theme === 'dark' ? '#cbd5e1' : '#f0d9b5' },
      } satisfies ChessboardOptions} />
    </div>
    <div className="mt-2.5 min-h-12 w-full text-center"><p className="text-[11px] text-slate-500">{t('chessboard.dragDropHint')}</p><p id={`${id}-keyboard-hint`} className="sr-only">{t('chessboard.keyboardNavigationHint')}</p></div>
    {navigation(notationTarget ? 'flex lg:hidden' : 'flex')}
    {notationTarget ? createPortal(<div data-chess-viewer={id} className="min-w-0">{notation}{navigation('hidden lg:flex')}</div>, notationTarget) : <div className="w-full min-w-0">{notation}</div>}
  </div>;
};
