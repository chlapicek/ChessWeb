import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../services/apiClient';
import { PlayerSummary } from '../types';
import { Users, Search, ChevronRight } from 'lucide-react';

export const PlayersView: React.FC = () => {
  const { t } = useTranslation();
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchPlayers = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get<PlayerSummary[]>('/player');
        setPlayers(res.data);
      } catch (err) {
        console.error('Failed to load players', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayers();
  }, []);

  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return players;
    return players.filter(
      (player) =>
        player.fullName?.toLowerCase().includes(query) ||
        (player.nickname && player.nickname.toLowerCase().includes(query))
    );
  }, [players, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Users className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          <span>{t('players.title')}</span>
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{t('players.subtitle')}</p>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('players.searchPlaceholder')}
          placeholder={t('players.searchPlaceholder')}
          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500 text-sm">{t('common.loading')}</div>
      ) : filteredPlayers.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-500 dark:text-slate-400 text-sm">
          {t('players.noPlayers')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPlayers.map((player) => (
            <Link
              key={player.id}
              to={`/players/${player.id}`}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 flex items-center justify-between shadow-sm group transition hover-card-animate animate-slide-up"
            >
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition">
                  {player.nickname || player.fullName || t('common.member')}
                </h3>
                {player.nickname && player.fullName && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{player.fullName}</p>
                )}
                <div className="flex items-center gap-2 mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {player.chessRating && (
                    <span className="font-mono">{t('players.eloLabel')}: {player.chessRating}</span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
