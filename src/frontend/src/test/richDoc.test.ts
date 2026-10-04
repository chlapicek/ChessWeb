import { describe, expect, it } from 'vitest';
import { collectAttachmentIds, plainTextToDoc, sanitizeRichDoc } from '../components/articles/richContent/richDoc';

describe('sanitizeRichDoc', () => {
  it('keeps only attributes accepted by the backend allowlist and drops null values', () => {
    const doc = sanitizeRichDoc({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2, id: 'x' }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'orderedList', attrs: { start: 1, type: null }, content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
        { type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: 'x' }] },
        { type: 'paragraph', attrs: { textAlign: 'left' }, content: [{
          type: 'text',
          text: 'link',
          marks: [
            { type: 'link', attrs: { href: 'https://example.com', target: '_blank', rel: 'noopener noreferrer nofollow', class: null, title: 'evil' } },
            { type: 'bold', attrs: {} },
          ],
        }] },
        { type: 'chessPosition', attrs: { fen: '8/8/8/8/8/8/8/8 w - - 0 1', caption: null, extra: 'x' } },
        { type: 'moveRef', attrs: { gameKey: 'p0', ply: 3, san: 'Nf3', label: '2. Nf3' } },
      ],
    } as never);

    expect(doc.content).toEqual([
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
      { type: 'orderedList', attrs: { start: 1 }, content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
      { type: 'codeBlock', content: [{ type: 'text', text: 'x' }] },
      { type: 'paragraph', content: [{
        type: 'text',
        text: 'link',
        marks: [
          { type: 'link', attrs: { href: 'https://example.com', target: '_blank', rel: 'noopener noreferrer nofollow' } },
          { type: 'bold' },
        ],
      }] },
      { type: 'chessPosition', attrs: { fen: '8/8/8/8/8/8/8/8 w - - 0 1' } },
      { type: 'moveRef', attrs: { gameKey: 'p0', ply: 3, san: 'Nf3' } },
    ]);
  });

  it('drops unknown node properties', () => {
    const doc = sanitizeRichDoc({ type: 'doc', content: [{ type: 'paragraph', foo: 'bar' } as never] });
    expect(doc).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });
});

describe('plainTextToDoc', () => {
  it('splits blank lines into paragraphs and single newlines into hard breaks', () => {
    expect(plainTextToDoc('First line\r\nsecond line\n\n\nNext paragraph\n')).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First line' }, { type: 'hardBreak' }, { type: 'text', text: 'second line' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Next paragraph' }] },
      ],
    });
  });

  it('returns a single empty paragraph for empty content', () => {
    expect(plainTextToDoc('   ')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });
});

describe('collectAttachmentIds', () => {
  it('finds inline image and file attachments', () => {
    const ids = collectAttachmentIds({
      type: 'doc',
      content: [
        { type: 'attachmentImage', attrs: { attachmentId: 'AAAAAAAA-0000-0000-0000-000000000001' } },
        { type: 'blockquote', content: [{ type: 'attachmentFile', attrs: { attachmentId: 'aaaaaaaa-0000-0000-0000-000000000002' } }] },
      ],
    });
    expect([...ids]).toEqual(['aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002']);
  });
});
