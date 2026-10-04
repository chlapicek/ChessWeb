import { Chess } from 'chess.js';
import { parseGame } from '@mliebelt/pgn-parser';
import type { PgnMove } from '@mliebelt/pgn-types';

export type NodePath = number[];
export type PgnNode = {
  san?: string;
  fen: string;
  comments: string[];
  startingComments: string[];
  nags: string[];
  children: PgnNode[];
};
export type PgnTree = { root: PgnNode; headers: Record<string, string>; result: string; source: string };
export type PgnChunk = { start: number; end: number; pgn: string };
export type BranchMove = {
  gameKey?: string;
  parentPath: NodePath;
  expectedParentFen: string;
  expectedSource: string;
  pgn: string;
  nodePath: NodePath;
  san: string;
};

export const pathKey = (path: NodePath) => path.join('.');
export const isMainlinePath = (path: NodePath) => path.every((index) => index === 0);
export const nodeAt = (tree: PgnTree, path: NodePath): PgnNode | undefined => {
  let node = tree.root;
  for (const index of path) {
    if (!Number.isInteger(index) || index < 0 || !node.children[index]) return undefined;
    node = node.children[index];
  }
  return node;
};
export const mainlineNodes = (tree: PgnTree): PgnNode[] => {
  const nodes: PgnNode[] = [];
  let node = tree.root.children[0];
  while (node) { nodes.push(node); node = node.children[0]; }
  return nodes;
};

export const splitPgnChunks = (source: string): PgnChunk[] => {
  const boundaries = [0];
  let comment = false;
  let lineComment = false;
  let quoted = false;
  let tag = false;
  let depth = 0;
  let moves = false;
  let ended = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (lineComment) { if (character === '\n') lineComment = false; continue; }
    if (comment) { if (character === '}') comment = false; continue; }
    if (tag) {
      if (character === '"' && source[index - 1] !== '\\') quoted = !quoted;
      if (character === ']' && !quoted) tag = false;
      continue;
    }
    if (/\s/.test(character)) continue;
    if (depth === 0 && (ended || (character === '[' && moves))) {
      boundaries.push(index);
      ended = false;
      moves = false;
    }
    if (character === '{') { comment = true; continue; }
    if (character === ';') { lineComment = true; continue; }
    if (character === '[') { tag = true; continue; }
    if (character === '(') { depth += 1; continue; }
    if (character === ')') { depth -= 1; continue; }
    moves = true;
    const result = depth === 0 && source.slice(index).match(/^(1-0|0-1|1\/2-1\/2|\*)(?=\s|$)/);
    if (result) { ended = true; index += result[0].length - 1; }
  }
  boundaries.push(source.length);
  return boundaries.slice(0, -1).flatMap((start, index) => {
    const raw = source.slice(start, boundaries[index + 1]);
    const leading = raw.length - raw.trimStart().length;
    const end = boundaries[index + 1] - (raw.length - raw.trimEnd().length);
    return end > start + leading ? [{ start: start + leading, end, pgn: source.slice(start + leading, end) }] : [];
  });
};

export const MAX_TREE_DEPTH = 512;
export const MAX_TREE_NODES = 4096;
const MAX_VARIATION_DEPTH = 32;

export const parsePgnTree = (source: string, startFen?: string): PgnTree => {
  if (source.length > 250000) throw new Error('PGN size limit exceeded');
  const rawComments: string[] = [];
  const matches = [...source.matchAll(/\[(?:"(?:\\.|[^"\\])*"|[^\]"\r\n])*\]|\{[^}]*\}|;[^\r\n]*|\$\d+|[()]|[^\s{}();$\[]+/g)];
  let consumed = 0;
  for (const match of matches) {
    if (source.slice(consumed, match.index).trim()) throw new Error('Invalid PGN token');
    consumed = match.index + match[0].length;
  }
  if (source.slice(consumed).trim()) throw new Error('Invalid PGN token');
  const tokens = matches.map((match) => match[0]);
  if (tokens.length > 20000) throw new Error('PGN token limit exceeded');
  let variationDepth = 0;
  const normalized: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '(' && ++variationDepth > MAX_VARIATION_DEPTH) throw new Error('PGN variation limit exceeded');
    if (token === ')' && --variationDepth < 0) throw new Error('Unbalanced PGN variation');
    if (!/^(?:\{|;|\$)/.test(token)) { normalized.push(token); continue; }
    const nags: string[] = [];
    const notes: string[] = [];
    while (index < tokens.length && /^(?:\{|;|\$)/.test(tokens[index])) {
      const annotation = tokens[index++];
      if (annotation.startsWith('$')) nags.push(annotation);
      else {
        rawComments.push(annotation.startsWith('{') ? annotation.slice(1, -1).trim() : annotation.slice(1).trim());
        notes.push(`{ CWCOMMENT${rawComments.length - 1} }`);
      }
    }
    index -= 1;
    normalized.push(...nags, ...notes);
  }
  if (variationDepth !== 0) throw new Error('Unbalanced PGN variation');
  const comments = (text?: string) => text ? [...text.matchAll(/CWCOMMENT(\d+)/g)].map((match) => rawComments[Number(match[1])]) : [];
  const parsed = parseGame(normalized.join(' ') || '*', startFen ? { startRule: 'game', fen: startFen } : undefined);
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.tags ?? {})) {
    if (key === 'messages') continue;
    if (typeof value === 'string') headers[key] = value;
    else if (value && typeof value === 'object' && 'value' in value && typeof value.value === 'string') headers[key] = value.value;
    else throw new Error(`Unsupported PGN tag: ${key}`);
  }
  if (headers.Variant && !['standard', 'chess', 'normal'].includes(headers.Variant.toLowerCase())) throw new Error('Unsupported chess variant');
  const result = headers.Result ?? '*';
  if (!tokens.some((token) => /^\[Result\s/i.test(token))) delete headers.Result;
  if (startFen && !headers.FEN) { headers.SetUp = '1'; headers.FEN = startFen; }
  const board = new Chess(headers.FEN || startFen);
  const root: PgnNode = { fen: board.fen(), comments: comments(parsed.gameComment?.comment), startingComments: [], nags: [], children: [] };
  let nodeCount = 0;
  const addLine = (moves: PgnMove[], parent: PgnNode, depth = 0) => {
    let current = parent;
    for (const move of moves) {
      if (++nodeCount > MAX_TREE_NODES || ++depth > MAX_TREE_DEPTH) throw new Error('PGN tree limit exceeded');
      const position = new Chess(current.fen);
      const played = position.move(move.notation.notation, { strict: true });
      if (!played || move.notation.drop || move.drawOffer) throw new Error('Unsupported or illegal PGN move');
      const node: PgnNode = {
        san: played.san, fen: position.fen(), children: [],
        comments: comments(move.commentAfter || move.commentDiag?.comment),
        startingComments: comments(move.commentMove), nags: move.nag ?? [],
      };
      current.children.push(node);
      for (const variation of move.variations ?? []) addLine(variation, current, depth - 1);
      current = node;
    }
  };
  addLine(parsed.moves, root);
  return { root, headers, result, source };
};

