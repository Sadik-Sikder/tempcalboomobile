import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { gradients } from '../constants/colors';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import {
  acceptInvite,
  declineInvite,
  getInvite,
  type TeamInvite,
} from '../api/invites';

interface Props {
  token: string;
  onAccepted: (teamName: string) => void;
  onDeclined: () => void;
  onClose: () => void;
}

// Mirrors calbook's invite-handler page, opened from the invite email's
// link. The email has separate Accept and Decline links, but like the web
// this always asks again here rather than acting on the link alone — link
// previews and mail scanners open URLs too.
export function TeamInviteScreen({
  token,
  onAccepted,
  onDeclined,
  onClose,
}: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [invite, setInvite] = useState<TeamInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getInvite(token)
      .then(setInvite)
      .catch((err: any) =>
        setError(err?.message ?? i18n.t('AUTH.GENERIC_ERROR')),
      )
      .finally(() => setLoading(false));
  }, [token]);

  const respond = async (choice: 'accept' | 'decline') => {
    setBusy(choice);
    setError(null);
    try {
      if (choice === 'accept') {
        await acceptInvite(token);
        onAccepted(invite?.team?.name ?? t('MOBILE.TEAM_INVITE.THE_TEAM'));
      } else {
        await declineInvite(token);
        onDeclined();
      }
    } catch (err: any) {
      setError(err?.message ?? t('AUTH.GENERIC_ERROR'));
      setBusy(null);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={onClose} style={styles.back} hitSlop={8}>
        <Text style={styles.backText}>
          {'‹'} {t('MOBILE.COMMON.CLOSE')}
        </Text>
      </Pressable>

      <View style={styles.body}>
        {loading ? (
          <ActivityIndicator color={colors.primaryText} />
        ) : invite ? (
          <>
            <Text style={styles.kicker}>{t('MOBILE.TEAM_INVITE.KICKER')}</Text>
            <Text style={styles.teamName}>
              {invite.team?.name ?? t('MOBILE.TEAM_INVITE.A_TEAM')}
            </Text>
            <Text style={styles.detail}>
              {t(
                invite.role === 'admin'
                  ? 'MOBILE.TEAM_INVITE.INVITED_AS_ADMIN'
                  : 'MOBILE.TEAM_INVITE.INVITED_AS_MEMBER',
                {
                  inviter:
                    invite.inviter?.name ?? t('MOBILE.TEAM_INVITE.SOMEONE'),
                },
              )}
            </Text>

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              onPress={() => respond('accept')}
              disabled={busy !== null}
            >
              <LinearGradient
                colors={gradients.primary}
                style={[styles.button, busy !== null && styles.dimmed]}
              >
                {busy === 'accept' ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={styles.buttonText}>
                    {t('INVITE_HANDLER.ACCEPT')}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>
            <Pressable
              onPress={() => respond('decline')}
              disabled={busy !== null}
              style={[
                styles.button,
                styles.declineButton,
                busy !== null && styles.dimmed,
              ]}
            >
              {busy === 'decline' ? (
                <ActivityIndicator color={colors.danger} />
              ) : (
                <Text style={styles.declineText}>
                  {t('INVITE_HANDLER.DECLINE')}
                </Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.teamName}>{t('INVITE_HANDLER.NOT_FOUND')}</Text>
            <Text style={styles.detail}>{error}</Text>
          </>
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
    paddingBottom: 10,
  },
  backText: {
    color: c.primaryText,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 60,
    gap: 10,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '600',
    color: c.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  teamName: {
    fontSize: 26,
    fontWeight: '700',
    color: c.text,
  },
  detail: {
    fontSize: 14,
    color: c.textMuted,
    lineHeight: 20,
    marginBottom: 16,
  },
  error: {
    color: c.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: c.onPrimary,
    fontWeight: '700',
    fontSize: 14.5,
  },
  declineButton: {
    borderWidth: 1,
    borderColor: c.border,
  },
  declineText: {
    color: c.danger,
    fontWeight: '700',
    fontSize: 14.5,
  },
  dimmed: {
    opacity: 0.7,
  },
}));
