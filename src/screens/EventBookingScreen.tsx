import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import dayjs from 'dayjs';
import { formatDate } from '../utils/calendarGrid';

import { gradients } from '../constants/colors';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import { BRAND_ASSET_BASE } from '../constants/env';
import {
  bookSlots,
  getEventInfo,
  getEventSlots,
  getMonthAvailability,
  type EventInfoResponse,
  type EventSlot,
  type MonthAvailability,
} from '../api/eventPage';
import { getMeetingLocation } from '../utils/location';
import { toDisplayTime } from '../utils/apiDate';
import { CalendarGrid } from '../components/CalendarGrid';
import { TimezoneModal } from '../components/TimezoneModal';
import timezonesJson from '../assets/timezones.json';

interface DisplaySlot extends EventSlot {
  startLocal: string;
  endLocal: string;
  selected: boolean;
}

interface Props {
  slug: string;
  id: string;
  onExit: () => void;
}

const TIMEZONES: string[] = timezonesJson;

export function EventBookingScreen({ slug, id, onExit }: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [event, setEvent] = useState<EventInfoResponse['event'] | null>(null);
  const [host, setHost] = useState<EventInfoResponse['host'] | null>(null);

  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [monthAvailability, setMonthAvailability] = useState<MonthAvailability>(
    {},
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  const [slots, setSlots] = useState<DisplaySlot[]>([]);
  const [currStep, setCurrStep] = useState<0 | 1>(0);

  const [selectedZone, setSelectedZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  );
  const [showTimezoneModal, setShowTimezoneModal] = useState(false);

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [showRequiredError, setShowRequiredError] = useState(false);
  const [showInvalidEmail, setShowInvalidEmail] = useState(false);

  const [bookForm, setBookForm] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  const toLocal = useCallback(
    (isoTime: string) =>
      toDisplayTime(isoTime, selectedZone, { padHour: true }),
    [selectedZone],
  );

  const mapSlots = useCallback(
    (rawSlots: EventSlot[]): DisplaySlot[] =>
      rawSlots
        .filter(slot => slot.available)
        .map(slot => ({
          ...slot,
          startLocal: toLocal(slot.start),
          endLocal: toLocal(slot.end),
          selected: false,
        })),
    [toLocal],
  );

  const loadSlotsForDate = useCallback(
    async (date: Date) => {
      const formatted = dayjs(date).format('YYYY-MM-DD');
      try {
        const res = await getEventSlots(slug, id, formatted, selectedZone);
        setSlots(mapSlots(res.slots));
      } catch (err) {
        console.error(err);
      }
    },
    [slug, id, selectedZone, mapSlots],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      const month = dayjs().format('YYYY-MM');

      try {
        const [eventRes, monthRes] = await Promise.all([
          getEventInfo(slug, id),
          getMonthAvailability(slug, id, month, selectedZone),
        ]);
        if (cancelled) return;

        setEvent(eventRes.event);
        setHost(eventRes.host);
        setMonthAvailability(monthRes);
        setLoading(false);
        loadSlotsForDate(selectedDate ?? new Date());
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setLoadError(t('MOBILE.BOOKING_PAGE.LOAD_FAILED'));
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, id, selectedZone]);

  const handleChangeMonth = useCallback(
    async (offset: number) => {
      const next = new Date(
        calendarMonth.getFullYear(),
        calendarMonth.getMonth() + offset,
        1,
      );
      setCalendarMonth(next);
      const monthKey = dayjs(next).format('YYYY-MM');
      try {
        const res = await getMonthAvailability(
          slug,
          id,
          monthKey,
          selectedZone,
        );
        setMonthAvailability(res);
      } catch (err) {
        console.error(err);
      }
    },
    [calendarMonth, slug, id, selectedZone],
  );

  const handleSelectDate = useCallback(
    (date: Date) => {
      setSelectedDate(date);
      loadSlotsForDate(date);
    },
    [loadSlotsForDate],
  );

  const handleSelectSlot = useCallback((slot: DisplaySlot) => {
    setSlots(prev =>
      prev.map(s => ({ ...s, selected: s.start === slot.start })),
    );
    setCurrStep(1);
  }, []);

  const selectedSlot = useMemo(
    () => slots.find(s => s.selected) ?? null,
    [slots],
  );

  const isValidEmail = (value: string) =>
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);

  const handleSubmit = useCallback(async () => {
    if (!selectedSlot) {
      Alert.alert(
        t('MOBILE.BOOKING_PAGE.SELECT_TIME_TITLE'),
        t('MOBILE.BOOKING_PAGE.SELECT_TIME_MESSAGE'),
      );
      return;
    }
    if (!guestName.trim() || !guestEmail.trim()) {
      setShowRequiredError(true);
      return;
    }
    if (!isValidEmail(guestEmail)) {
      setShowInvalidEmail(true);
      return;
    }

    setShowRequiredError(false);
    setShowInvalidEmail(false);
    setBookForm(true);
    setStatusLoading(true);

    try {
      const res = await bookSlots(slug, {
        host_id: selectedSlot.selected_host ?? '',
        guest_email: guestEmail,
        guest_name: guestName,
        guest_timezone: selectedZone,
        requests: [
          { start_time: selectedSlot.start, end_time: selectedSlot.end },
        ],
      });
      setStatusLoading(false);

      const created = res.created_requests?.length ?? 0;
      const failed = res.failed_requests ?? [];
      if (created) {
        Alert.alert(
          t('MOBILE.BOOKING_PAGE.REQUEST_SENT_TITLE'),
          t('MOBILE.BOOKING_PAGE.REQUESTS_SENT', { n: created }),
        );
      }
      if (failed.length) {
        Alert.alert(
          t('MOBILE.BOOKING_PAGE.SOME_FAILED'),
          failed.map(f => f.reason).join(', '),
        );
      }
    } catch (err: any) {
      console.error(err);
      setBookForm(false);
      setStatusLoading(false);
      Alert.alert(
        t('MOBILE.BOOKING_PAGE.BOOKING_FAILED'),
        err?.message ?? t('MOBILE.BOOKING_PAGE.BOOKING_FAILED'),
      );
    }
  }, [selectedSlot, guestName, guestEmail, selectedZone, slug, t]);

  if (loading) {
    return (
      <View style={styles.centerFill}>
        <ActivityIndicator size="large" color={colors.primaryText} />
      </View>
    );
  }

  if (loadError || !event || !host) {
    return (
      <View style={styles.centerFill}>
        <Text style={styles.errorText}>
          {loadError ?? t('AUTH.GENERIC_ERROR')}
        </Text>
        <Pressable style={styles.linkButton} onPress={onExit}>
          <Text style={styles.linkButtonText}>
            {t('MOBILE.BOOKING_PAGE.GO_BACK')}
          </Text>
        </Pressable>
      </View>
    );
  }

  const brandName = event.brand_name;
  const brandImage = event.brand_logo
    ? `${BRAND_ASSET_BASE}${event.brand_logo.replace(/^\/+/, '')}`
    : null;
  const location = getMeetingLocation(event.meeting_location);

  if (bookForm) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          {statusLoading ? (
            <View style={styles.statusLoadingWrap}>
              <ActivityIndicator size="large" color={colors.primaryText} />
              <Text style={styles.statusLoadingText}>
                {t('MOBILE.BOOKING_PAGE.SENDING')}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.statusHeader}>
                <View style={styles.statusIconBadge}>
                  <Text style={styles.statusIconText}>{'⏳'}</Text>
                </View>
                <Text style={styles.statusTitle}>
                  {t('MOBILE.BOOKING_PAGE.PENDING_TITLE')}
                </Text>
                <Text style={styles.statusDescription}>
                  {t('MOBILE.BOOKING_PAGE.PENDING_TEXT')}
                </Text>
              </View>

              <View style={styles.infoGrid}>
                <InfoRow label={t('MOBILE.FORM.TITLE')} value={event.title} />
                <InfoRow
                  label={t('MOBILE.BOOKING_PAGE.MEETING_TIME')}
                  value={
                    selectedDate
                      ? `${selectedSlot?.startLocal ?? ''} · ${formatDate(
                          selectedDate,
                          {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          },
                        )} (${selectedZone})`
                      : ''
                  }
                />
                <InfoRow
                  label={t('MOBILE.BOOKING_PAGE.HOST')}
                  value={host.name}
                  sub={host.email}
                />
                <InfoRow
                  label={t('MOBILE.CALENDAR.GUEST')}
                  value={guestName}
                  sub={guestEmail}
                />
                <InfoRow
                  label={t('EVENT_FORM.LOCATION_LABEL')}
                  value={location.label}
                  last
                />
              </View>

              <Pressable
                style={[styles.linkButton, styles.doneButton]}
                onPress={onExit}
              >
                <Text style={styles.linkButtonText}>
                  {t('MOBILE.COMMON.DONE')}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.card}>
        {/* Host / appointment info panel — always visible */}
        <View style={styles.hostPanel}>
          <View style={styles.hostRow}>
            {brandImage ? (
              <Image source={{ uri: brandImage }} style={styles.avatarImage} />
            ) : (
              <LinearGradient
                colors={gradients.brandAvatar}
                style={styles.avatar}
              >
                <Text style={styles.avatarText}>
                  {(host.email[0] ?? '?').toUpperCase()}
                </Text>
              </LinearGradient>
            )}
            <View style={styles.hostTextWrap}>
              <Text style={styles.hostName}>{brandName || host.name}</Text>
              {!brandName && <Text style={styles.hostEmail}>{host.email}</Text>}
            </View>
          </View>

          <Text style={styles.eventTitle}>{event.title}</Text>

          <Pressable
            style={styles.timezoneButton}
            onPress={() => setShowTimezoneModal(true)}
          >
            <Text style={styles.timezoneButtonText} numberOfLines={1}>
              {selectedZone || t('EVENT_FORM.SELECT_TIME_ZONE')}
            </Text>
            <Text style={styles.chevron}>{'▾'}</Text>
          </Pressable>

          <View style={styles.locationRow}>
            <Text style={styles.locationLabel}>
              {t('EVENT_FORM.LOCATION_LABEL')}
            </Text>
            <View style={styles.locationValueRow}>
              <View style={styles.locationBadge}>
                <Text style={styles.locationBadgeText}>{location.initial}</Text>
              </View>
              <Text style={styles.locationValueText}>{location.label}</Text>
            </View>
          </View>

          {currStep === 0 ? (
            <View style={styles.descriptionWrap}>
              <Text style={styles.descriptionLabel}>
                {t('MOBILE.BOOKING_PAGE.DESCRIPTION')}
              </Text>
              <Text style={styles.descriptionText}>
                {event.description || t('MOBILE.BOOKING_PAGE.NO_DESCRIPTION')}
              </Text>
            </View>
          ) : (
            selectedSlot && (
              <View style={styles.selectedInfoWrap}>
                <Text style={styles.descriptionLabel}>
                  {t('MOBILE.BOOKING_PAGE.SELECTED_SLOT')}
                </Text>
                <View style={styles.selectedSlotCard}>
                  <Text style={styles.selectedSlotDate}>
                    {selectedDate
                      ? formatDate(selectedDate, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : ''}
                  </Text>
                  <Text style={styles.selectedSlotTime}>
                    {selectedSlot.startLocal} - {selectedSlot.endLocal}
                  </Text>
                </View>
              </View>
            )
          )}
        </View>

        {currStep === 0 ? (
          <View style={styles.stepPanel}>
            <CalendarGrid
              monthDate={calendarMonth}
              selectedDate={selectedDate}
              monthAvailability={monthAvailability}
              onChangeMonth={handleChangeMonth}
              onSelectDate={handleSelectDate}
            />

            <View style={styles.slotsSection}>
              <Text style={styles.slotsTitle}>
                {t('MOBILE.BOOKING_PAGE.SLOTS_TITLE')}
              </Text>
              <Text style={styles.slotsDate}>
                {selectedDate
                  ? formatDate(selectedDate, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })
                  : t('MOBILE.BOOKING_PAGE.NO_DATE')}
              </Text>

              {slots.length === 0 ? (
                <View style={styles.emptySlots}>
                  <Text style={styles.emptySlotsText}>
                    {t('MOBILE.BOOKING_PAGE.NO_SLOTS')}
                  </Text>
                </View>
              ) : (
                slots.map(slot => (
                  <Pressable
                    key={slot.start}
                    style={[
                      styles.slotBase,
                      slot.selected && { borderColor: 'transparent' },
                    ]}
                    onPress={() => handleSelectSlot(slot)}
                  >
                    {slot.selected ? (
                      <LinearGradient
                        colors={gradients.primary}
                        style={styles.slotFill}
                      >
                        <Text
                          style={[styles.slotText, styles.slotTextSelected]}
                        >
                          {slot.startLocal} - {slot.endLocal}
                        </Text>
                        <Text style={styles.slotCheck}>{'✓'}</Text>
                      </LinearGradient>
                    ) : (
                      <View style={styles.slotFillPlain}>
                        <Text style={styles.slotText}>
                          {slot.startLocal} - {slot.endLocal}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                ))
              )}
            </View>
          </View>
        ) : (
          <View style={styles.formPanel}>
            <Text style={styles.formTitle}>
              {t('MOBILE.BOOKING_PAGE.CONFIRM_TITLE')}
            </Text>
            <Text style={styles.formSubtitle}>
              {t('MOBILE.BOOKING_PAGE.CONFIRM_SUBTITLE')}
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>
                {t('MOBILE.BOOKING_PAGE.NAME_LABEL')}
              </Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('PROFILE.EDIT.NAME_PLACEHOLDER')}
                value={guestName}
                onChangeText={setGuestName}
              />
              {showRequiredError && !guestName.trim() && (
                <Text style={styles.formError}>
                  {t('MOBILE.BOOKING_PAGE.NAME_REQUIRED')}
                </Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>
                {t('MOBILE.BOOKING_PAGE.EMAIL_LABEL')}
              </Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('AUTH.LOGIN.EMAIL_PLACEHOLDER')}
                autoCapitalize="none"
                keyboardType="email-address"
                value={guestEmail}
                onChangeText={setGuestEmail}
              />
              {showRequiredError && !guestEmail.trim() && (
                <Text style={styles.formError}>
                  {t('MOBILE.BOOKING_PAGE.EMAIL_REQUIRED')}
                </Text>
              )}
              {showInvalidEmail && guestEmail.trim() && (
                <Text style={styles.formError}>
                  {t('AUTH.LOGIN.INVALID_EMAIL')}
                </Text>
              )}
            </View>

            <Text style={styles.formFootnote}>
              {t('MOBILE.BOOKING_PAGE.PRIVACY_NOTE')}
            </Text>

            <View style={styles.formActions}>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => setCurrStep(0)}
              >
                <Text style={styles.secondaryButtonText}>
                  {t('MOBILE.COMMON.BACK')}
                </Text>
              </Pressable>
              <Pressable onPress={handleSubmit}>
                <LinearGradient
                  colors={gradients.primary}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>
                    {t('MOBILE.BOOKING_PAGE.CONFIRM_BUTTON')}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <TimezoneModal
        visible={showTimezoneModal}
        zones={TIMEZONES}
        selectedZone={selectedZone}
        onSelect={zone => {
          setSelectedZone(zone);
          setShowTimezoneModal(false);
        }}
        onClose={() => setShowTimezoneModal(false)}
      />
    </ScrollView>
  );
}

function InfoRow({
  label,
  value,
  sub,
  last,
}: {
  label: string;
  value: string;
  sub?: string;
  last?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoValueWrap}>
        <Text style={styles.infoValue}>{value}</Text>
        {sub && <Text style={styles.infoSub}>{sub}</Text>}
      </View>
    </View>
  );
}

const useStyles = makeStyles(c => ({
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  errorText: {
    color: c.text,
    fontSize: 15,
    textAlign: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.borderSoft,
    padding: 20,
    gap: 24,
    // CSS box-shadow equivalent
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 4,
  },
  hostPanel: {
    gap: 4,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: c.surface,
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarText: {
    color: c.onPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  hostTextWrap: {
    flex: 1,
  },
  hostName: {
    fontSize: 14,
    fontWeight: '700',
    color: c.textStrong,
  },
  hostEmail: {
    fontSize: 12,
    color: c.textBody,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: c.text,
    marginTop: 14,
  },
  timezoneButton: {
    marginTop: 12,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceMuted,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timezoneButtonText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: c.text,
  },
  chevron: {
    color: c.textMuted,
    fontSize: 12,
  },
  locationRow: {
    marginTop: 16,
  },
  locationLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
    marginBottom: 6,
  },
  locationValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationBadge: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationBadgeText: {
    color: c.onPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  locationValueText: {
    fontSize: 13,
    color: c.text,
  },
  descriptionWrap: {
    marginTop: 16,
  },
  descriptionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
    marginBottom: 4,
  },
  descriptionText: {
    fontSize: 13,
    color: c.textBody,
    lineHeight: 19,
  },
  selectedInfoWrap: {
    marginTop: 16,
  },
  selectedSlotCard: {
    backgroundColor: c.surfaceTint,
    borderWidth: 1,
    borderColor: c.borderSoft,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  selectedSlotDate: {
    fontSize: 13,
    fontWeight: '600',
    color: c.primaryText,
  },
  selectedSlotTime: {
    fontSize: 13,
    color: c.text,
  },
  stepPanel: {
    borderTopWidth: 1,
    borderTopColor: c.borderSoft,
    paddingTop: 20,
    gap: 24,
  },
  slotsSection: {},
  slotsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: c.text,
    marginBottom: 2,
  },
  slotsDate: {
    fontSize: 12,
    color: c.textMuted,
    marginBottom: 12,
  },
  emptySlots: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlotsText: {
    color: c.textMuted,
  },
  slotBase: {
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
  },
  slotFill: {
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slotFillPlain: {
    padding: 14,
    backgroundColor: c.surfaceMuted,
  },
  slotText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: c.primaryText,
  },
  slotTextSelected: {
    color: c.onPrimary,
  },
  slotCheck: {
    color: c.onPrimary,
    fontWeight: '700',
  },
  formPanel: {
    borderTopWidth: 1,
    borderTopColor: c.borderSoft,
    paddingTop: 20,
    gap: 4,
  },
  formTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: c.text,
  },
  formSubtitle: {
    fontSize: 12.5,
    color: c.textMuted,
    marginBottom: 12,
  },
  formGroup: {
    marginBottom: 14,
  },
  formLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: c.text,
    marginBottom: 6,
  },
  formInput: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: c.text,
  },
  formError: {
    color: c.danger,
    fontSize: 12,
    marginTop: 4,
  },
  formFootnote: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: 12,
    marginBottom: 8,
  },
  formActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: c.borderSoft,
  },
  secondaryButton: {
    height: 42,
    paddingHorizontal: 22,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: c.primaryText,
    fontWeight: '600',
    fontSize: 13.5,
  },
  primaryButton: {
    height: 42,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: c.onPrimary,
    fontWeight: '600',
    fontSize: 13.5,
  },
  statusLoadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  statusLoadingText: {
    color: c.textMuted,
  },
  statusHeader: {
    alignItems: 'center',
    gap: 8,
  },
  statusIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: c.borderSoft,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statusIconText: {
    fontSize: 22,
  },
  statusTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: c.text,
  },
  statusDescription: {
    fontSize: 13,
    color: c.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 340,
  },
  infoGrid: {
    backgroundColor: c.surfaceMuted,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.borderSoft,
    padding: 18,
    marginTop: 20,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 14,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSoft,
  },
  infoRowLast: {
    paddingBottom: 0,
    marginBottom: 0,
    borderBottomWidth: 0,
  },
  infoLabel: {
    width: 100,
    fontSize: 12,
    color: c.textMuted,
  },
  infoValueWrap: {
    flex: 1,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: c.text,
  },
  infoSub: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: 2,
  },
  linkButton: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  linkButtonText: {
    color: c.primaryText,
    fontWeight: '600',
  },
  doneButton: {
    marginTop: 20,
  },
}));
