import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import { DashboardTabs, type DashboardTab } from '../components/DashboardTabs';
import { getCalendarSchedules, type CalendarItem } from '../api/calendar';
import { toDisplayTime, toZonedParts } from '../utils/apiDate';
import { TopBarActions } from '../components/TopBarActions';
import {
  createModuleCache,
  currentSession,
  onSessionReset,
  useCachedState,
} from '../utils/cachedState';
import {
  buildMonthGrid,
  dateKey,
  formatDate,
  isSameMonth,
  monthKey,
  weekdayLabels,
} from '../utils/calendarGrid';
import { useRefreshOnFocus } from '../navigation/useRefreshOnFocus';
import { BottomSheet } from '../components/BottomSheet';

interface Props {
  onBack: () => void;
  onLoggedOut: () => void;
  onNavigate: (tab: DashboardTab) => void;
  onOpenProfile: () => void;
}

type ViewMode = 'month' | 'week' | 'day';

const TYPE_KEYS: Record<string, string> = {
  'one-to-one': 'EVENT_FORM.TYPE_ONE_TO_ONE',
  group: 'EVENT_FORM.TYPE_GROUP',
  appointment: 'EVENT_FORM.TYPE_APPOINTMENT',
  task: 'EVENT_MODAL.TAB_TASK',
};

