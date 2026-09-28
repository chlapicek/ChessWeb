import { describe, expect, it } from 'vitest';
import { parsePgnGames } from '../components/ChessViewer';
import { appendMoveToPgn, recordMoveInPgn } from '../components/articles/articleUtils';

const FEN = '8/8/8/8/8/8/8/K1k5 b - - 0 30';

describe('appendMoveToPgn', () => {
  it('appends White and Black moves with the right move numbers', () => {
    expect(appendMoveToPgn('1. e4 *', 0, 'e5', 2)).toBe('1. e4 e5 *');
    expect(appendMoveToPgn('1. e4 e5 *', 0, 'Nf3', 3)).toBe('1. e4 e5 2. Nf3 *');
  });

  it('keeps headers, comments, variations and the result', () => {
    const pgn = '[Event "Club"]\n[Result "1-0"]\n\n1. e4 { best by test } (1. d4 d5) 1-0';
    expect(appendMoveToPgn(pgn, 0, 'e5', 2)).toBe('[Event "Club"]\n[Result "1-0"]\n\n1. e4 { best by test } (1. d4 d5) 1... e5 1-0');
  });

  it('only changes the targeted game', () => {
    const pgn = '[White "A"]\n\n1. e4 *\n\n[White "B"]\n\n1. d4 *\n';
    const updated = appendMoveToPgn(pgn, 1, 'd5', 2);
    expect(updated).toBe('[White "A"]\n\n1. e4 *\n\n[White "B"]\n\n1. d4 d5 *\n');
    expect(parsePgnGames(updated!).map((game) => game.history)).toEqual([['e4'], ['d4', 'd5']]);
  });

  it('starts movetext after headers of a game without moves', () => {
    expect(appendMoveToPgn(`[SetUp "1"]\n[FEN "${FEN}"]\n\n*`, 0, 'Kd2', 1)).toBe(`[SetUp "1"]\n[FEN "${FEN}"]\n\n30... Kd2 *`);
  });

  it('does not append into a trailing line comment', () => {
    expect(parsePgnGames(appendMoveToPgn('1. e4 ; note\n*', 0, 'e5', 2)!)[0].history).toEqual(['e4', 'e5']);
  });

  it('rejects unknown games, illegal moves and moves for a different ply', () => {
    expect(appendMoveToPgn('1. e4 *', 1, 'e5', 2)).toBeNull();
    expect(appendMoveToPgn('1. e4 *', 0, 'Ke2', 2)).toBeNull();
    expect(appendMoveToPgn('1. e4 e5 *', 0, 'Nf3', 2)).toBeNull();
  });
});

describe('recordMoveInPgn', () => {
  it('creates a PGN from the start position or a FEN when there is none', () => {
    expect(recordMoveInPgn('', undefined, 'e4', 1)).toBe('1. e4 *');
    expect(recordMoveInPgn('', 'fen', 'Kd2', 1, FEN)).toBe(`[SetUp "1"]\n[FEN "${FEN}"]\n\n30... Kd2 *`);
  });

  it('extends PGN games and ignores collection games', () => {
    expect(recordMoveInPgn('1. e4 *', 'p0', 'e5', 2)).toBe('1. e4 e5 *');
    expect(recordMoveInPgn('', 'c:00000000-0000-0000-0000-000000000000', 'e4', 1)).toBeNull();
    expect(recordMoveInPgn('1. e4 *', 'fen', 'Kd2', 1, FEN)).toBeNull();
  });
});
