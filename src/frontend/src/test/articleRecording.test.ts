import { describe, expect, it } from 'vitest';
import { parsePgnGames } from '../components/ChessViewer';
import { appendMoveToPgn, recordMoveInPgn, recordBranchInPgn } from '../components/articles/articleUtils';
import { addTreeMove, completePgnExport, mainlineNodes, MAX_TREE_DEPTH, nodeAt, parsePgnTree, serializePgnTree, splitPgnChunks, type BranchMove } from '../chess/pgnTree';

describe('PGN variation tree', () => {
  it('exports complete tags and terminal results for every game including the starter', () => {
    const exported = completePgnExport('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6\n\n[Event "Second"]\n1. d4 (1. e4) *');
    const chunks = splitPgnChunks(exported);
    expect(chunks).toHaveLength(2);
    chunks.forEach((chunk) => {
      expect(chunk.pgn).toMatch(/\*$/);
      expect(Object.keys(parsePgnTree(chunk.pgn).headers)).toEqual(expect.arrayContaining(['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result']));
    });
    expect(nodeAt(parsePgnTree(chunks[1].pgn), [1])?.san).toBe('e4');
    expect(() => completePgnExport('1. e4 *\n\n[Variant "Atomic"] 1. d4 *')).toThrow();
  });

  it('uses inline parsed tags for variant gating, FEN and typed metadata roundtrips', () => {
    expect(() => parsePgnTree('[Event "Club"] [Variant "Atomic"] 1. e4 *')).toThrow('Unsupported chess variant');
    const source = '[Event "Club {quoted}"] [Date "2026.10.04"] [UTCDate "2026.10.04"] [UTCTime "12:34:56"] [TimeControl "300+2"] [Custom "a\\"b"] [SetUp "1"] [FEN "8/8/8/8/8/8/8/K1k5 b - - 0 30"] 30... Kd2 *';
    const tree = parsePgnTree(source);
    expect(tree.headers).toMatchObject({ Event: 'Club {quoted}', Date: '2026.10.04', UTCDate: '2026.10.04', UTCTime: '12:34:56', TimeControl: '300+2', Custom: 'a"b' });
    expect(tree.root.fen).toBe('8/8/8/8/8/8/8/K1k5 b - - 0 30');
    expect(parsePgnTree(serializePgnTree(tree))).toMatchObject({ root: tree.root, headers: tree.headers });
  });

  it('does not extract header-shaped comments and retains every interleaved annotation', () => {
    const tree = parsePgnTree('[Event "Real"]\n\n{\n[Variant "Atomic"]\n[FEN "invalid"]\n} 1. e4 {a} $1 {b} $2 e5 *');
    expect(tree.headers.Variant).toBeUndefined();
    expect(tree.headers.FEN).toBeUndefined();
    expect(nodeAt(tree, [0])).toMatchObject({ comments: ['a', 'b'], nags: ['$1', '$2'] });
    expect(parsePgnTree(serializePgnTree(tree)).root).toEqual(tree.root);
  });

  it('rejects excessive nesting and tree depth before edits and serialization', () => {
    expect(() => parsePgnTree(`1. e4 ${'('.repeat(33)}1. d4${')'.repeat(33)} *`)).toThrow('variation limit');
    expect(() => parsePgnTree(`${'Nf3 Nf6 Ng1 Ng8 '.repeat(MAX_TREE_DEPTH / 4)}Nf3 *`)).toThrow('tree limit');
    const tree = parsePgnTree('*');
    let parent = tree.root;
    for (let index = 0; index <= MAX_TREE_DEPTH; index += 1) {
      const child = { ...tree.root, san: 'e4', children: [] };
      parent.children.push(child); parent = child;
    }
    expect(() => serializePgnTree(tree)).toThrow('tree limit');
    expect(() => addTreeMove(tree, [], 'e4')).toThrow('tree limit');
  });

  it('preserves comment delimiters as text and leaves illegal edits atomic', () => {
    const tree = parsePgnTree('1. e4 e5 (1... c5) *');
    const before = structuredClone(tree);
    expect(() => addTreeMove(tree, [0, 1], 'Ke4')).toThrow();
    expect(tree).toEqual(before);
    nodeAt(tree, [0, 1])!.comments.push('broken } 2. Ke4 {');
    expect(parsePgnTree(serializePgnTree(tree)).root).toEqual(tree.root);
  });

  it('normalizes RAV to siblings before the replaced move and keeps the mainline', () => {
    const tree = parsePgnTree('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *');
    expect(nodeAt(tree, [0])?.children.map((node) => node.san)).toEqual(['e5', 'c5']);
    expect(mainlineNodes(tree).map((node) => node.san)).toEqual(['e4', 'e5', 'Nf3']);
    expect(nodeAt(tree, [0, 1, 0])?.san).toBe('Nf3');
    expect(parsePgnTree(serializePgnTree(tree)).root).toEqual(tree.root);
  });

  it('retains nested variations, starting comments, NAGs and repeated-position annotations', () => {
    const tree = parsePgnTree('[Event "Club"]\n\n{ intro } 1. e4 { first } $1 e5 ({ Sicilian } 1... c5 $2 2. Nf3 (2. Nc3 { alternate })) 2. Nf3 *');
    expect(tree.root.comments).toEqual(['intro']);
    expect(nodeAt(tree, [0, 1])?.startingComments).toEqual(['Sicilian']);
    expect(nodeAt(tree, [0, 1])?.nags).toEqual(['$2']);
    expect(parsePgnTree(serializePgnTree(tree))).toMatchObject({ root: tree.root, headers: tree.headers, result: '*' });
  });

  it('selects existing children without duplication and appends alternatives last', () => {
    const tree = parsePgnTree('1. e4 e5 *');
    expect(addTreeMove(tree, [0], 'e5').added).toBe(false);
    const added = addTreeMove(tree, [0], 'c5');
    expect(added.nodePath).toEqual([0, 1]);
    expect(mainlineNodes(added.tree).map((node) => node.san)).toEqual(['e4', 'e5']);
    expect(() => parsePgnTree('1. e4 e5 (1... Ke2) *')).toThrow();
  });
});

