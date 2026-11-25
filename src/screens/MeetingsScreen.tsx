import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import { DashboardTabs, type DashboardTab } from '../components/DashboardTabs';
import {
  cancelSchedule,
  deleteSchedule,
  getSchedules,
  type Schedule,
} from '../api/meetings';
import { refreshMeetingReminders } from '../background/meetingReminders';
import { meetingStatus } from '../utils/meetingStatus';
import { toDisplayDate, toDisplayTime } from '../utils/apiDate';
import { TopBarActions } from '../components/TopBarActions';
import { createModuleCache, useCachedState } from '../utils/cachedState';
import { useRefreshOnFocus } from '../navigation/useRefreshOnFocus';
import { BottomSheet } from '../components/BottomSheet';

interface Props {
  onBack: () => void;
  onLoggedOut: () => void;
  onNavigate: (tab: DashboardTab) => void;
  onOpenProfile: () => void;
  onEdit: (schedule: Schedule) => void;
  onCreate: () => void;
}

function formatDateTime(schedule: Schedule): { date: string; time: string } {
  const zone = schedule.time_zone || 'UTC';
  return {
    date: toDisplayDate(schedule.start_datetime, zone),
    time: `${toDisplayTime(schedule.start_datetime, zone, {
      compact: true,
    })} - ${toDisplayTime(schedule.end_datetime, zone, { compact: true })}`,
  };
}

// Same shape as meetings.component.ts's upcomingSchedules(): tasks and
// meetings the current user can't manage don't belong in this list.
function isManageable(schedule: Schedule): boolean {
  return schedule.type !== 'task' && !!schedule.can_manage && !!schedule.active;
}

const schedulesCache = createModuleCache<Schedule[]>([]);
const nextCursorCache = createModuleCache<string | null>(null);
const loadedOnceCache = createModuleCache(false);
// The search text the cached list was loaded with, so coming back to the
// tab restores the box and its results together instead of showing a
// filtered list under an empty search box.
const searchCache = createModuleCache('');

