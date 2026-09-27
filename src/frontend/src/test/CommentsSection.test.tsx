import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ConfirmProvider } from '../components/ConfirmDialog';
import { CommentsSection } from '../components/articles/CommentsSection';
import type { ArticleComment } from '../types';
import i18n from '../i18n';

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../services/apiClient', () => ({ apiClient: apiMocks }));

const reader = { id: 'user-2', email: 'reader@example.com', fullName: 'Reader', roles: ['RegisteredUser'] };

const comment: ArticleComment = {
  id: 'comment-1',
  articleId: 'article-1',
  content: 'Great game!',
  createdAt: '2026-09-20T10:00:00Z',
  updatedAt: '2026-09-21T10:00:00Z',
  authorId: 'user-2',
  authorName: 'Reader',
  authorRating: '1800',
  reactions: [],
  canEdit: true,
  canDelete: true,
};

const page = (items: ArticleComment[]) => ({ items, totalCount: items.length, pageNumber: 1, pageSize: 10, totalPages: 1 });

const renderSection = (commentsLocked = false) => render(
  <AuthProvider>
    <ConfirmProvider>
      <MemoryRouter>
        <CommentsSection
          article={{ id: 'article-1', authorId: 'author-1', commentsLocked, commentsCount: 1 }}
          boardState={null}
          onCountChange={vi.fn()}
          onLockedChange={vi.fn()}
        />
      </MemoryRouter>
    </ConfirmProvider>
  </AuthProvider>,
);

describe('CommentsSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    localStorage.clear();
    localStorage.setItem('chessweb_token', 'token');
    localStorage.setItem('chessweb_user', JSON.stringify(reader));
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
    apiMocks.get.mockImplementation(async (url: string) => {
      if (url === '/auth/me') return { data: reader };
      if (url === '/articles/article-1/comments') return { data: page([comment]) };
      return { data: [] };
    });
  });

  it('renders comments with a profile link, edited marker and a composer', async () => {
    renderSection();

    expect(await screen.findByText('Great game!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View profile: Reader' })).toHaveAttribute('href', '/players/user-2');
    expect(screen.getByText('(edited)')).toHaveAttribute('title', expect.stringContaining('Edited'));
    expect(screen.getByLabelText('Your comment')).toBeInTheDocument();
    expect(apiMocks.get).toHaveBeenCalledWith('/articles/article-1/comments', { params: { page: 1, pageSize: 10 } });
  });

  it('shows the locked notice and hides the composer for non-authors', async () => {
    apiMocks.get.mockImplementation(async (url: string) => {
      if (url === '/auth/me') return { data: reader };
      return { data: page([{ ...comment, canEdit: false }]) };
    });
    renderSection(true);

    expect(await screen.findByText('Comments are locked for this article.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Your comment')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit comment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lock comments' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock comments' })).not.toBeInTheDocument();
  });

  it('edits a comment through PUT and shows the updated text', async () => {
    apiMocks.put.mockResolvedValue({ data: { ...comment, content: 'Even better game!' } });
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit comment' }));
    const editor = screen.getByRole('textbox', { name: 'Edit comment' });
    fireEvent.change(editor, { target: { value: 'Even better game!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(apiMocks.put).toHaveBeenCalledWith('/articles/comments/comment-1', { content: 'Even better game!' }));
    expect(await screen.findByText('Even better game!')).toBeInTheDocument();
  });

  it('asks for confirmation before deleting a comment', async () => {
    apiMocks.delete.mockResolvedValue({ data: {} });
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete comment' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete comment?' });
    expect(apiMocks.delete).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(apiMocks.delete).toHaveBeenCalledWith('/articles/comments/comment-1'));
  });

  it('jumps to the last page after posting a comment', async () => {
    apiMocks.get.mockImplementation(async (url: string, config?: { params?: { page?: number } }) => {
      if (url === '/auth/me') return { data: reader };
      const items = Array.from({ length: 10 }, (_, index) => ({ ...comment, id: `c-${index}`, content: `Comment ${index}` }));
      return { data: { items, totalCount: 10, pageNumber: config?.params?.page ?? 1, pageSize: 10, totalPages: 1 } };
    });
    apiMocks.post.mockResolvedValue({ data: comment });
    renderSection();

    await screen.findByText('Comment 0');
    fireEvent.change(screen.getByLabelText('Your comment'), { target: { value: 'New one' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/articles/article-1/comments', { content: 'New one' }));
    await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith('/articles/article-1/comments', { params: { page: 2, pageSize: 10 } }));
  });
});
