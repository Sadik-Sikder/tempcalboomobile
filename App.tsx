/**
 * Calbook Mobile — Android port of the calbook web frontend.
 *
 * Navigation is React Navigation: a native stack for full-screen pages,
 * with the dashboard's tabs in a tab navigator inside it. Which half of
 * the stack exists depends on whether someone is signed in (the pattern
 * React Navigation recommends for auth), so signing in or out swaps the
 * whole set of screens and there's never a "back" across that line.
 *
 * There's no deep-linking set up yet for `calbook.../e/:slug/:id` URLs, so
 * the booking entry screen just asks for the slug + id directly. Once App
 * Links are wired up, they'd open the Booking route instead.
 *
 * @format
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Pressable,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  createNavigationContainerRef,
  useNavigation,
  type CompositeNavigationProp,
  type LinkingOptions,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import {
  createBottomTabNavigator,
  type BottomTabNavigationProp,
} from '@react-navigation/bottom-tabs';
import notifee, { EventType, type Notification } from '@notifee/react-native';

import { useTranslation } from 'react-i18next';
import { restoreLanguage, setLanguage } from './src/i18n';
import { useUserInfo } from './src/api/profile';
import { gradients } from './src/constants/colors';
import { ThemeProvider, makeStyles, useTheme } from './src/theme/ThemeContext';
import { EventBookingScreen } from './src/screens/EventBookingScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { SignupScreen } from './src/screens/SignupScreen';
import { ForgotPasswordScreen } from './src/screens/ForgotPasswordScreen';
import { MeetingsScreen } from './src/screens/MeetingsScreen';
import { EventsScreen } from './src/screens/EventsScreen';
import { EditEventScreen } from './src/screens/EditEventScreen';
import { EditMeetingScreen } from './src/screens/EditMeetingScreen';
import { AvailabilityScreen } from './src/screens/AvailabilityScreen';
import { BookingsScreen } from './src/screens/BookingsScreen';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { TeamsScreen } from './src/screens/TeamsScreen';
import { TeamDetailScreen } from './src/screens/TeamDetailScreen';
import { IntegrationsScreen } from './src/screens/IntegrationsScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { UpgradeScreen } from './src/screens/UpgradeScreen';
import { ProfileEditScreen } from './src/screens/ProfileEditScreen';
import { ChangePasswordScreen } from './src/screens/ChangePasswordScreen';
import { ModelTestScreen } from './src/screens/ModelTestScreen';
import type { DashboardTab } from './src/components/DashboardTabs';
import { startNotificationPolling } from './src/utils/notificationPolling';
import {
  requestNotificationPermission,
  startBackgroundSync,
  stopBackgroundSync,
} from './src/background/notificationSync';
import { startReminderSync } from './src/background/meetingReminders';
import { TeamInviteScreen } from './src/screens/TeamInviteScreen';
import { ResetPasswordScreen } from './src/screens/ResetPasswordScreen';
import {
  clearLocalSession,
  getStoredEmail,
  getToken,
  purgeLegacyPlaintextSession,
} from './src/api/auth';
import { setUnauthorizedHandler } from './src/api/http';
import type {
  DashboardTabParamList,
  RootStackParamList,
} from './src/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<DashboardTabParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Links that open in the app — the same URLs the web app serves, from
// booking links and the invite and password-reset emails, plus a
// calbook:// form of each for testing. The https ones need the site's
// assetlinks.json to open here without asking (see AndroidManifest.xml).
// Query strings (?token=…&email=…, ?action=…) arrive as route params.
const LINK_PREFIXES = ['https://calbook.zecodeek-it.com', 'calbook://'];
const LINK_SCREENS = {
  Booking: 'e/:slug/:id',
  TeamInvite: 'invites/:token',
  ResetPassword: 'reset-password',
} as const;

// Signing in and out happen deep inside screens (Login, the profile menu,
// a 401 from any request); they flip this one piece of state in App.
interface Auth {
  signIn: () => void;
  signOut: () => void;
}
const AuthContext = createContext<Auth>({
  signIn: () => {},
  signOut: () => {},
});
// For the screens both halves of the stack share (the linked ones).
const SignedInContext = createContext(false);

function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedStatusBar />
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

// While signed in, the app's text follows the profile's language: once
// /userinfo loads, and again whenever the cached profile changes (saving
// ProfileEditScreen merges the new language into it). Renders nothing.
function LanguageSync() {
  const language = useUserInfo()?.language;
  useEffect(() => {
    setLanguage(language).catch(err => console.warn(err));
  }, [language]);
  return null;
}

function ThemedStatusBar() {
  const { dark } = useTheme();
  return <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />;
}

type Session = 'checking' | 'signedIn' | 'signedOut';

function AppContent() {
  const styles = useStyles();
  const theme = useTheme();
  const { colors } = theme;
  const [session, setSession] = useState<Session>('checking');
  const [navigationReady, setNavigationReady] = useState(false);
  const signedIn = session === 'signedIn';

  // React Navigation paints its own backgrounds (behind a screen as it
  // slides in, for one); give it the app's colors instead of its defaults.
  const navigationTheme = useMemo<NavigationTheme>(() => {
    const base = theme.dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.primary,
        background: theme.colors.surface,
        card: theme.colors.surface,
        text: theme.colors.text,
        border: theme.colors.border,
      },
    };
  }, [theme]);

  const auth = useMemo<Auth>(
    () => ({
      signIn: () => setSession('signedIn'),
      signOut: () => setSession('signedOut'),
    }),
    [],
  );

  // Mirrors AuthGuard.canActivate: a stored token means the session is
  // still good enough to skip straight to the dashboard on launch; without
  // one, open on the login form.
  // The saved language is restored in the same wait, so the first screen
  // already shows the right text.
  useEffect(() => {
    purgeLegacyPlaintextSession().catch(err => console.warn(err));
    Promise.all([
      getToken(),
      restoreLanguage().catch(err => console.warn(err)),
    ]).then(([token]) => setSession(token ? 'signedIn' : 'signedOut'));
  }, []);

  // A request whose session can't be refreshed has already cleared it
  // (http.ts); this just leaves the signed-in screens.
  useEffect(() => {
    setUnauthorizedHandler(() => setSession('signedOut'));
    return () => setUnauthorizedHandler(null);
  }, []);

  // While signed in: in-app polling for the bell badge, meeting reminders
  // armed on the phone, plus the background job for when the app is closed.
  useEffect(() => {
    if (!signedIn) return;
    const stopPolling = startNotificationPolling();
    const stopReminderSync = startReminderSync();
    requestNotificationPermission().catch(err => console.warn(err));
    startBackgroundSync().catch(err => console.warn(err));
    return () => {
      stopPolling();
      stopReminderSync();
      // Signed out (or session expired): no more background checks for
      // this account, and nothing of theirs left in the notification shade.
      stopBackgroundSync().catch(err => console.warn(err));
    };
  }, [signedIn]);

  // Tapping a system notification opens the dashboard tab named in its
  // data: Notifications for the background job's, Meetings or My Bookings
  // for a meeting reminder. The press arrives three ways depending on app
  // state: as the initial notification on a cold start, the same when
  // brought back from the background, or as a foreground event. It's
  // queued until the session check finishes and the navigator is ready,
  // since on a cold start neither is true yet when it's read.
  const [queuedTab, setQueuedTab] = useState<DashboardTab | null>(null);

  useEffect(() => {
    const tabFor = (n?: Notification): DashboardTab | null => {
      const screen = n?.data?.screen;
      return screen === 'notifications' ||
        screen === 'meetings' ||
        screen === 'bookings'
        ? screen
        : null;
    };

    const checkInitial = () =>
      notifee
        .getInitialNotification()
        .then(initial => {
          const tab = tabFor(initial?.notification);
          if (tab) setQueuedTab(tab);
        })
        .catch(err => console.warn(err));

    checkInitial();
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') checkInitial();
    });
    const unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
      const tab = tabFor(detail.notification);
      if (type === EventType.PRESS && tab) setQueuedTab(tab);
    });
    return () => {
      appStateSub.remove();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (queuedTab && signedIn && navigationReady) {
      setQueuedTab(null);
      navigationRef.navigate('Dashboard', { screen: queuedTab });
    }
  }, [queuedTab, signedIn, navigationReady]);

  // A linked screen opens on top of the app's usual first screen, so back
  // from it lands somewhere sensible instead of closing the app.
  const linking = useMemo<LinkingOptions<RootStackParamList>>(
    () => ({
      prefixes: LINK_PREFIXES,
      config: {
        initialRouteName: signedIn ? 'Dashboard' : 'Login',
        screens: LINK_SCREENS,
      },
    }),
    [signedIn],
  );

  if (session === 'checking') {
    return (
      <View style={[styles.root, styles.centerFill]}>
        <ActivityIndicator size="large" color={colors.primaryText} />
      </View>
    );
  }

  return (
    <AuthContext.Provider value={auth}>
      <SignedInContext.Provider value={signedIn}>
        {signedIn && <LanguageSync />}
        <NavigationContainer
          ref={navigationRef}
          linking={linking}
          theme={navigationTheme}
          onReady={() => setNavigationReady(true)}
        >
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: styles.root,
            }}
          >
            {signedIn ? (
              <>
                <Stack.Screen name="Dashboard" component={DashboardTabs} />
                <Stack.Screen name="EditEvent" component={EditEventRoute} />
                <Stack.Screen name="EditMeeting" component={EditMeetingRoute} />
                <Stack.Screen name="TeamDetail" component={TeamDetailRoute} />
                <Stack.Screen name="ProfileEdit" component={ProfileEditRoute} />
                <Stack.Screen
                  name="ChangePassword"
                  component={ChangePasswordRoute}
                />
                {__DEV__ && (
                  <Stack.Screen name="ModelTest" component={ModelTestRoute} />
                )}
              </>
            ) : (
              <>
                <Stack.Screen name="Login" component={LoginRoute} />
                <Stack.Screen name="Signup" component={SignupRoute} />
                <Stack.Screen
                  name="ForgotPassword"
                  component={ForgotPasswordRoute}
                />
                <Stack.Screen name="Entry" component={EntryScreen} />
              </>
            )}
            {/* Opened from links, signed in or not. */}
            <Stack.Group>
              <Stack.Screen name="Booking" component={BookingRoute} />
              <Stack.Screen name="TeamInvite" component={TeamInviteRoute} />
              <Stack.Screen
                name="ResetPassword"
                component={ResetPasswordRoute}
              />
            </Stack.Group>
          </Stack.Navigator>
        </NavigationContainer>
      </SignedInContext.Provider>
    </AuthContext.Provider>
  );
}