const FEN = '8/8/8/8/8/8/8/K1k5 b - - 0 30';

describe('article branch recording', () => {
  const branch = (source: string, parentPath: number[], san: string, gameKey = 'p0'): BranchMove => {
    const tree = parsePgnTree(source);
    const addition = addTreeMove(tree, parentPath, san);
    return { gameKey, parentPath, expectedParentFen: nodeAt(tree, parentPath)!.fen,
      expectedSource: source, pgn: serializePgnTree(addition.tree), nodePath: addition.nodePath, san };
  };

  it('records at any node and leaves other game bytes and separators unchanged', () => {
    const first = '[White "A"]\r\n\r\n1. d4 *';
    const second = '[White "B"]\n\n1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *';
    const source = `${first}\r\n\r\n${second}\n\n`;
    const move = branch(second, [0, 1], 'Nc3', 'p1');
    const updated = recordBranchInPgn(source, move)!;
    expect(updated).toBe(`${first}\r\n\r\n${move.pgn}\n\n`);
    expect(nodeAt(parsePgnGames(updated)[1].tree, [0, 1])?.children.map((node) => node.san)).toEqual(['Nf3', 'Nc3']);
  });

  it('fails atomically for stale source, wrong parent, invalid other games and size overflow', () => {
    const move = branch('1. e4 e5 *', [0], 'c5');
    expect(recordBranchInPgn('1. e4 e6 *', move)).toBeNull();
    expect(recordBranchInPgn(move.expectedSource, { ...move, expectedParentFen: FEN })).toBeNull();
    expect(recordBranchInPgn(`${move.expectedSource}\n\n[Event "Bad"]\n\n1. Ke4 *`, move)).toBeNull();
    expect(recordBranchInPgn(move.expectedSource, move, move.pgn.length - 1)).toBeNull();
    expect(recordBranchInPgn(move.expectedSource, { ...move, gameKey: 'c:linked' })).toBeNull();
  });

  it('starts an empty or FEN-owned game and never overwrites existing PGN with a FEN game', () => {
    expect(recordBranchInPgn('', branch('*', [], 'e4'))).toContain('1. e4');
    const source = `[SetUp "1"]\n[FEN "${FEN}"]\n\n*`;
    const move = branch(source, [], 'Kd2', 'fen');
    expect(recordBranchInPgn('', move)).toContain('30... Kd2');
    expect(recordBranchInPgn('1. e4 *', move)).toBeNull();
  });
});

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
