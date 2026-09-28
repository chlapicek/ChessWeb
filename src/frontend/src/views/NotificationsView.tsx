import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, Check, ExternalLink, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../services/apiClient';
import { useConfirm } from '../components/ConfirmDialog';
import { NotificationAudienceOptions, NotificationInbox, NotificationInboxItem } from '../types';
import { Pagination } from '../components/Pagination';
import { usePersistentPageSize } from '../hooks/usePersistentPageSize';

export const NotificationsView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useAuth();
  const confirm = useConfirm();
  const [inbox, setInbox] = useState<NotificationInbox | null>(null);
  const [options, setOptions] = useState<NotificationAudienceOptions | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePersistentPageSize('notifications', 10);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [sendSuccess, setSendSuccess] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [internalLink, setInternalLink] = useState('');
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [accountSearch, setAccountSearch] = useState('');
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState('');
  const inboxSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    setLoading(true);
    setLoadError(false);
    apiClient.get<NotificationInbox>('/notifications', {
      params: { page, pageSize, unreadOnly: unreadOnly || undefined },
    }).then((response) => {
      if (active) setInbox(response.data);
    }).catch(() => {
      if (active) setLoadError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [isAuthenticated, page, pageSize, unreadOnly, reloadKey]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    apiClient.get<NotificationAudienceOptions>('/notifications/audience-options')
      .then((response) => { if (active) setOptions(response.data); })
      .catch(() => { if (active) setOptions(null); });
    return () => { active = false; };
  }, [isAuthenticated]);

  const markRead = async (item: NotificationInboxItem) => {
    setMarkingId(item.id);
    setActionError(false);
    try {
      await apiClient.put(`/notifications/${item.id}/read`);
      if (unreadOnly && inbox?.items.length === 1 && page > 1) {
        setPage((currentPage) => currentPage - 1);
      } else {
        setReloadKey((value) => value + 1);
      }
      window.dispatchEvent(new Event('notifications:refresh'));
    } catch {
      setActionError(true);
    } finally {
      setMarkingId(null);
    }
  };

  const deleteRead = async (item: NotificationInboxItem) => {
    const confirmed = await confirm({
      title: t('confirmDialog.deleteNotificationTitle'),
      message: t('notifications.confirmDelete', { title: item.title }),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (!confirmed) return;
    setDeletingId(item.id);
    setDeleteError(false);
    setDeleteSuccess('');
    try {
      await apiClient.delete(`/notifications/${item.id}`);
      setDeleteSuccess(t('notifications.deleteSuccess', { title: item.title }));
      inboxSectionRef.current?.focus();
      if (inbox?.items.length === 1 && page > 1) {
        setPage((currentPage) => currentPage - 1);
      } else {
        setReloadKey((value) => value + 1);
      }
      window.dispatchEvent(new Event('notifications:refresh'));
    } catch {
      setDeleteError(true);
    } finally {
      setDeletingId(null);
    }
  };

  const toggleValue = (values: string[], value: string, setValues: (next: string[]) => void) => {
    setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
    setIsConfirming(false);
    setSendError(false);
    setSendSuccess('');
  };

  const audienceSummary = options?.isAdministrator
    ? [
        ...options.teams.filter((team) => teamIds.includes(team.id)).map((team) => team.name),
        ...options.users.filter((user) => userIds.includes(user.id)).map((user) => user.fullName),
        ...roles.map((role) => t(`common.roleNames.${role}`, { defaultValue: role })),
      ].join(', ')
    : options?.teams.find((team) => teamIds.includes(team.id))?.name ?? '';
  const hasAudience = teamIds.length + userIds.length + roles.length > 0;
  const visibleUsers = options?.users.filter((user) => {
    const query = accountSearch.trim().toLowerCase();
    return !query || user.fullName.toLowerCase().includes(query) || user.email.toLowerCase().includes(query);
  }) ?? [];

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!options || !hasAudience) return;
    if (options.isAdministrator && !isConfirming) {
      setIsConfirming(true);
      return;
    }

    setIsSending(true);
    setSendError(false);
    setSendSuccess('');
    try {
      const response = await apiClient.post<{ recipientCount: number }>('/notifications', {
        title,
        message,
        internalLink: internalLink || null,
        audience: options.isAdministrator ? 'admin' : 'team',
        teamIds,
        userIds: options.isAdministrator ? userIds : [],
        roles: options.isAdministrator ? roles : [],
      });
      setSendSuccess(t('notifications.sendSuccess', { count: response.data.recipientCount }));
      setTitle('');
      setMessage('');
      setInternalLink('');
      setTeamIds([]);
      setUserIds([]);
      setRoles([]);
      setIsConfirming(false);
      setReloadKey((value) => value + 1);
      window.dispatchEvent(new Event('notifications:refresh'));
    } catch {
      setSendError(true);
      setIsConfirming(false);
    } finally {
      setIsSending(false);
    }
  };

  if (!isAuthenticated) {
    return <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-slate-600 dark:text-slate-300">{t('auth.signInPrompt')}</div>;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex items-center gap-3 border-b border-slate-200 pb-5 dark:border-slate-800">
        <Bell className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('notifications.title')}</h2>
      </header>

      <section ref={inboxSectionRef} tabIndex={-1} aria-label={t('notifications.title')}>
        {actionError && <p role="alert" className="mb-3 text-sm text-rose-700 dark:text-rose-300">{t('notifications.markReadError')}</p>}
        {deleteError && <p role="alert" className="mb-3 text-sm text-rose-700 dark:text-rose-300">{t('notifications.deleteError')}</p>}
        {deleteSuccess && <p role="status" className="mb-3 text-sm text-emerald-700 dark:text-emerald-300">{deleteSuccess}</p>}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-slate-300 p-1 dark:border-slate-700" role="group" aria-label={t('notifications.title')}>
            <button type="button" aria-pressed={!unreadOnly} onClick={() => { setUnreadOnly(false); setPage(1); }} className={`rounded px-3 py-1.5 text-sm ${!unreadOnly ? 'bg-slate-200 font-semibold dark:bg-slate-700' : 'text-slate-600 dark:text-slate-300'}`}>
              {t('notifications.all')}
            </button>
            <button type="button" aria-pressed={unreadOnly} onClick={() => { setUnreadOnly(true); setPage(1); }} className={`rounded px-3 py-1.5 text-sm ${unreadOnly ? 'bg-slate-200 font-semibold dark:bg-slate-700' : 'text-slate-600 dark:text-slate-300'}`}>
              {t('notifications.unread')}
            </button>
          </div>
        </div>

        {loading && <p role="status" className="py-8 text-sm text-slate-500">{t('notifications.loading')}</p>}
        {loadError && (
          <div role="alert" className="flex items-center justify-between gap-3 py-6 text-sm text-rose-700 dark:text-rose-300">
            <span>{t('notifications.loadError')}</span>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="rounded border border-current px-3 py-1.5">{t('notifications.retry')}</button>
          </div>
        )}
        {!loading && !loadError && inbox?.items.length === 0 && (
          <p className="py-8 text-sm text-slate-500 dark:text-slate-400">{unreadOnly ? t('notifications.emptyUnread') : t('notifications.empty')}</p>
        )}
        {!loading && !loadError && inbox && inbox.items.length > 0 && (
          <>
            <ol className="divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {inbox.items.map((item) => (
                <li key={item.id} className="py-5">
                  <article className="flex gap-3">
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full border ${item.isRead ? 'border-slate-400 bg-transparent' : 'border-emerald-600 bg-emerald-500'}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-slate-900 dark:text-white">{item.title}</h3>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {t(item.isRead ? 'notifications.readMarker' : 'notifications.unreadMarker')} · {t('notifications.sender', { name: item.senderName })} · {new Date(item.createdAt).toLocaleString(i18n.resolvedLanguage ?? i18n.language)}
                          </p>
                        </div>
                        {!item.isRead ? (
                          <button type="button" disabled={markingId === item.id} aria-label={t('notifications.markRead')} onClick={() => markRead(item)} className="inline-flex items-center gap-1.5 rounded border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            {t('notifications.markRead')}
                          </button>
                        ) : (
                          <button type="button" disabled={deletingId !== null} aria-label={t('notifications.deleteLabel', { title: item.title })} onClick={() => deleteRead(item)} className="inline-flex items-center gap-1.5 rounded border border-rose-300 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950">
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            {t('notifications.delete')}
                          </button>
                        )}
                      </div>
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 dark:text-slate-300">{item.message}</p>
                      {item.internalLink && (
                        <Link to={item.internalLink} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-300">
                          {t('notifications.openLink')} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      )}
                    </div>
                  </article>
                </li>
              ))}
            </ol>
            <Pagination
              page={page}
              totalPages={inbox.totalPages}
              totalCount={inbox.totalCount}
              pageSize={inbox.pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            />
          </>
        )}
      </section>

      {options && (
        <section className="mt-10 border-t border-slate-200 pt-8 dark:border-slate-800">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
            <Send className="h-4 w-4" aria-hidden="true" /> {t('notifications.composeTitle')}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t(options.isAdministrator ? 'notifications.adminScope' : 'notifications.captainScope')}
          </p>

          {!options.isAdministrator && options.teams.length === 0 ? (
            <p role="status" className="mt-5 text-sm text-slate-500 dark:text-slate-400">{t('notifications.noTeams')}</p>
          ) : (
          <form onSubmit={handleSend} className="mt-5 space-y-5">
            {options.isAdministrator ? (
              <fieldset className="space-y-4">
                <legend className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">{t('notifications.audience')}</legend>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-500">{t('notifications.teams')}</p>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {options.teams.map((team) => (
                      <label key={team.id} className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <input type="checkbox" checked={teamIds.includes(team.id)} onChange={() => toggleValue(teamIds, team.id, setTeamIds)} /> {team.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-500">{t('notifications.accounts')}</p>
                  <input type="search" value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} placeholder={t('notifications.searchAccounts')} aria-label={t('notifications.searchAccounts')} className="mb-2 w-full max-w-md rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                  <div className="max-h-40 overflow-y-auto border-y border-slate-200 py-2 dark:border-slate-800">
                    {visibleUsers.map((user) => (
                      <label key={user.id} className="flex items-center gap-2 py-1 text-sm text-slate-700 dark:text-slate-300">
                        <input type="checkbox" checked={userIds.includes(user.id)} onChange={() => toggleValue(userIds, user.id, setUserIds)} />
                        <span>{user.fullName} <span className="text-xs text-slate-500">{user.email}</span></span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-500">{t('notifications.roles')}</p>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {options.roles.map((role) => (
                      <label key={role} className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <input type="checkbox" checked={roles.includes(role)} onChange={() => toggleValue(roles, role, setRoles)} /> {t(`common.roleNames.${role}`, { defaultValue: role })}
                      </label>
                    ))}
                  </div>
                </div>
              </fieldset>
            ) : (
              <label className="block max-w-lg text-sm font-medium text-slate-800 dark:text-slate-200">
                {t('notifications.selectTeam')}
                <select required value={teamIds[0] ?? ''} onChange={(event) => { setTeamIds(event.target.value ? [event.target.value] : []); setIsConfirming(false); }} className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                  <option value="">{t('notifications.selectTeam')}</option>
                  {options.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </label>
            )}

            <p className="text-sm text-slate-700 dark:text-slate-300" aria-live="polite">
              {t('notifications.audienceSummary', { summary: audienceSummary || t('notifications.noAudience') })}
            </p>
            <label className="block max-w-2xl text-sm font-medium text-slate-800 dark:text-slate-200">
              {t('notifications.titleLabel')}
              <input required maxLength={120} value={title} onChange={(event) => { setTitle(event.target.value); setIsConfirming(false); }} className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
            </label>
            <label className="block max-w-2xl text-sm font-medium text-slate-800 dark:text-slate-200">
              {t('notifications.messageLabel')}
              <textarea required maxLength={4000} rows={5} value={message} onChange={(event) => { setMessage(event.target.value); setIsConfirming(false); }} className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
            </label>
            <label className="block max-w-2xl text-sm font-medium text-slate-800 dark:text-slate-200">
              {t('notifications.linkLabel')}
              <input maxLength={300} type="text" value={internalLink} placeholder={t('notifications.linkPlaceholder')} onChange={(event) => { setInternalLink(event.target.value); setIsConfirming(false); }} className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
            </label>
            {sendError && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{t('notifications.sendError')}</p>}
            {sendSuccess && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{sendSuccess}</p>}
            <button type="submit" disabled={isSending || !hasAudience} className="inline-flex items-center gap-2 rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
              <Send className="h-4 w-4" aria-hidden="true" />
              {isSending ? t('notifications.sending') : options.isAdministrator && isConfirming ? t('notifications.confirmSend') : options.isAdministrator ? t('notifications.reviewSend') : t('notifications.send')}
            </button>
          </form>
          )}
        </section>
      )}
    </div>
  );
};
