import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { gradients } from '../constants/colors';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import { resetPassword } from '../api/auth';

interface Props {
  token?: string;
  email?: string;
  onDone: () => void;
  onClose: () => void;
}

// Mirrors calbook's /reset-password page, opened from the password reset
// email (AppServiceProvider's ResetPassword::createUrlUsing puts the token
// and email in the link's query string).
export function ResetPasswordScreen({ token, email, onDone, onClose }: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkComplete = !!token && !!email;
  const valid = password.length >= 8 && password === confirm;

  const submit = async () => {
    if (!token || !email || !valid) return;
    setSaving(true);
    setError(null);
    try {
      await resetPassword({ token, email, password });
      onDone();
    } catch (err: any) {
      // e.g. "This password reset token is invalid." for a used or
      // expired link.
      setError(err?.message ?? t('AUTH.GENERIC_ERROR'));
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={onClose} style={styles.back} hitSlop={8}>
        <Text style={styles.backText}>
          {'‹'} {t('SHELL.CANCEL')}
        </Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t('MOBILE.AUTH.CHOOSE_NEW_PASSWORD')}</Text>

        {!linkComplete ? (
          <Text style={styles.error}>
            {t('MOBILE.AUTH.RESET_LINK_INCOMPLETE')}
          </Text>
        ) : (
          <>
            <Text style={styles.subtitle}>
              {t('MOBILE.AUTH.FOR_EMAIL', { email })}
            </Text>

            <Text style={styles.label}>
              {t('AUTH.NEW_PASSWORD_PLACEHOLDER')}
            </Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
            />
            {!!password && password.length < 8 && (
              <Text style={styles.hint}>
                {t('AUTH.VALIDATION.PASSWORD_MIN_LENGTH')}
              </Text>
            )}

            <Text style={styles.label}>
              {t('AUTH.CONFIRM_PASSWORD_PLACEHOLDER')}
            </Text>
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              onSubmitEditing={submit}
            />
            {!!confirm && confirm !== password && (
              <Text style={styles.hint}>
                {t('AUTH.VALIDATION.PASSWORDS_MISMATCH')}
              </Text>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable onPress={submit} disabled={saving || !valid}>
              <LinearGradient
                colors={gradients.primary}
                style={[styles.button, (saving || !valid) && styles.dimmed]}
              >
                {saving ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={styles.buttonText}>
                    {t('AUTH.RESET_PASSWORD.SUBMIT')}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>
          </>
        )}
      </ScrollView>
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
    paddingBottom: 10,
  },
  backText: {
    color: c.primaryText,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: c.text,
  },
  subtitle: {
    fontSize: 13.5,
    color: c.textMuted,
    marginTop: 4,
    marginBottom: 20,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '600',
    color: c.text,
    marginBottom: 6,
    marginTop: 12,
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
  hint: {
    color: c.danger,
    fontSize: 12.5,
    marginTop: 6,
  },
  error: {
    color: c.danger,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 16,
  },
  button: {
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  buttonText: {
    color: c.onPrimary,
    fontWeight: '700',
    fontSize: 14.5,
  },
  dimmed: {
    opacity: 0.6,
  },
}));
