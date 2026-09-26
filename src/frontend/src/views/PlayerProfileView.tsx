import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiClient } from '../services/apiClient';
import { useAuth } from '../context/AuthContext';
import { PlayerProfile } from '../types';
import { ArrowLeft, Trophy, Save, User as UserIcon } from 'lucide-react';
import { CalendarView } from './CalendarView';

export const PlayerProfileView: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { user: currentUser, updateUser } = useAuth();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [nicknameInput, setNicknameInput] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);


  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const res = await apiClient.get<PlayerProfile>(`/player/${id}`);
        setProfile(res.data);
        setNicknameInput(res.data.nickname || '');
      } catch (err) {
        console.error('Failed to load player profile', err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchProfile();
  }, [id]);

  const handleSaveNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingNickname(true);
    try {
      const res = await apiClient.put('/player/me/nickname', { nickname: nicknameInput || null });
      setProfile((prev) => (prev ? { ...prev, nickname: res.data.nickname } : prev));
      if (currentUser) {
        updateUser({ ...currentUser, nickname: res.data.nickname });
      }
      toast.success(t('players.nicknameSaved'));
    } catch (err) {
      console.error('Failed to update nickname', err);
      toast.error(t('players.nicknameSaveError'));
    } finally {
      setSavingNickname(false);
    }
  };

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 py-12 text-center text-slate-500 text-sm">{t('common.loading')}</div>;
  }

  if (notFound || !profile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-slate-500 dark:text-slate-400 text-sm">
        {t('players.notFound')}
        <div className="mt-4">
          <Link to="/players" className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold text-xs">
            {t('players.backToPlayers')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        to="/players"
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 mb-6 transition"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>{t('players.backToPlayers')}</span>
      </Link>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 dark:text-emerald-400 shrink-0">
            <UserIcon className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {profile.nickname || profile.fullName || t('common.member')}
            </h2>
            {profile.nickname && profile.fullName && (
              <p className="text-sm text-slate-500 dark:text-slate-400">{profile.fullName}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          {profile.chessRating && (
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('players.eloLabel')}</p>
              <p className="font-mono text-slate-800 dark:text-slate-200">{profile.chessRating}</p>
            </div>
          )}
          {profile.fideId && (
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('players.fideId')}</p>
              <p className="font-mono text-slate-800 dark:text-slate-200">{profile.fideId}</p>
            </div>
          )}
        </div>

        {profile.isSelf && (
          <form onSubmit={handleSaveNickname} className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
            <label htmlFor="player-nickname" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('players.myNickname')}
            </label>
            <div className="flex gap-2">
              <input
                id="player-nickname"
                type="text"
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                placeholder={t('players.nicknamePlaceholder')}
                className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={savingNickname}
                className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-semibold px-4 py-2 rounded-lg text-xs shadow transition"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingNickname ? t('common.saving') : t('players.saveNickname')}</span>
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm mb-6">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
          <Trophy className="w-4 h-4 text-emerald-500" />
          <span>{t('players.resultsTitle')}</span>
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('players.resultsComingSoon')}</p>
      </div>

      {profile.isSelf && <CalendarView subscribedOnly />}
    </div>
  );
};
