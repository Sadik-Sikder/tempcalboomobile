import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { gradients } from '../constants/colors';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import { register, sendSignupCode, verifySignupCode } from '../api/auth';

interface Props {
  onSuccess: () => void;
  onSignIn: () => void;
}

const WEB_BASE = 'https://calbook.zecodeek-it.com';

// Two steps, same API calls as calbook's signup (auth.service.ts):
// 'details' collects everything /register needs and emails a code; 'code'
// verifies it and registers in one go, which also signs the user in.
type Step = 'details' | 'code';

export function SignupScreen({ onSuccess, onSignIn }: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>('details');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const trimmedEmail = email.trim().toLowerCase();

  const validateDetails = (): string | null => {
    if (!name.trim()) return t('AUTH.LOGIN.USERNAME_REQUIRED');
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      return t('AUTH.LOGIN.INVALID_EMAIL');
    }
    if (password.length < 8) return t('AUTH.LOGIN.PASSWORD_MIN_LENGTH');
    if (password !== confirmPassword) {
      return t('AUTH.VALIDATION.PASSWORDS_MISMATCH');
    }
    if (!termsAccepted) return t('AUTH.LOGIN.TERMS_REQUIRED');
    return null;
  };

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await action();
    } catch (err: any) {
      setError(err?.message ?? t('AUTH.GENERIC_ERROR'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = () => {
    const problem = validateDetails();
    if (problem) {
      setError(problem);
      return;
    }
    run(async () => {
      await sendSignupCode(trimmedEmail);
      setCode('');
      setStep('code');
    });
  };

  const handleResend = () =>
    run(async () => {
      await sendSignupCode(trimmedEmail);
      setInfo(t('AUTH.LOGIN.CODE_RESENT'));
    });

  const handleVerify = () => {
    if (!/^\d{6}$/.test(code)) {
      setError(t('AUTH.LOGIN.CODE_REQUIRED'));
      return;
    }
    run(async () => {
      await verifySignupCode(trimmedEmail, code);
      await register({ name: name.trim(), email: trimmedEmail, password });
      onSuccess();
    });
  };

  const primaryButton = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} disabled={loading}>
      <LinearGradient
        colors={gradients.primary}
        style={[styles.button, loading && styles.dimmed]}
      >
        {loading ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.buttonText}>{label}</Text>
        )}
      </LinearGradient>
    </Pressable>
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {step === 'details' ? (
        <>
          <Text style={styles.title}>
            {t('MOBILE.AUTH.CREATE_ACCOUNT_TITLE')}
          </Text>
          <Text style={styles.subtitle}>
            {t('MOBILE.AUTH.SIGNUP_SUBTITLE')}
          </Text>

          <Field label={t('PROFILE.EDIT.NAME_LABEL')}>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t('AUTH.LOGIN.FULL_NAME_PLACEHOLDER')}
              autoComplete="name"
            />
          </Field>

          <Field label={t('PROFILE.EDIT.EMAIL_LABEL')}>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
            />
          </Field>

          <Field label={t('MOBILE.PROFILE.PASSWORD_LABEL')}>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder={t('MOBILE.AUTH.PASSWORD_HINT')}
            />
          </Field>

          <Field label={t('MOBILE.AUTH.CONFIRM_PASSWORD')}>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={t('AUTH.LOGIN.CONFIRM_PASSWORD_PLACEHOLDER')}
            />
          </Field>

          <Pressable
            style={styles.termsRow}
            onPress={() => setTermsAccepted(v => !v)}
            hitSlop={6}
          >
            <View style={[styles.checkbox, termsAccepted && styles.checked]}>
              {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.termsText}>
              {t('AUTH.LOGIN.TERMS_AGREEMENT_PREFIX')}{' '}
              <Text
                style={styles.link}
                onPress={() => Linking.openURL(`${WEB_BASE}/terms`)}
              >
                {t('AUTH.LOGIN.TERMS_OF_SERVICE')}
              </Text>{' '}
              {t('AUTH.LOGIN.TERMS_AGREEMENT_AND')}{' '}
              <Text
                style={styles.link}
                onPress={() => Linking.openURL(`${WEB_BASE}/privacy`)}
              >
                {t('AUTH.LOGIN.PRIVACY_POLICY')}
              </Text>
            </Text>
          </Pressable>

          {error && <Text style={styles.error}>{error}</Text>}
          {primaryButton(t('MOBILE.AUTH.CREATE_ACCOUNT'), handleSendCode)}
        </>
      ) : (
        <>
          <Text style={styles.title}>{t('MOBILE.AUTH.CHECK_EMAIL_TITLE')}</Text>
          <Text style={styles.subtitle}>
            {t('MOBILE.AUTH.SIGNUP_CODE_SENT', { email: trimmedEmail })}
          </Text>

          <Field label={t('MOBILE.AUTH.VERIFICATION_CODE')}>
            <TextInput
              style={[styles.input, styles.codeInput]}
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={text => setCode(text.replace(/\D/g, ''))}
              placeholder="123456"
              autoComplete="one-time-code"
            />
          </Field>

          {error && <Text style={styles.error}>{error}</Text>}
          {info && <Text style={styles.info}>{info}</Text>}
          {primaryButton(t('MOBILE.AUTH.VERIFY_AND_SIGN_UP'), handleVerify)}

          <View style={styles.codeActions}>
            <Pressable onPress={handleResend} disabled={loading} hitSlop={8}>
              <Text style={styles.link}>
                {t('PROFILE.EDIT.DELETE_RESEND_CODE')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setError(null);
                setInfo(null);
                setStep('details');
              }}
              disabled={loading}
              hitSlop={8}
            >
              <Text style={styles.link}>{t('MOBILE.AUTH.CHANGE_DETAILS')}</Text>
            </Pressable>
          </View>
        </>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {t('AUTH.LOGIN.HAVE_ACCOUNT_PROMPT')}{' '}
        </Text>
        <Pressable onPress={onSignIn} hitSlop={8}>
          <Text style={styles.link}>{t('MOBILE.AUTH.SIGN_IN')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.formGroup}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles(c => ({
  scroll: {
    flex: 1,
    backgroundColor: c.surface,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
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
  codeInput: {
    fontSize: 20,
    letterSpacing: 8,
    textAlign: 'center',
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 16,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checked: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  checkmark: {
    color: c.onPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    color: c.text,
    lineHeight: 19,
  },
  link: {
    color: c.primaryText,
    fontWeight: '600',
    fontSize: 13.5,
  },
  error: {
    color: c.danger,
    fontSize: 13,
    marginBottom: 12,
  },
  info: {
    color: c.primaryText,
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
  codeActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
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
}));