const validateTreeBounds = (tree: PgnTree) => {
  const stack = [{ node: tree.root, depth: 0, variations: 0 }];
  let count = 0;
  while (stack.length) {
    const { node, depth, variations } = stack.pop()!;
    if (++count > MAX_TREE_NODES + 1 || depth > MAX_TREE_DEPTH || variations > MAX_VARIATION_DEPTH) throw new Error('PGN tree limit exceeded');
    node.children.forEach((child, index) => stack.push({ node: child, depth: depth + 1, variations: variations + (index > 0 ? 1 : 0) }));
  }
};

const escapeHeader = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const commentText = (comments: string[]) => comments.map((comment) => comment.includes('}') ? `\n; ${comment}\n` : `{ ${comment} }`).join(' ');
export const serializePgnTree = (tree: PgnTree): string => {
  validateTreeBounds(tree);
  const line = (parent: PgnNode, childIndex = 0): string => {
    const child = parent.children[childIndex];
    if (!child) return '';
    const fields = parent.fen.split(' ');
    const number = `${fields[5]}${fields[1] === 'b' ? '...' : '.'}`;
    const tokens = [commentText(child.startingComments), number, child.san, ...child.nags, commentText(child.comments)];
    if (childIndex === 0) parent.children.slice(1).forEach((_, index) => tokens.push(`(${line(parent, index + 1)})`));
    tokens.push(line(child));
    return tokens.filter(Boolean).join(' ');
  };
  const headers = Object.entries(tree.headers).map(([key, value]) => `[${key} "${escapeHeader(value)}"]`).join('\n');
  const source = `${headers}${headers ? '\n\n' : ''}${[commentText(tree.root.comments), line(tree.root), tree.result].filter(Boolean).join(' ')}`;
  const reparsed = parsePgnTree(source);
  const nodeData = (node: PgnNode): unknown => [node.san, node.fen, node.comments, node.startingComments, node.nags, node.children.map(nodeData)];
  const headerData = (values: Record<string, string>) => Object.entries(values).sort(([left], [right]) => left.localeCompare(right));
  if (JSON.stringify(nodeData(reparsed.root)) !== JSON.stringify(nodeData(tree.root)) || JSON.stringify(headerData(reparsed.headers)) !== JSON.stringify(headerData(tree.headers)) || reparsed.result !== tree.result) throw new Error('PGN serialization changed the tree');
  return source;
};

export const addTreeMove = (tree: PgnTree, parentPath: NodePath, san: string) => {
  validateTreeBounds(tree);
  if (parentPath.length >= MAX_TREE_DEPTH) throw new Error('PGN depth limit exceeded');
  const parent = nodeAt(tree, parentPath);
  if (!parent) throw new Error('Unknown parent path');
  const board = new Chess(parent.fen);
  const move = board.move(san, { strict: true });
  const existing = parent.children.findIndex((child) => child.san === move.san);
  if (existing >= 0) return { tree, nodePath: [...parentPath, existing], added: false };
  const copy: PgnTree = structuredClone(tree);
  const copiedParent = nodeAt(copy, parentPath)!;
  copiedParent.children.push({ san: move.san, fen: board.fen(), comments: [], startingComments: [], nags: [], children: [] });
  validateTreeBounds(copy);
  return { tree: copy, nodePath: [...parentPath, copiedParent.children.length - 1], added: true };
};

export const replacePgnChunk = (source: string, index: number, expected: string, replacement: string): string | null => {
  try {
    const chunks = splitPgnChunks(source);
    chunks.forEach((chunk) => parsePgnTree(chunk.pgn));
    const chunk = chunks[index];
    if (!chunk || chunk.pgn !== expected.trim()) return null;
    parsePgnTree(replacement);
    return source.slice(0, chunk.start) + replacement + source.slice(chunk.end);
  } catch { return null; }
};

export const completePgnExport = (source: string): string => splitPgnChunks(source).map((chunk) => {
  const tree = parsePgnTree(chunk.pgn);
  for (const key of ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result']) {
    tree.headers[key] ??= key === 'Date' ? '????.??.??' : key === 'Result' ? tree.result : '?';
  }
  return serializePgnTree(tree);
}).join('\n\n');