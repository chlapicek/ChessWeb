export type CommentSegment =
  | { type: 'text'; text: string }
  | { type: 'move'; gameKey: string; ply: number; san?: string; raw: string };

const MOVE_TOKEN = /\[\[move:g=(p\d{1,4}|c:[0-9a-fA-F-]{36}),ply=(\d{1,4})(?:,san=([^\]\s,]{1,20}))?\]\]/g;

export const parseMoveTokens = (text: string): CommentSegment[] => {
  const segments: CommentSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(MOVE_TOKEN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) segments.push({ type: 'text', text: text.slice(lastIndex, index) });
    segments.push({ type: 'move', gameKey: match[1], ply: Number(match[2]), san: match[3], raw: match[0] });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ type: 'text', text: text.slice(lastIndex) });
  return segments;
};

export const buildMoveToken = (gameKey: string, ply: number, san?: string): string =>
  `[[move:g=${gameKey},ply=${ply}${san ? `,san=${san}` : ''}]]`;
