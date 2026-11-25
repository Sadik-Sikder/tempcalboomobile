import { authFetch, authFetchJson } from './http';
import {
  formatUtcForApi,
  zonedTimeToUtc,
} from '../utils/apiDate';

// Mirrors calbook/src/app/schedule/get-schedule.service.ts and
// post-schedule.service.ts — fetch, cancel, delete, and (unlike events,
// which go through multipart FormData + a PATCH-override) a real PUT with
// a plain JSON body for editing, matching PostScheduleService.updateEvent().

export interface ScheduleGuest {
  id?: string;
  user_id?: string;
  email: string;
  status?: string;
  invited_by?: string;
}

export interface Schedule {
  id: number;
  title: string | null;
  type: string;
  status: 'canceled' | string;
  start_datetime: string;
  end_datetime: string;
  duration_in_minutes?: number | string;
  time_zone: string;
  meeting_location: string | null;
  description?: string | null;
  guests?: ScheduleGuest[];
  active: boolean | number;
  can_manage?: boolean;
  owner_type?: 'user' | 'team';
  owner_id?: string | null;
  reminder_format?: string | null;
  // When the reminder goes out (start minus the chosen offset), UTC.
  reminder?: string | null;
  notification?: 'email' | 'slack' | null;
}

export interface SchedulesResponse {
  data: Schedule[];
  next_cursor: string | null;
}

export function getSchedules(
  cursor: string | null,
  search: string,
  perPage?: number,
): Promise<SchedulesResponse> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (perPage) params.set('per_page', String(perPage));
  if (search.trim()) params.set('search', search.trim());
  const query = params.toString();

  return authFetchJson(`/schedules/meetings${query ? `?${query}` : ''}`);
}

export function cancelSchedule(id: number): Promise<unknown> {
  return authFetchJson(`/schedules/${id}/cancel`, { method: 'POST' });
}

export function deleteSchedule(id: number): Promise<unknown> {
  return authFetchJson(`/schedules/${id}`, { method: 'DELETE' });
}

export interface MeetingFormValues {
  owner_type: 'user' | 'team';
  owner_id: string | null;
  title: string;
  type: string;
  schedule_date: string; // YYYY-MM-DD, local wall-clock date in time_zone
  start_time: string; // HH:mm, local wall-clock time in time_zone
  duration_in_minutes: number;
  time_zone: string;
  meeting_location: string;
  description: string;
  guests: ScheduleGuest[];
  reminder: { value: number; unit: 'Minute' | 'Hour' | 'Day' | 'Week' };
  notification: 'email' | 'slack';
  active: boolean;
}

const REMINDER_MS: Record<MeetingFormValues['reminder']['unit'], number> = {
  Minute: 60_000,
  Hour: 3_600_000,
  Day: 86_400_000,
  Week: 604_800_000,
};

// Mirrors calbook/src/app/events/mappers/meeting.mapper.ts's buildMeetingPayload()
// — same field names and same reminder/reminder_format derivation, built on
// zonedTimeToUtc instead of dayjs.tz() (see utils/apiDate.ts for why).
function buildMeetingPayload(form: MeetingFormValues) {
  const [year, month, day] = form.schedule_date.split('-').map(Number);
  const [hour, minute] = form.start_time.split(':').map(Number);
  const startUtc = zonedTimeToUtc(year, month, day, hour, minute, form.time_zone);
  const endUtc = new Date(startUtc.getTime() + form.duration_in_minutes * 60_000);
  const reminderUtc = new Date(
    startUtc.getTime() - form.reminder.value * REMINDER_MS[form.reminder.unit],
  );

  return {
    owner_type: form.owner_type,
    owner_id: form.owner_type === 'team' ? form.owner_id : undefined,
    title: form.title,
    type: form.type,
    start_datetime: formatUtcForApi(startUtc),
    end_datetime: formatUtcForApi(endUtc),
    duration_in_minutes: form.duration_in_minutes,
    time_zone: form.time_zone,
    meeting_location: form.meeting_location,
    description: form.description,
    reminder: formatUtcForApi(reminderUtc),
    reminder_format: `${String(form.reminder.value).padStart(3, '0')}${form.reminder.unit}`,
    active: form.active ? 1 : 0,
    guests: form.guests,
    notification: form.notification,
  };
}

async function submitMeetingJson(
  path: string,
  method: 'POST' | 'PUT',
  body: unknown,
): Promise<unknown> {
  const response = await authFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(responseBody?.message ?? responseBody?.error ?? 'Failed to save meeting');
  }
  return responseBody;
}

export function updateMeeting(id: number, form: MeetingFormValues): Promise<unknown> {
  return submitMeetingJson(`/schedules/${id}`, 'PUT', buildMeetingPayload(form));
}

export function createMeeting(form: MeetingFormValues): Promise<unknown> {
  return submitMeetingJson('/schedules', 'POST', buildMeetingPayload(form));
}
