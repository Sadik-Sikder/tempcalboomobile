import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import i18n from '../i18n';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { palette } from '../constants/colors';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import { DashboardTabs, type DashboardTab } from '../components/DashboardTabs';
import { TopBarActions } from '../components/TopBarActions';
import {
  AreaLineChart,
  BarChart,
  DonutChart,
  EmptyChart,
  type ChartPoint,
} from '../components/Charts';
import {
  getAnalytics,
  PERIOD_DAYS,
  type AnalyticsPeriod,
  type AnalyticsResponse,
  type AnalyticsScope,
} from '../api/analytics';
import { getTeams, type Team } from '../api/teams';
import {
  dateKey,
  formatDate,
  monthKey,
  monthShort,
} from '../utils/calendarGrid';
import { currentSession, onSessionReset } from '../utils/cachedState';
import { useRefreshOnFocus } from '../navigation/useRefreshOnFocus';

interface Props {
  onBack: () => void;
  onLoggedOut: () => void;
  onNavigate: (tab: DashboardTab) => void;
  onOpenProfile: () => void;
}

// labelKey: the chip; lastKey: "Last 7 days" under the numbers it covers.
const PERIODS: { key: AnalyticsPeriod; labelKey: string; lastKey: string }[] = [
  {
    key: '7d',
    labelKey: 'MOBILE.ANALYTICS.PERIOD_7D',
    lastKey: 'ANALYTIC.LAST_7_DAYS',
  },
  {
    key: '30d',
    labelKey: 'MOBILE.ANALYTICS.PERIOD_30D',
    lastKey: 'ANALYTIC.LAST_30_DAYS',
  },
  {
    key: '90d',
    labelKey: 'MOBILE.ANALYTICS.PERIOD_90D',
    lastKey: 'MOBILE.ANALYTICS.LAST_90_DAYS',
  },
  {
    key: '12m',
    labelKey: 'MOBILE.ANALYTICS.PERIOD_12M',
    lastKey: 'ANALYTIC.LAST_12_MONTHS',
  },
];

// Same enums and colors as analytic.component.ts. The backend spells it
// 'canceled'; the web's map uses 'cancelled' — accept both.
const STATUS_META: Record<string, { labelKey: string; color: string }> = {
  completed: { labelKey: 'ANALYTIC.STATUS_COMPLETED', color: palette.emerald },
  confirmed: { labelKey: 'ANALYTIC.STATUS_CONFIRMED', color: palette.blue },
  scheduled: { labelKey: 'ANALYTIC.STATUS_SCHEDULED', color: palette.indigo },
  pending: { labelKey: 'ANALYTIC.STATUS_PENDING', color: palette.amber },
  canceled: { labelKey: 'ANALYTIC.STATUS_CANCELLED', color: palette.red },
  cancelled: { labelKey: 'ANALYTIC.STATUS_CANCELLED', color: palette.red },
  rescheduled: {
    labelKey: 'ANALYTIC.STATUS_RESCHEDULED',
    color: palette.violet,
  },
};

const EVENT_TYPE_KEYS: Record<string, string> = {
  'one-to-one': 'ANALYTIC.EVENT_TYPE_ONE_TO_ONE',
  'round-robin': 'ANALYTIC.EVENT_TYPE_ROUND_ROBIN',
  group: 'ANALYTIC.EVENT_TYPE_GROUP',
  collective: 'ANALYTIC.EVENT_TYPE_COLLECTIVE',
  appointment: 'EVENT_FORM.TYPE_APPOINTMENT',
};

function eventTypeLabel(name: string | null | undefined): string {
  if (!name || name === 'null') return i18n.t('ANALYTIC.EVENT_TYPE_OTHER');
  return EVENT_TYPE_KEYS[name] ? i18n.t(EVENT_TYPE_KEYS[name]) : name;
}

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

// The server names the busiest day in English ("Monday").
function dayName(day: string): string {
  const index = WEEKDAYS.indexOf(day.toLowerCase());
  return index < 0 ? day : dayjs().day(index).format('dddd');
}

const shortDate = (d: Date) =>
  formatDate(d, { month: 'short', day: 'numeric' });

function buildTrend(
  trend: AnalyticsResponse['meetings_trend'],
  period: AnalyticsPeriod,
): ChartPoint[] {
  const counts = new Map(trend.map(t => [t.date, t.count]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (period === '12m') {
    return Array.from({ length: 12 }, (_, i) => {
      const month = new Date(today.getFullYear(), today.getMonth() - 11 + i, 1);
      const key = monthKey(month);
      let value = 0;
      counts.forEach((count, date) => {
        if (date.startsWith(key)) value += count;
      });
      return { label: monthShort(month.getMonth()), value };
    });
  }

  const days = Array.from({ length: PERIOD_DAYS[period] }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (PERIOD_DAYS[period] - 1) + i);
    return d;
  });

  if (period === '90d') {
    const weeks: ChartPoint[] = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      weeks.push({
        label: shortDate(chunk[0]),
        value: chunk.reduce((sum, d) => sum + (counts.get(dateKey(d)) ?? 0), 0),
      });
    }
    return weeks;
  }

  return days.map(d => ({
    label: shortDate(d),
    value: counts.get(dateKey(d)) ?? 0,
  }));
}

