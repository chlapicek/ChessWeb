import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Chess } from 'chess.js';
import { ThemeProvider } from '../context/ThemeContext';
import { ChessViewer, formatMoveLabel, formatMoveNumber, type ChessViewerState, type MainlineMove, type ViewerGame } from '../components/ChessViewer';
import { describeGames, GameCollectionPanel } from '../components/GameCollectionPanel';
import i18n from '../i18n';
import { addTreeMove, parsePgnTree, serializePgnTree, type BranchMove } from '../chess/pgnTree';
import ArticleEditorModal from '../components/articles/ArticleEditorModal';

vi.mock('../services/apiClient', () => ({ apiClient: { get: vi.fn(async () => ({ data: [] })) } }));

const boardMock = vi.hoisted(() => ({ nextDrop: ['g1', 'f3'] as [string, string] }));

// jsdom cannot drive react-dnd drags, so the board is replaced with a stub that forwards drops.
vi.mock('react-chessboard', () => ({
  Chessboard: ({ options }: { options: { position: string; onPieceDrop: (args: { piece: { isSparePiece: boolean; pieceType: string; position: string }; sourceSquare: string; targetSquare: string }) => boolean } }) => (
    <div data-testid="board" data-position={options.position}>
      <button type="button" onClick={() => options.onPieceDrop({
        piece: { isSparePiece: false, pieceType: 'wN', position: boardMock.nextDrop[0] },
        sourceSquare: boardMock.nextDrop[0],
        targetSquare: boardMock.nextDrop[1],
      })}>mock-drop</button>
    </div>
  ),
}));

const fenAfter = (...moves: string[]) => {
  const game = new Chess();
  moves.forEach((move) => game.move(move));
  return game.fen();
};

const drop = (from: string, to: string) => {
  boardMock.nextDrop = [from, to];
  fireEvent.click(screen.getByRole('button', { name: 'mock-drop' }));
};

const lastState = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.at(-1)?.[0] as ChessViewerState;

const viewerGames: ViewerGame[] = [
  { key: 'a', pgn: '[White "Alice"]\n[Black "Bob"]\n[Result "1-0"]\n[Event "Club Open"]\n\n1. e4 e5 1-0' },
  { key: 'b', pgn: '[White "Carol"]\n[Black "Dan"]\n\n1. d4 d5 2. c4 *', label: 'Queen\'s Gambit' },
  { key: 'c', pgn: '1. c4 *' },
];

