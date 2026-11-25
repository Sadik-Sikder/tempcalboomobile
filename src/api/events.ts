import { authFetch, authFetchJson } from './http';

// Mirrors calbook/src/app/dashboard/events/event.service.ts plus the
// relevant pieces of event-modal.component.ts / event.mappers.ts for
// editing. Brand logo upload is the one piece left out — it needs an
// image-picker native module, a bigger addition on its own.

export interface EventGuest {
  id?: string;
  email: string;
}

export interface EventItem {
  id: string;
  ulid: string;
  slug: string;
  title: string | null;
  event_type: 'one-to-one' | 'group' | 'appointment' | string;
  time_zone: string | null;
  active: 0 | 1;
  pending_requests_count?: number;
  viewer_roles?: string[];
  // Present on the list response (calbook's edit flow reuses the same
  // list item rather than fetching a fresh detail record) but not all
  // guaranteed — mapEventToForm on the web defaults every one of these.
  owner_type?: 'user' | 'team';
  owner_id?: string | null;
  brand_name?: string | null;
  // Relative path ("uploads/events/…") — prefix BRAND_ASSET_BASE to show it.
  brand_logo?: string | null;
  assignment_type?: 'standard' | 'manual' | 'round_robin';
  minimum_notice_minutes?: number;
  buffer_before_minutes?: number;
  slot_duration_minutes?: number | string | null;
  meeting_location?: string | null;
  description?: string | null;
  hosts?: { id: string }[];
  host_ids?: string[];
  guest_emails?: string[];
  guests?: EventGuest[];
  notification?: 'email' | 'slack' | null;
}

export interface EventsResponse {
  data: EventItem[];
  next_cursor: string | null;
}

export function getEvents(
  cursor: string | null,
  search: string,
): Promise<EventsResponse> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (search.trim()) params.set('search', search.trim());
  const query = params.toString();

  return authFetchJson(`/events${query ? `?${query}` : ''}`);
}

export function toggleEventStatus(
  eventUlid: string,
  action: 'activate' | 'deactivate',
): Promise<unknown> {
  return authFetchJson(`/events/${eventUlid}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: action }),
  });
}

export function deleteEvent(eventUlid: string): Promise<unknown> {
  return authFetchJson(`/events/${eventUlid}/delete`, { method: 'POST' });
}

export interface EventFormValues {
  owner_type: 'user' | 'team';
  owner_id: string | null;
  minimum_notice_minutes: number;
  buffer_before_minutes: number;
  assignment_type: 'standard' | 'manual' | 'round_robin';
  type: string;
  title: string;
  time_zone: string;
  slot_duration_minutes: number;
  meeting_location: string;
  description: string;
  brand_name: string;
  // A newly picked image to upload, in React Native's FormData file shape.
  // Null means "keep whatever logo the event already has": the backend only
  // replaces the logo when a file is sent and has no way to remove one.
  brand_logo: LocalImageFile | null;
  host_ids: string[];
  guests: EventGuest[];
  notification: 'email' | 'slack';
}

export interface LocalImageFile {
  uri: string;
  name: string;
  type: string;
}

// Same limits as the backend (EventController: image, jpg/jpeg/png/webp/
// svg, max 200 KB) and the web form's onBrandLogoSelected.
export const BRAND_LOGO_MAX_BYTES = 200 * 1024;
export const BRAND_LOGO_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
];

// Exact field-for-field match of calbook/src/app/events/mappers/event.mappers.ts's
// buildEventPayload() — same field names, same guests_cleared sentinel
// when the list is emptied rather than just omitting the field. Shared by
// create and update since the web app builds this payload identically for
// both and only the endpoint/method differ (event-modal.component.ts's
// submit calls the same config.buildPayload(form) either way).
function buildEventFormData(form: EventFormValues): FormData {
  const payload = new FormData();
  payload.append('owner_type', form.owner_type);
  if (form.owner_type === 'team' && form.owner_id) {
    payload.append('owner_id', form.owner_id);
  }
  payload.append('minimum_notice_minutes', String(form.minimum_notice_minutes));
  payload.append('buffer_before_minutes', String(form.buffer_before_minutes));
  payload.append('assignment_type', form.assignment_type);
  payload.append('type', form.type);
  payload.append('title', form.title);
  payload.append('time_zone', form.time_zone);
  payload.append('slot_duration_minutes', String(form.slot_duration_minutes));
  payload.append('meeting_location', form.meeting_location);
  payload.append('description', form.description);
  payload.append('multi_switch', '0');
  payload.append('brand_name', form.brand_name);
  if (form.brand_logo) {
    // RN's FormData takes { uri, name, type } for a file part; the cast is
    // because the DOM typings only know Blob.
    payload.append('brand_logo', form.brand_logo as unknown as Blob);
  }

  if (form.host_ids.length) {
    form.host_ids.forEach(id => payload.append('host_ids[]', id));
  }
  if (form.guests.length) {
    form.guests.forEach((guest, i) => {
      payload.append(`guests[${i}][email]`, guest.email);
    });
  } else {
    payload.append('guests_cleared', '1');
  }

  return payload;
}

async function submitEventForm(
  path: string,
  payload: FormData,
): Promise<unknown> {
  const response = await authFetch(path, { method: 'POST', body: payload });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message ?? body?.error ?? 'Failed to save event');
  }
  return body;
}

// ?_method=PATCH is Laravel's method-override convention for FormData,
// since a real PATCH request can't carry a multipart body the way POST can.
export function updateEvent(
  eventUlid: string,
  form: EventFormValues,
): Promise<unknown> {
  return submitEventForm(
    `/events/${eventUlid}?_method=PATCH`,
    buildEventFormData(form),
  );
}

export function createEvent(form: EventFormValues): Promise<unknown> {
  return submitEventForm('/events', buildEventFormData(form));
}

const BOOKING_LINK_BASE = 'https://calbook.zecodeek-it.com/e';

export function bookingLinkFor(event: EventItem): string | null {
  if (!event.slug) return null;
  return `${BOOKING_LINK_BASE}/${event.slug}/${event.ulid}`;
}
