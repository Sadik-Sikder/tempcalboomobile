import { authFetchJson } from './http';
import type { ScheduleGuest } from './meetings';

// Mirrors calbook/src/app/dashboard/bookings — schedules where the current
// user is a GUEST (invited to someone else's meeting/event), the mirror
// image of Meetings (schedules the current user OWNS). The backend always
// sets can_manage: false / is_guest: true on these rows since the viewer
// never owns them — see ScheduleController::bookings().

export type BookingTab = 'upcoming' | 'current' | 'past' | 'cancelled';

export interface Booking {
  id: number;
  title: string | null;
  type: string;
  status: 'canceled' | string;
  start_datetime: string;
  end_datetime: string;
  time_zone: string;
  meeting_location: string | null;
  description?: string | null;
  meeting_meta?: { join_url?: string | null } | null;
  // When the reminder goes out, UTC (see Schedule.reminder).
  reminder?: string | null;
  // The current user's answer: 'declined' ones stay in "upcoming".
  guest_status?: string | null;
  user: { id: string; name: string; email: string }; // the host/organizer
  event: { id: string; slug: string } | null;
  guests?: ScheduleGuest[];
  can_manage: false;
  is_guest: true;
}

export interface BookingsResponse {
  data: Booking[];
  next_cursor: string | null;
}

export interface BookingsSummary {
  upcoming: number;
  current: number;
  past: number;
  cancelled: number;
}

export function getBookingsSummary(): Promise<BookingsSummary> {
  return authFetchJson('/schedules/bookings/summary');
}

export function getBookings(
  type: BookingTab,
  cursor: string | null,
  perPage?: number,
): Promise<BookingsResponse> {
  const params = new URLSearchParams({ type });
  if (cursor) params.set('cursor', cursor);
  if (perPage) params.set('per_page', String(perPage));
  return authFetchJson(`/schedules/bookings?${params.toString()}`);
}

// A different endpoint from Meetings' cancel/delete (which operate on a
// schedule you own) — this only flips the current user's own guest row to
// 'declined' via PublicEventController::cancelBooking(); the schedule
// itself, and any other guests on it, are untouched.
export function cancelBooking(id: number): Promise<unknown> {
  return authFetchJson(`/events/cancel-booking/${id}`, { method: 'POST' });
}
