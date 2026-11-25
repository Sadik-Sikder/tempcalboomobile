import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, { AndroidImportance } from '@notifee/react-native';
import BackgroundFetch from 'react-native-background-fetch';
import { getToken } from '../api/auth';
import {
  getNotificationStatus,
  getNotifications,
  type AppNotification,
} from '../api/notifications';
import { syncMeetingReminders } from './meetingReminders';
import i18n, { restoreLanguage } from '../i18n';

// Phase 2a of notifications: a periodic background job that checks
// GET /notifications/status while the app is closed and posts a system
// notification for anything new. react-native-background-fetch schedules
// it through Android's JobScheduler — the same mechanism WorkManager uses
// underneath on API 23+, so the same rules apply: at most every 15
// minutes, deferred in Doze, and possibly skipped by aggressive OEM
// battery savers. Good enough as a best-effort notifier; FCM push
// (phase 2b) is the real fix for timeliness.
//
// "New" means newer than the newest notification this device has already
// seen, whether through this job or the in-app poll — so opening the app
// and seeing the badge counts as seen, and nothing is announced twice.

const LAST_SEEN_KEY = 'notifications.lastSeenCreatedAt';
const CHANNEL_ID = 'calbook-notifications';
// More than this many new at once collapses into one summary
// notification instead of flooding the shade.
const MAX_INDIVIDUAL = 3;

async function ensureChannel(): Promise<string> {
  return notifee.createChannel({
    id: CHANNEL_ID,
    name: i18n.t('NAV.NOTIFICATIONS'),
    description: i18n.t('MOBILE.NOTIFICATIONS.CHANNEL_DESCRIPTION'),
    importance: AndroidImportance.HIGH,
  });
}

// Tapping any of these opens the app on the Notifications screen (see
// App.tsx's notification-press handling).
const pressAction = { id: 'default' };
const OPEN_NOTIFICATIONS = { screen: 'notifications' };

async function display(fresh: AppNotification[]) {
  const channelId = await ensureChannel();

  if (fresh.length > MAX_INDIVIDUAL) {
    await notifee.displayNotification({
      id: 'notifications-summary',
      title: i18n.t('MOBILE.NOTIFICATIONS.NEW_COUNT', { n: fresh.length }),
      body: fresh
        .slice(0, MAX_INDIVIDUAL)
        .map(n => n.title)
        .join(' · '),
      data: OPEN_NOTIFICATIONS,
      android: { channelId, pressAction },
    });
    return;
  }

  for (const n of fresh) {
    await notifee.displayNotification({
      // The server's id, so a retried job can't show the same one twice.
      id: n.id,
      title: n.title,
      body: n.body ?? undefined,
      data: OPEN_NOTIFICATIONS,
      android: { channelId, pressAction },
    });
  }
}

// created_at strings share one fixed ISO format from Laravel, so plain
// string comparison orders them correctly.
function newestCreatedAt(items: AppNotification[]): string | null {
  return items.reduce<string | null>(
    (max, n) => (max === null || n.created_at > max ? n.created_at : max),
    null,
  );
}

// Checks for new notifications, records what's been seen, and with
// `notify` posts system notifications for anything new. Returns the unread
// count for the in-app badge.
//
// Asks GET /notifications/status first — a count and a timestamp — and
// only downloads the list when there's something new to announce. Most
// checks find nothing new, so most never fetch the list at all.
export async function syncNotifications(notify: boolean): Promise<number> {
  const status = await getNotificationStatus();
  if (status === null) return syncFromList(notify);

  const lastSeen = await AsyncStorage.getItem(LAST_SEEN_KEY);
  const latest = status.latest_at;
  const hasNew = latest !== null && (lastSeen === null || latest > lastSeen);
  if (!hasNew) return status.unread_count;

  // First run on this device (or right after sign-in) takes a baseline
  // instead of announcing the user's whole backlog; and the in-app poll
  // doesn't announce at all — the badge counts as seen.
  if (lastSeen !== null && notify) {
    const items = (await getNotifications()).notifications.data;
    const fresh = items.filter(n => !n.read_at && n.created_at > lastSeen);
    if (fresh.length > 0) await display(fresh);
  }

  await AsyncStorage.setItem(LAST_SEEN_KEY, latest);
  return status.unread_count;
}

