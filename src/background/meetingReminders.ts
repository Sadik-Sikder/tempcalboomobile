import { AppState } from 'react-native';
import notifee, {
  AlarmType,
  AndroidImportance,
  AndroidNotificationSetting,
  TriggerType,
} from '@notifee/react-native';
import { getToken } from '../api/auth';
import { getBookings, type Booking } from '../api/bookings';
import { getSchedules, type Schedule } from '../api/meetings';
import { parseApiDateUtc, toDisplayTime } from '../utils/apiDate';
import i18n from '../i18n';

// Meeting reminders scheduled on the phone itself: each upcoming meeting's
// `reminder` time (start minus the "Reminder before the meeting starts"
// setting, stored by the server in UTC) becomes a notifee trigger
// notification, which Android's AlarmManager fires on time even with the
// app closed, the phone offline or in Doze — and notifee re-arms them after
// a reboot. Unlike the notification poll (notificationSync), nothing here
// needs the server at the moment it fires; it only needs the meetings to
// have been synced once since they last changed.
//
// Synced when the app comes to the foreground, after this device creates,
// edits, cancels or deletes a meeting, and from the background job, which
// picks up changes made on the web. Sign-out clears them along with
// everything else (stopBackgroundSync → cancelAllNotifications).

const CHANNEL_ID = 'calbook-reminders';
const ID_PREFIX = 'reminder-';
// The soonest this many are armed; the rest get armed by later syncs as
// these fire. AlarmManager allows an app 500 alarms in all.
const MAX_SCHEDULED = 50;
// Pages of 50 to read at most, per list.
const MAX_PAGES = 4;
const PAGE_SIZE = 50;

interface Upcoming {
  id: number;
  title: string | null;
  status: string;
  active?: boolean | number;
  start_datetime: string;
  reminder?: string | null;
  meeting_location: string | null;
  guest_status?: string | null;
}

export interface PlannedReminder {
  id: string;
  at: number;
  title: string;
  body: string;
  // Which dashboard tab a tap opens.
  screen: 'meetings' | 'bookings';
}

// One / many forms of each unit, in src/i18n.
const UNIT_KEYS = {
  minute: ['MOBILE.REMINDERS.MINUTE_ONE', 'MOBILE.REMINDERS.MINUTE_OTHER'],
  hour: ['MOBILE.REMINDERS.HOUR_ONE', 'MOBILE.REMINDERS.HOUR_OTHER'],
  day: ['MOBILE.REMINDERS.DAY_ONE', 'MOBILE.REMINDERS.DAY_OTHER'],
  week: ['MOBILE.REMINDERS.WEEK_ONE', 'MOBILE.REMINDERS.WEEK_OTHER'],
} as const;

function plural(n: number, unit: keyof typeof UNIT_KEYS): string {
  return i18n.t(UNIT_KEYS[unit][n === 1 ? 0 : 1], { n });
}

// "15 minutes", "2 hours", "1 day" — the gap between the reminder and the
// start, which is what the user picked on the form.
function startsIn(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return plural(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return plural(hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 7) return plural(days, 'day');
  return plural(Math.round(days / 7), 'week');
}

// The reminders to arm, soonest first. Skips canceled, switched-off and
// declined meetings, ones without a reminder, and reminders already past —
// a meeting made 10 minutes before it starts with a 1-hour reminder gets
// none, the same as the server's email.
export function planReminders(
  meetings: Upcoming[],
  bookings: Upcoming[],
  now: number,
  zone: string,
): PlannedReminder[] {
  const planned = new Map<string, PlannedReminder>();
  const add = (item: Upcoming, screen: PlannedReminder['screen']) => {
    if (item.status === 'canceled') return;
    if (item.active === false || item.active === 0) return;
    if (item.guest_status === 'declined') return;
    if (!item.reminder) return;
    const at = parseApiDateUtc(item.reminder);
    const start = parseApiDateUtc(item.start_datetime);
    if (!at.isValid() || !start.isValid() || at.valueOf() <= now) return;

    const id = `${ID_PREFIX}${item.id}`;
    if (planned.has(id)) return; // a team meeting the user is also a guest of
    const time = toDisplayTime(item.start_datetime, zone);
    planned.set(id, {
      id,
      at: at.valueOf(),
      title: item.title?.trim() || i18n.t('EVENT_MODAL.TAB_MEETING'),
      body: [
        i18n.t('MOBILE.REMINDERS.STARTS_IN', {
          when: startsIn(start.diff(at)),
          time,
        }),
        item.meeting_location,
      ]
        .filter(Boolean)
        .join(' · '),
      screen,
    });
  };
  meetings.forEach(m => add(m, 'meetings'));
  bookings.forEach(b => add(b, 'bookings'));

  return [...planned.values()]
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_SCHEDULED);
}

