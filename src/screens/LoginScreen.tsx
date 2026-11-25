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
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { gradients, palette } from '../constants/colors';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import { GOOGLE_WEB_CLIENT_ID } from '../constants/env';
import { googleLogin, login } from '../api/auth';

GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });

interface Props {
  onSuccess: () => void;
  onSignUp: () => void;
  onForgotPassword: () => void;
}

export function LoginScreen({ onSuccess, onSignUp, onForgotPassword }: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const busy = loading || googleLoading;
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setError(t('MOBILE.AUTH.EMAIL_PASSWORD_REQUIRED'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      onSuccess();
    } catch (err: any) {
      setError(err?.message ?? t('AUTH.LOGIN.LOGIN_FAILED'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) {
        return; // user closed the account picker
      }
      const { idToken } = response.data;
      if (!idToken) {
        throw new Error(t('AUTH.LOGIN.GOOGLE_LOGIN_FAILED'));
      }
      await googleLogin(idToken);
      onSuccess();
    } catch (err: any) {
      if (isErrorWithCode(err)) {
        if (err.code === statusCodes.IN_PROGRESS) {
          return;
        }
        if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          setError(t('MOBILE.AUTH.PLAY_SERVICES_UNAVAILABLE'));
          return;
        }
      }
      setError(err?.message ?? t('AUTH.LOGIN.GOOGLE_LOGIN_FAILED'));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('MOBILE.AUTH.SIGN_IN')}</Text>
      <Text style={styles.subtitle}>{t('MOBILE.AUTH.SIGN_IN_SUBTITLE')}</Text>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('PROFILE.EDIT.EMAIL_LABEL')}</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('MOBILE.PROFILE.PASSWORD_LABEL')}</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder={t('MOBILE.PROFILE.PASSWORD_LABEL')}
        />
        <Pressable
          onPress={onForgotPassword}
          disabled={busy}
          hitSlop={8}
          style={styles.forgotLink}
        >
          <Text style={styles.footerLink}>
            {t('MOBILE.AUTH.FORGOT_PASSWORD_LINK')}
          </Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable onPress={handleSubmit} disabled={busy}>
        <LinearGradient
          colors={gradients.primary}
          style={[styles.button, loading && styles.dimmed]}
        >
          {loading ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.buttonText}>{t('MOBILE.AUTH.SIGN_IN')}</Text>
          )}
        </LinearGradient>
      </Pressable>

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t('AUTH.LOGIN.OR')}</Text>
        <View style={styles.dividerLine} />
      </View>

      <Pressable
        onPress={handleGoogle}
        disabled={busy}
        style={[styles.googleButton, googleLoading && styles.dimmed]}
      >
        {googleLoading ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <>
            <Text style={styles.googleG}>G</Text>
            <Text style={styles.googleText}>
              {t('AUTH.LOGIN.CONTINUE_WITH_GOOGLE')}
            </Text>
          </>
        )}
      </Pressable>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {t('AUTH.LOGIN.NO_ACCOUNT_PROMPT')}{' '}
        </Text>
        <Pressable onPress={onSignUp} disabled={busy} hitSlop={8}>
          <Text style={styles.footerLink}>{t('MOBILE.AUTH.SIGN_UP')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles(c => ({
  forgotLink: {
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
  },
  footerText: {
    fontSize: 13.5,
    color: c.textMuted,
  },
  footerLink: {
    fontSize: 13.5,
    fontWeight: '600',
    color: c.primaryText,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: c.surface,
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
    marginBottom: 24,
  },
  formGroup: {
    marginBottom: 16,
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
  buttonText: {
    color: c.onPrimary,
    fontWeight: '700',
    fontSize: 14.5,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: c.border,
  },
  dividerText: {
    fontSize: 12.5,
    color: c.textMuted,
  },
  googleButton: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: c.surface,
  },
  dimmed: {
    opacity: 0.7,
  },
  googleG: {
    fontSize: 17,
    fontWeight: '700',
    color: palette.google,
  },
  googleText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: c.text,
  },
}));