describe('ChessViewer controlled API', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('formats move labels for White and Black', () => {
    expect(formatMoveLabel(1, 'e4')).toBe('1. e4');
    expect(formatMoveLabel(2, 'e5')).toBe('1... e5');
    expect(formatMoveLabel(24, 'Nf3', { K: 'K', Q: 'D', R: 'V', B: 'S', N: 'J' })).toBe('12... Jf3');
    expect(formatMoveNumber(1, '8/8/8/8/8/8/8/K1k5 b - - 0 30')).toBe('30...');
  });

  it('analysis mode keeps the mainline, never calls onPgnChange, and resumes the game line', () => {
    const onPgnChange = vi.fn();
    const onStateChange = vi.fn();
    render(<ThemeProvider><ChessViewer pgn="1. e4 e5 2. Nf3 *" mode="analysis" onPgnChange={onPgnChange} onStateChange={onStateChange} /></ThemeProvider>);

    fireEvent.click(screen.getByRole('button', { name: '1... e5' }));
    drop('g1', 'g3');
    expect(screen.queryByText(i18n.t('chessboard.interactiveMode'))).not.toBeInTheDocument();

    drop('b1', 'c3');
    drop('b8', 'c6');

    expect(screen.getByTestId('board')).toHaveAttribute('data-position', fenAfter('e4', 'e5', 'Nc3', 'Nc6'));
    expect(screen.getByText(i18n.t('chessboard.interactiveMode'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2. Nc3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2... Nc6' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2. Nf3' })).toBeInTheDocument();
    expect(onPgnChange).not.toHaveBeenCalled();
    expect(lastState(onStateChange)).toMatchObject({ gameKey: 'p0', ply: 4, nodePath: [0, 0, 1, 0], isAnalyzing: true, fen: fenAfter('e4', 'e5', 'Nc3', 'Nc6') });

    fireEvent.click(screen.getByRole('button', { name: i18n.t('chessboard.resumeGameLine') }));

    expect(screen.getByTestId('board')).toHaveAttribute('data-position', fenAfter('e4', 'e5'));
    expect(screen.getByRole('button', { name: '1... e5' })).toHaveAttribute('aria-current', 'step');
    expect(lastState(onStateChange)).toMatchObject({ ply: 2, san: 'e5', isAnalyzing: false, moveNumberLabel: '1...' });
  });

  it('localizes analysis moves', async () => {
    await i18n.changeLanguage('cs');
    render(<ThemeProvider><ChessViewer pgn="1. e4 e5 *" mode="analysis" /></ThemeProvider>);
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    drop('g1', 'f3');

    expect(screen.getByRole('button', { name: '2. Jf3' })).toHaveTextContent('Jf3');
  });

  it('counts the selected continuation instead of the mainline', () => {
    render(<ThemeProvider><ChessViewer pgn="1. e4 e5 (1... c5 2. Nf3 Nc6 3. d4) 2. Nf3 *" /></ThemeProvider>);
    expect(screen.getByText('0 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1... c5' }));
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(screen.getByText('5 / 5')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'ArrowUp' });
    expect(screen.getByText('0 / 5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1... e5' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('aligns White and Black moves in separate columns, including variations', () => {
    render(<ThemeProvider><ChessViewer pgn="1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *" /></ThemeProvider>);
    const white = screen.getByRole('button', { name: '1. e4' });
    const black = screen.getByRole('button', { name: '1... e5' });
    expect(white).toHaveStyle({ gridColumn: '2' });
    expect(black).toHaveStyle({ gridColumn: '3' });
    expect(white.parentElement).toBe(black.parentElement);
    expect(screen.getByRole('button', { name: '1... c5' })).toHaveStyle({ gridColumn: '3' });
    screen.getAllByRole('button', { name: '2. Nf3' }).forEach((move) => expect(move).toHaveStyle({ gridColumn: '2' }));
  });

  it('fully hides collapsed variations and preserves nested disclosure state and selection', () => {
    render(<ThemeProvider><ChessViewer pgn="1. e4 e5 (1... c5 { Sicilian note } 2. Nf3 (2. Nc3 { Nested note })) 2. Nf3 *" /></ThemeProvider>);
    const outerLabel = i18n.t('chessboard.toggleVariation', { move: '1... c5' });
    const innerLabel = i18n.t('chessboard.toggleVariation', { move: '2. Nc3' });
    fireEvent.click(screen.getByRole('button', { name: '2. Nc3' }));
    const position = screen.getByTestId('board').getAttribute('data-position');
    fireEvent.click(screen.getByRole('button', { name: innerLabel }));
    expect(screen.queryByRole('button', { name: '2. Nc3' })).not.toBeInTheDocument();
    expect(screen.queryByText('Nested note')).not.toBeInTheDocument();
    const outer = screen.getByRole('button', { name: outerLabel });
    fireEvent.click(outer);
    expect(outer).toHaveAttribute('aria-expanded', 'false');
    expect(outer).toHaveTextContent('');
    expect(outer.parentElement).not.toHaveClass('border-l');
    expect(screen.queryByText('1... c5')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1... c5' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: innerLabel })).not.toBeInTheDocument();
    expect(screen.queryByText('Sicilian note')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1... e5' })).toBeInTheDocument();
    expect(screen.getByTestId('board')).toHaveAttribute('data-position', position);
    fireEvent.click(outer);
    expect(screen.getByRole('button', { name: innerLabel })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Sicilian note')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '2. Nc3' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: innerLabel }));
    expect(screen.getByRole('button', { name: '2. Nc3' })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Nested note')).toBeInTheDocument();
    expect(screen.getByTestId('board')).toHaveAttribute('data-position', position);
  });

  it('counts shorter variations, temporary analysis, and undone additions', () => {
    render(<ThemeProvider><ChessViewer pgn="1. e4 e5 (1... c5) 2. Nf3 Nc6 *" /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: '1... c5' }));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    drop('g1', 'f3');
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('chessboard.undoAddition') }));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2... Nc6' }));
    expect(screen.getByText('4 / 4')).toBeInTheDocument();
  });

  it('leaves the White column empty for a Black-to-move FEN', () => {
    render(<ThemeProvider><ChessViewer pgn={'[SetUp "1"]\n[FEN "8/8/8/8/8/8/8/K1k5 b - - 0 30"]\n\n30... Kd2 31. Ka2 *'} /></ThemeProvider>);
    const black = screen.getByRole('button', { name: '30... Kd2' });
    const white = screen.getByRole('button', { name: '31. Ka2' });
    expect(black).toHaveStyle({ gridColumn: '3' });
    expect(white).toHaveStyle({ gridColumn: '2' });
    expect(black.parentElement).not.toBe(white.parentElement);
    expect(screen.getByText('30...')).toBeInTheDocument();
    expect(screen.getByText('31.')).toBeInTheDocument();
  });

  it('edit mode rewrites the line and reports the new PGN', () => {
    const onPgnChange = vi.fn();
    render(<ThemeProvider><ChessViewer pgn="1. e4 e5 *" onPgnChange={onPgnChange} /></ThemeProvider>);
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    drop('g1', 'f3');

    expect(onPgnChange).toHaveBeenCalledWith(expect.stringContaining('2. Nf3'));
    expect(screen.getByRole('button', { name: '2. Nf3' })).toHaveAttribute('aria-current', 'step');
  });

  it('jumps to a target game and ply by key and reports state', () => {
    const onStateChange = vi.fn();
    const renderViewer = (target?: { gameKey: string; ply: number; nonce: number }) => (
      <ThemeProvider><ChessViewer games={viewerGames} target={target} onStateChange={onStateChange} hideGameSelector /></ThemeProvider>
    );
    const { rerender } = render(renderViewer({ gameKey: 'b', ply: 2, nonce: 1 }));

    expect(lastState(onStateChange)).toEqual({ gameKey: 'b', ply: 2, nodePath: [0, 0], isMainline: true, san: 'd5', fen: fenAfter('d4', 'd5'), moveNumberLabel: '1...', isAnalyzing: false, atMainlineEnd: false });
    expect(screen.getByRole('button', { name: '1... d5' })).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    rerender(renderViewer({ gameKey: 'a', ply: 1, nonce: 2 }));
    expect(lastState(onStateChange)).toMatchObject({ gameKey: 'a', ply: 1, san: 'e4', moveNumberLabel: '1.' });

    rerender(renderViewer({ gameKey: 'missing', ply: 1, nonce: 3 }));
    expect(lastState(onStateChange)).toMatchObject({ gameKey: 'a', ply: 1 });

    rerender(renderViewer({ gameKey: 'b', ply: 99, nonce: 4 }));
    expect(lastState(onStateChange)).toMatchObject({ gameKey: 'b', ply: 3, san: 'c4', moveNumberLabel: '2.' });

    rerender(renderViewer({ gameKey: 'b', ply: 0, nonce: 5 }));
    expect(lastState(onStateChange)).toMatchObject({ gameKey: 'b', ply: 0, san: undefined, moveNumberLabel: undefined });
  });

  it('keys games from a plain PGN prop as p0, p1', () => {
    const onStateChange = vi.fn();
    render(<ThemeProvider><ChessViewer pgn={'[White "A"]\n\n1. e4 *\n\n[White "B"]\n\n1. d4 *'} onStateChange={onStateChange} /></ThemeProvider>);
    expect(lastState(onStateChange).gameKey).toBe('p0');

    fireEvent.change(screen.getByRole('combobox', { name: i18n.t('chessboard.selectGame') }), { target: { value: '1' } });
    expect(lastState(onStateChange).gameKey).toBe('p1');
  });

  it('uses the fen key for a FEN position', () => {
    const onStateChange = vi.fn();
    const fen = '8/8/8/8/8/8/8/K1k5 w - - 0 1';
    render(<ThemeProvider><ChessViewer fen={fen} onStateChange={onStateChange} /></ThemeProvider>);
    expect(lastState(onStateChange)).toMatchObject({ gameKey: 'fen', ply: 0, fen });
  });

  describe('onMainlineMove', () => {
    const renderRecording = (pgn: string, onMainlineMove: (move: MainlineMove) => boolean, onStateChange = vi.fn()) => {
      const view = (games: ViewerGame[]) => (
        <ThemeProvider><ChessViewer games={games} mode="analysis" hideGameSelector onMainlineMove={onMainlineMove} onStateChange={onStateChange} /></ThemeProvider>
      );
      const result = render(view([{ key: 'p0', pgn }]));
      return { ...result, rerenderPgn: (next: string) => result.rerender(view([{ key: 'p0', pgn: next }])) };
    };

    it('records a move played at the end of the mainline and keeps it after the source updates', () => {
      const onMainlineMove = vi.fn(() => true);
      const onStateChange = vi.fn();
      const { rerenderPgn } = renderRecording('1. e4 e5 *', onMainlineMove, onStateChange);
      fireEvent.keyDown(document, { key: 'ArrowDown' });

      drop('g1', 'f3');

      expect(onMainlineMove).toHaveBeenCalledWith({ gameKey: 'p0', ply: 3, san: 'Nf3' });
      expect(screen.getByRole('button', { name: '2. Nf3' })).toHaveAttribute('aria-current', 'step');
      expect(screen.queryByText(i18n.t('chessboard.interactiveMode'))).not.toBeInTheDocument();

      rerenderPgn('1. e4 e5 2. Nf3 *');

      expect(screen.getByRole('button', { name: '2. Nf3' })).toHaveAttribute('aria-current', 'step');
      expect(lastState(onStateChange)).toMatchObject({ gameKey: 'p0', ply: 3, san: 'Nf3', atMainlineEnd: true });
    });

    it('falls back to analysis in the middle of the game or when the move is declined', () => {
      const onMainlineMove = vi.fn(() => false);
      renderRecording('1. e4 e5 *', onMainlineMove);

      fireEvent.click(screen.getByRole('button', { name: '1. e4' }));
      drop('g8', 'f6');
      expect(onMainlineMove).not.toHaveBeenCalled();
      expect(screen.getByText(i18n.t('chessboard.interactiveMode'))).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: i18n.t('chessboard.resumeGameLine') }));
      fireEvent.keyDown(document, { key: 'ArrowDown' });
      drop('g1', 'f3');
      expect(onMainlineMove).toHaveBeenCalledTimes(1);
      expect(screen.getByText(i18n.t('chessboard.interactiveMode'))).toBeInTheDocument();
    });
  });

  it('selects imported alternatives, remembers ancestor choices and returns to the replacement mainline move', () => {
    const state = vi.fn();
    render(<ThemeProvider><ChessViewer pgn="1. e4 e5 (1... c5 2. Nf3 (2. Nc3)) 2. Nf3 *" onStateChange={state} /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: '2. Nc3' }));
    expect(lastState(state)).toMatchObject({ nodePath: [0, 1, 1], isMainline: false, fen: fenAfter('e4', 'c5', 'Nc3') });
    fireEvent.keyDown(document, { key: 'ArrowUp' });
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(lastState(state).nodePath).toEqual([0, 1, 1]);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('chessboard.returnMainline') }));
    expect(lastState(state).nodePath).toEqual([0, 0]);
  });

  it('existing drops only select; new alternatives keep the source and undo restores cursor and full PGN', () => {
    const changed = vi.fn();
    const state = vi.fn();
    render(<ThemeProvider><ChessViewer pgn="1. e4 e5 2. Nf3 *" onPgnChange={changed} onStateChange={state} /></ThemeProvider>);
    drop('e2', 'e4');
    expect(changed).not.toHaveBeenCalled();
    drop('c7', 'c5');
    expect(lastState(state).nodePath).toEqual([0, 1]);
    expect(changed).toHaveBeenCalledWith(expect.stringContaining('(1... c5)'));
    expect(screen.getByRole('button', { name: '1... e5' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'ArrowUp' });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('chessboard.undoAddition') }));
    expect(lastState(state).nodePath).toEqual([0]);
    expect(changed).toHaveBeenLastCalledWith('1. e4 e5 2. Nf3 *');
    expect(screen.queryByRole('button', { name: '1... c5' })).not.toBeInTheDocument();
  });

  it('retains accepted branches through delayed sources and lets explicit reload override them', () => {
    const accepted: BranchMove[] = [];
    const state = vi.fn();
    const record = (move: BranchMove) => { accepted.push(move); return true; };
    const view = (source: string, reloadToken = 0) => <ThemeProvider><ChessViewer games={[{ key: 'p0', pgn: source }]} mode="analysis" onBranchMove={record} onStateChange={state} reloadToken={reloadToken} /></ThemeProvider>;
    const { rerender } = render(view('1. e4 e5 *'));
    fireEvent.click(screen.getByRole('button', { name: '1. e4' }));
    drop('c7', 'c5');
    expect(accepted[0]).toMatchObject({ parentPath: [0], nodePath: [0, 1], expectedSource: '1. e4 e5 *', expectedParentFen: fenAfter('e4') });
    drop('g1', 'f3');
    rerender(view(accepted[0].pgn));
    expect(lastState(state).nodePath).toEqual([0, 1, 0]);
    expect(screen.getByRole('button', { name: '2. Nf3' })).toHaveAttribute('aria-current', 'step');
    rerender(view(accepted[1].pgn));
    expect(lastState(state)).toMatchObject({ nodePath: [0, 1, 0], isAnalyzing: false, isMainline: false });
    rerender(view('1. e4 e5 *', 1));
    expect(lastState(state).nodePath).toEqual([]);
    expect(screen.queryByRole('button', { name: '1... c5' })).not.toBeInTheDocument();
  });

  it('a rejected article branch changes neither cursor nor tree and emits no PGN', () => {
    const state = vi.fn();
    const changed = vi.fn();
    render(<ThemeProvider><ChessViewer pgn="1. e4 e5 *" mode="analysis" onBranchMove={() => false} onStateChange={state} onPgnChange={changed} /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: '1. e4' }));
    drop('c7', 'c5');
    expect(lastState(state)).toMatchObject({ nodePath: [0], isAnalyzing: false });
    expect(screen.queryByRole('button', { name: '1... c5' })).not.toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled();
  });

  it('refuses edit writes and undo without changing the board or consuming snapshots', () => {
    let accepts = false;
    const changed = vi.fn(() => accepts);
    render(<ThemeProvider><ChessViewer pgn="*" onPgnChange={changed} /></ThemeProvider>);
    drop('e2', 'e4');
    expect(screen.getByTestId('board')).toHaveAttribute('data-position', fenAfter());
    expect(screen.queryByRole('button', { name: '1. e4' })).not.toBeInTheDocument();
    accepts = true;
    drop('e2', 'e4');
    accepts = false;
    fireEvent.click(screen.getByRole('button', { name: i18n.t('chessboard.undoAddition') }));
    expect(screen.getByTestId('board')).toHaveAttribute('data-position', fenAfter('e4'));
    expect(screen.getByRole('button', { name: i18n.t('chessboard.undoAddition') })).toBeEnabled();
    accepts = true;
    fireEvent.click(screen.getByRole('button', { name: i18n.t('chessboard.undoAddition') }));
    expect(screen.getByTestId('board')).toHaveAttribute('data-position', fenAfter());
  });

  it('invalidates edit undo when an external replacement arrives without a reload token', () => {
    const changed = vi.fn();
    const view = (source: string) => <ThemeProvider><ChessViewer pgn={source} onPgnChange={changed} /></ThemeProvider>;
    const { rerender } = render(view('*'));
    drop('e2', 'e4');
    rerender(view('1. d4 *'));
    expect(screen.getByRole('button', { name: i18n.t('chessboard.undoAddition') })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('chessboard.undoAddition') }));
    expect(changed).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '1. d4' })).toBeInTheDocument();
  });

  it('retires sequential deferred acknowledgements so an old source becomes authoritative again', () => {
    const outputs: string[] = [];
    const view = (source: string, reloadToken = 0) => <ThemeProvider><ChessViewer pgn={source} reloadToken={reloadToken} onPgnChange={(value) => { outputs.push(value); }} /></ThemeProvider>;
    const { rerender } = render(view('*'));
    drop('e2', 'e4'); drop('e7', 'e5'); drop('g1', 'f3');
    rerender(view(outputs[0]));
    expect(screen.getByTestId('board')).toHaveAttribute('data-position', fenAfter('e4', 'e5', 'Nf3'));
    rerender(view(outputs[1]));
    expect(screen.getByTestId('board')).toHaveAttribute('data-position', fenAfter('e4', 'e5', 'Nf3'));
    rerender(view(outputs[2]));
    expect(screen.getByRole('button', { name: i18n.t('chessboard.undoAddition') })).toBeEnabled();
    rerender(view(outputs[0]));
    expect(screen.queryByRole('button', { name: '2. Nf3' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('chessboard.undoAddition') })).toBeDisabled();
    rerender(view('', 1));
    expect(screen.queryByRole('button', { name: '1. e4' })).not.toBeInTheDocument();
    expect(screen.getByTestId('board')).toHaveAttribute('data-position', fenAfter());
  });

  it('roundtrips closing braces in semicolon comments through serialization and edits', () => {
    const tree = parsePgnTree('1. e4 ; note }\ne5 *');
    const serialized = serializePgnTree(tree);
    expect(serialized).toContain('\n; note }\n');
    expect(parsePgnTree(serialized).root).toEqual(tree.root);
    const edited = addTreeMove(tree, [0], 'c5');
    expect(parsePgnTree(serializePgnTree(edited.tree)).root).toEqual(edited.tree.root);
  });

  it('accepts controlled sources and games list additions with closing-brace comments', () => {
    const changed = vi.fn();
    const view = (games: ViewerGame[]) => <ThemeProvider><ChessViewer games={games} onPgnChange={changed} /></ThemeProvider>;
    const source = '1. e4 ; note }\ne5 *';
    const { rerender } = render(view([{ key: 'a', pgn: '*' }]));
    rerender(view([{ key: 'a', pgn: source }]));
    expect(screen.getByText('note }')).toBeInTheDocument();
    rerender(view([{ key: 'a', pgn: source }, { key: 'b', pgn: source }]));
    expect(screen.getByRole('combobox')).toHaveValue('0');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
    expect(screen.getByText('note }')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1. e4' }));
    drop('c7', 'c5');
    const output = changed.mock.calls.at(-1)?.[0] as string;
    expect(parsePgnTree(output).root.children[0].comments).toEqual(['note }']);
    rerender(view([{ key: 'a', pgn: source }, { key: 'b', pgn: output }]));
    expect(screen.getByRole('button', { name: '1... c5' })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('note }')).toBeInTheDocument();
  });

  it('keeps undo authoritative when an older addition acknowledgement arrives first', () => {
    const outputs: string[] = [];
    const view = (source: string) => <ThemeProvider><ChessViewer pgn={source} onPgnChange={(value) => { outputs.push(value); }} /></ThemeProvider>;
    const { rerender } = render(view('*'));
    drop('e2', 'e4');
    fireEvent.click(screen.getByRole('button', { name: i18n.t('chessboard.undoAddition') }));
    expect(outputs).toEqual(['1. e4 *', '*']);
    rerender(view(outputs[0]));
    expect(screen.getByTestId('board')).toHaveAttribute('data-position', fenAfter());
    expect(screen.queryByRole('button', { name: '1. e4' })).not.toBeInTheDocument();
    rerender(view(outputs[1]));
    expect(screen.getByTestId('board')).toHaveAttribute('data-position', fenAfter());
    drop('d2', 'd4');
    expect(outputs.at(-1)).toBe('1. d4 *');
    rerender(view(outputs[0]));
    expect(screen.getByRole('button', { name: '1. e4' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('chessboard.undoAddition') })).toBeDisabled();
  });

  it('retires acknowledged additions and undos across sequential edit cycles', () => {
    const outputs: string[] = [];
    const view = (source: string) => <ThemeProvider><ChessViewer pgn={source} onPgnChange={(value) => { outputs.push(value); }} /></ThemeProvider>;
    const { rerender } = render(view('*'));
    for (const [from, to, san] of [['e2', 'e4', 'e4'], ['d2', 'd4', 'd4']]) {
      drop(from, to);
      rerender(view(outputs.at(-1)!));
      expect(screen.getByTestId('board')).toHaveAttribute('data-position', fenAfter(san));
      fireEvent.click(screen.getByRole('button', { name: i18n.t('chessboard.undoAddition') }));
      rerender(view(outputs.at(-1)!));
      expect(screen.getByTestId('board')).toHaveAttribute('data-position', fenAfter());
      expect(screen.getByRole('button', { name: i18n.t('chessboard.undoAddition') })).toBeDisabled();
    }
    expect(outputs).toEqual(['1. e4 *', '*', '1. d4 *', '*']);
  });

  it('article manual clear and revert reset recorded games and disable stale move insertion', async () => {
    render(<ThemeProvider><ArticleEditorModal onClose={vi.fn()} onSaved={vi.fn()} /></ThemeProvider>);
    const notation = screen.getByLabelText(i18n.t('articles.pgnNotation'));
    const insertMove = screen.getByRole('button', { name: i18n.t('articles.insertMove') });
    drop('e2', 'e4');
    await waitFor(() => expect(notation).toHaveValue('1. e4 *'));
    await waitFor(() => expect(insertMove).toBeEnabled());
    fireEvent.change(notation, { target: { value: '' } });
    await waitFor(() => expect(screen.getByTestId('board')).toHaveAttribute('data-position', fenAfter()));
    expect(insertMove).toBeDisabled();
    expect(screen.queryByRole('button', { name: '1. e4' })).not.toBeInTheDocument();

    fireEvent.change(notation, { target: { value: '1. d4 *' } });
    await screen.findByRole('button', { name: '1. d4' });
    drop('d2', 'd4'); drop('d7', 'd5');
    await waitFor(() => expect(notation).toHaveValue('1. d4 1... d5 *'));
    await waitFor(() => expect(screen.getByTestId('board')).toHaveAttribute('data-position', fenAfter('d4', 'd5')));
    fireEvent.change(notation, { target: { value: '1. d4 *' } });
    await waitFor(() => expect(screen.getByTestId('board')).toHaveAttribute('data-position', fenAfter()));
    expect(insertMove).toBeDisabled();
    expect(screen.queryByRole('button', { name: '1... d5' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: i18n.t('articles.undoAddedMove') })).not.toBeInTheDocument();
  });
});

