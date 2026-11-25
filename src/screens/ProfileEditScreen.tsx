import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { gradients } from '../constants/colors';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import LinearGradient from 'react-native-linear-gradient';
import { launchImageLibrary } from 'react-native-image-picker';
import { Avatar } from '../components/Avatar';
import { TimePickerModal } from '../components/TimePickerModal';
import {
  updateCachedUserInfo,
  updateProfile,
  useUserInfo,
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_TYPES,
  uploadProfileImage,
} from '../api/profile';
import timezonesJson from '../assets/timezones.json';
import countriesJson from '../assets/countries.json';
import { LANGUAGES } from '../i18n';

const TIMEZONES: string[] = timezonesJson;
const COUNTRIES: string[] = countriesJson;

interface Props {
  onBack: () => void;
  onChangePassword: () => void;
}

interface FormState {
  name: string;
  time_zone: string;
  country: string;
  language: string;
}

export function ProfileEditScreen({ onBack, onChangePassword }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const userInfo = useUserInfo();
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [picker, setPicker] = useState<
    'timezone' | 'country' | 'language' | null
  >(null);

  useEffect(() => {
    if (userInfo && !form) {
      setForm({
        name: userInfo.name,
        time_zone: userInfo.time_zone,
        country: userInfo.country,
        language: userInfo.language,
      });
    }
  }, [userInfo, form]);

  const hasChanges =
    !!form &&
    !!userInfo &&
    (form.name !== userInfo.name ||
      form.time_zone !== userInfo.time_zone ||
      form.country !== userInfo.country ||
      form.language !== userInfo.language);

  // Uploads as soon as a photo is picked, like the web's onFileSelected —
  // the profile Save button doesn't need to be pressed for this.
  const changePhoto = async () => {
    // Downscaled by the picker: camera photos run well past the 2 MB limit,
    // and a 72dp avatar never needs more than ~1000px.
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      maxWidth: 1024,
      maxHeight: 1024,
      quality: 0.8,
    });
    if (result.didCancel) return;
    const asset = result.assets?.[0];
    if (result.errorCode || !asset?.uri) {
      Alert.alert(
        t('MOBILE.PROFILE.PHOTO_OPEN_FAILED'),
        result.errorMessage ?? t('MOBILE.PROFILE.PHOTO_TRY_ANOTHER'),
      );
      return;
    }
    const type = asset.type ?? 'image/jpeg';
    if (!PROFILE_IMAGE_TYPES.includes(type)) {
      Alert.alert(
        t('MOBILE.PROFILE.PHOTO_UNSUPPORTED'),
        t('MOBILE.PROFILE.PHOTO_USE_JPG_PNG'),
      );
      return;
    }
    if (asset.fileSize && asset.fileSize > PROFILE_IMAGE_MAX_BYTES) {
      Alert.alert(
        t('MOBILE.PROFILE.PHOTO_TOO_LARGE'),
        t('MOBILE.PROFILE.PHOTO_MAX_SIZE'),
      );
      return;
    }

    setUploadingPhoto(true);
    try {
      await uploadProfileImage({
        uri: asset.uri,
        type,
        name:
          asset.fileName ?? `profile.${type === 'image/png' ? 'png' : 'jpg'}`,
      });
    } catch (err: any) {
      Alert.alert(
        t('PROFILE.UPLOAD.FAILED'),
        err?.message ?? t('AUTH.GENERIC_ERROR'),
      );
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!form || !userInfo) return;
    setSaving(true);
    try {
      // Server's response omits profile_picture/subscription/integrations
      // — merge into the cached userInfo rather than replace it wholesale,
      // which also syncs every other mounted ProfileMenu/edit screen.
      const updated = await updateProfile(form);
      updateCachedUserInfo(updated);
    } catch (err: any) {
      Alert.alert(
        t('PROFILE.EDIT.UPDATE_FAILED'),
        err?.message ?? t('AUTH.GENERIC_ERROR'),
      );
    } finally {
      setSaving(false);
    }
  };

  if (!userInfo || !form) {
    return (
      <View style={styles.container}>
        <Pressable onPress={onBack} style={styles.back} hitSlop={8}>
          <Text style={styles.backText}>
            {'‹'} {t('MOBILE.COMMON.BACK')}
          </Text>
        </Pressable>
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.primaryText} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} style={styles.back} hitSlop={8}>
        <Text style={styles.backText}>
          {'‹'} {t('MOBILE.COMMON.BACK')}
        </Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>{t('PROFILE.EDIT.TITLE')}</Text>

        <View style={styles.avatarRow}>
          <Pressable onPress={changePhoto} disabled={uploadingPhoto}>
            <Avatar
              email={userInfo.email}
              imageUrl={userInfo.profile_picture}
              size={72}
            />
            {uploadingPhoto && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color={colors.onPrimary} />
              </View>
            )}
          </Pressable>
          <Pressable onPress={changePhoto} disabled={uploadingPhoto}>
            <Text style={styles.avatarChangeLink}>
              {uploadingPhoto
                ? t('MOBILE.PROFILE.UPLOADING')
                : t('MOBILE.PROFILE.CHANGE_PHOTO')}
            </Text>
          </Pressable>
        </View>

        <Section label={t('PROFILE.EDIT.NAME_LABEL')}>
          <TextInput
            style={styles.input}
            value={form.name}
            onChangeText={text =>
              setForm(prev => (prev ? { ...prev, name: text } : prev))
            }
          />
        </Section>

        <Section label={t('PROFILE.EDIT.EMAIL_LABEL')}>
          <View style={[styles.input, styles.inputReadonly]}>
            <Text style={styles.readonlyText}>{userInfo.email}</Text>
          </View>
        </Section>

        <Section label={t('MOBILE.PROFILE.PASSWORD_LABEL')}>
          <Pressable style={styles.secondaryButton} onPress={onChangePassword}>
            <Text style={styles.secondaryButtonText}>
              {t('PROFILE.EDIT.CHANGE_PASSWORD')}
            </Text>
          </Pressable>
        </Section>

        <Section label={t('PROFILE.EDIT.TIME_ZONE_LABEL')}>
          <Pressable
            style={styles.pickerButton}
            onPress={() => setPicker('timezone')}
          >
            <Text style={styles.pickerButtonText} numberOfLines={1}>
              {form.time_zone || t('PROFILE.EDIT.TIME_ZONE_PLACEHOLDER')}
            </Text>
            <Text style={styles.chevron}>{'▾'}</Text>
          </Pressable>
        </Section>

        <Section label={t('PROFILE.EDIT.COUNTRY_LABEL')}>
          <Pressable
            style={styles.pickerButton}
            onPress={() => setPicker('country')}
          >
            <Text style={styles.pickerButtonText} numberOfLines={1}>
              {form.country || t('PROFILE.EDIT.COUNTRY_PLACEHOLDER')}
            </Text>
            <Text style={styles.chevron}>{'▾'}</Text>
          </Pressable>
        </Section>

        <Section label={t('PROFILE.EDIT.LANGUAGE_LABEL')}>
          <Pressable
            style={styles.pickerButton}
            onPress={() => setPicker('language')}
          >
            <Text style={styles.pickerButtonText} numberOfLines={1}>
              {form.language || t('PROFILE.EDIT.LANGUAGE_PLACEHOLDER')}
            </Text>
            <Text style={styles.chevron}>{'▾'}</Text>
          </Pressable>
        </Section>

        <Pressable
          onPress={handleSave}
          disabled={saving || !hasChanges}
          style={{ marginTop: 8 }}
        >
          <LinearGradient
            colors={gradients.primary}
            style={[
              styles.saveButton,
              (saving || !hasChanges) && { opacity: 0.6 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.saveButtonText}>
                {t('MOBILE.COMMON.SAVE_CHANGES')}
              </Text>
            )}
          </LinearGradient>
        </Pressable>
      </ScrollView>

      <TimePickerModal
        visible={picker === 'timezone'}
        title={t('PROFILE.EDIT.TIME_ZONE_PLACEHOLDER')}
        options={TIMEZONES}
        selected={form.time_zone}
        onSelect={value => {
          setForm(prev => (prev ? { ...prev, time_zone: value } : prev));
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <TimePickerModal
        visible={picker === 'country'}
        title={t('PROFILE.EDIT.COUNTRY_PLACEHOLDER')}
        options={COUNTRIES}
        selected={form.country}
        onSelect={value => {
          setForm(prev => (prev ? { ...prev, country: value } : prev));
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <TimePickerModal
        visible={picker === 'language'}
        title={t('PROFILE.EDIT.LANGUAGE_PLACEHOLDER')}
        options={[...LANGUAGES]}
        selected={form.language}
        onSelect={value => {
          setForm(prev => (prev ? { ...prev, language: value } : prev));
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
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
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 48,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: c.text,
    marginBottom: 20,
  },
  avatarRow: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: 36,
    backgroundColor: c.imageOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarChangeLink: {
    color: c.primaryText,
    fontWeight: '600',
    fontSize: 13,
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
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: c.text,
  },
  inputReadonly: {
    backgroundColor: c.disabledSurface,
  },
  readonlyText: {
    fontSize: 14,
    color: c.textMuted,
  },
  secondaryButton: {
    height: 44,
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
  pickerButton: {
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
  pickerButtonText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: c.text,
  },
  chevron: {
    color: c.textMuted,
    fontSize: 12,
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
