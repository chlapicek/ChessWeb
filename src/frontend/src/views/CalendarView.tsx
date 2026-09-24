import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../services/apiClient';
import { CalendarEvent } from '../types';
import {
  Calendar as CalendarIcon,
  MapPin,
  Clock,
  ExternalLink,
  Plus,
  RefreshCw,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  CalendarDays,
  Info,
  Download,
  Bell,
  BellOff
} from 'lucide-react';

const WEEKDAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS_CS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

const sanitizeIcsFileName = (name: string) => {
  const sanitized = name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim();
  return sanitized || 'calendar-event';
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const cleanCalendarText = (value: string) => {
  const withLineBreaks = value
    .replace(/<\s*br\b[^>]*>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n');
  const document = new DOMParser().parseFromString(withLineBreaks, 'text/html');
  return (document.body.textContent || '').replace(/[ \t]+\n/g, '\n').trim();
};

interface CalendarViewProps {
  subscribedOnly?: boolean;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ subscribedOnly = false }) => {
  const { t, i18n } = useTranslation();
  const { isAdmin, isAuthenticated } = useAuth();
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [subscribedEventIds, setSubscribedEventIds] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<number | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [eventLoadError, setEventLoadError] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [downloadingIcs, setDownloadingIcs] = useState(false);
  const [updatingSubscription, setUpdatingSubscription] = useState(false);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(subscribedOnly);
  const [subscriptionError, setSubscriptionError] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);

  const showSubscribedOnly = subscribedOnly && !showAllEvents;

  const events = useMemo(
    () => showSubscribedOnly
      ? allEvents.filter((event) => subscribedEventIds.has(event.id))
      : allEvents,
    [allEvents, subscribedEventIds, showSubscribedOnly]
  );
  const canManageEvents = isAdmin && !subscribedOnly;

  // View state: 'month' (real calendar grid) or 'list' (agenda cards)
  const [viewMode, setViewMode] = useState<'month' | 'list'>('month');

  // Calendar navigation state (Year & Month: 0-indexed month)
  const [currentDate, setCurrentDate] = useState(() => new Date());

  // Selected event for detail popup modal
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // New Event Form
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [category, setCategory] = useState(0);
  const [recurrence, setRecurrence] = useState<number>(0);
  const [recurrenceCount, setRecurrenceCount] = useState<number>(4);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>('');

  const isCzech = i18n.language.startsWith('cs');
  const weekdays = isCzech ? WEEKDAYS_CS : WEEKDAYS_EN;

  const CATEGORY_MAP: Record<number, { label: string; bg: string; text: string; border: string; dot: string }> = {
    0: {
      label: t('calendar.tournament'),
      bg: 'bg-amber-500/15',
      text: 'text-amber-700 dark:text-amber-300',
      border: 'border-amber-500/30',
      dot: 'bg-amber-500',
    },
    1: {
      label: t('calendar.leagueMatch'),
      bg: 'bg-blue-500/15',
      text: 'text-blue-700 dark:text-blue-300',
      border: 'border-blue-500/30',
      dot: 'bg-blue-500',
    },
    2: {
      label: t('calendar.clubNight'),
      bg: 'bg-emerald-500/15',
      text: 'text-emerald-700 dark:text-emerald-300',
      border: 'border-emerald-500/30',
      dot: 'bg-emerald-500',
    },
    3: {
      label: t('calendar.trainingSeminar'),
      bg: 'bg-purple-500/15',
      text: 'text-purple-700 dark:text-purple-300',
      border: 'border-purple-500/30',
      dot: 'bg-purple-500',
    },
    4: {
      label: t('calendar.other'),
      bg: 'bg-slate-500/15',
      text: 'text-slate-700 dark:text-slate-300',
      border: 'border-slate-500/30',
      dot: 'bg-slate-500',
    },
  };

  const fetchEvents = async () => {
    setLoading(true);
    setEventLoadError(false);
    try {
      const res = await apiClient.get<CalendarEvent[]>('/calendar/events', {
        params: selectedCategory !== 'all' ? { category: selectedCategory } : {},
      });
      setAllEvents(res.data);
    } catch (err) {
      console.error('Failed to load events', err);
      setEventLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubscriptions = async () => {
    if (!isAuthenticated) {
      setSubscribedEventIds(new Set());
      setSubscriptionsLoading(false);
      return;
    }

    setSubscriptionsLoading(true);
    setSubscriptionError(false);
    try {
      const res = await apiClient.get<CalendarEvent[]>('/calendar/my-subscriptions');
      setSubscribedEventIds(new Set(res.data.map((event) => event.id)));
    } catch (err) {
      console.error('Failed to load calendar subscriptions', err);
      setSubscriptionError(true);
    } finally {
      setSubscriptionsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [selectedCategory]);

  useEffect(() => {
    fetchSubscriptions();
  }, [isAuthenticated]);

  const handleSubscription = async (evt: CalendarEvent, series: boolean, subscribe: boolean) => {
    const path = series && evt.recurrenceGroupId
      ? `/calendar/events/series/${evt.recurrenceGroupId}/subscribe`
      : `/calendar/events/${evt.id}/subscribe`;

    setUpdatingSubscription(true);
    try {
      if (subscribe) {
        await apiClient.post(path);
      } else {
        await apiClient.delete(path);
      }

      const affectedEventIds = series && evt.recurrenceGroupId
        ? allEvents.filter((event) => event.recurrenceGroupId === evt.recurrenceGroupId).map((event) => event.id)
        : [evt.id];

      setSubscribedEventIds((current) => {
        const next = new Set(current);
        affectedEventIds.forEach((eventId) => {
          if (subscribe) next.add(eventId);
          else next.delete(eventId);
        });
        return next;
      });
    } catch (err) {
      console.error('Failed to update calendar subscription', err);
      setStatusMsg(t('calendar.subscribeError'));
    } finally {
      setUpdatingSubscription(false);
    }
  };

  const isSeriesSubscribed = (evt: CalendarEvent) => {
    if (!evt.recurrenceGroupId) return false;
    const seriesEvents = allEvents.filter((event) => event.recurrenceGroupId === evt.recurrenceGroupId);
    return seriesEvents.length > 0 && seriesEvents.every((event) => subscribedEventIds.has(event.id));
  };

  const handleSyncFeeds = async () => {
    setSyncing(true);
    setStatusMsg(null);
    try {
      const res = await apiClient.post('/calendar/sync-all');
      setStatusMsg(res.data.message || 'Feeds synchronized!');
      fetchEvents();
    } catch (err: any) {
      setStatusMsg(err.response?.data?.message || 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/calendar/events', {
        title,
        description,
        location,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        category,
        recurrence,
        recurrenceCount: Number(recurrenceCount) || 1,
        recurrenceEndDate: recurrenceEndDate ? new Date(recurrenceEndDate).toISOString() : null,
      });
      setIsAdding(false);
      setTitle('');
      setDescription('');
      setLocation('');
      setStartTime('');
      setEndTime('');
      setRecurrence(0);
      setRecurrenceCount(4);
      setRecurrenceEndDate('');
      fetchEvents();
    } catch (err) {
      console.error('Failed to create event', err);
    }
  };

  const handleDeleteEvent = async (id: string, deleteSeries = false) => {
    const confirmPrompt = deleteSeries ? t('calendar.deleteEntireSeries') + '?' : t('common.deleteConfirm');
    if (!window.confirm(confirmPrompt)) return;
    try {
      await apiClient.delete(`/calendar/events/${id}`, {
        params: { deleteSeries },
      });
      if (selectedEvent?.id === id || (deleteSeries && selectedEvent?.recurrenceGroupId)) {
        setSelectedEvent(null);
      }
      fetchEvents();
    } catch (err) {
      console.error('Failed to delete event', err);
    }
  };

  const handleDownloadIcs = async (evt: CalendarEvent, series: boolean) => {
    setDownloadingIcs(true);
    try {
      const path = series && evt.recurrenceGroupId
        ? `/calendar/events/series/${evt.recurrenceGroupId}/ics`
        : `/calendar/events/${evt.id}/ics`;
      const response = await apiClient.get(path, { responseType: 'blob' });
      const suffix = series ? '-series' : '';
      downloadBlob(response.data as Blob, `${sanitizeIcsFileName(evt.title)}${suffix}.ics`);
    } catch (err) {
      console.error('Failed to download ICS file', err);
      setStatusMsg(t('calendar.downloadIcsError'));
    } finally {
      setDownloadingIcs(false);
    }
  };

  const openAddEventOnDate = (date: Date) => {
    const startStr = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 0).toISOString().slice(0, 16);
    const endStr = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 17, 0).toISOString().slice(0, 16);
    setStartTime(startStr);
    setEndTime(endStr);
    setIsAdding(true);
  };

  // Month navigation helpers
  const prevMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Month Title format
  const monthTitle = useMemo(() => {
    const locale = isCzech ? 'cs-CZ' : 'en-US';
    const monthStr = currentDate.toLocaleDateString(locale, { month: 'long' });
    const capitalizedMonth = monthStr.charAt(0).toUpperCase() + monthStr.slice(1);
    return `${capitalizedMonth} ${currentDate.getFullYear()}`;
  }, [currentDate, isCzech]);

  // Generate days for 7-column Monday-first calendar grid
  const calendarGrid = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Monday-based day of week (0: Mon, 1: Tue, ..., 6: Sun)
    const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;
    const daysInMonth = lastDayOfMonth.getDate();

    const prevMonthLastDay = new Date(year, month, 0).getDate();

    const cells: {
      date: Date;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      events: CalendarEvent[];
    }[] = [];

    // Leading days from previous month
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      cells.push({
        date: d,
        dayNumber: prevMonthLastDay - i,
        isCurrentMonth: false,
        isToday: isSameDay(d, new Date()),
        events: getEventsForDate(events, d),
      });
    }

    // Days in current month
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      cells.push({
        date: d,
        dayNumber: i,
        isCurrentMonth: true,
        isToday: isSameDay(d, new Date()),
        events: getEventsForDate(events, d),
      });
    }

    // Trailing days to complete the 35 or 42 grid
    const totalCells = cells.length <= 35 ? 35 : 42;
    const trailingDays = totalCells - cells.length;
    for (let i = 1; i <= trailingDays; i++) {
      const d = new Date(year, month + 1, i);
      cells.push({
        date: d,
        dayNumber: i,
        isCurrentMonth: false,
        isToday: isSameDay(d, new Date()),
        events: getEventsForDate(events, d),
      });
    }

    return cells;
  }, [currentDate, events]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-amber-500" />
            <span>{t(showSubscribedOnly ? 'calendar.myCalendarTitle' : 'calendar.title')}</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {t(showSubscribedOnly
              ? 'calendar.myCalendarSubtitle'
              : subscribedOnly
              ? 'calendar.allEventsSubtitle'
              : 'calendar.subtitle')}
          </p>
        </div>

        {/* Global actions: Sync, Add Event, View Mode toggle */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {subscribedOnly && (
            <button
              type="button"
              onClick={() => setShowAllEvents((current) => !current)}
              aria-pressed={showAllEvents}
              className="rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {showAllEvents ? t('calendar.showSubscribedEvents') : t('calendar.showAllEvents')}
            </button>
          )}

          {/* View mode toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-300 dark:border-slate-700">
            <button
              onClick={() => setViewMode('month')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'month'
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{t('calendar.monthView')}</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>{t('calendar.listView')}</span>
            </button>
          </div>

          {canManageEvents && (
            <>
              <button
                onClick={handleSyncFeeds}
                disabled={syncing}
                className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? t('calendar.syncing') : t('calendar.syncFeeds')}</span>
              </button>

              <button
                onClick={() => {
                  setStartTime(new Date().toISOString().slice(0, 16));
                  setEndTime(new Date(Date.now() + 2 * 3600000).toISOString().slice(0, 16));
                  setIsAdding(true);
                }}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 px-4 py-2 rounded-xl text-xs font-semibold shadow transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('calendar.addEvent')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {statusMsg && (
        <div className="mb-6 p-3.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-amber-700 dark:text-amber-400 text-xs rounded-xl shadow-sm">
          {statusMsg}
        </div>
      )}

      {subscribedOnly && subscriptionsLoading && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          {t('common.loading')}
        </div>
      )}

      {subscribedOnly && subscriptionError && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {t('calendar.subscriptionLoadError')}
        </div>
      )}

      {eventLoadError && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {t('calendar.eventLoadError')}
        </div>
      )}

      {/* Category Filter Pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition ${
            selectedCategory === 'all'
              ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800'
          }`}
        >
          {t('calendar.allCategories')}
        </button>
        {Object.entries(CATEGORY_MAP).map(([catId, { label, dot }]) => (
          <button
            key={catId}
            onClick={() => setSelectedCategory(Number(catId))}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition border ${
              selectedCategory === Number(catId)
                ? 'bg-amber-500 text-slate-950 font-bold border-amber-500 shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border-slate-200 dark:border-slate-800'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${dot}`} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* VIEW MODE 1: REAL INTERACTIVE MONTH CALENDAR */}
      {(!showSubscribedOnly || (!subscriptionsLoading && !subscriptionError)) && viewMode === 'month' && (
        events.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
            {showSubscribedOnly ? t('calendar.noSubscribedEvents') : t('calendar.noEvents')}
          </div>
        ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-md dark:shadow-xl transition-colors">
          {/* Calendar Toolbar: Month Title + Prev/Next/Today */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              {monthTitle}
            </h3>

            <div className="flex items-center gap-2">
              <button
                onClick={goToToday}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 transition"
              >
                {t('calendar.today')}
              </button>
              <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden">
                <button
                  onClick={prevMonth}
                  title={t('calendar.prevMonth')}
                  className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="w-[1px] h-6 bg-slate-300 dark:bg-slate-700" />
                <button
                  onClick={nextMonth}
                  title={t('calendar.nextMonth')}
                  className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Weekday column headers */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 font-mono">
            {weekdays.map((day, idx) => (
              <div key={idx} className="py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid Cells */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 auto-rows-fr">
            {calendarGrid.map((cell, idx) => {
              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (canManageEvents && cell.events.length === 0) {
                      openAddEventOnDate(cell.date);
                    }
                  }}
                  className={`min-h-[90px] sm:min-h-[110px] p-1.5 sm:p-2 rounded-xl border flex flex-col justify-between transition group relative ${
                    cell.isCurrentMonth
                      ? 'bg-slate-50/70 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800/80 hover:border-amber-500/40'
                      : 'bg-slate-100/40 dark:bg-slate-950/20 border-slate-200/50 dark:border-slate-900 text-slate-400 dark:text-slate-600'
                  } ${cell.isToday ? 'ring-2 ring-amber-500/80 dark:ring-amber-500' : ''}`}
                >
                  {/* Day header */}
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded-full ${
                        cell.isToday
                          ? 'bg-amber-500 text-slate-950'
                          : cell.isCurrentMonth
                          ? 'text-slate-800 dark:text-slate-200'
                          : 'text-slate-400 dark:text-slate-600'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>

                    {/* Quick Add button for admin on hover */}
                    {canManageEvents && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openAddEventOnDate(cell.date);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-amber-500 hover:bg-amber-500/20 transition"
                        title={t('calendar.addEvent')}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Day Events Stack */}
                  <div className="space-y-1 flex-1 overflow-hidden">
                    {cell.events.slice(0, 2).map((evt) => {
                      const cfg = CATEGORY_MAP[evt.category] || CATEGORY_MAP[0];
                      const timeStr = !evt.isAllDay
                        ? new Date(evt.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '';

                      return (
                        <div
                          key={evt.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(evt);
                          }}
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium border truncate cursor-pointer transition flex items-center gap-1 ${cfg.bg} ${cfg.text} ${cfg.border} hover:scale-[1.02] shadow-xs`}
                          title={`${evt.title} (${timeStr || t('calendar.allDay')})`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                          {evt.recurrenceGroupId && <span className="text-[9px] shrink-0" title={t('calendar.recurringBadge')}>🔁</span>}
                          <span className="truncate">{evt.title}</span>
                        </div>
                      );
                    })}

                    {cell.events.length > 2 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEvent(cell.events[0]);
                        }}
                        className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold px-1 hover:underline block"
                      >
                        +{cell.events.length - 2} more...
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )
      )}

      {/* VIEW MODE 2: AGENDA / LIST VIEW */}
      {(!showSubscribedOnly || (!subscriptionsLoading && !subscriptionError)) && viewMode === 'list' && (
        <div>
          {loading ? (
            <div className="text-center py-12 text-slate-500 text-sm">{t('common.loading')}</div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-500 dark:text-slate-400 text-sm">
              {showSubscribedOnly ? t('calendar.noSubscribedEvents') : t('calendar.noEvents')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map((evt) => {
                const badge = CATEGORY_MAP[evt.category] || CATEGORY_MAP[0];
                const startDate = new Date(evt.startTime);

                return (
                  <div
                    key={evt.id}
                    onClick={() => setSelectedEvent(evt)}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 rounded-2xl p-5 flex flex-col justify-between shadow-sm relative group transition cursor-pointer hover-card-animate animate-slide-up"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badge.bg} ${badge.text} ${badge.border}`}>
                            {badge.label}
                          </span>
                          {evt.recurrenceGroupId && (
                            <span className="bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                              <span>🔁</span>
                              <span>{t('calendar.recurrence')}</span>
                            </span>
                          )}
                        </div>
                        {evt.sourceFeedName && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                            {t('calendar.via')} {evt.sourceFeedName}
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2 leading-snug group-hover:text-amber-600 dark:group-hover:text-amber-400 transition">
                        {evt.title}
                      </h3>

                      {evt.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 mb-4 leading-relaxed">
                          {cleanCalendarText(evt.description)}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>
                          {startDate.toLocaleDateString()}{' '}
                          {!evt.isAllDay && `(${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
                        </span>
                      </div>

                      {evt.location && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{evt.location}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2" onClick={(e) => e.stopPropagation()}>
                        {evt.externalUrl ? (
                          <a
                            href={evt.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 text-[11px] font-semibold"
                          >
                            <span>{t('calendar.eventPage')}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : <span />}

                        {canManageEvents && (
                          <button
                            onClick={() => handleDeleteEvent(evt.id)}
                            className="text-slate-400 hover:text-rose-500 transition p-1"
                            title={t('common.delete')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* EVENT DETAIL MODAL */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 dark:bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg rounded-2xl p-6 shadow-2xl text-slate-800 dark:text-slate-100 relative transition-colors animate-scale-in">
            <button
              onClick={() => setSelectedEvent(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded border inline-block ${
                    CATEGORY_MAP[selectedEvent.category]?.bg || ''
                  } ${CATEGORY_MAP[selectedEvent.category]?.text || ''} ${
                    CATEGORY_MAP[selectedEvent.category]?.border || ''
                  }`}
                >
                  {CATEGORY_MAP[selectedEvent.category]?.label || t('calendar.tournament')}
                </span>
                {selectedEvent.recurrenceGroupId && (
                  <span className="bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 text-[10px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <span>🔁</span>
                    <span>{t('calendar.recurringBadge')}</span>
                  </span>
                )}
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
                {selectedEvent.title}
              </h3>
            </div>

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 mb-6 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                <span>
                  {new Date(selectedEvent.startTime).toLocaleDateString()}{' '}
                  {!selectedEvent.isAllDay &&
                    `${new Date(selectedEvent.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${new Date(selectedEvent.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                </span>
              </div>

              {selectedEvent.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>{selectedEvent.location}</span>
                </div>
              )}

              {selectedEvent.sourceFeedName && (
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="font-mono text-[11px]">
                    {t('calendar.via')} {selectedEvent.sourceFeedName}
                  </span>
                </div>
              )}
            </div>

            {selectedEvent.description && (
              <div className="mb-6">
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  {t('calendar.description')}
                </h4>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {cleanCalendarText(selectedEvent.description)}
                </p>
              </div>
            )}

            <div className="mb-6">
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                {t('calendar.addToMyCalendar')}
              </h4>
              <div className="flex flex-wrap gap-2">
                {selectedEvent.recurrenceGroupId ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleDownloadIcs(selectedEvent, false)}
                      disabled={downloadingIcs}
                      className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 transition disabled:opacity-40"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{t('calendar.downloadEvent')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadIcs(selectedEvent, true)}
                      disabled={downloadingIcs}
                      className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 transition disabled:opacity-40"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{t('calendar.downloadSeries')}</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleDownloadIcs(selectedEvent, false)}
                    disabled={downloadingIcs}
                    className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 transition disabled:opacity-40"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{t('calendar.addToMyCalendar')}</span>
                  </button>
                )}
              </div>
            </div>

            {isAuthenticated && (
              <div className="mb-6">
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  {t('calendar.subscribe')}
                </h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleSubscription(selectedEvent, false, !subscribedEventIds.has(selectedEvent.id))}
                    disabled={updatingSubscription}
                    className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 px-3 py-2 rounded-lg text-xs font-semibold transition"
                  >
                    {subscribedEventIds.has(selectedEvent.id) ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                    <span>
                      {subscribedEventIds.has(selectedEvent.id)
                        ? t('calendar.unsubscribeEvent')
                        : t('calendar.subscribeEvent')}
                    </span>
                  </button>
                  {selectedEvent.recurrenceGroupId && (
                    <button
                      type="button"
                      onClick={() => handleSubscription(selectedEvent, true, !isSeriesSubscribed(selectedEvent))}
                      disabled={updatingSubscription}
                      className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 transition"
                    >
                      {isSeriesSubscribed(selectedEvent) ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                      <span>
                        {isSeriesSubscribed(selectedEvent)
                          ? t('calendar.unsubscribeSeries')
                          : t('calendar.subscribeSeries')}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
              {selectedEvent.externalUrl ? (
                <a
                  href={selectedEvent.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-4 py-2 rounded-lg text-xs shadow transition"
                >
                  <span>{t('calendar.eventPage')}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : <div />}

              <div className="flex flex-wrap items-center gap-2">
                {canManageEvents && selectedEvent.recurrenceGroupId ? (
                  <>
                    <button
                      onClick={() => handleDeleteEvent(selectedEvent.id, false)}
                      className="px-3 py-2 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/70 border border-rose-200 dark:border-rose-900 rounded-lg text-xs font-semibold transition"
                    >
                      {t('calendar.deleteThisOnly')}
                    </button>
                    <button
                      onClick={() => handleDeleteEvent(selectedEvent.id, true)}
                      className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition shadow-sm"
                    >
                      {t('calendar.deleteEntireSeries')}
                    </button>
                  </>
                ) : canManageEvents ? (
                  <button
                    onClick={() => handleDeleteEvent(selectedEvent.id, false)}
                    className="px-3 py-2 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/70 border border-rose-200 dark:border-rose-900 rounded-lg text-xs font-semibold transition"
                  >
                    {t('common.delete')}
                  </button>
                ) : null}

                <button
                  onClick={() => setSelectedEvent(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-xs font-semibold transition"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD EVENT MODAL (ADMIN) */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 dark:bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg rounded-2xl p-6 shadow-2xl text-slate-800 dark:text-slate-100 relative transition-colors animate-scale-in">
            <button
              onClick={() => setIsAdding(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">{t('calendar.addEvent')}</h3>
            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t('articles.articleTitle')} *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t('calendar.startTime')} *</label>
                  <input
                    type="datetime-local"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t('calendar.endTime')} *</label>
                  <input
                    type="datetime-local"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t('calendar.location')}</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Prague Chess Club or Online"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t('calendar.category')}</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(Number(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-amber-500"
                >
                  <option value={0}>{t('calendar.tournament')}</option>
                  <option value={1}>{t('calendar.leagueMatch')}</option>
                  <option value={2}>{t('calendar.clubNight')}</option>
                  <option value={3}>{t('calendar.trainingSeminar')}</option>
                  <option value={4}>{t('calendar.other')}</option>
                </select>
              </div>

              {/* Recurrence Selector */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t('calendar.recurrence')}</label>
                  <select
                    value={recurrence}
                    onChange={(e) => setRecurrence(Number(e.target.value))}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-amber-500"
                  >
                    <option value={0}>{t('calendar.repeatNone')}</option>
                    <option value={1}>{t('calendar.repeatDaily')}</option>
                    <option value={2}>{t('calendar.repeatWeekly')}</option>
                    <option value={3}>{t('calendar.repeatBiWeekly')}</option>
                    <option value={4}>{t('calendar.repeatMonthly')}</option>
                  </select>
                </div>

                {recurrence !== 0 && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t('calendar.repeatCount')} (2–52)
                      </label>
                      <input
                        type="number"
                        min={2}
                        max={52}
                        value={recurrenceCount}
                        onChange={(e) => setRecurrenceCount(Number(e.target.value))}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t('calendar.repeatUntil')}
                      </label>
                      <input
                        type="date"
                        value={recurrenceEndDate}
                        onChange={(e) => setRecurrenceEndDate(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-amber-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{t('calendar.description')}</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-lg text-xs"
                >
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function getEventsForDate(events: CalendarEvent[], targetDate: Date): CalendarEvent[] {
  return events.filter((evt) => {
    const start = new Date(evt.startTime);
    const end = new Date(evt.endTime);
    const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const startDateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDateOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    return target >= startDateOnly && target <= endDateOnly;
  });
}


