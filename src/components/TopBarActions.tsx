import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import { useTranslation } from 'react-i18next';
import { useUnreadCount } from '../utils/notificationPolling';
import { ProfileMenu } from './ProfileMenu';

interface Props {
  onOpenProfile: () => void;
  onLoggedOut: () => void;
  onOpenNotifications: () => void;
  // True on the Notifications screen itself, so the bell reads as the
  // current location instead of a link.
  notificationsActive?: boolean;
}

export function TopBarActions({
  onOpenProfile,
  onLoggedOut,
  onOpenNotifications,
  notificationsActive = false,
}: Props) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <NotificationBell
        active={notificationsActive}
        onPress={onOpenNotifications}
      />
      <ProfileMenu onOpenProfile={onOpenProfile} onLoggedOut={onLoggedOut} />
    </View>
  );
}

function NotificationBell({
  active,
  onPress,
}: {
  active: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const unreadCount = useUnreadCount();
  const color = active ? colors.onPrimary : colors.primaryText;
  const label =
    unreadCount > 0
      ? t('MOBILE.TOP_BAR.NOTIFICATIONS_UNREAD', { n: unreadCount })
      : t('NAV.NOTIFICATIONS');

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.bellButton, active && styles.bellButtonActive]}
    >
      <Svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </Svg>
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles(c => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // Same 34dp as the avatar next to it (ProfileMenu's Avatar size), so the
  // pair reads as one matched set.
  bellButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.purpleTint,
  },
  bellButtonActive: {
    backgroundColor: c.primary,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: c.danger,
    borderWidth: 2,
    borderColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: c.onPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
}));