// Screens draw edge-to-edge, so each one starts below the status bar.
function TopInset({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>{children}</View>
  );
}

function DashboardTabs() {
  const styles = useStyles();
  return (
    <Tab.Navigator
      initialRouteName="meetings"
      backBehavior="history"
      tabBar={() => null}
      screenOptions={{ headerShown: false, sceneStyle: styles.root }}
    >
      <Tab.Screen name="meetings" component={MeetingsTab} />
      <Tab.Screen name="events" component={EventsTab} />
      <Tab.Screen name="bookings" component={BookingsTab} />
      <Tab.Screen name="calendar" component={CalendarTab} />
      <Tab.Screen name="availability" component={AvailabilityTab} />
      <Tab.Screen name="integrations" component={IntegrationsTab} />
      <Tab.Screen name="teams" component={TeamsTab} />
      <Tab.Screen name="upgrade" component={UpgradeTab} />
      <Tab.Screen name="analytics" component={AnalyticsTab} />
      <Tab.Screen name="notifications" component={NotificationsTab} />
    </Tab.Navigator>
  );
}

type DashboardNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<DashboardTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

// The props every dashboard screen takes for its top bar and tab strip.
function useDashboardActions() {
  const navigation = useNavigation<DashboardNavigation>();
  const { signOut } = useContext(AuthContext);
  return {
    // "‹ Back": the previous tab, or — at the first one — close the app,
    // the same as hardware back there.
    onBack: () => {
      if (navigation.canGoBack()) navigation.goBack();
      else BackHandler.exitApp();
    },
    onLoggedOut: signOut,
    onNavigate: (tab: DashboardTab) => navigation.navigate(tab),
    onOpenProfile: () => navigation.navigate('ProfileEdit'),
  };
}

