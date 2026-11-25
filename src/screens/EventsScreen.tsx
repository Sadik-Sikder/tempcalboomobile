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
import Clipboard from '@react-native-clipboard/clipboard';

import { makeStyles, useTheme } from '../theme/ThemeContext';
import { DashboardTabs, type DashboardTab } from '../components/DashboardTabs';
import {
  bookingLinkFor,
  deleteEvent,
  getEvents,
  toggleEventStatus,
  type EventItem,
} from '../api/events';
import { TopBarActions } from '../components/TopBarActions';
import { createModuleCache, useCachedState } from '../utils/cachedState';
import { useRefreshOnFocus } from '../navigation/useRefreshOnFocus';
import { BottomSheet } from '../components/BottomSheet';

interface Props {
  onBack: () => void;
  onLoggedOut: () => void;
  onNavigate: (tab: DashboardTab) => void;
  onOpenProfile: () => void;
  onEdit: (event: EventItem) => void;
  onCreate: () => void;
}

const EVENT_TYPE_KEYS: Record<string, string> = {
  'one-to-one': 'EVENT_FORM.TYPE_ONE_TO_ONE',
  group: 'EVENT_FORM.TYPE_GROUP',
  appointment: 'EVENT_FORM.TYPE_APPOINTMENT',
};

const eventsCache = createModuleCache<EventItem[]>([]);
const nextCursorCache = createModuleCache<string | null>(null);
const loadedOnceCache = createModuleCache(false);
// The search text the cached list was loaded with, so coming back to the
// tab restores the box and its results together instead of showing a
// filtered list under an empty search box.
const searchCache = createModuleCache('');