describe('GameCollectionPanel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('describes games from PGN headers', () => {
    expect(describeGames(viewerGames)).toEqual([
      { key: 'a', label: undefined, white: 'Alice', black: 'Bob', result: '1-0', event: 'Club Open' },
      { key: 'b', label: 'Queen\'s Gambit', white: 'Carol', black: 'Dan', result: undefined, event: undefined },
      { key: 'c', label: undefined, white: undefined, black: undefined, result: undefined, event: undefined },
    ]);
  });

  it('selects games from the list and via previous/next buttons', () => {
    const onSelect = vi.fn();
    const entries = describeGames(viewerGames);
    const { rerender } = render(<GameCollectionPanel games={entries} activeKey="a" onSelect={onSelect} />);

    expect(screen.getByText('Game 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Alice – Bob/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('Club Open')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous game' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Carol – Dan/ }));
    expect(onSelect).toHaveBeenLastCalledWith('b');
    fireEvent.click(screen.getByRole('button', { name: 'Next game' }));
    expect(onSelect).toHaveBeenLastCalledWith('b');

    rerender(<GameCollectionPanel games={entries} activeKey="c" onSelect={onSelect} title="Article games" />);
    expect(screen.getByRole('region', { name: 'Article games' })).toBeInTheDocument();
    expect(screen.getByText('Game 3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Game 3' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Next game' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous game' }));
    expect(onSelect).toHaveBeenLastCalledWith('b');
  });
});
