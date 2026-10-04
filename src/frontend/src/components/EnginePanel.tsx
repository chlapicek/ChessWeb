import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { BrainCircuit, Pause, Play, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { localizeSan, type PieceLetters } from '../chessNotation';

const stockfishWorkerUrl = `${import.meta.env.BASE_URL}stockfish/stockfish-19-lite-single.js`;

const SETTINGS_STORAGE_KEY = 'chessweb-engine-settings';
const MIN_DEPTH = 8;
const MAX_DEPTH = 24;
const MAX_MULTI_PV = 5;
const ANALYSIS_DEBOUNCE_MS = 300;
const RESULT_ROW_HEIGHT_PX = 26;
// Capped below MAX_MULTI_PV so overlapping candidate moves don't clutter the board.
const MAX_ARROW_LINES = 3;
const ARROW_COLORS = ['#f59e0b', '#3b82f6', '#60a5fa'];

interface EnginePanelProps {
  fen: string;
  onArrowsChange?: (arrows: Array<[string, string, string]>) => void;
}

interface EngineLine {
  multipv: number;
  evaluation: string;
  pv: string[];
}

interface DisplayLine extends EngineLine {
  sanMoves: string[];
}

interface AnalysisRequest {
  fen: string;
  depth: number;
  multiPv: number;
}

interface EngineSettings {
  depth: number;
  multiPv: number;
  running: boolean;
  showArrows: boolean;
}

const defaultSettings: EngineSettings = { depth: 16, multiPv: 3, running: true, showArrows: true };

const loadSettings = (): EngineSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<EngineSettings>;
    return {
      depth: Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, parsed.depth ?? defaultSettings.depth)),
      multiPv: Math.min(MAX_MULTI_PV, Math.max(1, parsed.multiPv ?? defaultSettings.multiPv)),
      running: parsed.running ?? defaultSettings.running,
      showArrows: parsed.showArrows ?? defaultSettings.showArrows,
    };
  } catch {
    return defaultSettings;
  }
};

const parseInfoLine = (message: string): { depth: number; multipv: number; evaluation: string; pv: string[] } | null => {
  if (!message.startsWith('info ') || !message.includes(' pv ')) return null;

  const depthMatch = message.match(/\bdepth (\d+)/);
  const multipvMatch = message.match(/\bmultipv (\d+)/);
  const scoreMatch = message.match(/\bscore (cp|mate) (-?\d+)/);
  const pvMatch = message.match(/\bpv (.+)$/);
  if (!scoreMatch || !pvMatch) return null;

  const evaluation =
    scoreMatch[1] === 'mate'
      ? `M${scoreMatch[2]}`
      : (() => {
          const score = Number(scoreMatch[2]) / 100;
          return `${score >= 0 ? '+' : ''}${score.toFixed(2)}`;
        })();

  return {
    depth: depthMatch ? Number(depthMatch[1]) : 0,
    multipv: multipvMatch ? Number(multipvMatch[1]) : 1,
    evaluation,
    pv: pvMatch[1].trim().split(/\s+/),
  };
};

const parseUciMove = (uciMove: string): { from: string; to: string; promotion?: string } => ({
  from: uciMove.slice(0, 2),
  to: uciMove.slice(2, 4),
  promotion: uciMove.length > 4 ? uciMove.slice(4) : undefined,
});

// Replays a UCI move sequence from a known-good fen to get localized SAN, stopping early if a
// move turns out illegal (e.g. stale engine output for a position that has since changed).
const toSan = (fen: string, uciMoves: string[], pieceLetters: PieceLetters): string[] => {
  const game = new Chess(fen);
  const sanMoves: string[] = [];
  for (const uciMove of uciMoves) {
    let move;
    try {
      move = game.move(parseUciMove(uciMove));
    } catch {
      break;
    }
    if (!move) break;
    sanMoves.push(localizeSan(move.san, pieceLetters));
  }
  return sanMoves;
};

// Only the top few lines' first moves are drawn, and each is re-validated against the fen the
// lines belong to since the engine's pv is never a substitute for board-side legality checks.
const getTopArrows = (fen: string, engineLines: EngineLine[]): Array<[string, string, string]> => {
  const arrows: Array<[string, string, string]> = [];
  for (const line of engineLines.slice(0, MAX_ARROW_LINES)) {
    const uciMove = line.pv[0];
    if (!uciMove) continue;
    const { from, to, promotion } = parseUciMove(uciMove);
    try {
      if (!new Chess(fen).move({ from, to, promotion })) continue;
    } catch {
      continue;
    }
    arrows.push([from, to, ARROW_COLORS[arrows.length] ?? ARROW_COLORS[ARROW_COLORS.length - 1]]);
  }
  return arrows;
};

