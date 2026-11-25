import { useEffect, useMemo, useState } from 'react';
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
import { launchImageLibrary } from 'react-native-image-picker';

import { gradients } from '../constants/colors';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import { BRAND_ASSET_BASE } from '../constants/env';
import {
  BRAND_LOGO_MAX_BYTES,
  BRAND_LOGO_TYPES,
  createEvent,
  updateEvent,
  type EventFormValues,
  type EventGuest,
  type EventItem,
} from '../api/events';
import {
  getTeamMembers,
  getTeams,
  type Team,
  type TeamMember,
} from '../api/teams';
import { TimezoneModal } from '../components/TimezoneModal';
import timezonesJson from '../assets/timezones.json';

const TIMEZONES: string[] = timezonesJson;

// labelKey (and descriptionKey): the option's text in src/i18n.
const EVENT_TYPES = [
  { value: 'one-to-one', labelKey: 'EVENT_FORM.TYPE_ONE_TO_ONE' },
  { value: 'group', labelKey: 'EVENT_FORM.TYPE_GROUP' },
  { value: 'appointment', labelKey: 'EVENT_FORM.TYPE_APPOINTMENT' },
];

const DURATION_OPTIONS = [
  { value: 15, labelKey: 'MOBILE.DURATION.MINUTES' },
  { value: 30, labelKey: 'MOBILE.DURATION.MINUTES' },
  { value: 45, labelKey: 'MOBILE.DURATION.MINUTES' },
  { value: 60, labelKey: 'EVENT_FORM.DURATION_60' },
  { value: 120, labelKey: 'EVENT_FORM.DURATION_120' },
];

const LOCATION_OPTIONS = ['Google Meet', 'Zoom'];

const ASSIGNMENT_TYPES: {
  value: 'standard' | 'manual' | 'round_robin';
  labelKey: string;
  descriptionKey: string;
}[] = [
  {
    value: 'standard',
    labelKey: 'EVENT_FORM.ASSIGNMENT_STANDARD_LABEL',
    descriptionKey: 'EVENT_FORM.ASSIGNMENT_STANDARD_DESC',
  },
  {
    value: 'manual',
    labelKey: 'EVENT_FORM.ASSIGNMENT_MANUAL_LABEL',
    descriptionKey: 'EVENT_FORM.ASSIGNMENT_MANUAL_DESC',
  },
  {
    value: 'round_robin',
    labelKey: 'EVENT_FORM.ASSIGNMENT_ROUND_ROBIN_LABEL',
    descriptionKey: 'EVENT_FORM.ASSIGNMENT_ROUND_ROBIN_DESC',
  },
];

interface Props {
  event: EventItem | null;
  onSaved: () => void;
  onCancel: () => void;
}

function mapEventToForm(event: EventItem | null): EventFormValues {
  return {
    owner_type: event?.owner_type ?? 'user',
    owner_id: event?.owner_id ?? null,
    minimum_notice_minutes: event?.minimum_notice_minutes ?? 60,
    buffer_before_minutes: event?.buffer_before_minutes ?? 0,
    assignment_type: event?.assignment_type ?? 'standard',
    type: event?.event_type ?? 'one-to-one',
    title: event?.title ?? '',
    time_zone:
      event?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    slot_duration_minutes: event?.slot_duration_minutes
      ? Number(event.slot_duration_minutes)
      : 30,
    meeting_location: event?.meeting_location ?? '',
    description: event?.description ?? '',
    brand_name: event?.brand_name ?? '',
    brand_logo: null,
    host_ids: (event?.hosts || event?.host_ids || []).map(h =>
      typeof h === 'object' ? h.id : h,
    ),
    guests: event?.guest_emails
      ? event.guest_emails.map(email => ({ email }))
      : (event?.guests || []).map(g => ({ email: g.email })),
    notification: event?.notification ?? 'email',
  };
}

