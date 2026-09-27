import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Edit3, Trash2 } from 'lucide-react';
import type { ArticleComment, ArticleReactionType } from '../../types';
import { CollapsibleText } from '../CollapsibleText';
import { ReactionBar } from './ReactionBar';
import { MoveChip } from './richContent/MoveChip';
import { parseMoveTokens } from './richContent/moveTokens';

export const COMMENT_MAX_LENGTH = 5000;

export const CommentBody: React.FC<{ content: string }> = ({ content }) => (
  <p className="whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300">
    {parseMoveTokens(content).map((segment, index) =>
      segment.type === 'text'
        ? <React.Fragment key={index}>{segment.text}</React.Fragment>
        : <MoveChip key={index} gameKey={segment.gameKey} ply={segment.ply} san={segment.san} />,
    )}
  </p>
);

interface CommentItemProps {
  comment: ArticleComment;
  onSave: (content: string) => Promise<boolean>;
  onDelete: () => void;
  onReact: (type: ArticleReactionType) => void;
}

export const CommentItem: React.FC<CommentItemProps> = ({ comment, onSave, onDelete, onReact }) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(comment.content);
    setEditing(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setSaving(true);
    const ok = await onSave(draft.trim());
    setSaving(false);
    if (ok) setEditing(false);
  };

  const iconButton = 'p-1 rounded text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500';

  return (
    <article className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-xl p-4 text-xs">
      <header className="flex items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/players/${comment.authorId}`}
            aria-label={`${t('players.viewProfile')}: ${comment.authorName}`}
            className="rounded-sm font-semibold text-slate-800 hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-200 dark:hover:text-emerald-400"
          >
            {comment.authorName}
          </Link>
          {comment.authorRating && (
            <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-mono">
              {comment.authorRating} Elo
            </span>
          )}
          <time dateTime={comment.createdAt} className="text-slate-400 text-[11px]">
            {new Date(comment.createdAt).toLocaleString()}
          </time>
          {comment.updatedAt && (
            <span className="text-slate-400 text-[11px] italic" title={t('articles.editedAt', { date: new Date(comment.updatedAt).toLocaleString() })}>
              {t('articles.edited')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {comment.canEdit && !editing && (
            <button type="button" onClick={startEdit} className={`${iconButton} hover:text-emerald-600`} title={t('articles.editComment')} aria-label={t('articles.editComment')}>
              <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
          {comment.canDelete && (
            <button type="button" onClick={onDelete} className={`${iconButton} hover:text-rose-500`} title={t('articles.deleteComment')} aria-label={t('articles.deleteComment')}>
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {editing ? (
        <form onSubmit={save} className="space-y-2">
          <textarea
            rows={3}
            required
            maxLength={COMMENT_MAX_LENGTH}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label={t('articles.editComment')}
            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-sm text-slate-900 dark:text-white focus:border-emerald-500"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving || !draft.trim()} className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-slate-950 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
              {saving ? t('common.saving') : t('articles.saveComment')}
            </button>
          </div>
        </form>
      ) : (
        <CollapsibleText maxLines={8}>
          <CommentBody content={comment.content} />
        </CollapsibleText>
      )}

      <div className="mt-3">
        <ReactionBar reactions={comment.reactions} onToggle={onReact} size="sm" label={t('articles.commentReactions')} />
      </div>
    </article>
  );
};
