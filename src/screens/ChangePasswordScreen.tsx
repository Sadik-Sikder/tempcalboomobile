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
import { gradients } from '../constants/colors';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import LinearGradient from 'react-native-linear-gradient';
import { changePassword } from '../api/profile';

interface Props {
  onBack: () => void;
  onChanged: () => void;
}

export function ChangePasswordScreen({ onBack, onChanged }: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const isValid =
    !!oldPassword && newPassword.length >= 8 && newPassword === confirmPassword;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      await changePassword(oldPassword, newPassword);
      Alert.alert(
        t('MOBILE.AUTH.PASSWORD_UPDATED_TITLE'),
        t('AUTH.UPDATE_PASSWORD.SUCCESS'),
        [{ text: t('MOBILE.COMMON.OK'), onPress: onChanged }],
      );
    } catch (err: any) {
      Alert.alert(
        t('MOBILE.AUTH.PASSWORD_UPDATE_FAILED'),
        err?.message ?? t('AUTH.GENERIC_ERROR'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} style={styles.back} hitSlop={8}>
        <Text style={styles.backText}>
          {'‹'} {t('SHELL.CANCEL')}
        </Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>{t('PROFILE.EDIT.CHANGE_PASSWORD')}</Text>

        <Section label={t('AUTH.UPDATE_PASSWORD.OLD_PASSWORD_PLACEHOLDER')}>
          <TextInput
            style={styles.input}
            value={oldPassword}
            onChangeText={setOldPassword}
            secureTextEntry
            autoCapitalize="none"
          />
        </Section>

        <Section label={t('AUTH.NEW_PASSWORD_PLACEHOLDER')}>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          {!!newPassword && newPassword.length < 8 && (
            <Text style={styles.errorText}>
              {t('AUTH.VALIDATION.PASSWORD_MIN_LENGTH')}
            </Text>
          )}
        </Section>

        <Section label={t('AUTH.CONFIRM_PASSWORD_PLACEHOLDER')}>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          {!!confirmPassword && confirmPassword !== newPassword && (
            <Text style={styles.errorText}>
              {t('AUTH.VALIDATION.PASSWORDS_MISMATCH')}
            </Text>
          )}
        </Section>

        <Pressable
          onPress={handleSubmit}
          disabled={saving || !isValid}
          style={{ marginTop: 8 }}
        >
          <LinearGradient
            colors={gradients.primary}
            style={[
              styles.saveButton,
              (saving || !isValid) && { opacity: 0.6 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.saveButtonText}>
                {t('AUTH.UPDATE_PASSWORD.UPDATE')}
              </Text>
            )}
          </LinearGradient>
        </Pressable>
      </ScrollView>
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
  errorText: {
    color: c.danger,
    fontSize: 11.5,
    marginTop: 6,
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
