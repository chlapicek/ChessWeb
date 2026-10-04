import React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import type { ArticleReactionType, ReactionSummary } from '../../types';
import { REACTION_CONFIG } from './articleUtils';

interface ReactionBarProps {
  reactions: ReactionSummary[] | undefined;
  onToggle: (type: ArticleReactionType) => void;
  size?: 'sm' | 'md';
  label?: string;
}

export const ReactionBar: React.FC<ReactionBarProps> = ({ reactions, onToggle, size = 'md', label }) => {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  const handleClick = (event: React.MouseEvent, type: ArticleReactionType) => {
    event.stopPropagation();
    if (!isAuthenticated) {
      toast.error(t('auth.signInPrompt'));
      return;
    }
    onToggle(type);
  };

  const sizeClass = size === 'sm' ? 'gap-1 px-2 py-0.5 text-[11px]' : 'gap-1.5 px-3 py-1.5 text-xs';

  return (
    <div role="group" aria-label={label ?? t('articles.reactions')} className="flex flex-wrap items-center gap-1.5">
      {REACTION_CONFIG.map(({ type, emoji, labelKey }) => {
        const summary = reactions?.find((reaction) => reaction.reactionType === type);
        const count = summary?.count ?? 0;
        const active = summary?.userReacted ?? false;
        const name = t(labelKey);
        return (
          <button
            key={type}
            type="button"
            onClick={(event) => handleClick(event, type)}
            title={name}
            aria-label={t('articles.reactionButton', { name, count })}
            aria-pressed={active}
            className={`flex items-center rounded-full border font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${sizeClass} ${
              active
                ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <span aria-hidden="true">{emoji}</span>
            <span className="font-mono">{count}</span>
          </button>
        );
      })}
    </div>
  );
};
