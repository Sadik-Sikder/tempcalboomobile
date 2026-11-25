import { Pressable, ScrollView, Text, View } from 'react-native';
import { makeStyles } from '../theme/ThemeContext';
import { useTranslation } from 'react-i18next';

// Stand-in for calbook's dashboard sidebar nav (dashboard-nav.ts) — the
// web app's sections, in the same order.
//
// 'notifications' stays a DashboardTab (it's a dashboard screen with this
// same tab bar) but isn't listed in TABS: it's reached from the bell in
// the top bar (TopBarActions), which shows the unread badge.
//
// 'admin' is deliberately left out: on web it's hidden behind
// `*ngIf="userData?.data?.user_role === 'admin'"` and its route carries a
// real `adminGuard` (dashboard.component.html, app.routes.ts) — the
// mobile app doesn't fetch the user's role anywhere yet, so there's no
// way to gate it the same way. Showing it unconditionally here would
// misrepresent a restricted feature as available to every user; add it
// back once role info is plumbed through.
export type DashboardTab =
  | 'meetings'
  | 'events'
  | 'bookings'
  | 'calendar'
  | 'availability'
  | 'integrations'
  | 'teams'
  | 'upgrade'
  | 'analytics'
  | 'notifications';

// labelKey: the tab's name in src/i18n.
export const TABS: { key: DashboardTab; labelKey: string }[] = [
  { key: 'events', labelKey: 'NAV.EVENTS' },
  { key: 'meetings', labelKey: 'MOBILE.NAV.MEETINGS' },
  { key: 'bookings', labelKey: 'NAV.MY_BOOKINGS' },
  { key: 'calendar', labelKey: 'NAV.CALENDAR' },
  { key: 'availability', labelKey: 'NAV.AVAILABILITY' },
  { key: 'integrations', labelKey: 'NAV.INTEGRATIONS' },
  { key: 'teams', labelKey: 'NAV.TEAMS' },
  { key: 'upgrade', labelKey: 'NAV.UPGRADE_PLAN' },
  { key: 'analytics', labelKey: 'NAV.ANALYTICS' },
];

interface Props {
  active: DashboardTab;
  onChange: (tab: DashboardTab) => void;
}

export function DashboardTabs({ active, onChange }: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {TABS.map(tab => (
        <Tab
          key={tab.key}
          label={t(tab.labelKey)}
          selected={active === tab.key}
          onPress={() => onChange(tab.key)}
        />
      ))}
    </ScrollView>
  );
}

function Tab({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={styles.tab}>
      <Text style={[styles.label, selected && styles.labelSelected]}>
        {label}
      </Text>
      {selected && <View style={styles.underline} />}
    </Pressable>
  );
}

const useStyles = makeStyles(c => ({
  row: {
    flexDirection: 'row',
    gap: 20,
    paddingHorizontal: 20,
  },
  tab: {
    paddingBottom: 8,
    flexShrink: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: c.textMuted,
  },
  labelSelected: {
    color: c.primaryText,
  },
  underline: {
    marginTop: 6,
    height: 2,
    borderRadius: 1,
    backgroundColor: c.primary,
  },
}));
