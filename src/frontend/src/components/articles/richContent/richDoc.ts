import type { JSONContent } from '@tiptap/core';

export type RichDoc = JSONContent & { type: 'doc' };

// Mirrors the attribute allowlist in the backend RichContentValidator; anything else is rejected there.
const NODE_ATTRS: Record<string, readonly string[]> = {
  heading: ['level'],
  orderedList: ['start'],
  codeBlock: ['language'],
  attachmentImage: ['attachmentId', 'alt'],
  attachmentFile: ['attachmentId'],
  chessPosition: ['fen', 'caption'],
  chessGame: ['gameKey'],
  moveRef: ['gameKey', 'ply', 'san'],
};

const MARK_ATTRS: Record<string, readonly string[]> = {
  link: ['href', 'target', 'rel'],
};

export const MAX_RICH_CONTENT_LENGTH = 50000;

export const GAME_KEY_PATTERN = /^(p(0|[1-9][0-9]{0,3})|c:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

export const isArticleGameKey = (key: string | undefined): key is string => !!key && GAME_KEY_PATTERN.test(key);

const pickAttrs = (attrs: Record<string, unknown> | undefined, allowed: readonly string[] | undefined) => {
  if (!attrs || !allowed) return undefined;
  const picked: Record<string, unknown> = {};
  for (const name of allowed) {
    const value = attrs[name];
    if (value !== null && value !== undefined) picked[name] = value;
  }
  return Object.keys(picked).length > 0 ? picked : undefined;
};

export const sanitizeRichNode = (node: JSONContent): JSONContent => {
  const result: JSONContent = { type: node.type };
  const attrs = pickAttrs(node.attrs, node.type ? NODE_ATTRS[node.type] : undefined);
  if (attrs) result.attrs = attrs;
  if (node.type === 'text') result.text = node.text ?? '';
  if (node.marks?.length) {
    result.marks = node.marks.map((mark) => {
      const markAttrs = pickAttrs(mark.attrs, MARK_ATTRS[mark.type]);
      return markAttrs ? { type: mark.type, attrs: markAttrs } : { type: mark.type };
    });
  }
  if (node.content) result.content = node.content.map(sanitizeRichNode);
  return result;
};

export const sanitizeRichDoc = (doc: JSONContent): RichDoc => ({ ...sanitizeRichNode(doc), type: 'doc', content: (doc.content ?? []).map(sanitizeRichNode) });

export const plainTextToDoc = (text: string): RichDoc => {
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/).map((block) => block.replace(/^\n+|\n+$/g, ''));
  const content = blocks.filter((block) => block.trim()).map((block): JSONContent => {
    const inline: JSONContent[] = [];
    block.split('\n').forEach((line, index) => {
      if (index > 0) inline.push({ type: 'hardBreak' });
      if (line) inline.push({ type: 'text', text: line });
    });
    return { type: 'paragraph', content: inline };
  });
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
};

export const parseRichDoc = (json: string): RichDoc | null => {
  try {
    const parsed = JSON.parse(json) as JSONContent;
    return parsed && parsed.type === 'doc' && Array.isArray(parsed.content) ? (parsed as RichDoc) : null;
  } catch {
    return null;
  }
};

export const collectAttachmentIds = (node: JSONContent | null | undefined, ids = new Set<string>()): Set<string> => {
  if (!node) return ids;
  if ((node.type === 'attachmentImage' || node.type === 'attachmentFile') && typeof node.attrs?.attachmentId === 'string') {
    ids.add(node.attrs.attachmentId.toLowerCase());
  }
  node.content?.forEach((child) => collectAttachmentIds(child, ids));
  return ids;
};