export const EnginePanel: React.FC<EnginePanelProps> = ({ fen, onArrowsChange }) => {
  const { t, i18n } = useTranslation();
  const workerRef = useRef<Worker | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchingRef = useRef(false);
  const pendingRequestRef = useRef<AnalysisRequest | null>(null);
  const sentMultiPvRef = useRef<number | null>(null);
  const lastArrowKeyRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [depthReached, setDepthReached] = useState(0);
  const [lines, setLines] = useState<EngineLine[]>([]);
  const [analysisFen, setAnalysisFen] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<EngineSettings>(loadSettings);

  // Unconditionally issues UCI commands for a search; only safe to call once the previous
  // search has fully stopped (i.e. its bestmove has been received).
  const startSearch = (worker: Worker, request: AnalysisRequest) => {
    setError(false);
    setLines([]);
    setDepthReached(0);
    setIsThinking(true);
    setAnalysisFen(request.fen);
    searchingRef.current = true;
    if (sentMultiPvRef.current !== request.multiPv) {
      worker.postMessage(`setoption name MultiPV value ${request.multiPv}`);
      sentMultiPvRef.current = request.multiPv;
    }
    worker.postMessage(`position fen ${request.fen}`);
    worker.postMessage(`go depth ${request.depth}`);
  };

  // Queues a request if a search is already running (stopping it first) so that stale
  // info/bestmove messages from the previous position never get attributed to the new one.
  const requestAnalysis = (request: AnalysisRequest) => {
    const worker = workerRef.current;
    if (!worker) return;

    if (searchingRef.current) {
      pendingRequestRef.current = request;
      worker.postMessage('stop');
      return;
    }

    startSearch(worker, request);
  };

  useEffect(() => {
    const worker = new Worker(stockfishWorkerUrl);
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<string>) => {
      const message = event.data;

      if (message === 'uciok') {
        setReady(true);
        return;
      }

      const info = parseInfoLine(message);
      if (info) {
        setDepthReached((previous) => Math.max(previous, info.depth));
        setLines((previous) => {
          const next = [...previous];
          const index = next.findIndex((line) => line.multipv === info.multipv);
          const updated = { multipv: info.multipv, evaluation: info.evaluation, pv: info.pv };
          if (index >= 0) {
            next[index] = updated;
          } else {
            next.push(updated);
          }
          return next.sort((a, b) => a.multipv - b.multipv);
        });
        return;
      }

      if (message.startsWith('bestmove')) {
        searchingRef.current = false;
        setIsThinking(false);

        const pending = pendingRequestRef.current;
        if (pending) {
          pendingRequestRef.current = null;
          startSearch(worker, pending);
        }
      }
    };

    worker.onerror = () => {
      searchingRef.current = false;
      setError(true);
      setIsThinking(false);
    };

    worker.postMessage('uci');

    return () => {
      worker.postMessage('quit');
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // storage unavailable (e.g. private browsing) — settings just won't persist
    }
  }, [settings]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!ready || !fen || !settings.running) return;

    debounceRef.current = setTimeout(() => {
      requestAnalysis({ fen, depth: settings.depth, multiPv: settings.multiPv });
    }, ANALYSIS_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, ready, settings.running, settings.multiPv, settings.depth]);

  // Board arrows must never show a move for a position the board no longer displays.
  useEffect(() => {
    lastArrowKeyRef.current = null;
    onArrowsChange?.([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen]);

  useEffect(() => {
    // analysisFen is set asynchronously once the search for `fen` actually starts, so a
    // late-arriving update for a since-superseded position must not re-draw stale arrows.
    if (!settings.showArrows || !analysisFen || analysisFen !== fen) {
      if (lastArrowKeyRef.current !== null) {
        lastArrowKeyRef.current = null;
        onArrowsChange?.([]);
      }
      return;
    }
    const arrows = getTopArrows(analysisFen, lines);
    const key = arrows.map(([from, to]) => `${from}${to}`).join(',');
    if (key === lastArrowKeyRef.current) return;
    lastArrowKeyRef.current = key;
    onArrowsChange?.(arrows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, analysisFen, fen, settings.showArrows]);

  const toggleRunning = () => {
    if (settings.running) {
      pendingRequestRef.current = null;
      workerRef.current?.postMessage('stop');
      setIsThinking(false);
    }
    setSettings((previous) => ({ ...previous, running: !previous.running }));
  };

  const setDepth = (depth: number) => {
    setSettings((previous) => ({ ...previous, depth: Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, depth)) }));
  };

  const setMultiPv = (multiPv: number) => {
    setSettings((previous) => ({ ...previous, multiPv }));
  };

  const toggleShowArrows = () => {
    setSettings((previous) => ({ ...previous, showArrows: !previous.showArrows }));
  };

  const multiPvOptions = useMemo(() => Array.from({ length: MAX_MULTI_PV }, (_, index) => index + 1), []);

  const pieceLetters = useMemo(
    () => t('board.pieceLetters', { returnObjects: true }) as Record<string, string>,
    [i18n.language, t],
  );

  const displayLines: DisplayLine[] = useMemo(() => {
    if (!analysisFen) return [];
    return lines.map((line) => ({ ...line, sanMoves: toSan(analysisFen, line.pv, pieceLetters) }));
  }, [lines, analysisFen, pieceLetters]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-emerald-500" />
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t('board.engineTitle')}</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {isThinking ? t('board.engineThinking', { depth: depthReached }) : t('board.engineDescription')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleRunning}
            aria-label={settings.running ? t('board.pauseEngine') : t('board.resumeEngine')}
            title={settings.running ? t('board.pauseEngine') : t('board.resumeEngine')}
            className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 transition hover:bg-emerald-500/20 dark:text-emerald-400"
          >
            {settings.running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen((previous) => !previous)}
            aria-label={t('board.engineSettings')}
            aria-expanded={settingsOpen}
            title={t('board.engineSettings')}
            className={`rounded-lg p-2 transition ${settingsOpen ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'}`}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {settingsOpen && (
        <div className="mt-3 flex flex-wrap items-center gap-4 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-950">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 dark:text-slate-400">{t('board.depthLabel')}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDepth(settings.depth - 1)}
                disabled={settings.depth <= MIN_DEPTH}
                aria-label={t('board.decreaseDepth')}
                className="h-6 w-6 rounded bg-slate-200 font-bold text-slate-700 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-200"
              >
                -
              </button>
              <span className="w-6 text-center font-mono font-semibold text-slate-900 dark:text-white">{settings.depth}</span>
              <button
                type="button"
                onClick={() => setDepth(settings.depth + 1)}
                disabled={settings.depth >= MAX_DEPTH}
                aria-label={t('board.increaseDepth')}
                className="h-6 w-6 rounded bg-slate-200 font-bold text-slate-700 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-200"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 dark:text-slate-400">{t('board.linesLabel')}</span>
            <div className="flex gap-1" role="group" aria-label={t('board.linesLabel')}>
              {multiPvOptions.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setMultiPv(count)}
                  aria-pressed={settings.multiPv === count}
                  className={`h-6 w-6 rounded font-semibold transition ${
                    settings.multiPv === count
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 dark:text-slate-400">{t('board.arrowsLabel')}</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.showArrows}
              aria-label={settings.showArrows ? t('board.hideArrows') : t('board.showArrows')}
              title={settings.showArrows ? t('board.hideArrows') : t('board.showArrows')}
              onClick={toggleShowArrows}
              className={`relative h-5 w-9 rounded-full transition ${settings.showArrows ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'}`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  settings.showArrows ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-1.5" style={{ minHeight: `${settings.multiPv * RESULT_ROW_HEIGHT_PX}px` }}>
        {error ? (
          <p className="text-xs font-semibold text-rose-500">{t('board.engineError')}</p>
        ) : !settings.running ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('board.enginePaused')}</p>
        ) : displayLines.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('board.engineNoLines')}</p>
        ) : (
          displayLines.map((line) => (
            <div key={line.multipv} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-950">
              <span className="w-5 shrink-0 font-mono text-slate-400 dark:text-slate-500">#{line.multipv}</span>
              <span className="w-14 shrink-0 font-mono font-bold text-slate-900 dark:text-white">{line.evaluation}</span>
              <span className="truncate font-mono text-slate-600 dark:text-slate-300" title={line.sanMoves.join(' ')}>
                {line.sanMoves.join(' ')}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
};