export function EditEventScreen({ event, onSaved, onCancel }: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const isCreate = event === null;
  const [form, setForm] = useState<EventFormValues>(() =>
    mapEventToForm(event),
  );
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showTimezoneModal, setShowTimezoneModal] = useState(false);
  const [newGuestEmail, setNewGuestEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    getTeams()
      .then(setTeams)
      .catch(err => console.error('Failed to load teams', err));
  }, []);

  useEffect(() => {
    if (form.owner_type === 'team' && form.owner_id) {
      getTeamMembers(form.owner_id)
        .then(team => setTeamMembers(team.members))
        .catch(err => console.error('Failed to load team members', err));
    } else {
      setTeamMembers([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.owner_id]);

  const selectedTeamName = useMemo(
    () => teams.find(team => team.id === form.owner_id)?.name ?? null,
    [teams, form.owner_id],
  );

  const update = (patch: Partial<EventFormValues>) =>
    setForm(prev => ({ ...prev, ...patch }));

  const selectOwner = (team: Team | null) => {
    if (!team) {
      update({
        owner_type: 'user',
        owner_id: null,
        assignment_type: 'standard',
        host_ids: [],
      });
    } else {
      update({
        owner_type: 'team',
        owner_id: team.id,
        assignment_type: 'manual',
      });
    }
  };

  const toggleHost = (member: TeamMember) => {
    const exists = form.host_ids.includes(member.id);
    update({
      host_ids: exists
        ? form.host_ids.filter(id => id !== member.id)
        : [...form.host_ids, member.id],
    });
  };

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
    const toAdd: EventGuest[] = found
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

  const isValid =
    !!form.title.trim() &&
    !!form.slot_duration_minutes &&
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
        await createEvent(form);
      } else {
        await updateEvent(event.ulid, form);
      }
      onSaved();
    } catch (err: any) {
      Alert.alert(
        isCreate
          ? t('MOBILE.EVENT_FORM.CREATE_FAILED')
          : t('MOBILE.COMMON.SAVE_FAILED'),
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
            ? t('EVENT_MODAL.CREATE_EVENT')
            : t('EVENT_MODAL.EDIT_EVENT')}
        </Text>

        <Section label={t('EVENT_FORM.TITLE_LABEL')}>
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

        <Section label={t('EVENT_FORM.DURATION_LABEL')}>
          <PillRow
            options={DURATION_OPTIONS.map(d => ({
              value: String(d.value),
              label: t(d.labelKey, { n: d.value }),
            }))}
            selected={String(form.slot_duration_minutes)}
            onSelect={value => update({ slot_duration_minutes: Number(value) })}
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
            placeholder={t('MOBILE.EVENT_FORM.DESCRIPTION_PLACEHOLDER')}
            multiline
          />
        </Section>

        <Section label={t('EVENT_FORM.HOSTED_BY_LABEL')}>
          {teams.length === 0 ? (
            <Text style={styles.helperText}>
              {t('MOBILE.EVENT_FORM.NO_TEAMS')}
            </Text>
          ) : (
            <PillRow
              options={[
                { value: '__user__', label: t('EVENT_FORM.HOST_ME') },
                ...teams.map(team => ({ value: team.id, label: team.name })),
              ]}
              selected={
                form.owner_type === 'user' ? '__user__' : form.owner_id ?? ''
              }
              onSelect={value =>
                selectOwner(
                  value === '__user__'
                    ? null
                    : teams.find(team => team.id === value) ?? null,
                )
              }
            />
          )}
        </Section>

        {form.owner_type === 'team' && (
          <Section
            label={`${t('EVENT_FORM.ASSIGNMENT_TYPE_LABEL')}${
              selectedTeamName ? ` (${selectedTeamName})` : ''
            }`}
          >
            {ASSIGNMENT_TYPES.map(opt => {
              const selected = form.assignment_type === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.assignmentCard,
                    selected && styles.assignmentCardSelected,
                  ]}
                  onPress={() => update({ assignment_type: opt.value })}
                >
                  <Text
                    style={[
                      styles.assignmentLabel,
                      selected && styles.assignmentLabelSelected,
                    ]}
                  >
                    {t(opt.labelKey)}
                  </Text>
                  <Text style={styles.assignmentDesc}>
                    {t(opt.descriptionKey)}
                  </Text>
                </Pressable>
              );
            })}

            {form.assignment_type === 'manual' && (
              <View style={styles.hostsWrap}>
                <Text style={styles.subLabel}>
                  {t('EVENT_FORM.ALLOWED_HOSTS_LABEL')}
                </Text>
                {teamMembers.length === 0 ? (
                  <Text style={styles.helperText}>
                    {t('MOBILE.EVENT_FORM.NO_MEMBERS')}
                  </Text>
                ) : (
                  teamMembers.map(member => {
                    const checked = form.host_ids.includes(member.id);
                    return (
                      <Pressable
                        key={member.id}
                        style={styles.memberRow}
                        onPress={() => toggleHost(member)}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            checked && styles.checkboxChecked,
                          ]}
                        >
                          {checked && (
                            <Text style={styles.checkboxMark}>{'✓'}</Text>
                          )}
                        </View>
                        <Text style={styles.memberName}>{member.name}</Text>
                      </Pressable>
                    );
                  })
                )}
              </View>
            )}
          </Section>
        )}

        <Section label={t('EVENT_FORM.MIN_NOTICE_LABEL')}>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={String(form.minimum_notice_minutes)}
            onChangeText={text =>
              update({ minimum_notice_minutes: Number(text) || 0 })
            }
          />
        </Section>

        <Section label={t('EVENT_FORM.BUFFER_BEFORE_LABEL')}>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={String(form.buffer_before_minutes)}
            onChangeText={text =>
              update({ buffer_before_minutes: Number(text) || 0 })
            }
          />
        </Section>

        <Section label={t('EVENT_FORM.BRAND_NAME_LABEL')}>
          <TextInput
            style={styles.input}
            value={form.brand_name}
            onChangeText={text => update({ brand_name: text })}
            placeholder={t('MOBILE.EVENT_FORM.BRAND_NAME_PLACEHOLDER')}
          />
        </Section>

        <Section label={t('EVENT_FORM.BRAND_LOGO_LABEL')}>
          <BrandLogoPicker
            savedLogoPath={event?.brand_logo ?? null}
            picked={form.brand_logo}
            onPick={file => update({ brand_logo: file })}
            onDiscard={() => update({ brand_logo: null })}
          />
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
                  ? t('EVENT_MODAL.CREATE_EVENT')
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
    </View>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
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

