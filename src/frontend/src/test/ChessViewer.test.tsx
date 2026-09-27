import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext';
import { buildPgnWithAnnotations, ChessViewer, formatAnnotationText, parsePgnGames } from '../components/ChessViewer';
import { localizeSan } from '../chessNotation';
import { Chess } from 'chess.js';
import '../i18n';
import i18n from '../i18n';

const multiGamePgn = `[Event "Game one"]
[White "Alice"]
[Black "Bob"]

1. e4 e5

[Event "Game two"]
[White "Carol"]
[Black "Dan"]

1. d4 d5`;

describe('ChessViewer PGN support', () => {
	it('uses the selected language for visible piece notation', () => {
		expect(localizeSan('Nf3 Bb5 Qh4', { K: 'K', Q: 'D', R: 'V', B: 'S', N: 'J' })).toBe('Jf3 Sb5 Dh4');
		expect(localizeSan('Nf3 Bb5 Qh4', { K: 'K', Q: 'Q', R: 'R', B: 'B', N: 'N' })).toBe('Nf3 Bb5 Qh4');
	});

	it('formats evaluation directives for display', () => {
		expect(formatAnnotationText('[%eval 1.0]')).toBe('+1');
		expect(formatAnnotationText('[%eval -1.0]')).toBe('-1');
		expect(formatAnnotationText('[%eval 0.0]')).toBe('0');
		expect(formatAnnotationText('[%eval 0.25]')).toBe('+0.25');
		expect(formatAnnotationText('[%eval #3]')).toBe('M3');
		expect(formatAnnotationText('[%eval #-2]')).toBe('-M2');
		expect(formatAnnotationText('{ ordinary note }')).toBe('{ ordinary note }');
	});

	it('preserves comments when rebuilding a changed main line', () => {
		const game = new Chess();
		game.move('c4');
		game.move('Nf6');
		game.move('d4');
		game.move('g6');
		game.move('Nc3');
		game.move('Bg7');
		game.move('e4');
		game.move('d6');
		game.move('f4');
		const pgn = buildPgnWithAnnotations(game, game.history(), {
			8: ['[%eval 0.0]', 'Inaccuracy. h3 was best.'],
		});

		expect(pgn).toContain('{ [%eval 0.0] }');
		expect(pgn).toContain('{ Inaccuracy. h3 was best. }');
		expect(pgn).toContain('5. f4');
	});

	it('loads annotated games with comments and side variations', () => {
		const annotatedPgn = `[Event "Annotated"]\n[Date "2025.10.12"]\n\n1. e4 { Good move. } e5 (1... c5 2. Nf3) 2. Nf3 *`;
		const [game] = parsePgnGames(annotatedPgn);

		expect(game.history).toEqual(['e4', 'e5', 'Nf3']);
		expect(game.pgn).toBe(annotatedPgn);
	});

	it('shows annotations directly beneath their move', () => {
		const target = document.createElement('div');
		document.body.appendChild(target);
		expect(parsePgnGames('1. e4 { Good move. } e5 *')[0].annotations).toEqual({ 0: ['Good move.'] });
		render(<ThemeProvider><ChessViewer pgn={'1. e4 { Good move. } e5 *'} notationTarget={target} /></ThemeProvider>);

		expect(screen.getByText(`${i18n.t('chessboard.annotationsHeading')} (1)`)).toBeInTheDocument();
		expect(screen.getByText('Good move.')).toBeInTheDocument();
	});

	it('keeps the board hint area separate from move annotations', () => {
		const target = document.createElement('div');
		document.body.appendChild(target);
		render(<ThemeProvider><ChessViewer pgn={'1. e4 { Good move. } e5 *'} notationTarget={target} /></ThemeProvider>);

		expect(screen.queryByRole('status')).not.toBeInTheDocument();
		expect(screen.getByText('Good move.')).toBeInTheDocument();
	});

	it('pairs White and Black moves on the same notation row', () => {
		const target = document.createElement('div');
		document.body.appendChild(target);
		render(<ThemeProvider><ChessViewer pgn={'1. e4 { White note. } e5 { Black note. } *'} notationTarget={target} /></ThemeProvider>);

		expect(screen.getByRole('button', { name: '1. e4' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '1. e5' })).toBeInTheDocument();
		expect(screen.getByText('White note.')).toBeInTheDocument();
		expect(screen.getByText('Black note.')).toBeInTheDocument();
	});

	it('associates the f4 annotations with white move five', () => {
		const annotatedOpening = `[Event "Annotated"]

1. c4 { [%eval 0.12] } Nf6 2. d4 { [%eval 0.18] } g6 3. Nc3 Bg7 4. e4 d6 5. f4?! { [%eval 0.0] } { Inaccuracy. h3 was best. } (5. h3 Nbd7 6. Nf3 e5) 5... O-O *`;
		const [game] = parsePgnGames(annotatedOpening);

		expect(game.history[8]).toBe('f4');
		expect(game.annotations[8]).toEqual(['[%eval 0.0]', 'Inaccuracy. h3 was best.']);
	});

	it('switches between games', () => {
		render(<ThemeProvider><ChessViewer pgn={multiGamePgn} /></ThemeProvider>);
		const selector = screen.getByRole('combobox', { name: i18n.t('chessboard.selectGame') });
		fireEvent.change(selector, { target: { value: '1' } });
		expect(selector).toHaveValue('1');
	});

	it('navigates moves with keyboard arrows when the board is focused', () => {
		render(<ThemeProvider><ChessViewer pgn="1. e4 e5 *" /></ThemeProvider>);
		const board = screen.getByRole('region', { name: i18n.t('chessboard.boardRegion') });

		board.focus();
		fireEvent.keyDown(board, { key: 'ArrowRight' });

		expect(screen.getByText(`${i18n.t('chessboard.move')} 1`)).toBeInTheDocument();
	});

	it('navigates moves from anywhere on the page', () => {
		render(<ThemeProvider><ChessViewer pgn="1. e4 e5 *" /></ThemeProvider>);
		fireEvent.keyDown(document, { key: 'ArrowRight' });

		expect(screen.getByText(`${i18n.t('chessboard.move')} 1`)).toBeInTheDocument();
	});

	it('uses the down arrow to jump to the end of the game', () => {
		render(<ThemeProvider><ChessViewer pgn="1. e4 e5 2. Nf3 *" /></ThemeProvider>);
		fireEvent.keyDown(document, { key: 'ArrowDown' });

		expect(screen.getByText(`${i18n.t('chessboard.move')} 2`)).toBeInTheDocument();
	});

	it('does not hijack arrow keys from notation controls', () => {
		const target = document.createElement('div');
		document.body.appendChild(target);
		render(<ThemeProvider><ChessViewer pgn={multiGamePgn} notationTarget={target} /></ThemeProvider>);
		const selector = screen.getByRole('combobox', { name: i18n.t('chessboard.selectGame') });
		fireEvent.keyDown(selector, { key: 'ArrowRight' });

		expect(selector).toHaveValue('0');
	});

	it('does not hijack arrow keys from links', () => {
		render(<ThemeProvider><ChessViewer pgn="1. e4 e5 *" /></ThemeProvider>);
		const link = document.createElement('a');
		link.href = '#related';
		document.body.appendChild(link);
		const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });

		link.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(false);
		expect(screen.queryByText(`${i18n.t('chessboard.move')} 1`)).not.toBeInTheDocument();
		link.remove();
	});

	it('renders the move list, flip button and a single navigation toolbar inline without a notation target', () => {
		render(<ThemeProvider><ChessViewer pgn={multiGamePgn} /></ThemeProvider>);

		expect(screen.getByRole('button', { name: '1. e4' })).toBeInTheDocument();
		expect(screen.getAllByRole('toolbar', { name: i18n.t('chessboard.moveNavigation') })).toHaveLength(1);
		expect(screen.getAllByRole('combobox', { name: i18n.t('chessboard.selectGame') })).toHaveLength(1);
		expect(screen.getByRole('button', { name: new RegExp(i18n.t('chessboard.flip')) })).toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: i18n.t('chessboard.nextMove') }));
		expect(screen.getByRole('button', { name: '1. e4' })).toHaveAttribute('aria-current', 'step');
	});

	it('highlights the currently selected move', () => {
		const target = document.createElement('div');
		document.body.appendChild(target);
		render(<ThemeProvider><ChessViewer pgn="1. e4 e5 *" notationTarget={target} /></ThemeProvider>);

		const move = screen.getByRole('button', { name: '1. e4' });
		fireEvent.click(move);

		expect(move).toHaveAttribute('aria-current', 'step');
		expect(move.className).toContain('bg-emerald-500/15');
	});
});
