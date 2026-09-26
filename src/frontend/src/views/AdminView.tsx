import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../services/apiClient';
import { User, CalendarFeed, Partner, LoggingSettings } from '../types';
import { Pagination } from '../components/Pagination';
import { TeamManager } from '../components/TeamManager';
import { Shield, UserCheck, RefreshCw, Plus, Trash2, Handshake, Pencil, ChevronUp, ChevronDown, X, ScrollText } from 'lucide-react';

const LOG_LEVELS = ['Verbose', 'Debug', 'Information', 'Warning', 'Error', 'Fatal'] as const;

export const AdminView: React.FC = () => {
  const { t } = useTranslation();
  const { user, isAdmin, hasRole } = useAuth();
  const isSuperAdmin = hasRole('SuperAdmin');
  const [users, setUsers] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const userPageSize = 5;
  const filteredUsers = users.filter((member) => {
    const search = userSearch.trim().toLowerCase();
    return !search || member.fullName.toLowerCase().includes(search) || member.email.toLowerCase().includes(search);
  });

  const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);

  // New Feed state
  const [feedName, setFeedName] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [feedType, setFeedType] = useState(0);

  const [partnerName, setPartnerName] = useState('');
  const [partnerUrl, setPartnerUrl] = useState('');
  const [partnerLogoFile, setPartnerLogoFile] = useState<File | null>(null);
  const [partnerLogoError, setPartnerLogoError] = useState('');
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editChessRating, setEditChessRating] = useState('');
  const [editFideId, setEditFideId] = useState('');
  const [editUserError, setEditUserError] = useState('');

  const [loggingSettings, setLoggingSettings] = useState<LoggingSettings | null>(null);
  const [loggingMinimumLevel, setLoggingMinimumLevel] = useState<string>('Information');
  const [loggingRetainedFileCount, setLoggingRetainedFileCount] = useState<number>(14);
  const [loggingSaving, setLoggingSaving] = useState(false);


  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, feedsRes, partnersRes] = await Promise.all([
        apiClient.get<User[]>('/auth/users'),
        apiClient.get<CalendarFeed[]>('/calendar/feeds'),
        apiClient.get<Partner[]>('/partners'),
      ]);
      setUsers(usersRes.data);
      setFeeds(feedsRes.data);
      setPartners(partnersRes.data);
    } catch (err) {
      console.error('Failed to load admin data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin]);

  const fetchLoggingSettings = async () => {
    try {
      const res = await apiClient.get<LoggingSettings>('/logging/settings');
      setLoggingSettings(res.data);
      setLoggingMinimumLevel(res.data.minimumLevel);
      setLoggingRetainedFileCount(res.data.retainedFileCountLimit);
    } catch (err: any) {
      console.error('Failed to load logging settings', err);
      toast.error(err.response?.data?.message || t('admin.loggingLoadFailed'));
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      fetchLoggingSettings();
    }
  }, [isSuperAdmin]);

  const handleSaveLogging = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingSaving(true);
    try {
      const res = await apiClient.put<LoggingSettings>('/logging/settings', {
        minimumLevel: loggingMinimumLevel,
        retainedFileCountLimit: loggingRetainedFileCount,
      });
      setLoggingSettings(res.data);
      toast.success(t('admin.loggingUpdateSuccess'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('admin.loggingUpdateFailed'));
    } finally {
      setLoggingSaving(false);
    }
  };

  const toggleRole = async (targetUser: User, roleToToggle: string) => {
    const currentRoles = targetUser.roles || [];
    const newRoles = currentRoles.includes(roleToToggle)
      ? currentRoles.filter((r) => r !== roleToToggle)
      : [...currentRoles, roleToToggle];

    try {
      await apiClient.post('/auth/change-roles', {
        userId: targetUser.id,
        roles: newRoles,
      });
      toast.success(t('admin.roleUpdateSuccess', { name: targetUser.fullName }));
      fetchData();
    } catch (err: any) {
      console.error('Failed to update roles', err);
      toast.error(err.response?.data?.message || t('admin.roleUpdateFailed'));
    }
  };

  const startEditingUser = (targetUser: User) => {
    setEditingUserId(targetUser.id);
    setEditFullName(targetUser.fullName);
    setEditEmail(targetUser.email);
    setEditChessRating(targetUser.chessRating || '');
    setEditFideId(targetUser.fideId || '');
    setEditUserError('');
  };

  const cancelEditingUser = () => {
    setEditingUserId(null);
    setEditUserError('');
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;

    try {
      await apiClient.put(`/player/${editingUserId}`, {
        fullName: editFullName,
        email: editEmail,
        chessRating: editChessRating || null,
        fideId: editFideId || null,
      });
      toast.success(t('admin.playerUpdateSuccess'));
      setEditingUserId(null);
      setEditUserError('');
      fetchData();
    } catch (err: any) {
      const message = err.response?.data?.message || t('admin.playerUpdateFailed');
      setEditUserError(message);
      toast.error(message);
    }
  };

  const handleAddFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/calendar/feeds', {
        name: feedName,
        url: feedUrl,
        type: feedType,
        isActive: true,
      });
      setFeedName('');
      setFeedUrl('');
      toast.success(t('admin.feedAddSuccess'));
      fetchData();
    } catch (err: any) {
      console.error('Failed to add feed', err);
      toast.error(err.response?.data?.message || t('admin.feedAddFailed'));
    }
  };

  const handleSyncFeed = async (feedId: string) => {
    try {
      const res = await apiClient.post(`/calendar/feeds/${feedId}/sync`);
      toast.success(res.data.message || t('admin.feedSyncSuccess'));
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('admin.feedSyncFailed'));
    }
  };

  const handleSavePartner = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingPartnerId && !partnerLogoFile) {
      setPartnerLogoError(t('admin.partnerLogoRequired'));
      return;
    }
    setPartnerLogoError('');

    try {
      const formData = new FormData();
      formData.append('name', partnerName);
      formData.append('url', partnerUrl);
      formData.append('isActive', 'true');
      if (partnerLogoFile) {
        formData.append('logoFile', partnerLogoFile);
      }

      await apiClient.request({
        method: editingPartnerId ? 'put' : 'post',
        url: editingPartnerId ? `/partners/${editingPartnerId}` : '/partners/upload',
        data: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setPartnerName('');
      setPartnerUrl('');
      setPartnerLogoFile(null);
      setEditingPartnerId(null);
      toast.success(editingPartnerId ? t('admin.partnerUpdateSuccess') : t('admin.partnerAddSuccess'));
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || (editingPartnerId ? t('admin.partnerUpdateFailed') : t('admin.partnerAddFailed')));
    }
  };

  const startEditingPartner = (partner: Partner) => {
    setEditingPartnerId(partner.id);
    setPartnerName(partner.name);
    setPartnerUrl(partner.url);
    setPartnerLogoFile(null);
    setPartnerLogoError('');
  };

  const cancelEditingPartner = () => {
    setEditingPartnerId(null);
    setPartnerName('');
    setPartnerUrl('');
    setPartnerLogoFile(null);
    setPartnerLogoError('');
  };

  const movePartner = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= partners.length) {
      return;
    }

    const reorderedPartners = [...partners];
    [reorderedPartners[index], reorderedPartners[targetIndex]] = [reorderedPartners[targetIndex], reorderedPartners[index]];
    setPartners(reorderedPartners);

    try {
      await apiClient.post('/partners/reorder', {
        partnerIds: reorderedPartners.map((partner) => partner.id),
      });
      toast.success(t('admin.partnerOrderSuccess'));
    } catch (err: any) {
      setPartners(partners);
      toast.error(err.response?.data?.message || t('admin.partnerOrderFailed'));
    }
  };

  const handleDeletePartner = async (partnerId: string) => {
    try {
      await apiClient.delete(`/partners/${partnerId}`);
      toast.success(t('admin.partnerDeleteSuccess'));
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('admin.partnerDeleteFailed'));
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto my-16 text-center p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-md">
        <Shield className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('admin.accessRestricted')}</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {t('admin.accessRestrictedDesc')}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Shield className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />
          <span>{t('admin.title')}</span>
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          {t('admin.subtitle')}
        </p>
      </div>

      {/* User Management & Role Assignment */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-md dark:shadow-xl transition-colors">
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-amber-500" />
          <span>{t('admin.memberRoles')}</span>
        </h3>

        <label className="mb-4 block text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>{t('admin.playerSearch')}</span>
          <input
            type="search"
            value={userSearch}
            onChange={(event) => { setUserSearch(event.target.value); setUserPage(1); }}
            placeholder={t('admin.playerSearchPlaceholder')}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
          />
        </label>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <thead className="bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase font-mono">
              <tr>
                <th className="p-3">{t('admin.member')}</th>
                <th className="p-3">{t('admin.email')}</th>
                <th className="p-3">{t('admin.rating')}</th>
                <th className="p-3">{t('admin.roles')}</th>
                <th className="p-3 text-right">{t('admin.togglePermissions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900/50">
              {filteredUsers.slice((userPage - 1) * userPageSize, userPage * userPageSize).map((u) => (
                <React.Fragment key={u.id}>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                  <td className="p-3 font-semibold text-slate-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <span>{u.fullName}</span>
                      {u.roles?.includes('SuperAdmin') && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-500/40">
                          {t('admin.superAdminBadge')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-slate-500 dark:text-slate-400 font-mono">{u.email}</td>
                  <td className="p-3 font-mono">{u.chessRating || '-'}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles?.map((r) => (
                        <span
                          key={r}
                          className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                            r === 'Admin'
                              ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400'
                          }`}
                        >
                          {t(`common.roleNames.${r}`, { defaultValue: r })}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        title={t('admin.editPlayer')}
                        aria-label={t('admin.editPlayerLabel', { name: u.fullName })}
                        onClick={() => startEditingUser(u)}
                        className="p-1.5 rounded-lg text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => toggleRole(u, 'Admin')}
                        className={`text-[10px] px-2.5 py-1 rounded transition border ${
                          u.roles?.includes('Admin')
                            ? 'bg-rose-600 text-white font-bold border-rose-600'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {t('common.roleNames.Admin')}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleRole(u, 'ClubMember')}
                        aria-pressed={u.roles?.includes('ClubMember')}
                        className={`text-[10px] px-2.5 py-1 rounded transition border ${
                          u.roles?.includes('ClubMember')
                            ? 'bg-emerald-700 text-white font-bold border-emerald-700'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-200'
                        }`}
                      >
                      </button>
                      {isSuperAdmin && (
                        <button
                          onClick={() => toggleRole(u, 'SuperAdmin')}
                          className={`text-[10px] px-2.5 py-1 rounded transition border ${
                            u.roles?.includes('SuperAdmin')
                              ? 'bg-violet-600 text-white font-bold border-violet-600'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          SuperAdmin
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {editingUserId === u.id && (
                  <tr>
                    <td colSpan={5} className="p-0">
                      <form onSubmit={handleSaveUser} className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">{t('admin.editPlayer')}</h4>
                          <button type="button" onClick={cancelEditingUser} className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1">
                            <X className="w-3.5 h-3.5" />
                            {t('common.cancel')}
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                          <input
                            type="text"
                            required
                            placeholder={t('admin.fullName')}
                            value={editFullName}
                            onChange={(e) => setEditFullName(e.target.value)}
                            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
                          />
                          <input
                            type="email"
                            required
                            placeholder={t('admin.email')}
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
                          />
                          <input
                            type="text"
                            placeholder={t('admin.rating')}
                            value={editChessRating}
                            onChange={(e) => setEditChessRating(e.target.value)}
                            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
                          />
                          <input
                            type="text"
                            placeholder={t('admin.fideId')}
                            value={editFideId}
                            onChange={(e) => setEditFideId(e.target.value)}
                            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
                          />
                        </div>
                        {editUserError && <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">{editUserError}</p>}
                        <button
                          type="submit"
                          className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-4 py-2 rounded-lg text-xs"
                        >
                          {t('admin.savePlayerChanges')}
                        </button>
                      </form>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>


        {filteredUsers.length > userPageSize && (
          <Pagination
            page={userPage}
            totalPages={Math.ceil(filteredUsers.length / userPageSize)}
            totalCount={filteredUsers.length}
            pageSize={userPageSize}
            onPageChange={(newPage) => setUserPage(newPage)}
          />
        )}
      </div>

      {isSuperAdmin && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-md dark:shadow-xl transition-colors">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-violet-500" />
            <span>{t('admin.logging')}</span>
          </h3>
          <p className="text-slate-500 dark:text-slate-400 text-xs mb-4">{t('admin.loggingDescription')}</p>

          <form onSubmit={handleSaveLogging} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                <span>{t('admin.loggingMinimumLevel')}</span>
                <select
                  value={loggingMinimumLevel}
                  onChange={(e) => setLoggingMinimumLevel(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                >
                  {LOG_LEVELS.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                <span>{t('admin.loggingRetainedFileCount')}</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={loggingRetainedFileCount}
                  onChange={(e) => setLoggingRetainedFileCount(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
              </label>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('admin.loggingRetentionNote')}</p>

            {loggingSettings && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('admin.loggingLastUpdated')}: {new Date(loggingSettings.updatedAt).toLocaleString()}
              </p>
            )}

            <button
              type="submit"
              disabled={loggingSaving}
              className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-xs"
            >
              {loggingSaving ? t('admin.loggingSaving') : t('admin.loggingSave')}
            </button>
          </form>
        </div>
      )}

      <TeamManager />

      {/* External Calendar Feeds Management */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-md dark:shadow-xl transition-colors">
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-amber-500" />
          <span>{t('admin.externalFeeds')}</span>
        </h3>

        {/* Existing Feeds */}
        <div className="space-y-3 mb-6">
          {feeds.map((feed) => (
            <div
              key={feed.id}
              className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 dark:text-white">{feed.name}</span>
                  <span className="bg-slate-200 dark:bg-slate-800 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded text-[10px] font-mono">
                    {feed.type === 0 ? t('admin.iCal') : t('admin.rss')}
                  </span>
                </div>
                <p className="text-slate-500 font-mono text-[11px] mt-0.5 truncate max-w-md">
                  {feed.url}
                </p>
                {feed.lastSyncStatus && (
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] mt-1">
                    {t('common.status')}: {feed.lastSyncStatus} ({new Date(feed.lastSyncTime || '').toLocaleTimeString()})
                  </p>
                )}
              </div>

              <button
                onClick={() => handleSyncFeed(feed.id)}
                className="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1 shrink-0 self-start sm:self-center font-medium"
              >
                <RefreshCw className="w-3 h-3" />
                <span>{t('admin.syncNow')}</span>
              </button>
            </div>
          ))}
        </div>

        {/* Add Feed Form */}
        <form onSubmit={handleAddFeed} className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">{t('admin.addFeed')}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              placeholder={t('admin.feedName')}
              value={feedName}
              onChange={(e) => setFeedName(e.target.value)}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <input
              type="url"
              required
              placeholder={t('admin.feedUrl')}
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <select
              value={feedType}
              onChange={(e) => setFeedType(Number(e.target.value))}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
            >
              <option value={0}>{t('admin.iCal')}</option>
              <option value={1}>{t('admin.rss')}</option>
            </select>
          </div>

          <button
            type="submit"
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-4 py-2 rounded-lg text-xs flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('admin.addFeedBtn')}</span>
          </button>
        </form>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-md dark:shadow-xl transition-colors">
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Handshake className="w-4 h-4 text-amber-500" />
          <span>{t('admin.partners')}</span>
        </h3>

        <div className="space-y-3 mb-6">
          {partners.map((partner, index) => (
            <div
              key={partner.id}
              className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={partner.logoUrl}
                  alt={`${partner.name} logo`}
                  className="h-10 w-10 object-cover rounded-md border border-slate-200 dark:border-slate-700 bg-white"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 dark:text-white truncate">{partner.name}</div>
                  <a
                    href={partner.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-500 dark:text-slate-400 font-mono text-[11px] truncate block"
                  >
                    {partner.url}
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0 self-start sm:self-center">
                <button
                  type="button"
                  title={t('admin.movePartnerUp')}
                  aria-label={t('admin.movePartnerUpLabel', { name: partner.name })}
                  disabled={index === 0}
                  onClick={() => movePartner(index, -1)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  title={t('admin.movePartnerDown')}
                  aria-label={t('admin.movePartnerDownLabel', { name: partner.name })}
                  disabled={index === partners.length - 1}
                  onClick={() => movePartner(index, 1)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  title={t('admin.editPartner')}
                  aria-label={t('admin.editPartnerLabel', { name: partner.name })}
                  onClick={() => startEditingPartner(partner)}
                  className="p-1.5 rounded-lg text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeletePartner(partner.id)}
                  className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 px-3 py-1.5 rounded-lg flex items-center gap-1 font-medium"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{t('common.delete')}</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleSavePartner} className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">{editingPartnerId ? t('admin.editPartner') : t('admin.addPartner')}</h4>
            {editingPartnerId && (
              <button type="button" onClick={cancelEditingPartner} className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1">
                <X className="w-3.5 h-3.5" />
                {t('common.cancel')}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              placeholder={t('admin.partnerName')}
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <input
              type="url"
              required
              placeholder={t('admin.partnerUrl')}
              value={partnerUrl}
              onChange={(e) => setPartnerUrl(e.target.value)}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <input
              type="file"
              accept="image/*"
              aria-invalid={!!partnerLogoError}
              onChange={(e) => { setPartnerLogoFile(e.target.files?.[0] ?? null); setPartnerLogoError(''); }}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white file:mr-3 file:rounded file:border-0 file:bg-amber-500 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-slate-950"
            />
          </div>
          {partnerLogoError && <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">{partnerLogoError}</p>}

          <button
            type="submit"
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-4 py-2 rounded-lg text-xs flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{editingPartnerId ? t('admin.savePartnerChanges') : t('admin.addPartnerBtn')}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
