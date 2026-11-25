import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import { DashboardTabs, type DashboardTab } from '../components/DashboardTabs';
import {
  cancelBooking,
  getBookings,
  getBookingsSummary,
  type Booking,
  type BookingsSummary,
  type BookingTab,
} from '../api/bookings';
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
}

// labelKey / emptyKey: the tab's name and empty-list text in src/i18n.
const BOOKING_TABS: { key: BookingTab; labelKey: string; emptyKey: string }[] =
  [
    {
      key: 'upcoming',
      labelKey: 'BOOKINGS.TAB_UPCOMING',
      emptyKey: 'BOOKINGS.EMPTY_UPCOMING_TITLE',
    },
    {
      key: 'current',
      labelKey: 'BOOKINGS.TAB_CURRENT',
      emptyKey: 'BOOKINGS.EMPTY_CURRENT_TITLE',
    },
    {
      key: 'past',
      labelKey: 'BOOKINGS.TAB_PAST',
      emptyKey: 'BOOKINGS.EMPTY_PAST_TITLE',
    },
    {
      key: 'cancelled',
      labelKey: 'BOOKINGS.TAB_CANCELLED',
      emptyKey: 'BOOKINGS.EMPTY_CANCELLED_TITLE',
    },
  ];

interface TabState {
  data: Booking[];
  cursor: string | null;
  loaded: boolean;
}

function emptyTabState(): TabState {
  return { data: [], cursor: null, loaded: false };
}

function formatDateTime(booking: Booking): { date: string; time: string } {
  const zone = booking.time_zone || 'UTC';
  return {
    date: toDisplayDate(booking.start_datetime, zone),
    time: `${toDisplayTime(booking.start_datetime, zone, {
      compact: true,
    })} - ${toDisplayTime(booking.end_datetime, zone, { compact: true })}`,
  };
}

const summaryCache = createModuleCache<BookingsSummary | null>(null);
const tabsCache = createModuleCache<Record<BookingTab, TabState>>({
  upcoming: emptyTabState(),
  current: emptyTabState(),
  past: emptyTabState(),
  cancelled: emptyTabState(),
});