function scopeKey(scope: AnalyticsScope): string {
  return scope.type === 'team' ? `team:${scope.id}` : 'personal';
}

// Last response per scope+period, so flipping filters back and forth (or
// opening the tab again after sign-in) shows data instantly while a fresh
// copy loads.
const responseCache = new Map<string, AnalyticsResponse>();
onSessionReset(() => responseCache.clear());

export function AnalyticsScreen({
  onBack,
  onLoggedOut,
  onNavigate,
  onOpenProfile,
}: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [scope, setScope] = useState<AnalyticsScope>({ type: 'personal' });
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d');
  const [teams, setTeams] = useState<Team[]>([]);
  const cacheKey = `${scopeKey(scope)}|${period}`;
  const [data, setData] = useState<AnalyticsResponse | null>(
    () => responseCache.get(cacheKey) ?? null,
  );
  const [loading, setLoading] = useState(!data);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Team analytics are for the people who run the team — same filter as
  // the web (is_owner || is_admin).
  useEffect(() => {
    getTeams()
      .then(all => setTeams(all.filter(team => team.is_owner || team.is_admin)))
      .catch(err => console.warn(err));
  }, []);

  const load = useCallback(async () => {
    try {
      const requestSession = currentSession();
      const res = await getAnalytics(scope, period);
      if (requestSession !== currentSession()) return;
      responseCache.set(cacheKey, res);
      setData(res);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? t('MOBILE.ANALYTICS.LOAD_FAILED'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [scope, period, cacheKey, t]);

  useEffect(() => {
    const cached = responseCache.get(cacheKey);
    setData(cached ?? null);
    setLoading(!cached);
    load();
  }, [cacheKey, load]);

  useRefreshOnFocus(load);

  const trend = useMemo(
    () => (data ? buildTrend(data.meetings_trend, period) : []),
    // Dates on the axis are in the current language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, period, t],
  );
  const statusSlices = useMemo(
    () =>
      (data?.meeting_status ?? [])
        .filter(s => s.count > 0)
        .map(s => {
          const meta = STATUS_META[s.status.toLowerCase()];
          return {
            label: meta ? t(meta.labelKey) : s.status,
            value: s.count,
            color: meta?.color ?? palette.indigo,
          };
        }),
    [data, t],
  );
  const eventTypeBars = useMemo(
    () =>
      (data?.event_types ?? []).map(e => ({
        label: eventTypeLabel(e.name),
        value: e.count,
      })),
    // eventTypeLabel reads the current language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, t],
  );

  const lastPeriod = t(PERIODS.find(p => p.key === period)!.lastKey);

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
        <DashboardTabs active="analytics" onChange={onNavigate} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        <Text style={styles.headerTitle}>{t('NAV.ANALYTICS')}</Text>
        <Text style={styles.headerSubtitle}>
          {t('MOBILE.ANALYTICS.SUBTITLE')}
        </Text>

        {teams.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <Chip
              label={t('ANALYTIC.MY_ACCOUNT')}
              selected={scope.type === 'personal'}
              onPress={() => setScope({ type: 'personal' })}
            />
            {teams.map(team => (
              <Chip
                key={team.id}
                label={team.name}
                selected={scope.type === 'team' && scope.id === team.id}
                onPress={() => setScope({ type: 'team', id: team.id })}
              />
            ))}
          </ScrollView>
        )}

        <View style={styles.chipRow}>
          {PERIODS.map(p => (
            <Chip
              key={p.key}
              label={t(p.labelKey)}
              selected={period === p.key}
              onPress={() => setPeriod(p.key)}
            />
          ))}
        </View>

        {loading ? (
          <View style={styles.centerFill}>
            <ActivityIndicator size="large" color={colors.primaryText} />
          </View>
        ) : !data ? (
          <View style={styles.centerFill}>
            <Text style={styles.emptyText}>
              {error ?? t('MOBILE.ANALYTICS.NO_DATA')}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.statsGrid}>
              {/* Team count only makes sense for your own account. */}
              {scope.type === 'personal' && (
                <StatCard
                  value={data.total_teams}
                  label={t('ANALYTIC.TEAMS_BADGE')}
                  color={palette.violet}
                />
              )}
              <StatCard
                value={data.total_events}
                label={t('ANALYTIC.EVENT_TYPES_BADGE')}
                color={palette.indigo}
              />
              <StatCard
                value={data.hosted_meetings}
                label={t('ANALYTIC.HOSTED_MEETINGS')}
                hint={lastPeriod}
                color={palette.emerald}
              />
              <StatCard
                value={data.upcoming_hosted}
                label={t('ANALYTIC.UPCOMING_HOSTED')}
                color={palette.blue}
              />
              <StatCard
                value={data.bookings}
                label={t('ANALYTIC.BOOKINGS_GUEST')}
                hint={lastPeriod}
                color={palette.amber}
              />
              <StatCard
                value={data.upcoming_bookings}
                label={t('ANALYTIC.UPCOMING_BOOKINGS')}
                color={palette.pink}
              />
            </View>

            <Card
              title={t('MOBILE.ANALYTICS.MEETINGS_OVER_TIME')}
              subtitle={lastPeriod}
            >
              {trend.some(p => p.value > 0) ? (
                <AreaLineChart points={trend} />
              ) : (
                <EmptyChart message={t('MOBILE.ANALYTICS.NO_MEETINGS')} />
              )}
            </Card>

            <Card title={t('ANALYTIC.MEETING_STATUS_TITLE')}>
              {statusSlices.length > 0 ? (
                <DonutChart slices={statusSlices} />
              ) : (
                <EmptyChart message={t('MOBILE.ANALYTICS.NO_MEETINGS')} />
              )}
            </Card>

            <Card title={t('ANALYTIC.EVENT_TYPES_BADGE')}>
              {eventTypeBars.length > 0 ? (
                <>
                  <BarChart bars={eventTypeBars} />
                  <View style={styles.list}>
                    {data.event_types.map(e => (
                      <ListRow
                        key={`${e.name}`}
                        label={eventTypeLabel(e.name)}
                        value={`${e.percentage}%`}
                      />
                    ))}
                  </View>
                </>
              ) : (
                <EmptyChart message={t('MOBILE.ANALYTICS.NO_EVENT_TYPES')} />
              )}
            </Card>

            <Card title={t('ANALYTIC.KEY_INSIGHTS_TITLE')}>
              <View style={styles.list}>
                <ListRow
                  label={t('ANALYTIC.MOST_USED_EVENT_TYPE')}
                  value={
                    data.insights.most_used_event_type &&
                    data.insights.most_used_event_type !== 'null'
                      ? eventTypeLabel(data.insights.most_used_event_type)
                      : '—'
                  }
                />
                <ListRow
                  label={t('ANALYTIC.PEAK_BOOKING_DAY')}
                  value={
                    data.insights.peak_booking_day &&
                    data.insights.peak_booking_day !== 'null'
                      ? dayName(data.insights.peak_booking_day)
                      : '—'
                  }
                />
                <ListRow
                  label={t('ANALYTIC.CANCELLATION_RATE')}
                  value={`${data.insights.cancellation_rate}%`}
                  valueStyle={styles.dangerValue}
                />
              </View>
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function StatCard({
  value,
  label,
  hint,
  color,
}: {
  value: number;
  label: string;
  hint?: string;
  color: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.statCard}>
      <View style={[styles.statAccent, { backgroundColor: color }]} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {hint && <Text style={styles.statHint}>{hint}</Text>}
    </View>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        {subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
      </View>
      {children}
    </View>
  );
}

function ListRow({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: object;
}) {
  const styles = useStyles();
  return (
    <View style={styles.listRow}>
      <Text style={styles.listLabel}>{label}</Text>
      <Text style={[styles.listValue, valueStyle]}>{value}</Text>
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
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: c.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: c.textMuted,
    marginTop: 2,
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  chipSelected: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: c.text,
  },
  chipTextSelected: {
    color: c.onPrimary,
  },
  centerFill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: c.textMuted,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginTop: 4,
    marginBottom: 14,
  },
  statCard: {
    width: '48.5%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.borderSoft,
    backgroundColor: c.surface,
    padding: 14,
  },
  statAccent: {
    width: 22,
    height: 4,
    borderRadius: 2,
    marginBottom: 10,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: c.text,
  },
  statLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: c.text,
    marginTop: 2,
  },
  statHint: {
    fontSize: 11,
    color: c.textMuted,
    marginTop: 2,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.borderSoft,
    backgroundColor: c.surface,
    padding: 14,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: c.text,
  },
  cardSubtitle: {
    fontSize: 11.5,
    color: c.textMuted,
  },
  list: {
    marginTop: 6,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: c.borderSoft,
  },
  listLabel: {
    fontSize: 13,
    color: c.text,
  },
  listValue: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
  },
  dangerValue: {
    color: palette.rose,
  },
}));
