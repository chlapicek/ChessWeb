import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { parsePgnGames, type ViewerGame } from './ChessViewer';

export interface GameCollectionEntry {
  key: string;
  label?: string;
  white?: string;
  black?: string;
  result?: string;
  event?: string;
}

interface GameCollectionPanelProps {
  games: GameCollectionEntry[];
  activeKey: string;
  onSelect: (key: string) => void;
  title?: string;
}

const headerValue = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed && trimmed !== '?' ? trimmed : undefined;
};

export const describeGames = (games: ViewerGame[]): GameCollectionEntry[] => games.map(({ key, pgn, label }) => {
  const headers = parsePgnGames(pgn)[0]?.headers ?? {};
  const result = headerValue(headers.Result);
  return {
    key,
    label,
    white: headerValue(headers.White),
    black: headerValue(headers.Black),
    result: result === '*' ? undefined : result,
    event: headerValue(headers.Event),
  };
});

export const GameCollectionPanel: React.FC<GameCollectionPanelProps> = ({ games, activeKey, onSelect, title }) => {
  const { t } = useTranslation();
  const activeIndex = games.findIndex((game) => game.key === activeKey);
  const heading = title ?? t('gameCollection.title');

  return (
    <section aria-label={heading} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{heading}</h3>
        {games.length > 0 && (
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400" aria-live="polite">
            {t('gameCollection.position', { current: activeIndex + 1, total: games.length })}
          </span>
        )}
      </div>

      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {games.map((game, index) => {
          const active = index === activeIndex;
          const players = game.white || game.black
            ? `${game.white ?? t('gameCollection.unknownPlayer')} – ${game.black ?? t('gameCollection.unknownPlayer')}`
            : game.label ?? t('gameCollection.untitled', { number: index + 1 });
          const detail = game.white || game.black ? game.label ?? game.event : game.label ? game.event : undefined;
          return (
            <li key={game.key}>
              <button
                type="button"
                onClick={() => onSelect(game.key)}
                aria-current={active ? 'true' : undefined}
                className={`w-full rounded-lg border-l-2 px-2.5 py-2 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${active
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                  : 'border-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate font-semibold">{players}</span>
                  {game.result && <span className="shrink-0 font-mono text-[11px] text-slate-500 dark:text-slate-400">{game.result}</span>}
                </span>
                {detail && <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">{detail}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {games.length > 1 && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onSelect(games[activeIndex - 1].key)}
            disabled={activeIndex <= 0}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t('gameCollection.previousGame')}
          </button>
          <button
            type="button"
            onClick={() => onSelect(games[activeIndex + 1].key)}
            disabled={activeIndex >= games.length - 1}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {t('gameCollection.nextGame')}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
};
