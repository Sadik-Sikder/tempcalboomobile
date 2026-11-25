import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

import { gradients } from '../constants/colors';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import {
  createMeeting,
  updateMeeting,
  type MeetingFormValues,
  type Schedule,
  type ScheduleGuest,
} from '../api/meetings';
import { refreshMeetingReminders } from '../background/meetingReminders';
import { toZonedParts } from '../utils/apiDate';
import { TimezoneModal } from '../components/TimezoneModal';
import { DatePickerModal } from '../components/DatePickerModal';
import { ClockPickerModal } from '../components/ClockPickerModal';
import timezonesJson from '../assets/timezones.json';

const TIMEZONES: string[] = timezonesJson;

// labelKey: the option's text in src/i18n.
const EVENT_TYPES = [
  { value: 'one-to-one', labelKey: 'EVENT_FORM.TYPE_ONE_TO_ONE' },
  { value: 'group', labelKey: 'EVENT_FORM.TYPE_GROUP' },
];

const DURATION_OPTIONS = [
  { value: 15, labelKey: 'MOBILE.DURATION.MINUTES' },
  { value: 30, labelKey: 'MOBILE.DURATION.MINUTES' },
  { value: 45, labelKey: 'MOBILE.DURATION.MINUTES' },
  { value: 60, labelKey: 'EVENT_FORM.DURATION_60' },
  { value: 120, labelKey: 'EVENT_FORM.DURATION_120' },
];

const LOCATION_OPTIONS = ['Google Meet', 'Zoom'];

const REMINDER_UNITS: MeetingFormValues['reminder']['unit'][] = [
  'Minute',
  'Hour',
  'Day',
  'Week',
];

// The units above are what the API takes; these are what the user reads.
const REMINDER_UNIT_KEYS: Record<
  MeetingFormValues['reminder']['unit'],
  string
> = {
  Minute: 'MEETING_FORM.UNIT_MINUTE',
  Hour: 'MEETING_FORM.UNIT_HOUR',
  Day: 'MEETING_FORM.UNIT_DAY',
  Week: 'MEETING_FORM.UNIT_WEEK',
};

interface Props {
  schedule: Schedule | null;
  // Fields to start a new meeting with, on top of the usual defaults.
  draft?: Partial<MeetingFormValues>;
  onSaved: () => void;
  onCancel: () => void;
}

function parseReminderFormat(
  value: string | null | undefined,
): MeetingFormValues['reminder'] {
  if (!value) return { value: 1, unit: 'Hour' };
  const numberMatch = value.match(/^\d+/);
  const unitMatch = value.match(/[a-zA-Z]+$/);
  const unit = unitMatch?.[0] as
    | MeetingFormValues['reminder']['unit']
    | undefined;
  return {
    value: numberMatch ? parseInt(numberMatch[0], 10) : 1,
    unit: unit && REMINDER_UNITS.includes(unit) ? unit : 'Hour',
  };
}

function mapScheduleToForm(schedule: Schedule): MeetingFormValues {
  const zone =
    schedule.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { date, time } = toZonedParts(schedule.start_datetime, zone);

  return {
    owner_type: schedule.owner_type ?? 'user',
    owner_id: schedule.owner_id ?? null,
    title: schedule.title ?? '',
    type: schedule.type ?? 'one-to-one',
    schedule_date: date,
    start_time: time,
    duration_in_minutes: schedule.duration_in_minutes
      ? Number(schedule.duration_in_minutes)
      : 30,
    time_zone: zone,
    meeting_location: schedule.meeting_location ?? '',
    description: schedule.description ?? '',
    guests: (schedule.guests || []).map(g => ({ email: g.email })),
    reminder: parseReminderFormat(schedule.reminder_format),
    notification: schedule.notification ?? 'email',
    active: !!schedule.active,
  };
}