export function EventsScreen({
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
  const [events, setEvents] = useCachedState(eventsCache);
  const [nextCursor, setNextCursor] = useCachedState(nextCursorCache);
  const [loadedOnce, setLoadedOnce] = useCachedState(loadedOnceCache);
  const [loading, setLoading] = useState(!loadedOnce);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useCachedState(searchCache);
  const [selected, setSelected] = useState<EventItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped by every list (re)load. A response is applied only if no newer
  // load started meanwhile — otherwise a slow reply for an earlier search
  // could land last and replace the results for what's in the box now.
  const requestSeq = useRef(0);

  const load = useCallback(
    async (searchTerm: string, opts?: { silent?: boolean }) => {
      const seq = ++requestSeq.current;
      if (!opts?.silent) setLoading(true);
      try {
        const res = await getEvents(null, searchTerm);
        if (seq !== requestSeq.current) return;
        setEvents(res.data);
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
    [setEvents, setNextCursor, setLoadedOnce],
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
      const res = await getEvents(nextCursor, search);
      // A new search started while this page loaded: it belongs to the
      // old results, which have been replaced.
      if (seq !== requestSeq.current) return;
      setEvents(prev => [...prev, ...res.data]);
      setNextCursor(res.next_cursor);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  };

  const typeLabel = (type: string) =>
    EVENT_TYPE_KEYS[type] ? t(EVENT_TYPE_KEYS[type]) : type;

  const handleCopyLink = (event: EventItem) => {
    const link = bookingLinkFor(event);
    if (!link) {
      Alert.alert(
        t('MOBILE.EVENTS.NO_LINK_TITLE'),
        t('EVENTS_PAGE.LINK_NOT_SHAREABLE'),
      );
      return;
    }
    Clipboard.setString(link);
    Alert.alert(t('MOBILE.EVENTS.LINK_COPIED_TITLE'), link);
  };

  const handleToggleStatus = async (event: EventItem) => {
    setActionLoading(true);
    const action = event.active === 1 ? 'deactivate' : 'activate';
    try {
      await toggleEventStatus(event.ulid, action);
      setEvents(prev =>
        prev.map(e =>
          e.ulid === event.ulid ? { ...e, active: e.active === 1 ? 0 : 1 } : e,
        ),
      );
      setSelected(null);
    } catch (err: any) {
      Alert.alert(
        t('MOBILE.COMMON.UPDATE_FAILED'),
        err?.message ?? t('AUTH.GENERIC_ERROR'),
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (event: EventItem) => {
    setActionLoading(true);
    try {
      await deleteEvent(event.ulid);
      setEvents(prev => prev.filter(e => e.ulid !== event.ulid));
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

  const confirmDelete = (event: EventItem) => {
    Alert.alert(
      t('MOBILE.EVENTS.DELETE_TITLE'),
      event.title ?? t('MOBILE.EVENTS.THIS_EVENT'),
      [
        { text: t('MOBILE.COMMON.KEEP_IT'), style: 'cancel' },
        {
          text: t('MOBILE.COMMON.DELETE'),
          style: 'destructive',
          onPress: () => handleDelete(event),
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
        <DashboardTabs active="events" onChange={onNavigate} />
      </View>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('NAV.EVENTS')}</Text>
        <Pressable onPress={onCreate}>
          <Text style={styles.newEventLink}>{t('MOBILE.EVENTS.NEW_LINK')}</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.search}
        placeholder={t('MOBILE.EVENTS.SEARCH_PLACEHOLDER')}
        value={search}
        onChangeText={handleSearchChange}
      />

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.primaryText} />
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={item => item.ulid}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          onEndReachedThreshold={0.4}
          onEndReached={handleLoadMore}
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <Text style={styles.emptyText}>{t('MOBILE.EVENTS.EMPTY')}</Text>
              <Pressable style={styles.emptyCreateButton} onPress={onCreate}>
                <Text style={styles.emptyCreateButtonText}>
                  {t('MOBILE.EVENTS.CREATE_FIRST')}
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
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
              ]}
              onPress={() => setSelected(item)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title || t('MOBILE.EVENTS.UNTITLED')}
                </Text>
                <View
                  style={[
                    styles.badge,
                    item.active === 1
                      ? styles.badgeActive
                      : styles.badgeInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      item.active === 1
                        ? styles.badgeTextActive
                        : styles.badgeTextInactive,
                    ]}
                  >
                    {item.active === 1
                      ? t('EVENTS_PAGE.ACTIVE')
                      : t('EVENTS_PAGE.INACTIVE')}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardMeta}>{typeLabel(item.event_type)}</Text>
              <Text style={styles.cardMeta}>
                {item.time_zone || t('EVENTS_PAGE.NOT_SET')}
              </Text>
              {!!item.pending_requests_count && (
                <Text style={styles.cardPending}>
                  {t(
                    item.pending_requests_count === 1
                      ? 'MOBILE.EVENTS.PENDING_ONE'
                      : 'MOBILE.EVENTS.PENDING_OTHER',
                    { n: item.pending_requests_count },
                  )}
                </Text>
              )}
            </Pressable>
          )}
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
              {selected.title || t('MOBILE.EVENTS.UNTITLED')}
            </Text>
            <Text style={styles.sheetLine}>
              {typeLabel(selected.event_type)}
            </Text>

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

            <Pressable
              style={styles.sheetButtonSecondary}
              onPress={() => {
                setSelected(null);
                handleCopyLink(selected);
              }}
            >
              <Text style={styles.sheetButtonSecondaryText}>
                {t('EVENTS_PAGE.COPY_LINK')}
              </Text>
            </Pressable>

            <Pressable
              style={styles.sheetButtonSecondary}
              disabled={actionLoading}
              onPress={() => handleToggleStatus(selected)}
            >
              <Text style={styles.sheetButtonSecondaryText}>
                {selected.active === 1
                  ? t('EVENTS_PAGE.CONTEXT_DEACTIVATE')
                  : t('EVENTS_PAGE.CONTEXT_ACTIVATE')}
              </Text>
            </Pressable>

            <Pressable
              style={styles.sheetButtonDanger}
              disabled={actionLoading}
              onPress={() => confirmDelete(selected)}
            >
              <Text style={styles.sheetButtonDangerText}>
                {t('EVENTS_PAGE.CONTEXT_DELETE')}
              </Text>
            </Pressable>
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
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: c.text,
  },
  newEventLink: {
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
  badgeActive: {
    backgroundColor: c.activeBadgeSoft,
  },
  badgeInactive: {
    backgroundColor: c.inactiveBadgeSoft,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextActive: {
    color: c.activeBadge,
  },
  badgeTextInactive: {
    color: c.inactiveBadge,
  },
  cardMeta: {
    fontSize: 12.5,
    color: c.textMuted,
    marginTop: 2,
  },
  cardPending: {
    fontSize: 12,
    color: c.accent,
    fontWeight: '600',
    marginTop: 6,
  },
  sheet: {
    padding: 20,
    gap: 10,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: c.text,
  },
  sheetLine: {
    fontSize: 13.5,
    color: c.textMuted,
    marginBottom: 6,
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
  sheetFootnote: {
    fontSize: 11.5,
    color: c.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
}));
