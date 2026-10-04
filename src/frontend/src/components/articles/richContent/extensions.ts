import { mergeAttributes, Node, ReactNodeViewRenderer, type Extensions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { AttachmentFileView, AttachmentImageView, ChessGameView, ChessPositionView, MoveRefView } from './nodeViews';

export const SAFE_LINK_REL = 'noopener noreferrer nofollow';
const SAFE_URL = /^(https?:\/\/|mailto:)/i;

export const isSafeLinkHref = (href: string) => {
  if (!SAFE_URL.test(href) || href.length > 2000) return false;
  try {
    new URL(href);
    return true;
  } catch {
    return false;
  }
};

const SafeLink = Link.extend({
  renderHTML(props) {
    const [tag, attrs] = this.parent?.(props) as [string, Record<string, unknown>, 0];
    return [tag, { ...attrs, target: '_blank', rel: SAFE_LINK_REL }, 0];
  },
}).configure({
  openOnClick: false,
  autolink: true,
  linkOnPaste: true,
  defaultProtocol: 'https',
  isAllowedUri: (url) => isSafeLinkHref(url),
  HTMLAttributes: { target: '_blank', rel: SAFE_LINK_REL, class: null },
});

const attr = (name: string) => ({
  default: null,
  parseHTML: (element: HTMLElement) => element.getAttribute(`data-${name}`),
  renderHTML: (attrs: Record<string, unknown>) => (attrs[name] == null ? {} : { [`data-${name}`]: String(attrs[name]) }),
});

const AttachmentImage = Node.create({
  name: 'attachmentImage',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes: () => ({ attachmentId: attr('attachmentId'), alt: attr('alt') }),
  parseHTML: () => [{ tag: 'figure[data-attachment-image]' }],
  renderHTML: ({ HTMLAttributes }) => ['figure', mergeAttributes(HTMLAttributes, { 'data-attachment-image': '' })],
  addNodeView: () => ReactNodeViewRenderer(AttachmentImageView),
});

const AttachmentFile = Node.create({
  name: 'attachmentFile',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes: () => ({ attachmentId: attr('attachmentId') }),
  parseHTML: () => [{ tag: 'div[data-attachment-file]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-attachment-file': '' })],
  addNodeView: () => ReactNodeViewRenderer(AttachmentFileView),
});

const ChessPosition = Node.create({
  name: 'chessPosition',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes: () => ({ fen: attr('fen'), caption: attr('caption') }),
  parseHTML: () => [{ tag: 'figure[data-chess-position]' }],
  renderHTML: ({ HTMLAttributes }) => ['figure', mergeAttributes(HTMLAttributes, { 'data-chess-position': '' })],
  renderText: ({ node }) => (node.attrs.caption as string | null) ?? '',
  addNodeView: () => ReactNodeViewRenderer(ChessPositionView),
});

const ChessGame = Node.create({
  name: 'chessGame',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes: () => ({ gameKey: attr('gameKey') }),
  parseHTML: () => [{ tag: 'div[data-chess-game]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-chess-game': '' })],
  addNodeView: () => ReactNodeViewRenderer(ChessGameView),
});

const MoveRef = Node.create({
  name: 'moveRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes: () => ({
    gameKey: attr('gameKey'),
    ply: {
      default: 0,
      parseHTML: (element: HTMLElement) => Number(element.getAttribute('data-ply')) || 0,
      renderHTML: (attrs: Record<string, unknown>) => ({ 'data-ply': String(attrs.ply) }),
    },
    san: attr('san'),
  }),
  parseHTML: () => [{ tag: 'span[data-move-ref]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-move-ref': '' })],
  renderText: ({ node }) => (node.attrs.san as string | null) ?? '',
  addNodeView: () => ReactNodeViewRenderer(MoveRefView, { as: 'span' }),
});

export const createRichExtensions = (): Extensions => [
  StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: false }),
  SafeLink,
  AttachmentImage,
  AttachmentFile,
  ChessPosition,
  ChessGame,
  MoveRef,
];
