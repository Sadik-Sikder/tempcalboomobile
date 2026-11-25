import type { ThemeColors } from '../constants/colors';
import i18n from '../i18n';

// Badge text and colors for a meeting. Takes the caller's theme colors
// (from useTheme()) since it isn't a component and can't read them itself.
export function meetingStatus(
  schedule: {
    status: string;
    end_datetime: string;
  },
  colors: ThemeColors,
): {
  label: string;
  color: string;
  background: string;
} {
  if (schedule.status === 'canceled') {
    return {
      label: i18n.t('MEETINGS_PAGE.STATUS_CANCELED'),
      color: colors.canceled,
      background: colors.canceledSoft,
    };
  }

  const now = new Date();
  const end = new Date(schedule.end_datetime);

  if (end < now) {
    return {
      label: i18n.t('MEETINGS_PAGE.STATUS_COMPLETED'),
      color: colors.textMuted,
      background: colors.surfaceMuted,
    };
  }

  return {
    label: i18n.t('MEETINGS_PAGE.STATUS_CONFIRMED'),
    color: colors.success,
    background: colors.successSoft,
  };
}