export function BookingsScreen({
  onBack,
  onLoggedOut,
  onNavigate,
  onOpenProfile,
}: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<BookingTab>('upcoming');
  const [summary, setSummary] = useCachedState(summaryCache);
  const [tabs, setTabs] = useCachedState(tabsCache);
  const [loading, setLoading] = useState(!tabsCache.get().upcoming.loaded);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Booking | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    getBookingsSummary()
      .then(setSummary)
      .catch(err => console.error(err));
  }, [setSummary]);

  const loadTab = useCallback(
    async (tab: BookingTab, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const res = await getBookings(tab, null);
        setTabs(prev => ({
          ...prev,
          [tab]: {
            data: res.data.filter(b => b.type !== 'task'),
            cursor: res.next_cursor,
            loaded: true,
          },
        }));
      } catch (err) {
        console.error(err);
      } finally {
        if (!opts?.silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [setTabs],
  );

  useEffect(() => {
    if (tabs[activeTab].loaded) {
      setLoading(false);
      loadTab(activeTab, { silent: true });
    } else {
      loadTab(activeTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useRefreshOnFocus(() => {
    getBookingsSummary()
      .then(setSummary)
      .catch(err => console.error(err));
    loadTab(activeTab, { silent: true });
  });

  const handleRefresh = () => {
    setRefreshing(true);
    loadTab(activeTab);
  };

  const handleLoadMore = async () => {
    const current = tabs[activeTab];
    if (!current.cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await getBookings(activeTab, current.cursor);
      setTabs(prev => ({
        ...prev,
        [activeTab]: {
          data: [
            ...prev[activeTab].data,
            ...res.data.filter(b => b.type !== 'task'),
          ],
          cursor: res.next_cursor,
          loaded: true,
        },
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleCancelBooking = async (booking: Booking) => {
    setActionLoading(true);
    try {
      await cancelBooking(booking.id);
      refreshMeetingReminders();
      setTabs(prev => ({
        ...prev,
        [activeTab]: {
          ...prev[activeTab],
          data: prev[activeTab].data.filter(b => b.id !== booking.id),
        },
      }));
      setSummary(prev =>
        prev
          ? {
              ...prev,
              [activeTab]: Math.max(0, prev[activeTab] - 1),
              cancelled: prev.cancelled + 1,
            }
          : prev,
      );
      setSelected(null);
    } catch (err: any) {
      Alert.alert(
        t('BOOKINGS.FAILED_CANCEL_BOOKING'),
        err?.message ?? t('AUTH.GENERIC_ERROR'),
      );
    } finally {
      setActionLoading(false);
    }
  };

  const confirmCancelBooking = (booking: Booking) => {
    Alert.alert(
      t('MOBILE.BOOKINGS.CANCEL_TITLE'),
      booking.title ?? t('MOBILE.BOOKINGS.THIS_BOOKING'),
      [
        { text: t('MOBILE.COMMON.KEEP_IT'), style: 'cancel' },
        {
          text: t('BOOKINGS.CANCEL_BOOKING_TITLE'),
          style: 'destructive',
          onPress: () => handleCancelBooking(booking),
        },
      ],
    );
  };

  const handleJoin = (booking: Booking) => {
    const url = booking.meeting_meta?.join_url;
    if (url) Linking.openURL(url).catch(() => {});
  };

  const currentData = tabs[activeTab].data;
  const trimmedSearch = search.trim().toLowerCase();
  const displayedData = trimmedSearch
    ? currentData.filter(b =>
        (b.title ?? '').toLowerCase().includes(trimmedSearch),
      )
    : currentData;

  const countFor = (tab: BookingTab): number => {
    if (trimmedSearch && tabs[tab].loaded) {
      return tabs[tab].data.filter(b =>
        (b.title ?? '').toLowerCase().includes(trimmedSearch),
      ).length;
    }
    return summary?.[tab] ?? 0;
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
        <DashboardTabs active="bookings" onChange={onNavigate} />
      </View>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('NAV.MY_BOOKINGS')}</Text>
      </View>

      <TextInput
        style={styles.search}
        placeholder={t('MOBILE.BOOKINGS.SEARCH_PLACEHOLDER')}
        value={search}
        onChangeText={setSearch}
      />

      <View style={styles.bookingTabsRow}>
        {BOOKING_TABS.map(tab => {
          const count = countFor(tab.key);
          const isSelected = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              style={[
                styles.bookingTab,
                isSelected && styles.bookingTabSelected,
              ]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text
                style={[
                  styles.bookingTabText,
                  isSelected && styles.bookingTabTextSelected,
                ]}
              >
                {t(tab.labelKey)}
                {count > 0 ? ` (${count})` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.primaryText} />
        </View>
      ) : (
        <FlatList
          data={displayedData}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          onEndReachedThreshold={0.4}
          onEndReached={handleLoadMore}
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <Text style={styles.emptyText}>
                {t(BOOKING_TABS.find(tab => tab.key === activeTab)!.emptyKey)}
              </Text>
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
                    {item.title || t('MOBILE.BOOKINGS.UNTITLED')}
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
                <Text style={styles.cardHost}>
                  {t('MOBILE.BOOKINGS.HOSTED_BY', {
                    name: item.user?.name || item.user?.email,
                  })}
                </Text>
                <Text style={styles.cardDate}>{date}</Text>
                <Text style={styles.cardTime}>{time}</Text>
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
              {selected.title || t('MOBILE.BOOKINGS.UNTITLED')}
            </Text>
            <Text style={styles.sheetLine}>
              {t('MOBILE.BOOKINGS.HOSTED_BY', {
                name: selected.user?.name || selected.user?.email,
              })}
            </Text>
            {!!selected.user?.email && selected.user?.name && (
              <Text style={styles.sheetSubLine}>{selected.user.email}</Text>
            )}
            <Text style={styles.sheetLine}>
              {formatDateTime(selected).date}
            </Text>
            <Text style={styles.sheetLine}>
              {formatDateTime(selected).time}
            </Text>
            {!!selected.meeting_location && (
              <Text style={styles.sheetLine}>{selected.meeting_location}</Text>
            )}

            <View style={styles.sheetActions}>
              {activeTab === 'current' && !!selected.meeting_meta?.join_url && (
                <Pressable
                  style={styles.sheetButtonSecondary}
                  onPress={() => handleJoin(selected)}
                >
                  <Text style={styles.sheetButtonSecondaryText}>
                    {t('BOOKINGS.CONTEXT_JOIN_MEETING')}
                  </Text>
                </Pressable>
              )}
              {(activeTab === 'upcoming' || activeTab === 'current') && (
                <Pressable
                  style={styles.sheetButtonDanger}
                  disabled={actionLoading}
                  onPress={() => confirmCancelBooking(selected)}
                >
                  <Text style={styles.sheetButtonDangerText}>
                    {t('BOOKINGS.CANCEL_BOOKING_TITLE')}
                  </Text>
                </Pressable>
              )}
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
  search: {
    marginHorizontal: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13.5,
    color: c.text,
  },
  bookingTabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  bookingTab: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  bookingTabSelected: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  bookingTabText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: c.text,
  },
  bookingTabTextSelected: {
    color: c.onPrimary,
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
  cardHost: {
    fontSize: 12,
    color: c.textMuted,
    marginBottom: 4,
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
  sheetSubLine: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: -2,
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