export function MeetingsScreen({
  onBack,
  onLoggedOut,
  onNavigate,
  onOpenProfile,
  onEdit,
  onCreate,
}: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [schedules, setSchedules] = useCachedState(schedulesCache);
  const [nextCursor, setNextCursor] = useCachedState(nextCursorCache);
  const [loadedOnce, setLoadedOnce] = useCachedState(loadedOnceCache);
  const [loading, setLoading] = useState(!loadedOnce);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useCachedState(searchCache);
  const [selected, setSelected] = useState<Schedule | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped by every list (re)load. A response is applied only if no newer
  // load started meanwhile — otherwise a slow reply for an earlier search
  // could land last and replace the results for what's in the box now.
  const requestSeq = useRef(0);

  // Mounting shows the cached list instantly instead of a spinner (see
  // cachedState.ts), then quietly refetches in the background to
  // self-correct; useRefreshOnFocus does the same on returning to the tab.
  const load = useCallback(
    async (searchTerm: string, opts?: { silent?: boolean }) => {
      const seq = ++requestSeq.current;
      if (!opts?.silent) setLoading(true);
      try {
        const res = await getSchedules(null, searchTerm);
        if (seq !== requestSeq.current) return;
        const manageable = res.data.filter(isManageable);
        setSchedules(manageable);
        setNextCursor(res.next_cursor);
        setLoadedOnce(true);
      } catch (err) {
        console.error(err);
      } finally {
        // Only the latest load owns the spinners; an older one finishing
        // mustn't hide them while the newer is still in flight.
        if (seq === requestSeq.current) {
          if (!opts?.silent) setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [setSchedules, setNextCursor, setLoadedOnce],
  );

  useEffect(() => {
    load(search, { silent: loadedOnce });
    // Leaving the tab mid-typing shouldn't fire the search afterwards.
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRefreshOnFocus(() => load(search, { silent: true }));

  const handleSearchChange = (text: string) => {
    setSearch(text);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => load(text), 300);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    load(search);
  };

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const seq = requestSeq.current;
    setLoadingMore(true);
    try {
      const res = await getSchedules(nextCursor, search);
      // A new search started while this page loaded: it belongs to the
      // old results, which have been replaced.
      if (seq !== requestSeq.current) return;
      setSchedules(prev => [...prev, ...res.data.filter(isManageable)]);
      setNextCursor(res.next_cursor);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleCancel = async (schedule: Schedule) => {
    setActionLoading(true);
    try {
      await cancelSchedule(schedule.id);
      refreshMeetingReminders();
      setSchedules(prev =>
        prev.map(s =>
          s.id === schedule.id ? { ...s, status: 'canceled' } : s,
        ),
      );
      setSelected(null);
    } catch (err: any) {
      Alert.alert(
        t('MEETINGS_PAGE.FAILED_CANCEL_MEETING'),
        err?.message ?? t('AUTH.GENERIC_ERROR'),
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (schedule: Schedule) => {
    setActionLoading(true);
    try {
      await deleteSchedule(schedule.id);
      refreshMeetingReminders();
      setSchedules(prev => prev.filter(s => s.id !== schedule.id));
      setSelected(null);
    } catch (err: any) {
      Alert.alert(
        t('MOBILE.COMMON.DELETE_FAILED'),
        err?.message ?? t('AUTH.GENERIC_ERROR'),
      );
    } finally {
      setActionLoading(false);
    }
  };

  const confirmCancel = (schedule: Schedule) => {
    Alert.alert(
      t('MOBILE.MEETINGS.CANCEL_TITLE'),
      schedule.title ?? t('MOBILE.MEETINGS.THIS_MEETING'),
      [
        { text: t('MOBILE.COMMON.KEEP_IT'), style: 'cancel' },
        {
          text: t('MEETINGS_PAGE.CANCEL_MEETING'),
          style: 'destructive',
          onPress: () => handleCancel(schedule),
        },
      ],
    );
  };

  const confirmDelete = (schedule: Schedule) => {
    Alert.alert(
      t('MOBILE.MEETINGS.DELETE_TITLE'),
      t('MOBILE.COMMON.CANNOT_UNDO'),
      [
        { text: t('MOBILE.COMMON.KEEP_IT'), style: 'cancel' },
        {
          text: t('MOBILE.COMMON.DELETE'),
          style: 'destructive',
          onPress: () => handleDelete(schedule),
        },
      ],
    );
  };

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
        <DashboardTabs active="meetings" onChange={onNavigate} />
      </View>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('MOBILE.NAV.MEETINGS')}</Text>
        <Pressable onPress={onCreate}>
          <Text style={styles.newMeetingLink}>
            {t('MOBILE.MEETINGS.NEW_LINK')}
          </Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.search}
        placeholder={t('MOBILE.MEETINGS.SEARCH_PLACEHOLDER')}
        value={search}
        onChangeText={handleSearchChange}
      />

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.primaryText} />
        </View>
      ) : (
        <FlatList
          data={schedules}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          onEndReachedThreshold={0.4}
          onEndReached={handleLoadMore}
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <Text style={styles.emptyText}>{t('MOBILE.MEETINGS.EMPTY')}</Text>
              <Pressable style={styles.emptyCreateButton} onPress={onCreate}>
                <Text style={styles.emptyCreateButtonText}>
                  {t('MOBILE.MEETINGS.CREATE_FIRST')}
                </Text>
              </Pressable>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                style={{ marginVertical: 16 }}
                color={colors.primaryText}
              />
            ) : undefined
          }
          renderItem={({ item }) => {
            const { date, time } = formatDateTime(item);
            const status = meetingStatus(item, colors);
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.card,
                  pressed && styles.cardPressed,
                ]}
                onPress={() => setSelected(item)}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.title || t('MOBILE.MEETINGS.UNTITLED')}
                  </Text>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: status.background },
                    ]}
                  >
                    <Text style={[styles.badgeText, { color: status.color }]}>
                      {status.label}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardDate}>{date}</Text>
                <Text style={styles.cardTime}>{time}</Text>
                {!!item.guests?.length && (
                  <Text style={styles.cardGuests}>
                    {t(
                      item.guests.length === 1
                        ? 'MOBILE.MEETINGS.GUESTS_ONE'
                        : 'MOBILE.MEETINGS.GUESTS_OTHER',
                      { n: item.guests.length },
                    )}
                  </Text>
                )}
              </Pressable>
            );
          }}
        />
      )}

      <BottomSheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        sheetStyle={styles.sheet}
      >
        {selected && (
          <>
            <Text style={styles.sheetTitle}>
              {selected.title || t('MOBILE.MEETINGS.UNTITLED')}
            </Text>
            <Text style={styles.sheetLine}>
              {formatDateTime(selected).date}
            </Text>
            <Text style={styles.sheetLine}>
              {formatDateTime(selected).time}
            </Text>
            {!!selected.meeting_location && (
              <Text style={styles.sheetLine}>{selected.meeting_location}</Text>
            )}
            {selected.guests?.map((guest, i) => (
              <Text key={i} style={styles.sheetGuest}>
                {guest.email}
              </Text>
            ))}

            <View style={styles.sheetActions}>
              <Pressable
                style={styles.sheetButtonSecondary}
                onPress={() => {
                  setSelected(null);
                  onEdit(selected);
                }}
              >
                <Text style={styles.sheetButtonSecondaryText}>
                  {t('EVENTS_PAGE.CONTEXT_EDIT')}
                </Text>
              </Pressable>
              {selected.status !== 'canceled' && (
                <Pressable
                  style={styles.sheetButtonSecondary}
                  disabled={actionLoading}
                  onPress={() => confirmCancel(selected)}
                >
                  <Text style={styles.sheetButtonSecondaryText}>
                    {t('MEETINGS_PAGE.CANCEL_MEETING')}
                  </Text>
                </Pressable>
              )}
              <Pressable
                style={styles.sheetButtonDanger}
                disabled={actionLoading}
                onPress={() => confirmDelete(selected)}
              >
                <Text style={styles.sheetButtonDangerText}>
                  {t('MEETINGS_PAGE.DELETE')}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </BottomSheet>
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
  newMeetingLink: {
    color: c.primaryText,
    fontWeight: '700',
    fontSize: 13,
  },
  emptyCreateButton: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: c.primary,
  },
  emptyCreateButtonText: {
    color: c.onPrimary,
    fontWeight: '700',
    fontSize: 13.5,
  },
  search: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13.5,
    color: c.text,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: c.textMuted,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 10,
  },
  card: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.borderSoft,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  // Immediate feedback on touch, before the sheet / next screen opens.
  cardPressed: {
    opacity: 0.7,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: c.text,
    flex: 1,
    marginRight: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardDate: {
    fontSize: 12.5,
    color: c.text,
  },
  cardTime: {
    fontSize: 12.5,
    color: c.textMuted,
    marginTop: 2,
  },
  cardGuests: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: 6,
  },
  sheet: {
    padding: 20,
    gap: 4,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: c.text,
    marginBottom: 4,
  },
  sheetLine: {
    fontSize: 13.5,
    color: c.text,
  },
  sheetGuest: {
    fontSize: 12.5,
    color: c.textMuted,
    marginTop: 2,
  },
  sheetActions: {
    gap: 10,
    marginTop: 20,
  },
  sheetButtonSecondary: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetButtonSecondaryText: {
    color: c.primaryText,
    fontWeight: '600',
    fontSize: 13.5,
  },
  sheetButtonDanger: {
    height: 44,
    borderRadius: 10,
    backgroundColor: c.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetButtonDangerText: {
    color: c.dangerStrong,
    fontWeight: '700',
    fontSize: 13.5,
  },
}));
