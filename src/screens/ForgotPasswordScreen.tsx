import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { gradients } from '../constants/colors';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import { requestPasswordReset } from '../api/auth';

interface Props {
  onBack: () => void;
}

// Mirrors calbook's /forgot-password page: ask for the email, send the
// reset link. The link itself opens in the browser (see
// requestPasswordReset), so this screen's job ends at "check your email".
export function ForgotPasswordScreen({ onBack }: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setError(t('AUTH.LOGIN.INVALID_EMAIL'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(trimmed);
      setSentTo(trimmed);
    } catch (err: any) {
      setError(err?.message ?? t('AUTH.GENERIC_ERROR'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} style={styles.back} hitSlop={8}>
        <Text style={styles.backText}>
          {'‹'} {t('MOBILE.AUTH.BACK_TO_SIGN_IN')}
        </Text>
      </Pressable>

      {sentTo ? (
        <>
          <Text style={styles.title}>{t('MOBILE.AUTH.CHECK_EMAIL_TITLE')}</Text>
          <Text style={styles.subtitle}>
            {t('MOBILE.AUTH.RESET_LINK_SENT', { email: sentTo })}
          </Text>
          <Text style={styles.note}>{t('MOBILE.AUTH.RESET_LINK_NOTE')}</Text>

          <Pressable onPress={onBack}>
            <LinearGradient colors={gradients.primary} style={styles.button}>
              <Text style={styles.buttonText}>
                {t('MOBILE.AUTH.BACK_TO_SIGN_IN')}
              </Text>
            </LinearGradient>
          </Pressable>
          <Pressable
            onPress={send}
            disabled={loading}
            hitSlop={8}
            style={styles.resend}
          >
            <Text style={styles.link}>
              {loading
                ? t('AUTH.FORGOT_PASSWORD.SENDING')
                : t('MOBILE.AUTH.SEND_LINK_AGAIN')}
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.title}>{t('MOBILE.AUTH.RESET_TITLE')}</Text>
          <Text style={styles.subtitle}>{t('MOBILE.AUTH.RESET_SUBTITLE')}</Text>

          <Text style={styles.label}>{t('PROFILE.EDIT.EMAIL_LABEL')}</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={send}
            placeholder="you@example.com"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable onPress={send} disabled={loading}>
            <LinearGradient
              colors={gradients.primary}
              style={[styles.button, loading && styles.dimmed]}
            >
              {loading ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.buttonText}>
                  {t('AUTH.FORGOT_PASSWORD.SEND_LINK')}
                </Text>
              )}
            </LinearGradient>
          </Pressable>
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles(c => ({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: c.surface,
  },
  back: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
  },
  backText: {
    color: c.primaryText,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: c.text,
    marginTop: 12,
  },
  subtitle: {
    fontSize: 13.5,
    color: c.textMuted,
    lineHeight: 20,
    marginTop: 4,
    marginBottom: 24,
  },
  note: {
    fontSize: 12.5,
    color: c.textMuted,
    lineHeight: 18,
    marginBottom: 24,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '600',
    color: c.text,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: c.text,
    marginBottom: 16,
  },
  error: {
    color: c.danger,
    fontSize: 13,
    marginBottom: 12,
  },
  button: {
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  dimmed: {
    opacity: 0.7,
  },
  buttonText: {
    color: c.onPrimary,
    fontWeight: '700',
    fontSize: 14.5,
  },
  resend: {
    alignSelf: 'center',
    marginTop: 20,
  },
  link: {
    color: c.primaryText,
    fontWeight: '600',
    fontSize: 13.5,
  },
}));