// Mirrors the web form's brand logo field (onBrandLogoSelected): pick an
// image, preview it, and send it with the rest of the form on Save.
function BrandLogoPicker({
  savedLogoPath,
  picked,
  onPick,
  onDiscard,
}: {
  savedLogoPath: string | null;
  picked: EventFormValues['brand_logo'];
  onPick: (file: NonNullable<EventFormValues['brand_logo']>) => void;
  onDiscard: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const savedUri = savedLogoPath
    ? `${BRAND_ASSET_BASE}${savedLogoPath.replace(/^\/+/, '')}`
    : null;
  const previewUri = picked?.uri ?? savedUri;

  const choose = async () => {
    // Phone photos are megabytes, far over the 200 KB limit, so let the
    // picker downscale — a logo never needs more than a few hundred px.
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      maxWidth: 512,
      maxHeight: 512,
      quality: 0.8,
    });
    if (result.didCancel) return;
    const asset = result.assets?.[0];
    if (result.errorCode || !asset?.uri) {
      Alert.alert(
        t('MOBILE.REPORT_ISSUE.IMAGE_OPEN_FAILED'),
        result.errorMessage ?? t('MOBILE.PROFILE.PHOTO_TRY_ANOTHER'),
      );
      return;
    }
    const type = asset.type ?? 'image/jpeg';
    if (!BRAND_LOGO_TYPES.includes(type)) {
      Alert.alert(
        t('MOBILE.REPORT_ISSUE.IMAGE_UNSUPPORTED'),
        t('MOBILE.EVENT_FORM.LOGO_TYPES'),
      );
      return;
    }
    if (asset.fileSize && asset.fileSize > BRAND_LOGO_MAX_BYTES) {
      Alert.alert(
        t('MOBILE.REPORT_ISSUE.IMAGE_TOO_LARGE'),
        t('MOBILE.EVENT_FORM.LOGO_MAX_SIZE'),
      );
      return;
    }
    onPick({
      uri: asset.uri,
      type,
      name: asset.fileName ?? `brand-logo.${type.split('/')[1] ?? 'jpg'}`,
    });
  };

  return (
    <View style={styles.logoRow}>
      <View style={styles.logoPreview}>
        {previewUri ? (
          <Image
            source={{ uri: previewUri }}
            style={styles.logoImage}
            resizeMode="contain"
          />
        ) : (
          <Text style={styles.logoPlaceholder}>
            {t('MOBILE.EVENT_FORM.NO_LOGO')}
          </Text>
        )}
      </View>
      <View style={styles.logoActions}>
        <Pressable style={styles.logoButton} onPress={choose}>
          <Text style={styles.logoButtonText}>
            {previewUri
              ? t('MOBILE.EVENT_FORM.CHANGE_IMAGE')
              : t('MOBILE.EVENT_FORM.CHOOSE_IMAGE')}
          </Text>
        </Pressable>
        {picked ? (
          // Only an unsaved pick can be undone: the API replaces a logo
          // when a file is sent but has no way to delete one.
          <Pressable onPress={onDiscard} hitSlop={6}>
            <Text style={styles.logoDiscardText}>
              {savedUri ? t('MOBILE.EVENT_FORM.KEEP_LOGO') : t('TEAM.REMOVE')}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.helperText}>
            {t('MOBILE.EVENT_FORM.LOGO_HINT')}
          </Text>
        )}
      </View>
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
  subLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: c.text,
    marginTop: 12,
    marginBottom: 8,
  },
  helperText: {
    fontSize: 12.5,
    color: c.textMuted,
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
    marginTop: 4,
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
  assignmentCard: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  assignmentCardSelected: {
    borderColor: c.primary,
    backgroundColor: c.surfaceTint,
  },
  assignmentLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: c.text,
  },
  assignmentLabelSelected: {
    color: c.primaryText,
  },
  assignmentDesc: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: 2,
  },
  hostsWrap: {
    marginTop: 4,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  checkboxMark: {
    color: c.onPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  memberName: {
    fontSize: 13.5,
    color: c.text,
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
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  logoPreview: {
    width: 72,
    height: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoPlaceholder: {
    fontSize: 11,
    color: c.textMuted,
  },
  logoActions: {
    flex: 1,
    gap: 8,
    alignItems: 'flex-start',
  },
  logoButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.borderStrong,
  },
  logoButtonText: {
    color: c.primaryText,
    fontWeight: '600',
    fontSize: 13,
  },
  logoDiscardText: {
    color: c.danger,
    fontWeight: '600',
    fontSize: 12.5,
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