function buildWeek(anchor: Date): Date[] {
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - anchor.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function formatWeekRangeLabel(week: Date[]): string {
  const start = formatDate(week[0], { month: 'short', day: 'numeric' });
  const end = formatDate(week[6], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${start} – ${end}`;
}

function formatDayLabel(d: Date): string {
  return formatDate(d, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

const itemsCache = createModuleCache<CalendarItem[]>([]);
const loadedMonths = new Set<string>();
onSessionReset(() => loadedMonths.clear());

function allMonthsCached(dates: Date[]): boolean {
  const keys = new Set(dates.map(monthKey));
  return Array.from(keys).every(k => loadedMonths.has(k));
}

export function CalendarScreen({
  onBack,
  onLoggedOut,
  onNavigate,
  onOpenProfile,
}: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [items, setItems] = useCachedState(itemsCache);
  const [loading, setLoading] = useState(
    () => !allMonthsCached(buildMonthGrid(new Date())),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);

  const anchorYear = anchorDate.getFullYear();
  const anchorMonth = anchorDate.getMonth();
  const monthGrid = useMemo(
    () => buildMonthGrid(new Date(anchorYear, anchorMonth, 1)),
    [anchorYear, anchorMonth],
  );
  const week = useMemo(() => buildWeek(anchorDate), [anchorDate]);

  const visibleDates = useMemo(() => {
    if (viewMode === 'month') return monthGrid;
    if (viewMode === 'week') return week;
    return [anchorDate];
  }, [viewMode, monthGrid, week, anchorDate]);

  const loadMonth = useCallback(
    async (monthDate: Date) => {
      const key = monthKey(monthDate);
      const grid = buildMonthGrid(monthDate);
      const start = dateKey(grid[0]);
      const end = dateKey(grid[grid.length - 1]);
      const requestSession = currentSession();
      const res = await getCalendarSchedules(start, end);
      if (requestSession !== currentSession()) return;
      loadedMonths.add(key);
      const gridDates = new Set(grid.map(dateKey));
      setItems(prev => {
        const outsideThisMonth = prev.filter(item => {
          const zone = item.time_zone || 'UTC';
          const { date } = toZonedParts(item.start_datetime, zone);
          return !gridDates.has(date);
        });
        return [...outsideThisMonth, ...res];
      });
    },
    [setItems],
  );

  const ensureLoaded = useCallback(
    async (dates: Date[], force: boolean) => {
      const byKey = new Map<string, Date>();
      for (const d of dates) byKey.set(monthKey(d), d);
      const entries = Array.from(byKey.entries());
      const toLoad = force
        ? entries
        : entries.filter(([k]) => !loadedMonths.has(k));

      if (toLoad.length === 0) {
        setLoading(false);
        setRefreshing(false);
        if (!force) {
          Promise.all(entries.map(([, d]) => loadMonth(d))).catch(err =>
            console.error(err),
          );
        }
        return;
      }
      try {
        await Promise.all(toLoad.map(([, d]) => loadMonth(d)));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadMonth],
  );

  useEffect(() => {
    const needsLoad = !allMonthsCached(visibleDates);
    if (needsLoad) setLoading(true);
    ensureLoaded(visibleDates, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleDates]);

  useRefreshOnFocus(() => ensureLoaded(visibleDates, true));

  const handleRefresh = () => {
    setRefreshing(true);
    ensureLoaded(visibleDates, true);
  };

  // Which local date cell an item belongs to is derived in ITS OWN
  // time_zone (same as the web's eventMap), not the device's — two guests
  // in different zones would see the same meeting land on different cells
  // if it straddles midnight for one of them, matching web's behavior.
  const dateMap = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const zone = item.time_zone || 'UTC';
      const { date } = toZonedParts(item.start_datetime, zone);
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(item);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));
    }
    return map;
  }, [items]);

  const goToday = () => {
    setPickedDate(null);
    setAnchorDate(new Date());
  };

  const pickDay = (day: Date) => {
    const key = dateKey(day);
    setPickedDate(key);
    setAnchorDate(day);
    if (dateMap.has(key)) setSelectedDate(key);
  };

  // Leaving Month view, Week/Day center on the day the user tapped. With
  // no tap, paging months has left the anchor on the 1st — usually not
  // what they're looking at — so prefer today if it's this month, then the
  // month's first day with something on it, and only then the 1st.
  const changeViewMode = (mode: ViewMode) => {
    if (viewMode === 'month' && mode !== 'month' && !pickedDate) {
      const today = new Date();
      if (isSameMonth(today, anchorDate)) {
        setAnchorDate(today);
      } else {
        const firstBusyDay = monthGrid.find(
          d => isSameMonth(d, anchorDate) && dateMap.has(dateKey(d)),
        );
        if (firstBusyDay) setAnchorDate(firstBusyDay);
      }
    }
    setViewMode(mode);
  };

  const goPrev = () => {
    if (viewMode === 'month') setPickedDate(null);
    setAnchorDate(d => {
      if (viewMode === 'month')
        return new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const nd = new Date(d);
      nd.setDate(d.getDate() - (viewMode === 'week' ? 7 : 1));
      return nd;
    });
  };
  const goNext = () => {
    if (viewMode === 'month') setPickedDate(null);
    setAnchorDate(d => {
      if (viewMode === 'month')
        return new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const nd = new Date(d);
      nd.setDate(d.getDate() + (viewMode === 'week' ? 7 : 1));
      return nd;
    });
  };

  const selectedItems = selectedDate ? dateMap.get(selectedDate) ?? [] : [];
  const dayItems = dateMap.get(dateKey(anchorDate)) ?? [];

  const navLabel =
    viewMode === 'month'
      ? formatDate(anchorDate, { month: 'long', year: 'numeric' })
      : viewMode === 'week'
      ? formatWeekRangeLabel(week)
      : formatDayLabel(anchorDate);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={styles.back} hitSlop={8}>
          <Text style={styles.backText}>
            {'‹'} {t('MOBILE.COMMON.BACK')}
          </Text>
        </Pressable>
        <TopBarActions
          onOpenProfile={onOpenProfile}
          onLoggedOut={onLoggedOut}
          onOpenNotifications={() => onNavigate('notifications')}
        />
      </View>

      <View style={styles.tabsRow}>
        <DashboardTabs active="calendar" onChange={onNavigate} />
      </View>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('NAV.CALENDAR')}</Text>
      </View>

      <View style={styles.viewModeRow}>
        {(['month', 'week', 'day'] as ViewMode[]).map(mode => {
          const isSelected = mode === viewMode;
          return (
            <Pressable
              key={mode}
              style={[
                styles.viewModePill,
                isSelected && styles.viewModePillSelected,
              ]}
              onPress={() => changeViewMode(mode)}
            >
              <Text
                style={[
                  styles.viewModePillText,
                  isSelected && styles.viewModePillTextSelected,
                ]}
              >
                {mode === 'month'
                  ? t('SHELL.MONTH')
                  : mode === 'week'
                  ? t('SHELL.WEEK')
                  : t('SHELL.DAY')}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.monthNav}>
        <Pressable onPress={goPrev} hitSlop={8} style={styles.monthNavButton}>
          <Text style={styles.monthNavArrow}>{'‹'}</Text>
        </Pressable>
        <View style={styles.monthNavCenter}>
          <Text style={styles.monthLabel}>{navLabel}</Text>
          <Pressable onPress={goToday} hitSlop={6}>
            <Text style={styles.todayLink}>{t('CALENDAR.TODAY')}</Text>
          </Pressable>
        </View>
        <Pressable onPress={goNext} hitSlop={8} style={styles.monthNavButton}>
          <Text style={styles.monthNavArrow}>{'›'}</Text>
        </Pressable>
      </View>

      {viewMode === 'month' && (
        <View style={styles.weekdayRow}>
          {weekdayLabels().map(label => (
            <Text key={label} style={styles.weekdayLabel}>
              {label}
            </Text>
          ))}
        </View>
      )}

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.primaryText} />
        </View>
      ) : viewMode === 'month' ? (
        <ScrollView
          contentContainerStyle={styles.gridScroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          <View style={styles.grid}>
            {monthGrid.map(day => {
              const key = dateKey(day);
              const cellItems = dateMap.get(key) ?? [];
              const inMonth = isSameMonth(day, anchorDate);
              const isToday = key === todayKey;
              const isPicked = key === pickedDate && !isToday;
              return (
                <Pressable
                  key={key}
                  style={styles.cell}
                  onPress={() => pickDay(day)}
                >
                  <View
                    style={[
                      styles.dateBadge,
                      isToday && styles.dateBadgeToday,
                      isPicked && styles.dateBadgePicked,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dateText,
                        !inMonth && styles.dateTextDim,
                        isToday && styles.dateTextToday,
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </View>
                  {cellItems.length > 0 && <View style={styles.dot} />}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : viewMode === 'week' ? (
        <ScrollView
          contentContainerStyle={styles.agendaScroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          {week.map(day => {
            const key = dateKey(day);
            const dayAgendaItems = dateMap.get(key) ?? [];
            const isToday = key === todayKey;
            return (
              <View key={key} style={styles.weekDaySection}>
                <Text
                  style={[
                    styles.weekDayHeader,
                    isToday && styles.weekDayHeaderToday,
                  ]}
                >
                  {formatDate(day, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
                {dayAgendaItems.length === 0 ? (
                  <Text style={styles.noEventsText}>
                    {t('MOBILE.CALENDAR.NO_EVENTS')}
                  </Text>
                ) : (
                  dayAgendaItems.map(item => (
                    <AgendaItemRow key={item.id} item={item} />
                  ))
                )}
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.agendaScroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          {dayItems.length === 0 ? (
            <Text style={styles.noEventsText}>
              {t('MOBILE.CALENDAR.NO_EVENTS_DAY')}
            </Text>
          ) : (
            dayItems.map(item => <AgendaItemRow key={item.id} item={item} />)
          )}
        </ScrollView>
      )}

      <BottomSheet
        visible={!!selectedDate}
        onClose={() => setSelectedDate(null)}
        sheetStyle={styles.sheet}
      >
        <Text style={styles.sheetTitle}>{selectedDate}</Text>
        <ScrollView style={styles.sheetList}>
          {selectedItems.map(item => (
            <AgendaItemRow key={item.id} item={item} />
          ))}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

function AgendaItemRow({ item }: { item: CalendarItem }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const zone = item.time_zone || 'UTC';
  const time = `${toDisplayTime(item.start_datetime, zone, {
    compact: true,
  })} - ${toDisplayTime(item.end_datetime, zone, { compact: true })}`;
  return (
    <View style={styles.itemRow}>
      <View style={styles.itemTop}>
        <Text style={styles.itemTitle} numberOfLines={1}>
          {item.title || t('MOBILE.CALENDAR.UNTITLED')}
        </Text>
        <View
          style={[
            styles.roleBadge,
            item.can_manage ? styles.roleBadgeHosting : styles.roleBadgeGuest,
          ]}
        >
          <Text style={styles.roleBadgeText}>
            {item.can_manage
              ? t('MOBILE.CALENDAR.HOSTING')
              : t('MOBILE.CALENDAR.GUEST')}
          </Text>
        </View>
      </View>
      <Text style={styles.itemSubLine}>
        {TYPE_KEYS[item.type] ? t(TYPE_KEYS[item.type]) : item.type} · {time}
      </Text>
      <Text style={styles.itemSubLine}>
        {item.can_manage
          ? t('MOBILE.CALENDAR.YOU')
          : item.user?.name || item.user?.email}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(c => ({
  container: {
    flex: 1,
    backgroundColor: c.surface,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  back: {
    alignSelf: 'center',
  },
  backText: {
    color: c.primaryText,
    fontWeight: '600',
  },
  tabsRow: {
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: c.text,
  },
  viewModeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  viewModePill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  viewModePillSelected: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  viewModePillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: c.text,
  },
  viewModePillTextSelected: {
    color: c.onPrimary,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  monthNavButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavArrow: {
    fontSize: 20,
    color: c.primaryText,
    fontWeight: '700',
  },
  monthNavCenter: {
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: c.text,
    textAlign: 'center',
  },
  todayLink: {
    fontSize: 11.5,
    color: c.primaryText,
    fontWeight: '600',
  },
  weekdayRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: c.textMuted,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridScroll: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  dateBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Soft fill rather than an outline ring: same lavender as the bell
  // button, and clearly secondary to today's solid purple.
  dateBadgePicked: {
    backgroundColor: c.purpleTintStrong,
  },
  dateBadgeToday: {
    backgroundColor: c.primary,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.text,
  },
  dateTextDim: {
    color: c.textFaint,
  },
  dateTextToday: {
    color: c.onPrimary,
    fontWeight: '700',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: c.accent,
    marginTop: 3,
  },
  agendaScroll: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  weekDaySection: {
    marginBottom: 18,
  },
  weekDayHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
    marginBottom: 8,
  },
  weekDayHeaderToday: {
    color: c.primaryText,
  },
  noEventsText: {
    fontSize: 12.5,
    color: c.textMuted,
    marginBottom: 4,
  },

  // under that cap, so the list scrolls only when the day is too full. (A
  // percentage maxHeight here resolved against the sheet's own
  // content-sized height, clipping even a single meeting.)
  sheet: {
    padding: 20,
    flexShrink: 1,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: c.text,
    marginBottom: 12,
  },
  sheetList: {
    flexGrow: 0,
    flexShrink: 1,
  },
  itemRow: {
    backgroundColor: c.surfaceMuted,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: c.text,
    flex: 1,
    marginRight: 8,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  roleBadgeHosting: {
    backgroundColor: c.successSoft,
  },
  roleBadgeGuest: {
    backgroundColor: c.purpleTintStrong,
  },
  roleBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: c.text,
  },
  itemSubLine: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: 1,
  },
}));
