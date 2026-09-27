import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

interface PendingConfirm {
  id: number;
  options: ConfirmOptions;
  resolve: (result: boolean) => void;
}

const ConfirmContext = createContext<ConfirmFn | null>(null);

export const useConfirm = (): ConfirmFn => {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used within a <ConfirmProvider>.');
  return confirm;
};

const ConfirmDialogView: React.FC<{ options: ConfirmOptions; onClose: (result: boolean) => void }> = ({ options, onClose }) => {
  const { t } = useTranslation();
  const titleId = useId();
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose(false);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        const next = document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current;
        next?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const confirmClass = options.destructive
    ? 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500'
    : 'bg-emerald-500 text-slate-950 hover:bg-emerald-600 focus-visible:ring-emerald-500';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-fade-in dark:bg-slate-950/80"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(false); }}
      data-testid="confirm-dialog-backdrop"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={options.message ? messageId : undefined}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-start gap-3">
          {options.destructive && (
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400" aria-hidden="true">
              <AlertTriangle className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold text-slate-900 dark:text-white">{options.title}</h2>
            {options.message && <p id={messageId} className="mt-2 text-sm text-slate-600 dark:text-slate-300">{options.message}</p>}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onClose(false)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {options.cancelLabel ?? t('common.cancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onClose(true)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${confirmClass}`}
          >
            {options.confirmLabel ?? t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);
  const nextIdRef = useRef(0);

  const confirm = useCallback<ConfirmFn>((options) => new Promise<boolean>((resolve) => {
    // A newer request supersedes an unanswered one.
    pendingRef.current?.resolve(false);
    nextIdRef.current += 1;
    const next = { id: nextIdRef.current, options, resolve };
    pendingRef.current = next;
    setPending(next);
  }), []);

  const close = useCallback((result: boolean) => {
    pendingRef.current?.resolve(result);
    pendingRef.current = null;
    setPending(null);
  }, []);

  useEffect(() => () => pendingRef.current?.resolve(false), []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <ConfirmDialogView key={pending.id} options={pending.options} onClose={close} />}
    </ConfirmContext.Provider>
  );
};
