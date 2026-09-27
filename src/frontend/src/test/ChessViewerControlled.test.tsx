import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Chess } from 'chess.js';
import { ThemeProvider } from '../context/ThemeContext';
import { ChessViewer, formatMoveLabel, formatMoveNumber, type ChessViewerState, type ViewerGame } from '../components/ChessViewer';
import { describeGames, GameCollectionPanel } from '../components/GameCollectionPanel';
import i18n from '../i18n';

const boardMock = vi.hoisted(() => ({ nextDrop: ['g1', 'f3'] as [string, string] }));

// jsdom cannot drive react-dnd drags, so the board is replaced with a stub that forwards drops.
vi.mock('react-chessboard', () => ({
  Chessboard: ({ position, onPieceDrop }: { position: string; onPieceDrop: (from: string, to: string) => boolean }) => (
    <div data-testid="board" data-position={position}>
      <button type="button" onClick={() => onPieceDrop(boardMock.nextDrop[0], boardMock.nextDrop[1])}>mock-drop</button>
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

    fireEvent.click(screen.getByRole('button', { name: '1. e5' }));
    drop('g1', 'g3');
    expect(screen.queryByText(i18n.t('chessboard.interactiveMode'))).not.toBeInTheDocument();

    drop('b1', 'c3');
    drop('b8', 'c6');

    expect(screen.getByTestId('board')).toHaveAttribute('data-position', fenAfter('e4', 'e5', 'Nc3', 'Nc6'));
    expect(screen.getByText(i18n.t('chessboard.interactiveMode'))).toBeInTheDocument();
    expect(screen.getByText('2. Nc3 Nc6')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2. Nf3' })).toBeInTheDocument();
    expect(onPgnChange).not.toHaveBeenCalled();
    expect(lastState(onStateChange)).toMatchObject({ gameKey: 'p0', ply: 2, isAnalyzing: true, fen: fenAfter('e4', 'e5', 'Nc3', 'Nc6') });

    fireEvent.click(screen.getByRole('button', { name: i18n.t('chessboard.resumeGameLine') }));

    expect(screen.getByTestId('board')).toHaveAttribute('data-position', fenAfter('e4', 'e5'));
    expect(screen.getByRole('button', { name: '1. e5' })).toHaveAttribute('aria-current', 'step');
    expect(lastState(onStateChange)).toMatchObject({ ply: 2, san: 'e5', isAnalyzing: false, moveNumberLabel: '1...' });
  });

  it('localizes analysis moves', async () => {
    await i18n.changeLanguage('cs');
    render(<ThemeProvider><ChessViewer pgn="1. e4 e5 *" mode="analysis" /></ThemeProvider>);
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    drop('g1', 'f3');

    expect(screen.getByText('2. Jf3')).toBeInTheDocument();
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

    expect(lastState(onStateChange)).toEqual({ gameKey: 'b', ply: 2, san: 'd5', fen: fenAfter('d4', 'd5'), moveNumberLabel: '1...', isAnalyzing: false });
    expect(screen.getByRole('button', { name: '1. d5' })).toHaveAttribute('aria-current', 'step');
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