function MeetingsTab() {
  const actions = useDashboardActions();
  const navigation = useNavigation<DashboardNavigation>();
  return (
    <TopInset>
      <MeetingsScreen
        {...actions}
        onEdit={schedule => navigation.navigate('EditMeeting', { schedule })}
        onCreate={() => navigation.navigate('EditMeeting', { schedule: null })}
      />
    </TopInset>
  );
}

function EventsTab() {
  const actions = useDashboardActions();
  const navigation = useNavigation<DashboardNavigation>();
  return (
    <TopInset>
      <EventsScreen
        {...actions}
        onEdit={event => navigation.navigate('EditEvent', { event })}
        onCreate={() => navigation.navigate('EditEvent', { event: null })}
      />
    </TopInset>
  );
}

function TeamsTab() {
  const actions = useDashboardActions();
  const navigation = useNavigation<DashboardNavigation>();
  return (
    <TopInset>
      <TeamsScreen
        {...actions}
        onOpenTeam={team =>
          navigation.navigate('TeamDetail', { teamId: team.id })
        }
      />
    </TopInset>
  );
}

function BookingsTab() {
  const actions = useDashboardActions();
  return (
    <TopInset>
      <BookingsScreen {...actions} />
    </TopInset>
  );
}

function CalendarTab() {
  const actions = useDashboardActions();
  return (
    <TopInset>
      <CalendarScreen {...actions} />
    </TopInset>
  );
}

