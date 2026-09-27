import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { parsePgnGames, type ChessViewerState, type ViewerGame, type ViewerTarget } from '../../ChessViewer';
import type { Attachment } from '../../../types';
import { FEN_GAME_KEY, fenToViewerGame, isValidFen } from '../articleUtils';

export interface BoardGameInfo {
  key: string;
  label?: string;
  white?: string;
  black?: string;
  result?: string;
  startFen?: string;
  history: string[];
}

export interface ArticleBoardContextValue {
  games: ViewerGame[];
  gameInfo: Record<string, BoardGameInfo>;
  attachments: Attachment[];
  jumpTo: (gameKey: string, ply: number) => void;
  showFen: (fen: string) => void;
  selectGame: (gameKey: string) => void;
}

const noop = () => undefined;

const ArticleBoardContext = createContext<ArticleBoardContextValue>({
  games: [],
  gameInfo: {},
  attachments: [],
  jumpTo: noop,
  showFen: noop,
  selectGame: noop,
});

export const useArticleBoard = () => useContext(ArticleBoardContext);

const headerValue = (value: string | undefined) => (value && value.trim() !== '?' ? value.trim() : undefined);

export const describeBoardGames = (games: ViewerGame[]): Record<string, BoardGameInfo> =>
  Object.fromEntries(games.map((game) => {
    const parsed = parsePgnGames(game.pgn)[0];
    const headers = parsed?.headers ?? {};
    const result = headerValue(headers.Result);
    return [game.key, {
      key: game.key,
      label: game.label,
      white: headerValue(headers.White),
      black: headerValue(headers.Black),
      result: result === '*' ? undefined : result,
      startFen: parsed?.startFen,
      history: parsed?.history ?? [],
    }];
  }));

interface ArticleBoardProviderProps {
  games: ViewerGame[];
  attachments: Attachment[];
  jumpTo: (gameKey: string, ply: number) => void;
  showFen: (fen: string) => void;
  selectGame: (gameKey: string) => void;
  children: React.ReactNode;
}

export const ArticleBoardProvider: React.FC<ArticleBoardProviderProps> = ({ games, attachments, jumpTo, showFen, selectGame, children }) => {
  const gameInfo = useMemo(() => describeBoardGames(games), [games]);
  const value = useMemo(
    () => ({ games, gameInfo, attachments, jumpTo, showFen, selectGame }),
    [games, gameInfo, attachments, jumpTo, showFen, selectGame],
  );
  return <ArticleBoardContext.Provider value={value}>{children}</ArticleBoardContext.Provider>;
};

// Drives a controlled ChessViewer: base games plus an optional transient position shown via showFen.
export const useBoardController = (baseGames: ViewerGame[], fenLabel: string, onNavigate?: () => void) => {
  const [transientFen, setTransientFen] = useState<string | null>(null);
  const [target, setTarget] = useState<ViewerTarget | undefined>();
  const [boardState, setBoardState] = useState<ChessViewerState | null>(null);
  const nonce = useRef(0);
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  const games = useMemo(() => {
    if (!transientFen) return baseGames;
    return [...baseGames.filter((game) => game.key !== FEN_GAME_KEY), fenToViewerGame(transientFen, fenLabel)];
  }, [baseGames, transientFen, fenLabel]);

  const jumpTo = useCallback((gameKey: string, ply: number) => {
    nonce.current += 1;
    setTarget({ gameKey, ply, nonce: nonce.current });
    onNavigateRef.current?.();
  }, []);
  const selectGame = useCallback((gameKey: string) => jumpTo(gameKey, 0), [jumpTo]);
  const showFen = useCallback((fen: string) => {
    if (!isValidFen(fen)) return;
    setTransientFen(fen.trim());
    jumpTo(FEN_GAME_KEY, 0);
  }, [jumpTo]);

  return { games, target, boardState, setBoardState, jumpTo, selectGame, showFen };
};
