import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { launchImageLibrary } from 'react-native-image-picker';
import { gradients } from '../constants/colors';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import {
  ISSUE_ATTACHMENT_MAX_BYTES,
  ISSUE_ATTACHMENT_TYPES,
  ISSUE_DESCRIPTION_MAX,
  ISSUE_MODULES,
  ISSUE_STEPS_MAX,
  ISSUE_TITLE_MAX,
  ISSUE_TYPES,
  reportIssue,
  type IssueModule,
  type IssueType,
} from '../api/issues';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface Attachment {
  uri: string;
  name: string;
  type: string;
}

export function ReportIssueModal({ visible, onClose }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<IssueType | null>(null);
  const [module, setModule] = useState<IssueModule | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setType(null);
    setModule(null);
    setTitle('');
    setDescription('');
    setSteps('');
    setAttachment(null);
    setSubmitted(false);
  };

  const dirty =
    type !== null ||
    module !== null ||
    title !== '' ||
    description !== '' ||
    steps !== '' ||
    attachment !== null;

  const close = () => {
    if (submitting) return;
    if (!dirty) {
      onClose();
      return;
    }
    Alert.alert(
      t('MOBILE.REPORT_ISSUE.DISCARD_TITLE'),
      t('MOBILE.REPORT_ISSUE.DISCARD_MESSAGE'),
      [
        { text: t('MOBILE.COMMON.KEEP_EDITING'), style: 'cancel' },
        {
          text: t('MOBILE.COMMON.DISCARD'),
          style: 'destructive',
          onPress: () => {
            reset();
            onClose();
          },
        },
      ],
    );
  };

  const pickScreenshot = async () => {
    // Downscaled by the picker: a full-resolution phone screenshot can
    // pass the 3 MB limit, and 1600px is plenty to read one.
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      maxWidth: 1600,
      maxHeight: 1600,
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
    const assetType = asset.type ?? 'image/jpeg';
    if (!ISSUE_ATTACHMENT_TYPES.includes(assetType)) {
      Alert.alert(
        t('MOBILE.REPORT_ISSUE.IMAGE_UNSUPPORTED'),
        t('MOBILE.REPORT_ISSUE.IMAGE_TYPES'),
      );
      return;
    }
    if (asset.fileSize && asset.fileSize > ISSUE_ATTACHMENT_MAX_BYTES) {
      Alert.alert(
        t('MOBILE.REPORT_ISSUE.IMAGE_TOO_LARGE'),
        t('MOBILE.REPORT_ISSUE.IMAGE_MAX_SIZE'),
      );
      return;
    }
    setAttachment({
      uri: asset.uri,
      type: assetType,
      name: asset.fileName ?? `screenshot.${assetType.split('/')[1]}`,
    });
  };

  const errors = {
    type: type === null ? t('REPORT_ISSUE_FORM.ISSUE_TYPE_REQUIRED') : null,
    module: module === null ? t('REPORT_ISSUE_FORM.MODULE_REQUIRED') : null,
    title: title.trim() === '' ? t('REPORT_ISSUE_FORM.TITLE_REQUIRED') : null,
    description:
      description.trim() === ''
        ? t('REPORT_ISSUE_FORM.DESCRIPTION_REQUIRED')
        : null,
  };
  const valid = Object.values(errors).every(e => e === null);

  const submit = async () => {
    setSubmitted(true);
    if (!valid || !type || !module || submitting) return;
    setSubmitting(true);
    try {
      await reportIssue({
        type,
        module,
        title: title.trim(),
        description: description.trim(),
        stepsToReproduce: steps.trim(),
        attachment,
      });
      reset();
      onClose();
      Alert.alert(
        t('MOBILE.REPORT_ISSUE.THANKS'),
        t('REPORT_ISSUE_FORM.SUBMIT_SUCCESS'),
      );
    } catch (err: any) {
      Alert.alert(
        t('REPORT_ISSUE_FORM.SUBMIT_FAILED'),
        err?.message ?? t('AUTH.GENERIC_ERROR'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const shown = (error: string | null) =>
    submitted && error ? <Text style={styles.error}>{error}</Text> : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <KeyboardAvoidingView
        behavior="padding"
        style={[
          styles.root,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <View style={styles.header}>
          <Pressable onPress={close} hitSlop={8} disabled={submitting}>
            <Text style={styles.cancel}>{t('SHELL.CANCEL')}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{t('REPORT_ISSUE_FORM.TITLE')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.subtitle}>{t('REPORT_ISSUE_FORM.SUBTITLE')}</Text>

          <Text style={styles.label}>
            {t('REPORT_ISSUE_FORM.ISSUE_TYPE_LABEL')}
          </Text>
          <ChipGroup options={ISSUE_TYPES} value={type} onChange={setType} />
          {shown(errors.type)}

          <Text style={styles.label}>
            {t('REPORT_ISSUE_FORM.MODULE_LABEL')}
          </Text>
          <ChipGroup
            options={ISSUE_MODULES}
            value={module}
            onChange={setModule}
          />
          {shown(errors.module)}

          <Text style={styles.label}>{t('REPORT_ISSUE_FORM.TITLE_LABEL')}</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            maxLength={ISSUE_TITLE_MAX}
            placeholder={t('REPORT_ISSUE_FORM.TITLE_PLACEHOLDER')}
            placeholderTextColor={colors.textMuted}
          />
          {shown(errors.title)}

          <Text style={styles.label}>
            {t('REPORT_ISSUE_FORM.DESCRIPTION_LABEL')}
          </Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            maxLength={ISSUE_DESCRIPTION_MAX}
            multiline
            textAlignVertical="top"
            placeholder={t('REPORT_ISSUE_FORM.DESCRIPTION_PLACEHOLDER')}
            placeholderTextColor={colors.textMuted}
          />
          {shown(errors.description)}

          <Text style={styles.label}>{t('REPORT_ISSUE_FORM.STEPS_LABEL')}</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={steps}
            onChangeText={setSteps}
            maxLength={ISSUE_STEPS_MAX}
            multiline
            textAlignVertical="top"
            placeholder={t('MOBILE.REPORT_ISSUE.STEPS_PLACEHOLDER')}
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>
            {t('REPORT_ISSUE_FORM.SCREENSHOT_LABEL')}
          </Text>
          {attachment ? (
            <View style={styles.attachmentRow}>
              <Image
                source={{ uri: attachment.uri }}
                style={styles.thumbnail}
              />
              <View style={styles.attachmentActions}>
                <Pressable onPress={pickScreenshot} hitSlop={6}>
                  <Text style={styles.link}>{t('MOBILE.COMMON.REPLACE')}</Text>
                </Pressable>
                <Pressable onPress={() => setAttachment(null)} hitSlop={6}>
                  <Text style={[styles.link, styles.removeLink]}>
                    {t('TEAM.REMOVE')}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={pickScreenshot} style={styles.attachButton}>
              <Text style={styles.link}>
                {t('MOBILE.REPORT_ISSUE.ADD_SCREENSHOT')}
              </Text>
            </Pressable>
          )}

          <Pressable onPress={submit} disabled={submitting}>
            <LinearGradient
              colors={gradients.primary}
              style={[styles.button, submitting && styles.dimmed]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.buttonText}>
                  {t('REPORT_ISSUE_FORM.SUBMIT_REPORT')}
                </Text>
              )}
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ChipGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; labelKey: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.chips}>
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text
              style={[styles.chipText, selected && styles.chipTextSelected]}
            >
              {t(option.labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(c => ({
  root: {
    flex: 1,
    backgroundColor: c.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSoft,
  },
  cancel: {
    color: c.primaryText,
    fontWeight: '600',
    fontSize: 14,
    minWidth: 56,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: c.text,
  },
  // Balances the Cancel button so the title stays centred.
  headerSpacer: {
    minWidth: 56,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  subtitle: {
    fontSize: 13.5,
    color: c.textMuted,
    lineHeight: 20,
    marginBottom: 8,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '600',
    color: c.text,
    marginTop: 16,
    marginBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
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
    minHeight: 100,
  },
  error: {
    color: c.danger,
    fontSize: 12.5,
    marginTop: 6,
  },
  attachButton: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: c.borderStrong,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: c.surfaceMuted,
  },
  attachmentActions: {
    gap: 10,
  },
  link: {
    color: c.primaryText,
    fontWeight: '600',
    fontSize: 13.5,
  },
  removeLink: {
    color: c.danger,
  },
  button: {
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  dimmed: {
    opacity: 0.7,
  },
  buttonText: {
    color: c.onPrimary,
    fontWeight: '700',
    fontSize: 14.5,
  },
}));