function AvailabilityTab() {
  const actions = useDashboardActions();
  return (
    <TopInset>
      <AvailabilityScreen {...actions} />
    </TopInset>
  );
}

function IntegrationsTab() {
  const actions = useDashboardActions();
  return (
    <TopInset>
      <IntegrationsScreen {...actions} />
    </TopInset>
  );
}

function UpgradeTab() {
  const actions = useDashboardActions();
  return (
    <TopInset>
      <UpgradeScreen {...actions} />
    </TopInset>
  );
}

function AnalyticsTab() {
  const actions = useDashboardActions();
  return (
    <TopInset>
      <AnalyticsScreen {...actions} />
    </TopInset>
  );
}

function NotificationsTab() {
  const actions = useDashboardActions();
  return (
    <TopInset>
      <NotificationsScreen {...actions} />
    </TopInset>
  );
}

// ---- Signed-in stack screens ----

function EditEventRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'EditEvent'>) {
  return (
    <TopInset>
      <EditEventScreen
        event={route.params.event}
        onCancel={navigation.goBack}
        // Back on the Events tab, its focus refresh picks up the save.
        onSaved={navigation.goBack}
      />
    </TopInset>
  );
}

function EditMeetingRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'EditMeeting'>) {
  return (
    <TopInset>
      <EditMeetingScreen
        schedule={route.params.schedule}
        draft={route.params.draft}
        onCancel={navigation.goBack}
        onSaved={navigation.goBack}
      />
    </TopInset>
  );
}

function TeamDetailRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'TeamDetail'>) {
  return (
    <TopInset>
      <TeamDetailScreen
        teamId={route.params.teamId}
        onBack={navigation.goBack}
      />
    </TopInset>
  );
}

function ProfileEditRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'ProfileEdit'>) {
  return (
    <TopInset>
      <ProfileEditScreen
        onBack={navigation.goBack}
        onChangePassword={() => navigation.navigate('ChangePassword')}
      />
    </TopInset>
  );
}

function ChangePasswordRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'ChangePassword'>) {
  return (
    <TopInset>
      <ChangePasswordScreen
        onBack={navigation.goBack}
        onChanged={navigation.goBack}
      />
    </TopInset>
  );
}

function ModelTestRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'ModelTest'>) {
  return (
    <TopInset>
      <ModelTestScreen
        onBack={navigation.goBack}
        onUseDraft={draft =>
          navigation.navigate('EditMeeting', { schedule: null, draft })
        }
      />
    </TopInset>
  );
}

// ---- Signed-out stack screens ----

function LoginRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Login'>) {
  const { signIn } = useContext(AuthContext);
  return (
    <TopInset>
      <LoginScreen
        onSuccess={signIn}
        onSignUp={() => navigation.navigate('Signup')}
        onForgotPassword={() => navigation.navigate('ForgotPassword')}
      />
    </TopInset>
  );
}

function SignupRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Signup'>) {
  const { signIn } = useContext(AuthContext);
  return (
    <TopInset>
      <SignupScreen
        onSuccess={signIn}
        onSignIn={() => navigation.popTo('Login')}
      />
    </TopInset>
  );
}

function ForgotPasswordRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>) {
  return (
    <TopInset>
      <ForgotPasswordScreen onBack={navigation.goBack} />
    </TopInset>
  );
}

function BookingRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'Booking'>) {
  const styles = useStyles();
  // Usually opened from a link, so this is the way into the rest of the
  // app: back lands on the dashboard (or Login), which the linking config
  // puts underneath.
  const exit = () =>
    navigation.canGoBack() ? navigation.goBack() : BackHandler.exitApp();
  return (
    <TopInset>
      <Pressable onPress={exit} style={styles.back} hitSlop={8}>
        <Text style={styles.backText}>{'‹'} Back</Text>
      </Pressable>
      <EventBookingScreen
        slug={route.params.slug}
        id={route.params.id}
        onExit={exit}
      />
    </TopInset>
  );
}

function TeamInviteRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'TeamInvite'>) {
  const signedIn = useContext(SignedInContext);
  const { t } = useTranslation();
  return (
    <TopInset>
      <TeamInviteScreen
        token={route.params.token}
        onAccepted={teamName => {
          if (signedIn) {
            // The Teams tab's focus refresh shows the new team.
            navigation.popTo('Dashboard', { screen: 'teams' });
            Alert.alert(
              t('MOBILE.TEAM_INVITE.ACCEPTED_TITLE'),
              t('MOBILE.TEAM_INVITE.JOINED', { team: teamName }),
            );
          } else {
            navigation.popTo('Login');
            Alert.alert(
              t('MOBILE.TEAM_INVITE.ACCEPTED_TITLE'),
              t('MOBILE.TEAM_INVITE.JOINED_SIGN_IN', { team: teamName }),
            );
          }
        }}
        onDeclined={() => {
          navigation.goBack();
          Alert.alert(t('MOBILE.TEAM_INVITE.DECLINED_TITLE'));
        }}
        onClose={navigation.goBack}
      />
    </TopInset>
  );
}

function ResetPasswordRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'ResetPassword'>) {
  const signedIn = useContext(SignedInContext);
  const { signOut } = useContext(AuthContext);
  const { t } = useTranslation();
  return (
    <TopInset>
      <ResetPasswordScreen
        token={route.params?.token}
        email={route.params?.email}
        onDone={async () => {
          Alert.alert(
            t('AUTH.RESET_PASSWORD.SUCCESS'),
            t('MOBILE.AUTH.SIGN_IN_WITH_NEW_PASSWORD'),
          );
          const resetEmail = route.params?.email?.toLowerCase();
          const ownEmail = (await getStoredEmail())?.toLowerCase();
          if (signedIn && resetEmail === ownEmail) {
            // The reset revoked every session for this account, this
            // device's included — sign out here too rather than wait for
            // the next request to fail.
            await clearLocalSession();
            signOut();
          } else if (signedIn) {
            navigation.goBack();
          } else {
            navigation.popTo('Login');
          }
        }}
        onClose={navigation.goBack}
      />
    </TopInset>
  );
}

function EntryScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Entry'>) {
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [slug, setSlug] = useState('');
  const [id, setId] = useState('');

  return (
    <View
      style={[
        styles.root,
        styles.entryContainer,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <Text style={styles.title}>Calbook</Text>
      <Text style={styles.subtitle}>{t('MOBILE.ENTRY.SUBTITLE')}</Text>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('MOBILE.ENTRY.SLUG_LABEL')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('MOBILE.ENTRY.SLUG_PLACEHOLDER')}
          autoCapitalize="none"
          value={slug}
          onChangeText={setSlug}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('MOBILE.ENTRY.ID_LABEL')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('MOBILE.ENTRY.ID_PLACEHOLDER')}
          autoCapitalize="none"
          value={id}
          onChangeText={setId}
        />
      </View>

      <Pressable
        disabled={!slug.trim() || !id.trim()}
        onPress={() =>
          navigation.navigate('Booking', { slug: slug.trim(), id: id.trim() })
        }
        style={{ opacity: !slug.trim() || !id.trim() ? 0.5 : 1 }}
      >
        <LinearGradient colors={gradients.primary} style={styles.button}>
          <Text style={styles.buttonText}>{t('MOBILE.ENTRY.OPEN')}</Text>
        </LinearGradient>
      </Pressable>

      <Pressable
        style={styles.loginLink}
        onPress={() => navigation.navigate('Login')}
      >
        <Text style={styles.loginLinkText}>
          {t('MOBILE.ENTRY.SIGN_IN_LINK')}
        </Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(c => ({
  root: {
    flex: 1,
    backgroundColor: c.surface,
  },
  back: {
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  backText: {
    color: c.primaryText,
    fontWeight: '600',
  },
  centerFill: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryContainer: {
    paddingHorizontal: 24,
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: c.text,
  },
  subtitle: {
    fontSize: 13.5,
    color: c.textMuted,
    marginBottom: 20,
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
  loginLink: {
    alignSelf: 'center',
    marginTop: 24,
    paddingVertical: 8,
  },
  loginLinkText: {
    color: c.primaryText,
    fontWeight: '600',
    fontSize: 13.5,
  },
}));

export default App;
