import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import {
  TeamsBlockDeletionError,
  checkAccountDeletable,
  deleteAccount,
  sendDeleteAccountCode,
} from '../api/account';
import { clearLocalSession } from '../api/auth';

interface Props {
  visible: boolean;
  email: string;
  onClose: () => void;
  onDeleted: () => void;
}

type Step = 'confirm' | 'code';

function errorMessage(err: any): string {
  if (err instanceof TeamsBlockDeletionError) {
    return `${i18n.t('PROFILE.EDIT.DELETE_BLOCKED_TEAMS')} ${err.teams.join(
      ', ',
    )}`;
  }
  return err?.message ?? i18n.t('AUTH.GENERIC_ERROR');
}

// Mirrors the delete-account confirmation in calbook's profile.component:
// warn, email a 6-digit code, then delete with it.
export function DeleteAccountModal({
  visible,
  email,
  onClose,
  onDeleted,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('confirm');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setStep('confirm');
    setCode('');
    setError(null);
    onClose();
  };

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await checkAccountDeletable();
      await sendDeleteAccountCode();
      setStep('code');
    } catch (err: any) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError(t('MOBILE.DELETE_ACCOUNT.CODE_INVALID'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(code);
    } catch (err: any) {
      setBusy(false);
      setError(errorMessage(err));
      return;
    }
    // The server has already revoked every token; only the device's copy
    // of the session is left to clear.
    await clearLocalSession();
    setBusy(false);
    onDeleted();
    Alert.alert(
      t('MOBILE.DELETE_ACCOUNT.DELETED_TITLE'),
      t('PROFILE.EDIT.DELETE_SUCCESS'),
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable
            style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}
            onPress={() => {}}
          >
            <Text style={styles.title}>
              {t('PROFILE.EDIT.DELETE_CONFIRM_TITLE')}
            </Text>

            {step === 'confirm' ? (
              <Text style={styles.text}>
                {t('MOBILE.DELETE_ACCOUNT.CONFIRM_TEXT', { email })}
              </Text>
            ) : (
              <>
                <Text style={styles.text}>
                  {t('MOBILE.DELETE_ACCOUNT.CODE_SENT', { email })}
                </Text>
                <TextInput
                  style={styles.input}
                  value={code}
                  onChangeText={text => setCode(text.replace(/\D/g, ''))}
                  placeholder={t('PROFILE.EDIT.DELETE_CODE_PLACEHOLDER')}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  autoFocus
                />
                <Pressable
                  onPress={sendCode}
                  disabled={busy}
                  hitSlop={8}
                  style={styles.resend}
                >
                  <Text style={styles.link}>
                    {t('PROFILE.EDIT.DELETE_RESEND_CODE')}
                  </Text>
                </Pressable>
              </>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.actions}>
              <Pressable
                onPress={close}
                disabled={busy}
                style={[styles.button, styles.cancelButton]}
              >
                <Text style={styles.cancelText}>{t('SHELL.CANCEL')}</Text>
              </Pressable>
              <Pressable
                onPress={step === 'confirm' ? sendCode : confirmDelete}
                disabled={busy}
                style={[
                  styles.button,
                  styles.dangerButton,
                  busy && styles.dimmed,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={styles.dangerText}>
                    {step === 'confirm'
                      ? t('MOBILE.DELETE_ACCOUNT.SEND_CODE')
                      : t('MOBILE.DELETE_ACCOUNT.DELETE_BUTTON')}
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles(c => ({
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: c.backdrop,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: c.text,
  },
  text: {
    fontSize: 13.5,
    color: c.textMuted,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    letterSpacing: 4,
    color: c.text,
  },
  resend: {
    alignSelf: 'flex-start',
  },
  link: {
    color: c.primaryText,
    fontWeight: '600',
    fontSize: 13.5,
  },
  error: {
    color: c.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  button: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: c.border,
  },
  cancelText: {
    color: c.text,
    fontWeight: '700',
    fontSize: 14.5,
  },
  dangerButton: {
    backgroundColor: c.danger,
  },
  dimmed: {
    opacity: 0.7,
  },
  dangerText: {
    color: c.onPrimary,
    fontWeight: '700',
    fontSize: 14.5,
  },
}));
