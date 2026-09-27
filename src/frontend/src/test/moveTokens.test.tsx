import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CommentBody } from '../components/articles/CommentItem';
import { ArticleBoardProvider } from '../components/articles/richContent/ArticleBoardContext';
import { buildMoveToken, parseMoveTokens } from '../components/articles/richContent/moveTokens';
import i18n from '../i18n';

const games = [{ key: 'p0', pgn: '1. e4 e5 2. Nf3 Nc6 *' }];

const renderBody = (content: string, jumpTo = vi.fn()) => {
  render(
    <ArticleBoardProvider games={games} attachments={[]} jumpTo={jumpTo} showFen={vi.fn()} selectGame={vi.fn()}>
      <CommentBody content={content} />
    </ArticleBoardProvider>,
  );
  return jumpTo;
};

describe('move tokens', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('parses valid tokens and keeps surrounding text', () => {
    expect(parseMoveTokens('See [[move:g=p0,ply=3,san=Nf3]] now')).toEqual([
      { type: 'text', text: 'See ' },
      { type: 'move', gameKey: 'p0', ply: 3, san: 'Nf3', raw: '[[move:g=p0,ply=3,san=Nf3]]' },
      { type: 'text', text: ' now' },
    ]);
    expect(buildMoveToken('p0', 3, 'Nf3')).toBe('[[move:g=p0,ply=3,san=Nf3]]');
  });

  it('renders a valid token as a keyboard-usable chip that jumps the board', () => {
    const jumpTo = renderBody('Look at [[move:g=p0,ply=3,san=Nf3]] here');
    const chip = screen.getByRole('button', { name: 'Show 2. Nf3 on the board' });
    fireEvent.click(chip);
    expect(jumpTo).toHaveBeenCalledWith('p0', 3);
    expect(screen.getByText(/Look at/)).toBeInTheDocument();
  });

  it('renders a disabled chip when the game is unknown', () => {
    renderBody('[[move:g=p7,ply=1,san=e4]]');
    expect(screen.getByRole('button', { name: /not available/ })).toBeDisabled();
  });

  it('leaves malformed tokens and HTML as plain text', () => {
    const { container } = render(
      <CommentBody content={'[[move:g=x1,ply=3]] <img src=x onerror=alert(1)> [[move:g=p0,ply=abc]]'} />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(container.textContent).toContain('[[move:g=x1,ply=3]]');
  });
});
