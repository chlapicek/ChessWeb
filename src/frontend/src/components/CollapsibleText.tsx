import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapsibleTextProps {
  maxLines?: number;
  className?: string;
  children: React.ReactNode;
}

const LINE_HEIGHT_EM = 1.625;

export const CollapsibleText: React.FC<CollapsibleTextProps> = ({ maxLines = 8, className = '', children }) => {
  const { t } = useTranslation();
  const contentId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    // While expanded there is no clamp to measure against, so keep the last collapsed result.
    const measure = () => { if (!expandedRef.current) setOverflowing(element.scrollHeight > element.clientHeight + 1); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children, maxLines, expanded]);

  const clamped = !expanded;

  return (
    <div className={className}>
      <div className="relative">
        <div
          ref={contentRef}
          id={contentId}
          className="overflow-hidden leading-relaxed"
          style={clamped ? { maxHeight: `${maxLines * LINE_HEIGHT_EM}em` } : undefined}
        >
          {children}
        </div>
        {clamped && overflowing && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-white to-transparent dark:from-slate-900" />
        )}
      </div>
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={contentId}
          className="mt-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
          {t(expanded ? 'common.showLess' : 'common.showMore')}
        </button>
      )}
    </div>
  );
};