// Meetings come newest-start first, so upcoming ones lead and paging stops
// at the first one that has already started.
async function upcomingMeetings(now: number): Promise<Schedule[]> {
  const result: Schedule[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await getSchedules(cursor, '', PAGE_SIZE);
    const future = res.data.filter(
      s => parseApiDateUtc(s.start_datetime).valueOf() > now,
    );
    result.push(...future);
    if (future.length < res.data.length || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return result;
}

// Bookings' "upcoming" list is already future-only, soonest first.
async function upcomingBookings(): Promise<Booking[]> {
  const result: Booking[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await getBookings('upcoming', cursor, PAGE_SIZE);
    result.push(...res.data);
    if (result.length >= MAX_SCHEDULED || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return result;
}

async function sync() {
  const now = Date.now();
  const [meetings, bookings] = await Promise.all([
    upcomingMeetings(now),
    upcomingBookings(),
  ]);
  // Signed out while the lists were loading: arm nothing for that account.
  if (!(await getToken())) return;

  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const planned = planReminders(meetings, bookings, now, zone);

  const wanted = new Set(planned.map(r => r.id));
  const stale = (await notifee.getTriggerNotificationIds()).filter(
    id => id.startsWith(ID_PREFIX) && !wanted.has(id),
  );
  if (stale.length > 0) await notifee.cancelTriggerNotifications(stale);
  if (planned.length === 0) return;

  const channelId = await notifee.createChannel({
    id: CHANNEL_ID,
    // Shown in Android's notification settings for the app.
    name: i18n.t('MOBILE.REMINDERS.CHANNEL_NAME'),
    description: i18n.t('MOBILE.REMINDERS.CHANNEL_DESCRIPTION'),
    importance: AndroidImportance.HIGH,
  });
  // On time needs exact alarms (USE_EXACT_ALARM in AndroidManifest.xml,
  // granted to calendar apps). Should that ever be off, an inexact alarm
  // still fires, just possibly some minutes late.
  const settings = await notifee.getNotificationSettings();
  const alarmType =
    settings.android.alarm === AndroidNotificationSetting.ENABLED
      ? AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE
      : AlarmType.SET_AND_ALLOW_WHILE_IDLE;

  for (const r of planned) {
    // The same id replaces what's armed, so syncing again is harmless.
    await notifee.createTriggerNotification(
      {
        id: r.id,
        title: r.title,
        body: r.body,
        data: { screen: r.screen },
        android: { channelId, pressAction: { id: 'default' } },
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: r.at,
        alarmManager: { type: alarmType },
      },
    );
  }
}

// One sync at a time: a save and a foregrounding can land together, and two
// interleaved syncs could cancel what the other just armed.
let queue: Promise<void> = Promise.resolve();
export function syncMeetingReminders(): Promise<void> {
  queue = queue.then(sync, sync);
  return queue;
}

// Fire-and-forget form for screens: a failed sync leaves the previous
// reminders armed, and the next one tries again.
export function refreshMeetingReminders() {
  syncMeetingReminders().catch(err =>
    console.warn('Meeting reminder sync failed:', err),
  );
}

// While signed in: sync now and whenever the app comes back to the
// foreground. Returns a stop function.
export function startReminderSync(): () => void {
  refreshMeetingReminders();
  const sub = AppState.addEventListener('change', state => {
    if (state === 'active') refreshMeetingReminders();
  });
  return () => sub.remove();
}
