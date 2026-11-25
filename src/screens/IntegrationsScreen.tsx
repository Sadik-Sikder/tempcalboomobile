import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Pressable,
  Switch,
  Text,
  View,
} from 'react-native';
import { palette } from '../constants/colors';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import { DashboardTabs, type DashboardTab } from '../components/DashboardTabs';
import { TopBarActions } from '../components/TopBarActions';
import {
  getCachedUserInfo,
  updateCachedUserInfo,
  useUserInfo,
} from '../api/profile';
import {
  disableGoogleMeet,
  disableZoom,
  disconnectGoogleCalendar,
  enableGoogleMeet,
  enableZoom,
  getGoogleCalendarAuthUrl,
} from '../api/integrations';

interface Props {
  onBack: () => void;
  onLoggedOut: () => void;
  onNavigate: (tab: DashboardTab) => void;
  onOpenProfile: () => void;
}

type IntegrationKey = 'google_calendar' | 'google_meet' | 'zoom';

const CALLBACK_PREFIX = 'calbookmobile://google-calendar-callback';

function parseQueryParams(query: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [key, value = ''] = pair.split('=');
    result[decodeURIComponent(key)] = decodeURIComponent(
      value.replace(/\+/g, ' '),
    );
  }
  return result;
}

export function IntegrationsScreen({
  onBack,
  onLoggedOut,
  onNavigate,
  onOpenProfile,
}: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const userInfo = useUserInfo();
  const [busy, setBusy] = useState<IntegrationKey | null>(null);

  const connectingCalendar = useRef(false);

  useEffect(() => {
    const finishConnecting = (status: string, message?: string) => {
      if (!connectingCalendar.current) return;
      connectingCalendar.current = false;
      setBusy(null);
      const current = getCachedUserInfo();
      if (status === 'success' && current) {
        updateCachedUserInfo({
          integrations: { ...current.integrations, google_calendar: true },
        });
      } else if (status !== 'success') {
        Alert.alert(
          i18n.t('INTEGRATIONS.CONNECT_FAILED', { name: 'Google Calendar' }),
          message || i18n.t('AUTH.GENERIC_ERROR'),
        );
      }
    };

    const handleUrl = (url: string) => {
      if (!url.startsWith(CALLBACK_PREFIX)) return;
      const queryStart = url.indexOf('?');
      const params = parseQueryParams(
        queryStart >= 0 ? url.slice(queryStart + 1) : '',
      );
      finishConnecting(params.status, params.message);
    };

    const urlSub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    Linking.getInitialURL().then(url => {
      if (url) handleUrl(url);
    });

    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active' && connectingCalendar.current) {
        setTimeout(() => finishConnecting('canceled'), 800);
      }
    });

    return () => {
      urlSub.remove();
      appStateSub.remove();
    };
  }, []);

  const integrations = userInfo?.integrations;

  const handleToggleCalendar = async (next: boolean) => {
    if (!userInfo) return;
    if (!next) {
      setBusy('google_calendar');
      try {
        await disconnectGoogleCalendar();
        updateCachedUserInfo({
          integrations: {
            ...userInfo.integrations,
            google_calendar: false,
            google_meet: false,
          },
        });
      } catch (err: any) {
        Alert.alert(
          t('INTEGRATIONS.DISCONNECT_FAILED', { name: 'Google Calendar' }),
          err?.message ?? t('AUTH.GENERIC_ERROR'),
        );
      } finally {
        setBusy(null);
      }
      return;
    }

    setBusy('google_calendar');
    connectingCalendar.current = true;
    try {
      const url = await getGoogleCalendarAuthUrl();
      await Linking.openURL(url);
      // Left busy — cleared by the deep-link/AppState handling above.
    } catch (err: any) {
      connectingCalendar.current = false;
      setBusy(null);
      Alert.alert(
        t('INTEGRATIONS.CONNECT_FAILED', { name: 'Google Calendar' }),
        err?.message ?? t('AUTH.GENERIC_ERROR'),
      );
    }
  };

  const handleToggleMeet = async (next: boolean) => {
    if (!userInfo) return;
    if (next && !userInfo.integrations.google_calendar) {
      Alert.alert(
        t('INTEGRATIONS.CONNECT_CALENDAR_FIRST_TITLE'),
        t('INTEGRATIONS.CONNECT_CALENDAR_FIRST_TEXT'),
      );
      return;
    }
    setBusy('google_meet');
    try {
      await (next ? enableGoogleMeet() : disableGoogleMeet());
      updateCachedUserInfo({
        integrations: { ...userInfo.integrations, google_meet: next },
      });
    } catch (err: any) {
      Alert.alert(
        t(
          next
            ? 'INTEGRATIONS.CONNECT_FAILED'
            : 'INTEGRATIONS.DISCONNECT_FAILED',
          { name: 'Google Meet' },
        ),
        err?.message ?? t('AUTH.GENERIC_ERROR'),
      );
    } finally {
      setBusy(null);
    }
  };

  const handleToggleZoom = async (next: boolean) => {
    if (!userInfo) return;
    setBusy('zoom');
    try {
      await (next ? enableZoom() : disableZoom());
      updateCachedUserInfo({
        integrations: { ...userInfo.integrations, zoom: next },
      });
    } catch (err: any) {
      Alert.alert(
        t(
          next
            ? 'INTEGRATIONS.CONNECT_FAILED'
            : 'INTEGRATIONS.DISCONNECT_FAILED',
          { name: 'Zoom' },
        ),
        err?.message ?? t('AUTH.GENERIC_ERROR'),
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={styles.back} hitSlop={8}>
          <Text style={styles.backText}>
            {'‹'} {t('MOBILE.COMMON.BACK')}
          </Text>
        </Pressable>
        <TopBarActions
          onOpenProfile={onOpenProfile}
          onLoggedOut={onLoggedOut}
          onOpenNotifications={() => onNavigate('notifications')}
        />
      </View>

      <View style={styles.tabsRow}>
        <DashboardTabs active="integrations" onChange={onNavigate} />
      </View>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('NAV.INTEGRATIONS')}</Text>
      </View>

      {!integrations ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.primaryText} />
        </View>
      ) : (
        <View style={styles.list}>
          <IntegrationRow
            letter="G"
            color={colors.accent}
            name="Google Calendar"
            status={
              integrations.google_calendar
                ? t('INTEGRATIONS.STATUS_CONNECTED')
                : t('INTEGRATIONS.STATUS_NOT_CONNECTED')
            }
            value={integrations.google_calendar}
            busy={busy === 'google_calendar'}
            onChange={handleToggleCalendar}
          />
          <IntegrationRow
            letter="M"
            color={colors.primaryText}
            name="Google Meet"
            status={
              integrations.google_meet
                ? t('INTEGRATIONS.STATUS_CONNECTED')
                : integrations.google_calendar
                ? t('INTEGRATIONS.STATUS_NOT_CONNECTED')
                : t('INTEGRATIONS.STATUS_BLOCKED', { name: 'Google Calendar' })
            }
            value={integrations.google_meet}
            busy={busy === 'google_meet'}
            disabled={
              !integrations.google_calendar && !integrations.google_meet
            }
            onChange={handleToggleMeet}
          />
          <IntegrationRow
            letter="Z"
            color={palette.cyan}
            name="Zoom"
            status={
              integrations.zoom
                ? t('INTEGRATIONS.STATUS_CONNECTED')
                : t('INTEGRATIONS.STATUS_NOT_CONNECTED')
            }
            value={integrations.zoom}
            busy={busy === 'zoom'}
            onChange={handleToggleZoom}
          />
        </View>
      )}
    </View>
  );
}

function IntegrationRow({
  letter,
  color,
  name,
  status,
  value,
  busy,
  disabled,
  onChange,
}: {
  letter: string;
  color: string;
  name: string;
  status: string;
  value: boolean;
  busy: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.card}>
      <View style={[styles.avatar, { backgroundColor: color }]}>
        <Text style={styles.avatarText}>{letter}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{name}</Text>
        <Text style={styles.cardStatus}>{status}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.primaryText} />
      ) : (
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{ true: colors.primary }}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles(c => ({
  container: {
    flex: 1,
    backgroundColor: c.surface,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  back: {
    alignSelf: 'center',
  },
  backText: {
    color: c.primaryText,
    fontWeight: '600',
  },
  tabsRow: {
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: c.text,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 4,
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.borderSoft,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: c.onPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: c.text,
  },
  cardStatus: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: 2,
  },
}));
