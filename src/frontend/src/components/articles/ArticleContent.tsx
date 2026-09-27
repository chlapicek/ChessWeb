import React, { Suspense, lazy, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Article } from '../../types';
import { parseRichDoc } from './richContent/richDoc';

const RichContentRenderer = lazy(() => import('./richContent/RichContentRenderer'));

interface ArticleContentProps {
  article: Pick<Article, 'content' | 'contentFormat' | 'excerpt'>;
}

const PlainContent: React.FC<{ text: string }> = ({ text }) => (
  <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800 dark:text-slate-200">{text}</div>
);

export const ArticleContent: React.FC<ArticleContentProps> = ({ article }) => {
  const { t } = useTranslation();
  const doc = useMemo(() => (article.contentFormat === 1 ? parseRichDoc(article.content) : null), [article.content, article.contentFormat]);

  if (article.contentFormat !== 1) return <PlainContent text={article.content} />;
  if (!doc) return <PlainContent text={article.excerpt} />;
  return (
    <Suspense fallback={<p className="text-xs text-slate-500">{t('common.loading')}</p>}>
      <RichContentRenderer doc={doc} />
    </Suspense>
  );
};
