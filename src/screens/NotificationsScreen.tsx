import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  Text,
  View,
} from 'react-native';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import { DashboardTabs, type DashboardTab } from '../components/DashboardTabs';
import { TopBarActions } from '../components/TopBarActions';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '../api/notifications';
import { toDisplayDate, toDisplayTime, toZonedParts } from '../utils/apiDate';
import { createModuleCache, useCachedState } from '../utils/cachedState';
import {
  decrementUnreadCount,
  setUnreadCount,
  useUnreadCount,
} from '../utils/notificationPolling';
import { useRefreshOnFocus } from '../navigation/useRefreshOnFocus';

interface Props {
  onBack: () => void;
  onLoggedOut: () => void;
  onNavigate: (tab: DashboardTab) => void;
  onOpenProfile: () => void;
}

// Same routing as NotificationFacade.navigateNotification on the web —
// other types just get marked read, with nowhere to go.
const TYPE_DESTINATIONS: Record<string, DashboardTab> = {
  meeting_request_created: 'events',
  schedule_created: 'meetings',
  schedule_updated: 'meetings',
};

interface ListState {
  items: AppNotification[];
  cursor: string | null;
  loaded: boolean;
}

const listCache = createModuleCache<ListState>({
  items: [],
  cursor: null,
  loaded: false,
});

const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const toMillisIso = (value: string) => value.replace(/\.(\d{3})\d*Z$/, '.$1Z');

export function NotificationsScreen({
  onBack,
  onLoggedOut,
  onNavigate,
  onOpenProfile,
}: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [list, setList] = useCachedState(listCache);
  const [loading, setLoading] = useState(!listCache.get().loaded);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unreadCount = useUnreadCount();

  const loadFirstPage = useCallback(async () => {
    try {
      const res = await getNotifications();
      setList({
        items: res.notifications.data,
        cursor: res.notifications.next_cursor,
        loaded: true,
      });
      setUnreadCount(res.unread_count);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? t('MOBILE.NOTIFICATIONS.LOAD_FAILED'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setList, t]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  useRefreshOnFocus(loadFirstPage);

  const lastCount = useRef(unreadCount);
  useEffect(() => {
    if (unreadCount > lastCount.current) loadFirstPage();
    lastCount.current = unreadCount;
  }, [unreadCount, loadFirstPage]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadFirstPage();
  };

  const handleLoadMore = async () => {
    if (!list.cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await getNotifications(list.cursor);
      setList(prev => ({
        items: [...prev.items, ...res.notifications.data],
        cursor: res.notifications.next_cursor,
        loaded: true,
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  };

  const markReadLocally = (ids: Set<string> | 'all') => {
    const now = new Date().toISOString();
    setList(prev => ({
      ...prev,
      items: prev.items.map(n =>
        !n.read_at && (ids === 'all' || ids.has(n.id))
          ? { ...n, read_at: now }
          : n,
      ),
    }));
  };

  const handleOpen = (notification: AppNotification) => {
    if (!notification.read_at) {
      markReadLocally(new Set([notification.id]));
      decrementUnreadCount();
      markNotificationRead(notification.id).catch(err => console.error(err));
    }
    const destination = TYPE_DESTINATIONS[notification.type];
    if (destination) onNavigate(destination);
  };

  const handleMarkAll = () => {
    markReadLocally('all');
    setUnreadCount(0);
    markAllNotificationsRead().catch(err => console.error(err));
  };

  const sections = useMemo(() => {
    const zone = deviceZone();
    const todayKey = toZonedParts(new Date().toISOString(), zone).date;
    const today: AppNotification[] = [];
    const earlier: AppNotification[] = [];
    for (const n of list.items) {
      const { date } = toZonedParts(toMillisIso(n.created_at), zone);
      (date === todayKey ? today : earlier).push(n);
    }
    return [
      { title: t('CALENDAR.TODAY'), isToday: true, data: today },
      {
        title: t('MOBILE.NOTIFICATIONS.EARLIER'),
        isToday: false,
        data: earlier,
      },
    ].filter(s => s.data.length > 0);
  }, [list.items, t]);

  const hasUnread = list.items.some(n => !n.read_at);

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
          notificationsActive
        />
      </View>

      <View style={styles.tabsRow}>
        <DashboardTabs active="notifications" onChange={onNavigate} />
      </View>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('NAV.NOTIFICATIONS')}</Text>
        {hasUnread && (
          <Pressable onPress={handleMarkAll} hitSlop={8}>
            <Text style={styles.markAllText}>
              {t('NOTIFICATION_PANEL.MARK_ALL_READ')}
            </Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.primaryText} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          onEndReachedThreshold={0.4}
          onEndReached={handleLoadMore}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item, section }) => (
            <NotificationRow
              notification={item}
              showDate={!section.isToday}
              onPress={() => handleOpen(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <Text style={styles.emptyText}>
                {error ?? t('MOBILE.NOTIFICATIONS.EMPTY')}
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                style={styles.footerSpinner}
                color={colors.primaryText}
              />
            ) : undefined
          }
        />
      )}
    </View>
  );
}

function NotificationRow({
  notification,
  showDate,
  onPress,
}: {
  notification: AppNotification;
  showDate: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const unread = !notification.read_at;
  const zone = deviceZone();
  const createdAt = toMillisIso(notification.created_at);
  const time = toDisplayTime(createdAt, zone);
  const when = showDate ? `${toDisplayDate(createdAt, zone)} · ${time}` : time;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, unread && styles.rowUnread]}
    >
      <View style={[styles.dot, !unread && styles.dotHidden]} />
      <View style={styles.rowBody}>
        <Text
          style={[styles.rowTitle, unread && styles.rowTitleUnread]}
          numberOfLines={2}
        >
          {notification.title}
        </Text>
        {!!notification.body && (
          <Text style={styles.rowText} numberOfLines={3}>
            {notification.body}
          </Text>
        )}
        <Text style={styles.rowTime}>{when}</Text>
      </View>
    </Pressable>
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
  markAllText: {
    color: c.primaryText,
    fontWeight: '600',
    fontSize: 13,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: c.textMuted,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: c.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 12,
    marginBottom: 8,
  },
  footerSpinner: {
    marginVertical: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.borderSoft,
    backgroundColor: c.surface,
    marginBottom: 10,
  },
  rowUnread: {
    backgroundColor: c.purpleTint,
    borderColor: c.border,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: c.accent,
    marginTop: 6,
  },
  dotHidden: {
    backgroundColor: 'transparent',
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: c.text,
  },
  rowTitleUnread: {
    fontWeight: '700',
  },
  rowText: {
    fontSize: 12.5,
    color: c.textMuted,
    marginTop: 3,
    lineHeight: 18,
  },
  rowTime: {
    fontSize: 11.5,
    color: c.textMuted,
    marginTop: 6,
  },
}));