function emptyForm(): MeetingFormValues {
  return {
    owner_type: 'user',
    owner_id: null,
    title: '',
    type: 'one-to-one',
    schedule_date: '',
    start_time: '',
    duration_in_minutes: 30,
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    meeting_location: '',
    description: '',
    guests: [],
    reminder: { value: 1, unit: 'Hour' },
    notification: 'email',
    active: true,
  };
}

export function EditMeetingScreen({
  schedule,
  draft,
  onSaved,
  onCancel,
}: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const isCreate = schedule === null;
  const [form, setForm] = useState<MeetingFormValues>(() =>
    schedule ? mapScheduleToForm(schedule) : { ...emptyForm(), ...draft },
  );
  const [showTimezoneModal, setShowTimezoneModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [newGuestEmail, setNewGuestEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const update = (patch: Partial<MeetingFormValues>) =>
    setForm(prev => ({ ...prev, ...patch }));

  const addGuest = () => {
    const found = newGuestEmail.match(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    );
    if (!found) {
      Alert.alert(
        t('MOBILE.COMMON.INVALID_EMAIL_TITLE'),
        t('AUTH.LOGIN.INVALID_EMAIL'),
      );
      return;
    }
    const existing = new Set(form.guests.map(g => g.email));
    const toAdd: ScheduleGuest[] = found
      .filter(email => !existing.has(email))
      .map(email => ({ email }));
    if (toAdd.length) {
      update({ guests: [...form.guests, ...toAdd] });
    }
    setNewGuestEmail('');
  };

  const removeGuest = (email: string) => {
    update({ guests: form.guests.filter(g => g.email !== email) });
  };

  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(form.schedule_date);
  const timeValid = /^([01]\d|2[0-3]):[0-5]\d$/.test(form.start_time);
  const isValid =
    !!form.title.trim() &&
    dateValid &&
    timeValid &&
    !!form.time_zone &&
    !!form.meeting_location;

  const handleSave = async () => {
    if (!isValid) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    try {
      if (isCreate) {
        await createMeeting(form);
      } else {
        await updateMeeting(schedule.id, form);
      }
      refreshMeetingReminders();
      onSaved();
    } catch (err: any) {
      Alert.alert(
        t('MOBILE.COMMON.SAVE_FAILED'),
        err?.message ?? t('AUTH.GENERIC_ERROR'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={onCancel} style={styles.back} hitSlop={8}>
        <Text style={styles.backText}>
          {'‹'} {t('SHELL.CANCEL')}
        </Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>
          {isCreate
            ? t('EVENT_MODAL.CREATE_MEETING')
            : t('EVENT_MODAL.EDIT_MEETING')}
        </Text>

        <Section label={t('MOBILE.FORM.TITLE')}>
          <TextInput
            style={styles.input}
            value={form.title}
            onChangeText={text => update({ title: text })}
            placeholder={t('EVENT_FORM.TITLE_PLACEHOLDER')}
          />
          {showErrors && !form.title.trim() && (
            <ErrorText text={t('EVENT_FORM.TITLE_REQUIRED')} />
          )}
        </Section>

        <Section label={t('EVENT_FORM.SCHEDULE_TYPE_LABEL')}>
          <PillRow
            options={EVENT_TYPES.map(o => ({
              value: o.value,
              label: t(o.labelKey),
            }))}
            selected={form.type}
            onSelect={value => update({ type: value })}
          />
        </Section>

        <View style={styles.row}>
          <Section label={t('MEETING_FORM.DATE_LABEL')} style={styles.rowItem}>
            <Pressable
              style={styles.timezoneButton}
              onPress={() => setShowDateModal(true)}
            >
              <Text style={styles.timezoneButtonText} numberOfLines={1}>
                {form.schedule_date ||
                  t('MEETING_FORM.CHOOSE_DATE_PLACEHOLDER')}
              </Text>
              <Text style={styles.chevron}>{'▾'}</Text>
            </Pressable>
          </Section>
          <Section
            label={t('MEETING_FORM.START_TIME_LABEL')}
            style={styles.rowItem}
          >
            <Pressable
              style={styles.timezoneButton}
              onPress={() => setShowTimeModal(true)}
            >
              <Text style={styles.timezoneButtonText} numberOfLines={1}>
                {form.start_time || t('MOBILE.PICKERS.SELECT_TIME')}
              </Text>
              <Text style={styles.chevron}>{'▾'}</Text>
            </Pressable>
          </Section>
        </View>
        {showErrors && (!dateValid || !timeValid) && (
          <ErrorText text={t('MOBILE.MEETING_FORM.DATE_TIME_REQUIRED')} />
        )}
        <Text style={styles.helperText}>
          {t('MOBILE.MEETING_FORM.TIME_ZONE_HINT')}
        </Text>

        <Section label={t('EVENT_FORM.DURATION_LABEL')}>
          <PillRow
            options={DURATION_OPTIONS.map(d => ({
              value: String(d.value),
              label: t(d.labelKey, { n: d.value }),
            }))}
            selected={String(form.duration_in_minutes)}
            onSelect={value => update({ duration_in_minutes: Number(value) })}
          />
        </Section>

        <Section label={t('EVENT_FORM.LOCATION_LABEL')}>
          <PillRow
            options={LOCATION_OPTIONS.map(l => ({ value: l, label: l }))}
            selected={form.meeting_location}
            onSelect={value => update({ meeting_location: value })}
          />
          {showErrors && !form.meeting_location && (
            <ErrorText text={t('EVENT_FORM.PLEASE_SELECT_LOCATION')} />
          )}
        </Section>

        <Section label={t('EVENT_FORM.TIME_ZONE_LABEL')}>
          <Pressable
            style={styles.timezoneButton}
            onPress={() => setShowTimezoneModal(true)}
          >
            <Text style={styles.timezoneButtonText} numberOfLines={1}>
              {form.time_zone || t('EVENT_FORM.SELECT_TIME_ZONE')}
            </Text>
            <Text style={styles.chevron}>{'▾'}</Text>
          </Pressable>
        </Section>

        <Section label={t('MOBILE.FORM.DESCRIPTION')}>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={form.description}
            onChangeText={text => update({ description: text })}
            placeholder={t('MOBILE.MEETING_FORM.DESCRIPTION_PLACEHOLDER')}
            multiline
          />
        </Section>

        <Section label={t('MOBILE.MEETING_FORM.REMINDER')}>
          <View style={styles.reminderRow}>
            <TextInput
              style={[styles.input, styles.reminderInput]}
              keyboardType="number-pad"
              value={String(form.reminder.value)}
              onChangeText={text =>
                update({
                  reminder: { ...form.reminder, value: Number(text) || 0 },
                })
              }
            />
            <View style={styles.reminderUnits}>
              <PillRow
                options={REMINDER_UNITS.map(u => ({
                  value: u,
                  label: t(REMINDER_UNIT_KEYS[u]),
                }))}
                selected={form.reminder.unit}
                onSelect={value =>
                  update({
                    reminder: {
                      ...form.reminder,
                      unit: value as MeetingFormValues['reminder']['unit'],
                    },
                  })
                }
              />
            </View>
          </View>
          <Text style={styles.sectionHelperText}>
            {t('MOBILE.MEETING_FORM.REMINDER_HINT')}
          </Text>
        </Section>

        <Section label={t('MOBILE.FORM.GUESTS')}>
          <View style={styles.guestInputRow}>
            <TextInput
              style={[styles.input, styles.guestInput]}
              value={newGuestEmail}
              onChangeText={setNewGuestEmail}
              placeholder="guest@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              onSubmitEditing={addGuest}
            />
            <Pressable style={styles.addGuestButton} onPress={addGuest}>
              <Text style={styles.addGuestButtonText}>
                {t('EVENT_FORM.ADD_BUTTON')}
              </Text>
            </Pressable>
          </View>
          {form.guests.map(guest => (
            <View key={guest.email} style={styles.guestChip}>
              <Text style={styles.guestChipText}>{guest.email}</Text>
              <Pressable onPress={() => removeGuest(guest.email)} hitSlop={8}>
                <Text style={styles.guestChipRemove}>{'✕'}</Text>
              </Pressable>
            </View>
          ))}
        </Section>

        <Section label={t('EVENT_FORM.NOTIFICATION_LABEL')}>
          <PillRow
            options={[
              { value: 'email', label: t('EVENT_FORM.EMAIL') },
              { value: 'slack', label: 'Slack' },
            ]}
            selected={form.notification}
            onSelect={value =>
              update({ notification: value as 'email' | 'slack' })
            }
          />
        </Section>

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={{ marginTop: 8 }}
        >
          <LinearGradient
            colors={gradients.primary}
            style={[styles.saveButton, saving && { opacity: 0.7 }]}
          >
            {saving ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.saveButtonText}>
                {isCreate
                  ? t('EVENT_MODAL.CREATE_MEETING')
                  : t('MOBILE.COMMON.SAVE_CHANGES')}
              </Text>
            )}
          </LinearGradient>
        </Pressable>
      </ScrollView>

      <TimezoneModal
        visible={showTimezoneModal}
        zones={TIMEZONES}
        selectedZone={form.time_zone}
        onSelect={zone => {
          update({ time_zone: zone });
          setShowTimezoneModal(false);
        }}
        onClose={() => setShowTimezoneModal(false)}
      />

      <DatePickerModal
        visible={showDateModal}
        value={form.schedule_date || null}
        onSelect={date => {
          update({ schedule_date: date });
          setShowDateModal(false);
        }}
        onClose={() => setShowDateModal(false)}
      />

      <ClockPickerModal
        visible={showTimeModal}
        title={t('MEETING_FORM.START_TIME_PLACEHOLDER')}
        value={form.start_time || null}
        onSelect={time => update({ start_time: time })}
        onClose={() => setShowTimeModal(false)}
      />
    </View>
  );
}

function Section({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: object;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.section, style]}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ErrorText({ text }: { text: string }) {
  const styles = useStyles();
  return <Text style={styles.errorText}>{text}</Text>;
}

function PillRow({
  options,
  selected,
  onSelect,
}: {
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.pillRow}>
      {options.map(opt => {
        const isSelected = opt.value === selected;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onSelect(opt.value)}
            style={[styles.pill, isSelected && styles.pillSelected]}
          >
            <Text
              style={[styles.pillText, isSelected && styles.pillTextSelected]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(c => ({
  container: {
    flex: 1,
    backgroundColor: c.surface,
  },
  back: {
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  backText: {
    color: c.primaryText,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: c.text,
    marginTop: 8,
    marginBottom: 16,
  },
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
    marginBottom: 8,
  },
  // Under a row of Sections, pulled up into the last one's bottom margin.
  helperText: {
    fontSize: 11.5,
    color: c.textMuted,
    marginTop: -10,
    marginBottom: 14,
  },
  // Inside a Section, below its input; the Section's margin follows.
  sectionHelperText: {
    fontSize: 11.5,
    color: c.textMuted,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: c.text,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  errorText: {
    color: c.danger,
    fontSize: 12,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rowItem: {
    flex: 1,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  pillSelected: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.text,
  },
  pillTextSelected: {
    color: c.onPrimary,
  },
  timezoneButton: {
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
  reminderRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  reminderInput: {
    width: 70,
  },
  reminderUnits: {
    flex: 1,
  },
  guestInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  guestInput: {
    flex: 1,
  },
  addGuestButton: {
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addGuestButtonText: {
    color: c.onPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  guestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.surfaceMuted,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  guestChipText: {
    fontSize: 13,
    color: c.text,
  },
  guestChipRemove: {
    color: c.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  saveButton: {
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  saveButtonText: {
    color: c.onPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
}));
