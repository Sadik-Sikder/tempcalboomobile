import { API_URL } from '../constants/env';

// Same endpoints as calbook/src/app/public/event-page.service.ts, using
// fetch instead of Angular's HttpClient. No caching layer here (the web
// service caches by slug+id+date/month+timezone in memory) — worth adding
// back once this screen is doing enough re-fetching for it to matter.

export interface EventInfoResponse {
  event: {
    title: string;
    description: string | null;
    meeting_location: string;
    brand_name: string | null;
    brand_logo: string | null;
    start?: string;
  };
  host: {
    name: string;
    email: string;
  };
}

export interface EventSlot {
  start: string;
  end: string;
  available: boolean;
  selected_host?: string;
  is_owner?: boolean;
  is_booked_by_me?: boolean;
}

export interface EventSlotsResponse {
  slots: EventSlot[];
}

export type MonthAvailability = Record<string, boolean>;

async function getJson<T>(url: string): Promise<T> {
  // See http.ts's authFetch for why Accept matters here: without it, an
  // error response from this backend can arrive as a browser-style
  // redirect instead of JSON, and fetch() silently follows it into an
  // unrelated 404.
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.json();
}

export function getEventInfo(
  slug: string,
  id: string,
): Promise<EventInfoResponse> {
  return getJson(`${API_URL}/events/${slug}/${id}`);
}

export function getMonthAvailability(
  slug: string,
  id: string,
  month: string,
  timezone: string,
): Promise<MonthAvailability> {
  const params = new URLSearchParams({ month, timezone });
  return getJson(`${API_URL}/events/${slug}/${id}/month-availability?${params}`);
}

export function getEventSlots(
  slug: string,
  id: string,
  date: string,
  timezone: string,
): Promise<EventSlotsResponse> {
  const params = new URLSearchParams({ date, timezone });
  return getJson(`${API_URL}/events/${slug}/${id}/slots?${params}`);
}

export interface BookSlotsRequest {
  host_id: string;
  guest_email: string;
  guest_name: string;
  guest_timezone: string;
  requests: { start_time: string; end_time: string }[];
}

export interface BookSlotsResponse {
  created_requests?: { start_time: string; end_time: string }[];
  failed_requests?: { reason: string }[];
}

export async function bookSlots(
  slug: string,
  data: BookSlotsRequest,
): Promise<BookSlotsResponse> {
  const response = await fetch(`${API_URL}/events/${slug}/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(data),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (body && (body.error ?? (typeof body === 'string' ? body : null))) ??
      'Booking request failed';
    throw new Error(message);
  }

  return body;
}