// The same check against the full first page (unread-first, newest-first —
// new notifications always land on it), for a backend without /status.
async function syncFromList(notify: boolean): Promise<number> {
  const res = await getNotifications();
  const items = res.notifications.data;
  const newest = newestCreatedAt(items);
  const lastSeen = await AsyncStorage.getItem(LAST_SEEN_KEY);

  if (lastSeen !== null && notify) {
    const fresh = items.filter(n => !n.read_at && n.created_at > lastSeen);
    if (fresh.length > 0) await display(fresh);
  }

  if (newest !== null && (lastSeen === null || newest > lastSeen)) {
    await AsyncStorage.setItem(LAST_SEEN_KEY, newest);
  }

  return res.unread_count;
}

// Android 13+ needs the runtime POST_NOTIFICATIONS permission; asked once
// the user is signed in, since that's when there's something to notify.
export async function requestNotificationPermission() {
  await notifee.requestPermission();
}

// React Native pauses JS timers while the app is backgrounded (they run on
// the frame clock), except inside a headless task. When the job fires with
// the app still alive in the background, it runs as a normal JS callback —
// and fetch() (whatwg-fetch) resolves every response via setTimeout(…, 0),
// so the request completes natively but its promise never settles until
// the user reopens the app. For the duration of the job, send zero-delay
// timeouts through setImmediate, which RN drains after each native→JS
// message instead of on a frame. Delayed timers are left alone, and
// nothing changes in the foreground or a headless run, where timers work.
async function withTimersRunning<T>(work: () => Promise<T>): Promise<T> {
  if (AppState.currentState === 'active') return work();
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((
    handler: (...args: any[]) => void,
    delay?: number,
    ...args: any[]
  ) =>
    delay
      ? originalSetTimeout(handler, delay, ...args)
      : setImmediate(handler, ...args)) as typeof setTimeout;
  try {
    return await work();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
}

// The job body, shared by the in-process callback and the headless task
// (index.js) that runs when the app has been closed. Any failure just
// means trying again next time.
export async function runBackgroundSync(taskId: string) {
  try {
    // With the app closed nothing has restored the language yet, and the
    // reminders and summaries this arms are shown in it.
    await restoreLanguage().catch(err => console.warn(err));
    if (await getToken()) {
      await withTimersRunning(async () => {
        // Separately, so one failing doesn't skip the other.
        await syncNotifications(true).catch(err =>
          console.warn('Background notification sync failed:', err),
        );
        // Picks up meetings created or changed on the web.
        await syncMeetingReminders().catch(err =>
          console.warn('Background reminder sync failed:', err),
        );
      });
    }
  } catch (err) {
    console.warn('Background sync failed:', err);
  } finally {
    BackgroundFetch.finish(taskId);
  }
}

// start/stop are async native calls; if a stop (sign-out) and a start
// (sign-in, or an effect re-run) overlap, the native side can end up
// stopped right after being configured and silently drop every event.
// Chaining them keeps each one finished before the next begins.
let lifecycle: Promise<unknown> = Promise.resolve();
function inOrder(step: () => Promise<unknown>): Promise<unknown> {
  lifecycle = lifecycle.then(step, step);
  return lifecycle;
}

export function startBackgroundSync() {
  return inOrder(() =>
    BackgroundFetch.configure(
      {
        minimumFetchInterval: 15, // minutes — Android's floor
        stopOnTerminate: false, // keep running after the app is swiped away
        startOnBoot: true,
        enableHeadless: true,
        requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY,
      },
      runBackgroundSync,
      taskId => BackgroundFetch.finish(taskId), // OS time limit hit
    ),
  );
}

// On sign-out: stop the job, forget the baseline so the next account
// starts fresh, and clear anything still showing for the old account.
export function stopBackgroundSync() {
  return inOrder(async () => {
    await BackgroundFetch.stop();
    await AsyncStorage.removeItem(LAST_SEEN_KEY);
    await notifee.cancelAllNotifications();
  });
}
