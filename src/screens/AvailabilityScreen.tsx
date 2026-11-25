import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { gradients } from '../constants/colors';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import LinearGradient from 'react-native-linear-gradient';
import { DashboardTabs, type DashboardTab } from '../components/DashboardTabs';
import { TimePickerModal } from '../components/TimePickerModal';
import {
  DAY_KEYS,
  getAvailability,
  updateAvailability,
  type AvailabilityMap,
  type DayKey,
} from '../api/availability';
import { TopBarActions } from '../components/TopBarActions';
import { createModuleCache, useCachedState } from '../utils/cachedState';

interface Props {
  onBack: () => void;
  onLoggedOut: () => void;
  onNavigate: (tab: DashboardTab) => void;
  onOpenProfile: () => void;
}

const DAY_INDEX: Record<DayKey, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

// "Monday", "lundi", … in the app's language (dayjs follows it).
const dayLabel = (day: DayKey) => dayjs().day(DAY_INDEX[day]).format('dddd');

const DEFAULT_START = '09:00 AM';
const DEFAULT_END = '05:00 PM';

// Matches the web form's fixed 24-entry hourly dropdown (availability.component.ts's
// `hours` array) — no custom minute granularity.
const HOURS: string[] = Array.from({ length: 24 }, (_, i) => {
  const hour12 = i % 12 === 0 ? 12 : i % 12;
  const period = i < 12 ? 'AM' : 'PM';
  return `${String(hour12).padStart(2, '0')}:00 ${period}`;
});

function timeToMinutes(time: string): number {
  const match = time.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/);
  if (!match) return 0;
  let hour = parseInt(match[1], 10) % 12;
  if (match[3] === 'PM') hour += 12;
  return hour * 60 + parseInt(match[2], 10);
}

