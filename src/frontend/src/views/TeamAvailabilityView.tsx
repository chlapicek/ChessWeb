import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, Plus, RefreshCw, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../services/apiClient';
import { AvailabilityStatus, ExistingPlayer, MatchPlayerTag, SeasonReportEntry, TeamAvailability, TeamAvailabilityDate, TeamAvailabilityEntry, TeamAvailabilityPlayer, TeamAvailabilityTeam } from '../types';

const availableStatus: AvailabilityStatus = 1;
const pendingStatus: AvailabilityStatus = 0;
const noTag: MatchPlayerTag = 0;
const tagOptions: { value: MatchPlayerTag; labelKey: string }[] = [
  { value: 0, labelKey: 'teamAvailability.tagNone' },
  { value: 1, labelKey: 'teamAvailability.tagCizinec' },
  { value: 2, labelKey: 'teamAvailability.tagHost' },
  { value: 3, labelKey: 'teamAvailability.tagVyssi' },
];
const tagChips: { value: MatchPlayerTag; letter: string; labelKey: string }[] = [
  { value: 1, letter: 'C', labelKey: 'teamAvailability.tagCizinec' },
  { value: 2, letter: 'H', labelKey: 'teamAvailability.tagHost' },
  { value: 3, letter: 'V', labelKey: 'teamAvailability.tagVyssi' },
];

const toDateInputValue = (date: Date) => date.toISOString().slice(0, 10);
const playerKey = (player: Pick<TeamAvailabilityPlayer, 'playerUserId' | 'playerName'>) => player.playerUserId || player.playerName.trim().toUpperCase();
const matchKey = (match: Pick<TeamAvailabilityDate, 'roundNumber' | 'matchDate' | 'opponentTeam' | 'location' | 'isHomeMatch'>) => `${match.roundNumber}|${match.matchDate.slice(0, 10)}|${match.opponentTeam}|${match.location}|${match.isHomeMatch}`;
const entryMatchKey = (entry: Pick<TeamAvailabilityEntry, 'roundNumber' | 'matchDate' | 'opponentTeam' | 'location' | 'isHomeMatch'>) => `${entry.roundNumber}|${entry.matchDate.slice(0, 10)}|${entry.opponentTeam}|${entry.location}|${entry.isHomeMatch}`;
const emptyGuid = '00000000-0000-0000-0000-000000000000';
const axisRenderKey = (id: string | undefined, fallback: string) => id && id.trim().toLowerCase() !== emptyGuid ? id.trim().toLowerCase() : fallback;
const formatDateOnly = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString();
};

