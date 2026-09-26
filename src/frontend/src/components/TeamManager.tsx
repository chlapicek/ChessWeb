import React, { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../services/apiClient';
import { Team, User } from '../types';

export const TeamManager: React.FC = () => {
  const { t } = useTranslation();
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [teamName, setTeamName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Record<string, string>>({});

  const load = async () => {
    const [teamsResponse, usersResponse] = await Promise.all([apiClient.get<Team[]>('/teams'), apiClient.get<User[]>('/auth/users')]);
    setTeams(teamsResponse.data);
    setUsers(usersResponse.data);
  };

  useEffect(() => { load().catch(() => toast.error(t('admin.teamLoadFailed'))); }, []);

  const createTeam = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await apiClient.post('/teams', { name: teamName });
      setTeamName('');
      toast.success(t('admin.teamCreated'));
      await load();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('admin.teamCreateFailed'));
    }
  };

  const addMember = async (teamId: string) => {
    const userId = selectedUsers[teamId];
    if (!userId) return;
    try {
      await apiClient.post(`/teams/${teamId}/members`, { userId });
      setSelectedUsers((previous) => ({ ...previous, [teamId]: '' }));
      toast.success(t('admin.teamMemberAdded'));
      await load();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('admin.teamMemberAddFailed'));
    }
  };

  const removeMember = async (teamId: string, userId: string) => {
    try {
      await apiClient.delete(`/teams/${teamId}/members/${userId}`);
      toast.success(t('admin.teamMemberRemoved'));
      await load();
    } catch {
      toast.error(t('admin.teamMemberRemoveFailed'));
    }
  };

  const assignCaptain = async (teamId: string, captainUserId?: string) => {
    try {
      await apiClient.put(`/teams/${teamId}/captain`, { captainUserId: captainUserId ?? null });
      toast.success(captainUserId ? t('admin.teamCaptainAssigned', { name: users.find((candidate) => candidate.id === captainUserId)?.fullName ?? '' }) : t('admin.teamCaptainCleared'));
      await load();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('admin.teamCaptainAssignFailed'));
    }
  };

  const deleteTeam = async (team: Team) => {
    if (!window.confirm(t('admin.teamDeleteConfirm', { name: team.name }))) return;
    try {
      await apiClient.delete(`/teams/${team.id}`);
      toast.success(t('admin.teamDeleted', { name: team.name }));
      await load();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('admin.teamDeleteFailed'));
    }
  };

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <h2 className="text-base font-bold text-slate-900 dark:text-white">{t('admin.teamManagement')}</h2>
    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('admin.teamManagementDescription')}</p>
    <form onSubmit={createTeam} className="mt-4 flex gap-2">
      <input required maxLength={100} value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder={t('admin.teamName')} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
      <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950"><Plus className="h-3.5 w-3.5" />{t('admin.createTeam')}</button>
    </form>
    <div className="mt-5 space-y-3">
      {teams.map((team) => {
        const members = users.filter((candidate) => team.userIds.includes(candidate.id)).sort((a, b) => a.fullName.localeCompare(b.fullName));
        return <article key={team.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold text-slate-900 dark:text-white">{team.name}</h3><span className="text-xs text-slate-500">{members.length} {t('admin.teamMembers')}</span></div><button type="button" aria-label={t('admin.deleteTeamLabel', { name: team.name })} onClick={() => deleteTeam(team)} className="inline-flex items-center gap-1 rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"><Trash2 className="h-3.5 w-3.5" />{t('admin.deleteTeam')}</button></div>
          <div className="mt-3 flex flex-wrap gap-2">{members.map((member) => <span key={member.id} className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">{member.fullName}<button type="button" aria-label={t('admin.removeTeamMember', { name: member.fullName })} onClick={() => removeMember(team.id, member.id)}><X className="h-3 w-3" /></button></span>)}</div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('admin.teamCaptain')}</label>
                <select aria-label={t('admin.teamCaptain')} value={team.captainUserId || ''} onChange={(event) => assignCaptain(team.id, event.target.value || undefined)} className="min-w-0 flex-1 bg-transparent text-xs text-slate-900 dark:text-white"><option value="">{team.captainUserId ? t('admin.noCaptain') : t('admin.noCaptainAssigned')}</option>{members.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">{t('admin.teamCaptainHelp')}</span>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row"><select aria-label={t('admin.addTeamMember')} value={selectedUsers[team.id] || ''} onChange={(event) => setSelectedUsers((previous) => ({ ...previous, [team.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="">{t('admin.selectExistingUser')}</option>{users.filter((candidate) => !team.userIds.includes(candidate.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.fullName}</option>)}</select><button type="button" disabled={!selectedUsers[team.id]} onClick={() => addMember(team.id)} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:opacity-50">{t('admin.addTeamMember')}</button></div>
        </article>;
      })}
    </div>
  </section>;
};