function formatDuration(start: string, end: string): string {
  const minutes = timeToMinutes(end) - timeToMinutes(start);
  if (minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const availabilityCache = createModuleCache<AvailabilityMap | null>(null);

export function AvailabilityScreen({
  onBack,
  onLoggedOut,
  onNavigate,
  onOpenProfile,
}: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [availability, setAvailability] = useCachedState(availabilityCache);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(() =>
    availability ? JSON.stringify(availability) : null,
  );
  const [loading, setLoading] = useState(!availability);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<{
    day: DayKey;
    field: 'start' | 'end';
  } | null>(null);

  // Mounting shows the cached availability instantly instead of a spinner
  // (see cachedState.ts), then quietly refetches in the background to
  // self-correct. No refresh on returning to the tab: that would throw
  // away unsaved edits, which now survive switching tabs.
  useEffect(() => {
    getAvailability()
      .then(data => {
        setAvailability(data);
        setSavedSnapshot(JSON.stringify(data));
      })
      .catch((err: any) => {
        if (availability) {
          console.error(err);
        } else {
          Alert.alert(
            t('MOBILE.AVAILABILITY.LOAD_FAILED'),
            err?.message ?? t('AUTH.GENERIC_ERROR'),
          );
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasUnsavedChanges =
    availability !== null && JSON.stringify(availability) !== savedSnapshot;

  const activeDayCount = availability
    ? DAY_KEYS.filter(day => availability[day].active).length
    : 0;

  const invalidDays = useMemo(() => {
    if (!availability) return [];
    return DAY_KEYS.filter(day => {
      const slot = availability[day];
      if (!slot.active) return false;
      if (!slot.start || !slot.end) return true;
      return timeToMinutes(slot.end) <= timeToMinutes(slot.start);
    });
  }, [availability]);

  const toggleDay = (day: DayKey) => {
    setAvailability(prev => {
      if (!prev) return prev;
      const slot = prev[day];
      const nextActive = !slot.active;
      return {
        ...prev,
        [day]: {
          active: nextActive,
          start: slot.start ?? (nextActive ? DEFAULT_START : null),
          end: slot.end ?? (nextActive ? DEFAULT_END : null),
        },
      };
    });
  };

  const setTime = (day: DayKey, field: 'start' | 'end', value: string) => {
    setAvailability(prev => {
      if (!prev) return prev;
      const slot = prev[day];
      const next = { ...slot, [field]: value };

      if (
        field === 'start' &&
        next.end &&
        timeToMinutes(value) >= timeToMinutes(next.end)
      ) {
        const validEnd = HOURS.find(
          h => timeToMinutes(h) > timeToMinutes(value),
        );
        next.end = validEnd ?? next.end;
      }
      return { ...prev, [day]: next };
    });
    setPicker(null);
  };

  const handleSave = async () => {
    if (!availability) return;
    if (invalidDays.length) {
      Alert.alert(
        t('MOBILE.AVAILABILITY.FIX_DAYS_TITLE'),
        t('AVAILABILITY.INVALID_DAYS_ERROR', {
          days: invalidDays.map(dayLabel).join(', '),
        }),
      );
      return;
    }
    setSaving(true);
    try {
      const result = await updateAvailability(availability);
      setAvailability(result);
      setSavedSnapshot(JSON.stringify(result));
    } catch (err: any) {
      Alert.alert(
        t('AVAILABILITY.UPDATE_FAILED'),
        err?.message ?? t('AUTH.GENERIC_ERROR'),
      );
    } finally {
      setSaving(false);
    }
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
        <DashboardTabs active="availability" onChange={onNavigate} />
      </View>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('NAV.AVAILABILITY')}</Text>
      </View>

      {loading || !availability ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.primaryText} />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.subtitle}>
              {t('MOBILE.AVAILABILITY.SUBTITLE', { active: activeDayCount })}
            </Text>

            {DAY_KEYS.map(day => {
              const slot = availability[day];
              const isInvalid = invalidDays.includes(day);
              const duration =
                slot.active && slot.start && slot.end
                  ? formatDuration(slot.start, slot.end)
                  : '';
              return (
                <View
                  key={day}
                  style={[styles.dayRow, isInvalid && styles.dayRowInvalid]}
                >
                  <View style={styles.dayTop}>
                    <Switch
                      value={slot.active}
                      onValueChange={() => toggleDay(day)}
                      trackColor={{ true: colors.primary }}
                    />
                    <Text style={styles.dayLabel}>{dayLabel(day)}</Text>
                    {!!duration && (
                      <Text style={styles.durationBadge}>{duration}</Text>
                    )}
                  </View>

                  {slot.active ? (
                    <View style={styles.timeRow}>
                      <Pressable
                        style={styles.timeButton}
                        onPress={() => setPicker({ day, field: 'start' })}
                      >
                        <Text style={styles.timeButtonText}>
                          {slot.start ?? t('MOBILE.AVAILABILITY.START')}
                        </Text>
                      </Pressable>
                      <Text style={styles.timeArrow}>{'→'}</Text>
                      <Pressable
                        style={styles.timeButton}
                        onPress={() => setPicker({ day, field: 'end' })}
                      >
                        <Text style={styles.timeButtonText}>
                          {slot.end ?? t('MOBILE.AVAILABILITY.END')}
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={styles.dayOffText}>
                      {t('AVAILABILITY.DAY_OFF_LABEL')}
                    </Text>
                  )}
                  {isInvalid && (
                    <Text style={styles.errorText}>
                      {t('MOBILE.AVAILABILITY.INVALID_RANGE')}
                    </Text>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            {hasUnsavedChanges && (
              <Text style={styles.unsavedHint}>
                {t('AVAILABILITY.UNSAVED_CHANGES')}
              </Text>
            )}
            <Pressable onPress={handleSave} disabled={saving}>
              <LinearGradient
                colors={gradients.primary}
                style={[styles.saveButton, saving && { opacity: 0.7 }]}
              >
                {saving ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {t('AVAILABILITY.UPDATE')}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>

          {picker && (
            <TimePickerModal
              visible
              title={
                picker.field === 'start'
                  ? t('MOBILE.AVAILABILITY.START_TIME')
                  : t('MOBILE.AVAILABILITY.END_TIME')
              }
              options={
                picker.field === 'end' && availability[picker.day].start
                  ? HOURS.filter(
                      h =>
                        timeToMinutes(h) >
                        timeToMinutes(availability[picker.day].start!),
                    )
                  : HOURS
              }
              selected={availability[picker.day][picker.field]}
              onSelect={value => setTime(picker.day, picker.field, value)}
              onClose={() => setPicker(null)}
            />
          )}
        </>
      )}
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
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  subtitle: {
    fontSize: 12.5,
    color: c.textMuted,
    marginBottom: 16,
  },
  dayRow: {
    borderWidth: 1,
    borderColor: c.borderSoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  dayRowInvalid: {
    borderColor: c.danger,
  },
  dayTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: c.text,
    flex: 1,
  },
  durationBadge: {
    fontSize: 11.5,
    fontWeight: '600',
    color: c.primaryText,
    backgroundColor: c.borderSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  dayOffText: {
    fontSize: 12.5,
    color: c.textMuted,
    marginTop: 8,
    marginLeft: 50,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    marginLeft: 50,
  },
  timeButton: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  timeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.text,
  },
  timeArrow: {
    color: c.textMuted,
  },
  errorText: {
    color: c.danger,
    fontSize: 11.5,
    marginTop: 6,
    marginLeft: 50,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 48,
    borderTopWidth: 1,
    borderTopColor: c.borderSoft,
  },
  unsavedHint: {
    fontSize: 11.5,
    color: c.textMuted,
    marginBottom: 8,
    textAlign: 'center',
  },
  saveButton: {
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: c.onPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
}));