export const TeamAvailabilityView: React.FC = () => {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading: authLoading, isAdmin } = useAuth();
  const [teams, setTeams] = useState<TeamAvailabilityTeam[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [availability, setAvailability] = useState<TeamAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingAvailability, setRefreshingAvailability] = useState(false);
  const [error, setError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [dateForm, setDateForm] = useState({ matchDate: toDateInputValue(new Date()), opponentTeam: '', location: '', isHomeMatch: true });
  const [playerForm, setPlayerForm] = useState({ playerName: '' });
  const [playerQuery, setPlayerQuery] = useState('');
  const [playerResults, setPlayerResults] = useState<ExistingPlayer[]>([]);
  const [selectedRegisteredPlayer, setSelectedRegisteredPlayer] = useState<ExistingPlayer | null>(null);
  const [playerValidation, setPlayerValidation] = useState('');
  const [searchingPlayers, setSearchingPlayers] = useState(false);
  const [submittingDate, setSubmittingDate] = useState(false);
  const [submittingPlayer, setSubmittingPlayer] = useState(false);
  const [updatingZakladId, setUpdatingZakladId] = useState<string | null>(null);
  const [updatingTagId, setUpdatingTagId] = useState<string | null>(null);
  const [seasonForm, setSeasonForm] = useState({ seasonStartDate: '', seasonEndDate: '' });
  const [savingSeason, setSavingSeason] = useState(false);
  const [showSeasonReport, setShowSeasonReport] = useState(false);
  const [seasonReport, setSeasonReport] = useState<SeasonReportEntry[]>([]);
  const [loadingSeasonReport, setLoadingSeasonReport] = useState(false);
  const availabilityRequestId = useRef(0);

  const loadTeams = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.get<TeamAvailabilityTeam[]>('/teamavailability/teams');
      setTeams(response.data);
      if (!selectedTeamId && response.data.length > 0) setSelectedTeamId(response.data[0].id);
    } catch {
      setError(t('teamAvailability.loadTeamsError'));
    } finally {
      setLoading(false);
    }
  };

  const loadAvailability = async (teamId: string) => {
    const requestId = availabilityRequestId.current + 1;
    availabilityRequestId.current = requestId;
    const hasCurrentTeamAvailability = !!availability && availability.teamId === teamId;
    if (hasCurrentTeamAvailability) {
      setRefreshingAvailability(true);
      setRefreshError('');
    } else {
      setLoading(true);
      setRefreshingAvailability(false);
      setAvailability(null);
      setError('');
      setRefreshError('');
    }
    try {
      const response = await apiClient.get<TeamAvailability>(`/teamavailability/team/${teamId}`);
      if (requestId !== availabilityRequestId.current) return;
      setAvailability(response.data);
      setRefreshError('');
    } catch {
      if (requestId !== availabilityRequestId.current) return;
      if (hasCurrentTeamAvailability) {
        setRefreshError(t('teamAvailability.refreshAvailabilityError'));
      } else {
        setError(t('teamAvailability.loadAvailabilityError'));
      }
    } finally {
      if (requestId !== availabilityRequestId.current) return;
      if (hasCurrentTeamAvailability) {
        setRefreshingAvailability(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (isAuthenticated) loadTeams();
  }, [isAuthenticated]);

  useEffect(() => {
    if (selectedTeamId) loadAvailability(selectedTeamId);
    setShowSeasonReport(false);
    setSeasonReport([]);
  }, [selectedTeamId]);

  useEffect(() => {
    if (!availability) return;
    setSeasonForm({
      seasonStartDate: availability.seasonStartDate ? availability.seasonStartDate.slice(0, 10) : '',
      seasonEndDate: availability.seasonEndDate ? availability.seasonEndDate.slice(0, 10) : '',
    });
  }, [availability?.teamId, availability?.seasonStartDate, availability?.seasonEndDate]);

  useEffect(() => {
    if (!availability || playerQuery.trim().length < 1) {
      setPlayerResults([]);
      setSearchingPlayers(false);
      return;
    }
    const handle = window.setTimeout(async () => {
      setSearchingPlayers(true);
      try {
        const response = await apiClient.get<ExistingPlayer[]>('/teamavailability/players', { params: { teamId: availability.teamId, query: playerQuery.trim() } });
        const existingPlayerIds = new Set(availability.players.map((player) => player.playerUserId).filter(Boolean));
        setPlayerResults(response.data.filter((player) => !existingPlayerIds.has(player.userId)));
      } catch {
        toast.error(t('teamAvailability.playerSearchError'));
      } finally {
        setSearchingPlayers(false);
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [availability, playerQuery, t]);

  const canManageTeam = !!availability && (isAdmin || (!!user && availability.captainUserId === user.id));
  const players = useMemo(() => availability?.players ?? [], [availability]);
  const matches = useMemo(() => availability?.dates ?? [], [availability]);

  const findEntry = (player: TeamAvailabilityPlayer, match: TeamAvailabilityDate) => availability?.entries.find((entry) => entryMatchKey(entry) === matchKey(match) && playerKey(entry) === playerKey(player));
  const canManageEntry = (entry: TeamAvailabilityEntry) => isAdmin || (!!user && entry.playerUserId === user.id);
  const formatMatchLabel = (match: TeamAvailabilityDate) => [formatDateOnly(match.matchDate), match.opponentTeam ? `${t('teamAvailability.vs')} ${match.opponentTeam}` : '', match.isHomeMatch ? t('teamAvailability.home') : t('teamAvailability.away')].filter(Boolean).join(' · ');
  const emptyState = !players.length && !matches.length ? 'teamAvailability.emptyBothAxes' : !players.length ? 'teamAvailability.emptyPlayers' : 'teamAvailability.emptyDates';

  const updateEntryFields = async (entry: TeamAvailabilityEntry, fields: { status?: AvailabilityStatus }) => {
    if (!canManageEntry(entry)) return;
    setSavingId(entry.id);
    setError('');
    const nextStatus = fields.status ?? entry.status;
    try {
      if (user && entry.playerUserId === user.id && !isAdmin) {
        await apiClient.put(`/teamavailability/entries/${entry.id}/self`, { status: nextStatus, isDriver: entry.isDriver, notes: entry.notes || null });
      } else {
        await apiClient.put(`/teamavailability/entries/${entry.id}`, {
          playerUserId: entry.playerUserId || null,
          playerName: entry.playerName,
          playerRating: entry.playerRating || null,
          roundNumber: entry.roundNumber,
          matchDate: entry.matchDate,
          opponentTeam: entry.opponentTeam,
          location: entry.location,
          isHomeMatch: entry.isHomeMatch,
          status: nextStatus,
          isDriver: entry.isDriver,
          notes: entry.notes || null,
        });
      }
      toast.success(t('teamAvailability.saveSuccess'));
      await loadAvailability(entry.teamId);
    } catch (error: any) {
      const backendMessage: string | undefined = error.response?.data?.message;
      const message = backendMessage === 'Availability is closed for this match date.'
        ? t('teamAvailability.closedAfterMatchDate')
        : backendMessage || t('teamAvailability.saveError');
      toast.error(message);
    } finally {
      setSavingId(null);
    }
  };

  const updateEntry = (entry: TeamAvailabilityEntry, status: AvailabilityStatus) => updateEntryFields(entry, { status });

  const toggleZaklad = async (player: TeamAvailabilityPlayer) => {
    if (!availability || !canManageTeam) return;
    setUpdatingZakladId(player.id);
    try {
      await apiClient.put(`/teamavailability/team/${availability.teamId}/players/${player.id}/zaklad`, { isZaklad: !player.isZaklad });
      await loadAvailability(availability.teamId);
    } catch {
      toast.error(t('teamAvailability.zakladUpdateError'));
    } finally {
      setUpdatingZakladId(null);
    }
  };

  const updatePlayerTag = async (player: TeamAvailabilityPlayer, tag: MatchPlayerTag) => {
    if (!availability || !canManageTeam) return;
    setUpdatingTagId(player.id);
    try {
      await apiClient.put(`/teamavailability/team/${availability.teamId}/players/${player.id}/tag`, { tag });
      await loadAvailability(availability.teamId);
    } catch (error: any) {
      const backendMessage: string | undefined = error.response?.data?.message;
      toast.error(backendMessage?.startsWith('Maximum of 3 tagged players') ? t('teamAvailability.tagLimitError') : t('teamAvailability.tagUpdateError'));
    } finally {
      setUpdatingTagId(null);
    }
  };

  const saveSeason = async (event: FormEvent) => {
    event.preventDefault();
    if (!availability || !canManageTeam) return;
    setSavingSeason(true);
    try {
      await apiClient.put(`/teamavailability/team/${availability.teamId}/season`, {
        seasonStartDate: seasonForm.seasonStartDate ? `${seasonForm.seasonStartDate}T00:00:00` : null,
        seasonEndDate: seasonForm.seasonEndDate ? `${seasonForm.seasonEndDate}T00:00:00` : null,
      });
      toast.success(t('teamAvailability.seasonSaveSuccess'));
      await loadAvailability(availability.teamId);
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('teamAvailability.seasonSaveError'));
    } finally {
      setSavingSeason(false);
    }
  };

  const loadSeasonReport = async (teamId: string) => {
    setLoadingSeasonReport(true);
    try {
      const response = await apiClient.get<SeasonReportEntry[]>(`/teamavailability/team/${teamId}/season-report`);
      setSeasonReport(response.data);
    } catch {
      toast.error(t('teamAvailability.seasonReportLoadError'));
    } finally {
      setLoadingSeasonReport(false);
    }
  };

  const toggleSeasonReport = async () => {
    if (!availability) return;
    const next = !showSeasonReport;
    setShowSeasonReport(next);
    if (next) await loadSeasonReport(availability.teamId);
  };

  const addDate = async (event: FormEvent) => {
    event.preventDefault();
    if (!availability || !canManageTeam || !dateForm.matchDate) return;
    setSubmittingDate(true);
    setError('');
    try {
      await apiClient.post(`/teamavailability/team/${availability.teamId}/dates`, {
        matchDate: `${dateForm.matchDate}T00:00:00`,
        opponentTeam: dateForm.opponentTeam || null,
        location: dateForm.location || null,
        isHomeMatch: dateForm.isHomeMatch,
      });
      setDateForm({ matchDate: toDateInputValue(new Date()), opponentTeam: '', location: '', isHomeMatch: true });
      toast.success(t('teamAvailability.addDateSuccess'));
      await loadAvailability(availability.teamId);
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('teamAvailability.addDateError'));
    } finally {
      setSubmittingDate(false);
    }
  };

  const addPlayer = async (event: FormEvent) => {
    event.preventDefault();
    if (!availability || !canManageTeam) return;
    const playerName = playerForm.playerName.trim();
    if (selectedRegisteredPlayer && playerName) {
      setPlayerValidation(t('teamAvailability.playerChooseOne'));
      return;
    }
    if (!selectedRegisteredPlayer && !playerName) {
      setPlayerValidation(t('teamAvailability.playerRequired'));
      return;
    }
    setSubmittingPlayer(true);
    setError('');
    setPlayerValidation('');
    try {
      await apiClient.post(`/teamavailability/team/${availability.teamId}/players`, {
        playerUserId: selectedRegisteredPlayer?.userId || null,
        playerName: selectedRegisteredPlayer ? null : playerName,
      });
      setPlayerForm({ playerName: '' });
      setSelectedRegisteredPlayer(null);
      setPlayerQuery('');
      setPlayerResults([]);
      toast.success(selectedRegisteredPlayer && !selectedRegisteredPlayer.isTeamMember ? t('teamAvailability.addPlayerAndTeamSuccess') : t('teamAvailability.addPlayerSuccess'));
      await loadAvailability(availability.teamId);
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('teamAvailability.addPlayerError'));
    } finally {
      setSubmittingPlayer(false);
    }
  };

  if (authLoading) return <div className="max-w-5xl mx-auto px-4 py-16 text-center text-slate-500">{t('common.loading')}</div>;
  if (!isAuthenticated) return <div className="max-w-2xl mx-auto px-4 py-16 text-center"><Users className="mx-auto h-10 w-10 text-amber-500" /><h2 className="mt-4 text-xl font-bold">{t('teamAvailability.signInTitle')}</h2><p className="mt-2 text-sm text-slate-500">{t('teamAvailability.signInDesc')}</p></div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><CalendarDays className="h-6 w-6 text-amber-500" /><h1 className="text-2xl font-bold">{t('teamAvailability.title')}</h1></div>
          <p className="mt-1 text-sm text-slate-500">{t('teamAvailability.subtitle')}</p>
        </div>
        <button type="button" onClick={() => loadAvailability(selectedTeamId)} disabled={!selectedTeamId || loading || refreshingAvailability} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"><RefreshCw aria-hidden="true" className={`h-4 w-4 ${refreshingAvailability ? 'animate-spin' : ''}`} />{t('common.refresh')}</button>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="team-availability-team">{t('teamAvailability.selectTeam')}</label>
        <select id="team-availability-team" value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)} disabled={loading || teams.length === 0} className="mt-2 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700 sm:max-w-xl"><option value="">{t('teamAvailability.noTeams')}</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
      </section>

      {error && <div className="flex items-center justify-between gap-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button type="button" onClick={() => selectedTeamId ? loadAvailability(selectedTeamId) : loadTeams()} className="font-semibold underline">{t('common.retry')}</button></div>}
      {!loading && !error && teams.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">{t('teamAvailability.noTeams')}</div>}

      {availability && !loading && (
        <>
          {canManageTeam && (
            <section className="grid gap-4 lg:grid-cols-2">
              <form onSubmit={addDate} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h2 className="text-base font-bold">{t('teamAvailability.addMatchDate')}</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium"><span className="block text-xs uppercase tracking-wide text-slate-500">{t('teamAvailability.matchDate')}</span><input type="date" required value={dateForm.matchDate} onChange={(event) => setDateForm((current) => ({ ...current, matchDate: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700" /></label>
                  <label className="text-sm font-medium"><span className="block text-xs uppercase tracking-wide text-slate-500">{t('teamAvailability.opponent')}</span><input type="text" maxLength={150} value={dateForm.opponentTeam} onChange={(event) => setDateForm((current) => ({ ...current, opponentTeam: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700" /></label>
                  <label className="text-sm font-medium"><span className="block text-xs uppercase tracking-wide text-slate-500">{t('teamAvailability.location')}</span><input type="text" maxLength={300} value={dateForm.location} onChange={(event) => setDateForm((current) => ({ ...current, location: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700" /></label>
                  <label className="text-sm font-medium"><span className="block text-xs uppercase tracking-wide text-slate-500">{t('teamAvailability.homeAway')}</span><select value={dateForm.isHomeMatch ? 'home' : 'away'} onChange={(event) => setDateForm((current) => ({ ...current, isHomeMatch: event.target.value === 'home' }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700"><option value="home">{t('teamAvailability.home')}</option><option value="away">{t('teamAvailability.away')}</option></select></label>
                </div>
                <button type="submit" disabled={submittingDate} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"><Plus className="h-4 w-4" />{t('teamAvailability.addMatchDate')}</button>
              </form>

              <form onSubmit={addPlayer} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h2 className="text-base font-bold">{t('teamAvailability.addPlayer')}</h2>
                <div className="mt-4 grid gap-3">
                  <label className="text-sm font-medium"><span className="block text-xs uppercase tracking-wide text-slate-500">{t('teamAvailability.registeredPlayerSearch')}</span><input type="search" value={playerQuery} onChange={(event) => { setPlayerQuery(event.target.value); setSelectedRegisteredPlayer(null); setPlayerValidation(''); }} placeholder={t('teamAvailability.registeredPlayerSearchPlaceholder')} aria-controls="team-availability-player-results" aria-expanded={playerQuery.trim().length >= 1 && playerResults.length > 0} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700" /></label>
                  {selectedRegisteredPlayer ? <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"><span>{selectedRegisteredPlayer.fullName} · {selectedRegisteredPlayer.isTeamMember ? t('teamAvailability.alreadyTeamMember') : t('teamAvailability.willBeAddedToTeam')}</span><button type="button" aria-label={t('teamAvailability.clearSelectedPlayer')} onClick={() => setSelectedRegisteredPlayer(null)}><X className="h-4 w-4" /></button></div> : playerQuery.trim().length >= 1 && <select id="team-availability-player-results" aria-label={t('teamAvailability.registeredPlayerResults')} value="" onChange={(event) => { const selected = playerResults.find((player) => player.userId === event.target.value); if (selected) { setSelectedRegisteredPlayer(selected); setPlayerForm({ playerName: '' }); setPlayerValidation(''); } }} className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"><option value="">{searchingPlayers ? t('teamAvailability.searchingPlayers') : playerResults.length ? t('teamAvailability.selectRegisteredPlayer') : t('teamAvailability.noRegisteredPlayersFound')}</option>{playerResults.map((player) => <option key={player.userId} value={player.userId}>{player.fullName}{player.chessRating ? ` · ${player.chessRating}` : ''} · {player.isTeamMember ? t('teamAvailability.alreadyTeamMember') : t('teamAvailability.willBeAddedToTeam')}</option>)}</select>}
                  <label className="text-sm font-medium"><span className="block text-xs uppercase tracking-wide text-slate-500">{t('teamAvailability.customPlayerName')}</span><input type="text" maxLength={150} disabled={!!selectedRegisteredPlayer} value={playerForm.playerName} onChange={(event) => { setPlayerForm((current) => ({ ...current, playerName: event.target.value })); setPlayerValidation(''); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 disabled:opacity-60 dark:border-slate-700" /></label>
                  {playerValidation && <p className="text-sm text-rose-600" role="alert">{playerValidation}</p>}
                </div>
                <button type="submit" disabled={submittingPlayer} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"><Plus className="h-4 w-4" />{t('teamAvailability.addPlayer')}</button>
              </form>
            </section>
          )}

          {canManageTeam && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-base font-bold">{t('teamAvailability.seasonSettings')}</h2>
              <form onSubmit={saveSeason} className="mt-4 grid gap-3 sm:grid-cols-3 sm:items-end">
                <label className="text-sm font-medium"><span className="block text-xs uppercase tracking-wide text-slate-500">{t('teamAvailability.seasonStart')}</span><input type="date" value={seasonForm.seasonStartDate} onChange={(event) => setSeasonForm((current) => ({ ...current, seasonStartDate: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700" /></label>
                <label className="text-sm font-medium"><span className="block text-xs uppercase tracking-wide text-slate-500">{t('teamAvailability.seasonEnd')}</span><input type="date" value={seasonForm.seasonEndDate} onChange={(event) => setSeasonForm((current) => ({ ...current, seasonEndDate: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700" /></label>
                <button type="submit" disabled={savingSeason} className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60">{t('common.save')}</button>
              </form>
            </section>
          )}

          <section aria-busy={refreshingAvailability} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 p-5 dark:border-slate-800">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold">{availability.teamName}</h2>
                  <p className="mt-1 text-sm text-slate-500">{t('teamAvailability.teamMembers')}: {availability.teamMembers.length}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={toggleSeasonReport} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">{showSeasonReport ? t('teamAvailability.seasonReportHide') : t('teamAvailability.seasonReportShow')}</button>
                  {refreshingAvailability && <div role="status" className="inline-flex items-center gap-2 text-xs font-medium text-slate-500"><RefreshCw aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />{t('teamAvailability.refreshingAvailability')}</div>}
                </div>
              </div>
              {refreshError && <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"><span>{refreshError}</span><button type="button" onClick={() => loadAvailability(availability.teamId)} disabled={refreshingAvailability} className="font-semibold underline">{t('common.retry')}</button></div>}
              {showSeasonReport && (
                <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <h3 className="text-sm font-bold">{t('teamAvailability.seasonReport')}</h3>
                  {loadingSeasonReport ? (
                    <p className="mt-2 text-sm text-slate-500">{t('common.loading')}</p>
                  ) : seasonReport.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">{t('teamAvailability.seasonReportEmpty')}</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {seasonReport.map((reportEntry) => (
                        <li key={reportEntry.playerId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                          <span className="font-medium">{reportEntry.playerName}</span>
                          <span className="flex items-center gap-2">
                            <span>{t('teamAvailability.seasonReportMatchesPlayed')}: {reportEntry.matchesPlayed}</span>
                            {reportEntry.meetsMinimum ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{t('teamAvailability.seasonReportMeetsMinimum')}</span>
                            ) : (
                              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-200">⚠ {t('teamAvailability.seasonReportBelowMinimum')}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            {matches.length === 0 || players.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                {canManageTeam ? t(emptyState) : t('teamAvailability.memberEmptyState')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-separate border-spacing-0 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950">
                    <tr>
                      <th scope="col" className="sticky left-0 z-20 min-w-52 border-b border-slate-200 bg-slate-50 p-3 text-left dark:border-slate-800 dark:bg-slate-950">{t('teamAvailability.playerName')}</th>
                      {matches.map((match) => <th key={axisRenderKey(match.id, matchKey(match))} scope="col" className="min-w-36 border-b border-slate-200 p-3 text-center dark:border-slate-800"><span className="block font-semibold text-slate-700 dark:text-slate-200">{formatDateOnly(match.matchDate)}</span><span className="block text-[11px] normal-case text-slate-500">{[match.opponentTeam ? `${t('teamAvailability.vs')} ${match.opponentTeam}` : '', match.isHomeMatch ? t('teamAvailability.home') : t('teamAvailability.away')].filter(Boolean).join(' · ')}</span></th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((player) => (
                      <tr key={axisRenderKey(player.id, playerKey(player))}>
                        <th scope="row" className="sticky left-0 z-10 border-b border-slate-200 bg-white p-3 text-left align-middle dark:border-slate-800 dark:bg-slate-900">
                          <span className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{player.playerName}</span>
                            {canManageTeam ? (
                              <button type="button" onClick={() => toggleZaklad(player)} disabled={updatingZakladId === player.id} aria-pressed={player.isZaklad} aria-label={t('teamAvailability.zakladToggleLabel', { player: player.playerName })} title={t('teamAvailability.zakladLabel')} className={`inline-flex h-5 w-5 items-center justify-center rounded border text-[11px] font-bold ${player.isZaklad ? 'border-amber-500 bg-amber-500 text-slate-950' : 'border-slate-300 text-slate-400 dark:border-slate-600'} disabled:cursor-not-allowed disabled:opacity-60`}>{t('teamAvailability.zakladBadge')}</button>
                            ) : player.isZaklad ? (
                              <span aria-label={t('teamAvailability.zakladLabel')} title={t('teamAvailability.zakladLabel')} className="inline-flex h-5 w-5 items-center justify-center rounded border border-amber-500 bg-amber-500 text-[11px] font-bold text-slate-950">{t('teamAvailability.zakladBadge')}</span>
                            ) : null}
                          </span>
                          <span className="mt-1 flex items-center gap-1">
                            <span className="text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500">{t('teamAvailability.tagLabel')}:</span>
                            {canManageTeam ? (
                              tagChips.map((chip) => (
                                <button
                                  key={chip.value}
                                  type="button"
                                  onClick={() => updatePlayerTag(player, player.tag === chip.value ? noTag : chip.value)}
                                  disabled={updatingTagId === player.id}
                                  aria-pressed={player.tag === chip.value}
                                  aria-label={t('teamAvailability.tagToggleLabel', { player: player.playerName, tag: t(chip.labelKey) })}
                                  title={t(chip.labelKey)}
                                  className={`inline-flex h-5 w-5 items-center justify-center rounded border text-[11px] font-bold ${player.tag === chip.value ? 'border-amber-500 bg-amber-500 text-slate-950' : 'border-slate-300 text-slate-400 dark:border-slate-600'} disabled:cursor-not-allowed disabled:opacity-60`}
                                >
                                  {chip.letter}
                                </button>
                              ))
                            ) : player.tag !== noTag ? (
                              <span aria-label={t(tagOptions[player.tag].labelKey)} title={t(tagOptions[player.tag].labelKey)} className="inline-flex h-5 w-5 items-center justify-center rounded border border-amber-500 bg-amber-500 text-[11px] font-bold text-slate-950">
                                {tagChips.find((chip) => chip.value === player.tag)?.letter}
                              </span>
                            ) : null}
                          </span>
                          {player.playerRating && <span className="block text-xs text-slate-500">{player.playerRating}</span>}
                        </th>
                        {matches.map((match) => {
                          const entry = findEntry(player, match);
                          const closed = match.isClosed;
                          const canEdit = !!entry && canManageEntry(entry) && !closed;
                          const checked = entry?.status === availableStatus;
                          const disabledReason = closed ? t('teamAvailability.closedAfterMatchDate') : t('teamAvailability.readOnlyCell');
                          const cellLabel = closed ? t('teamAvailability.availabilityCheckboxClosedLabel', { player: player.playerName, match: formatMatchLabel(match) }) : t('teamAvailability.availabilityCheckboxLabel', { player: player.playerName, match: formatMatchLabel(match) });
                          return (
                            <td key={`player:${axisRenderKey(player.id, playerKey(player))}|match:${axisRenderKey(match.id, matchKey(match))}`} className="border-b border-slate-200 p-3 text-center align-middle dark:border-slate-800">
                              {entry ? (
                                <div className="flex flex-col items-center gap-1.5">
                                  <label className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border text-slate-500 focus-within:ring-2 focus-within:ring-amber-500 ${closed ? 'border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950'}`} title={canEdit ? t('teamAvailability.pendingMeansUnchecked') : disabledReason}>
                                    <input type="checkbox" className="sr-only" checked={checked} disabled={!canEdit || savingId === entry.id} aria-label={cellLabel} onChange={(event) => updateEntry(entry, event.target.checked ? availableStatus : pendingStatus)} />
                                    <span className={`flex h-6 w-6 items-center justify-center rounded border ${checked ? 'border-amber-500 bg-amber-500 text-slate-950' : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'} ${!canEdit ? 'opacity-50' : ''}`}>{checked && <Check className="h-4 w-4" />}</span>
                                    {!canEdit && <span className="sr-only">{disabledReason}</span>}
                                  </label>
                                </div>
                              ) : (
                                <span className="text-slate-400">{t('teamAvailability.noCell')}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};